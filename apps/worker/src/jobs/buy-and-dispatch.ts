// Buy on source + dispatch to buyer.
//
// Three delivery models depending on provider:
//   - RUSTTM: P2P. We pass the buyer's trade URL (parsed for partner+token)
//     plus our SourceTransaction.id as custom_id to /buy-for. rust.tm's
//     seller bot dispatches the Steam trade offer directly to the buyer.
//     The buy-for response acknowledges the buy, but actual delivery is
//     async and tracked by poll-trade-status via get-list-buy-info-by-custom-id
//     (keyed by the custom_id we passed in == our SourceTransaction.id).
//   - WAXPEER (dormant fallback): same P2P model as rust.tm but via Waxpeer's
//     /buy-one-p2p endpoint. Their wallet-sampling guard against false-negative
//     buy responses is preserved for if we ever route back to them.
//   - DMARKET (legacy / unused): item is delivered to OUR bot inventory.
//     We then create a Trade row and enqueue dispatch-trade so our bot
//     re-sends the item to the buyer. Requires us to actually operate a
//     Steam bot — we don't, so this path is dead until/unless we set one up.
//
// Idempotent: if the SourceTransaction is already SUCCESS we skip the buy.
// On any buy failure we issue a refund + transition Order to REFUNDED.

import type { Job } from 'bullmq';
import pino from 'pino';
import { prisma } from '@rustskinpay/db';
import { dmarket } from '../dmarket-client.js';
import { waxpeer } from '../waxpeer-client.js';
import { rusttm } from '../rusttm-client.js';
import { tradeDispatchQueue } from '../queue.js';
import { refundOrder } from '../refund.js';

const log = pino({ name: 'buy-and-dispatch' });

export interface BuyAndDispatchJob {
  orderId: string;
}

export async function buyAndDispatch(job: Job<BuyAndDispatchJob>): Promise<void> {
  const { orderId } = job.data;

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { buyer: true, sourceTransactions: true, items: true },
  });
  if (!order) {
    log.warn({ orderId }, 'order not found');
    return;
  }
  if (order.status === 'FULFILLED' || order.status === 'CANCELLED' || order.status === 'REFUNDED') {
    log.info({ orderId, status: order.status }, 'order in terminal state, skipping');
    return;
  }
  if (!order.buyer?.tradeUrl || !order.buyerSteamId64) {
    log.warn({ orderId }, 'buyer missing trade url or steamId — cannot dispatch');
    return;
  }

  // Single SourceTransaction per order in Phase 1 (one item per order).
  const tx = order.sourceTransactions.find((t) => t.state === 'PENDING' || t.state === 'EXECUTING');
  if (!tx) {
    log.info({ orderId }, 'no pending source transaction; nothing to do');
    return;
  }

  // 1. Mark EXECUTING (idempotent — only flip from PENDING).
  if (tx.state === 'PENDING') {
    await prisma.sourceTransaction.update({
      where: { id: tx.id },
      data: { state: 'EXECUTING', attemptCount: { increment: 1 } },
    });
  }

  // 2. Buy on source — route to the provider that listed the item.
  log.info({ orderId, provider: tx.provider, sourceOfferId: tx.sourceOfferId }, 'buying on source');
  const expectedPriceMinor = tx.amountSpentMinor ?? 0;

  // For Waxpeer, sample the wallet balance BEFORE the buy attempt so we can
  // detect false-negative buy responses: their P2P API sometimes returns
  // `success:false` ("Item no longer available" / "Item price has increased")
  // but the seller's bot still delivers the trade and Waxpeer charges us. In
  // that case the wallet drops by ~item price — we use that as the source of
  // truth instead of trusting the response. Without this guard we
  // double-lose: pay Waxpeer, refund the buyer.
  // (No equivalent guard for rust.tm yet — re-add if we see false negatives
  // in practice; the docs suggest their buy response is authoritative.)
  const balanceBefore =
    tx.provider === 'WAXPEER' && !waxpeer.isMock()
      ? await waxpeer.getBalance().catch(() => null)
      : null;

  const buy =
    tx.provider === 'RUSTTM'
      ? await rusttm.buyOffer(tx.sourceOfferId, expectedPriceMinor, order.buyer.tradeUrl, tx.id)
      : tx.provider === 'WAXPEER'
        ? await waxpeer.buyOffer(tx.sourceOfferId, expectedPriceMinor, order.buyer.tradeUrl)
        : await dmarket.buyOffer(tx.sourceOfferId, expectedPriceMinor);

  if (!buy.success) {
    // Waxpeer false-negative check: wait a bit for the wallet to settle, then
    // compare against the pre-buy balance. If they charged us, the buy went
    // through despite the negative response.
    if (tx.provider === 'WAXPEER' && balanceBefore) {
      log.warn(
        { orderId, errorMessage: buy.errorMessage, balanceBefore: balanceBefore.usdMinor },
        'waxpeer buy returned failure — sampling balance to detect false-negative',
      );
      await new Promise((r) => setTimeout(r, 8_000));
      const balanceAfter = await waxpeer.getBalance().catch(() => null);
      if (balanceAfter) {
        const delta = balanceBefore.usdMinor - balanceAfter.usdMinor;
        // Charged within ±10% of expected → treat as successful buy.
        const tolerance = Math.max(2, Math.floor(expectedPriceMinor * 0.1));
        const charged = delta >= expectedPriceMinor - tolerance && delta <= expectedPriceMinor + tolerance;
        if (charged) {
          log.warn(
            { orderId, balanceBefore: balanceBefore.usdMinor, balanceAfter: balanceAfter.usdMinor, delta },
            'waxpeer reported failure but charged the wallet — treating buy as successful',
          );
          // Override into the success path below.
          buy.success = true;
          buy.sourcePaymentId = buy.sourcePaymentId ?? `recovered_${Date.now()}`;
          buy.raw = { ...((buy.raw as object) ?? {}), reconciledFromBalance: true, delta };
        }
      }
    }
  }

  if (!buy.success) {
    log.error({ orderId, errorCode: buy.errorCode, errorMessage: buy.errorMessage }, 'source buy failed');
    await prisma.sourceTransaction.update({
      where: { id: tx.id },
      data: {
        state: 'FAILED',
        errorCode: buy.errorCode ?? 'BUY_FAILED',
        errorMessage: buy.errorMessage ?? null,
        rawResponse: buy.raw as object,
      },
    });
    // Refund the buyer — they paid us, we can't deliver.
    const refund = await refundOrder(orderId, `source_buy_failed:${buy.errorCode ?? 'unknown'}`);
    log.warn({ orderId, refund }, 'refund issued after source buy failure');
    throw new Error(`source buy failed: ${buy.errorCode ?? 'unknown'}`);
  }

  // 3. Buy succeeded — branch on provider.
  await prisma.sourceTransaction.update({
    where: { id: tx.id },
    data: {
      state: 'SUCCESS',
      sourcePaymentId: buy.sourcePaymentId ?? null,
      succeededAt: new Date(),
      rawResponse: buy.raw as object,
    },
  });

  if (tx.provider === 'RUSTTM') {
    // P2P delivery via rust.tm. Their seller bot sends the Steam trade offer
    // directly to the buyer's tradeUrl. We park the Order in FULFILLING and
    // the Trade in SENDING and let poll-trade-status watch
    // /get-list-buy-info-by-custom-id for terminal resolution. We use
    // tx.id (which we already passed as custom_id) as the polling key,
    // stored in Trade.tradeOfferId. NOT buy.sourcePaymentId — that's rust.tm's
    // internal item id, useful for debugging but not the polling key.
    await prisma.$transaction([
      prisma.trade.create({
        data: {
          orderId,
          botSteamId64: 'RUSTTM_P2P',
          buyerSteamId64: order.buyerSteamId64,
          buyerTradeUrl: order.buyer.tradeUrl,
          status: 'SENDING',
          tradeOfferId: tx.id,
        },
      }),
      prisma.order.update({
        where: { id: orderId },
        data: { status: 'FULFILLING' },
      }),
    ]);
    log.info(
      { orderId, sourcePaymentId: buy.sourcePaymentId, customId: tx.id },
      'rust.tm buy queued — order in FULFILLING, awaiting poll-trade-status',
    );
    return;
  }

  if (tx.provider === 'WAXPEER') {
    // P2P delivery: Waxpeer's seller bot will eventually send the Steam trade
    // offer to the buyer's tradeUrl, but that's an async process happening on
    // Waxpeer's side. We park the Order in FULFILLING and the Trade in SENDING
    // and let poll-trade-status watch /v1/check-many-steam for terminal
    // resolution (sent / accepted / declined).
    await prisma.$transaction([
      prisma.trade.create({
        data: {
          orderId,
          botSteamId64: 'WAXPEER_P2P',
          buyerSteamId64: order.buyerSteamId64,
          buyerTradeUrl: order.buyer.tradeUrl,
          status: 'SENDING',
          tradeOfferId: buy.sourcePaymentId ?? null,
        },
      }),
      prisma.order.update({
        where: { id: orderId },
        data: { status: 'FULFILLING' },
      }),
    ]);
    log.info(
      { orderId, sourcePaymentId: buy.sourcePaymentId },
      'waxpeer buy queued — order in FULFILLING, awaiting poll-trade-status',
    );
    return;
  }

  // DMARKET legacy path: item lands in our bot inventory; dispatch-trade
  // worker re-sends it to the buyer.
  const trade = await prisma.trade.create({
    data: {
      orderId,
      botSteamId64: 'AUTO',
      buyerSteamId64: order.buyerSteamId64,
      buyerTradeUrl: order.buyer.tradeUrl,
      status: 'QUEUED',
    },
  });

  await prisma.order.update({
    where: { id: orderId },
    data: { status: 'FULFILLING' },
  });

  await tradeDispatchQueue.add(
    'dispatch',
    { tradeId: trade.id },
    {
      jobId: `trade_${trade.id}`,
      attempts: 5,
      backoff: { type: 'exponential', delay: 30_000 },
      removeOnComplete: { age: 60 * 60 * 24, count: 1000 },
      removeOnFail: { age: 60 * 60 * 24 * 7 },
    },
  );

  log.info({ orderId, tradeId: trade.id, sourcePaymentId: buy.sourcePaymentId }, 'buy ok, trade queued');
}

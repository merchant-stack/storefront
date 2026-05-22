// Buy on source + dispatch to buyer.
//
// Two delivery models depending on provider:
//   - WAXPEER: P2P. We pass the buyer's trade URL to buy-one-p2p; Waxpeer's
//     seller bot sends the Steam trade offer directly to the buyer. We mark
//     the Order FULFILLED on a successful API response. No Trade row, no
//     own-bot dispatch.
//   - DMARKET (legacy / unused): item is delivered to OUR bot inventory.
//     We then create a Trade row and enqueue dispatch-trade so our bot
//     re-sends the item to the buyer.
//
// Idempotent: if the SourceTransaction is already SUCCESS we skip the buy.
// On any buy failure we issue a Stripe refund + transition Order to REFUNDED.

import type { Job } from 'bullmq';
import pino from 'pino';
import { prisma } from '@rustskinpay/db';
import { dmarket } from '../dmarket-client.js';
import { waxpeer } from '../waxpeer-client.js';
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
  const buy =
    tx.provider === 'WAXPEER'
      ? await waxpeer.buyOffer(tx.sourceOfferId, expectedPriceMinor, order.buyer.tradeUrl)
      : await dmarket.buyOffer(tx.sourceOfferId, expectedPriceMinor);

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

  if (tx.provider === 'WAXPEER') {
    // P2P delivery: Waxpeer's seller bot sends the Steam trade offer directly
    // to the buyer's tradeUrl. From our state machine's perspective the order
    // is fulfilled the moment the source confirms. Buyer acceptance / Steam
    // escrow holds are between buyer and Steam and are outside our pipeline.
    const now = new Date();
    await prisma.$transaction([
      prisma.trade.create({
        data: {
          orderId,
          botSteamId64: 'WAXPEER_P2P',
          buyerSteamId64: order.buyerSteamId64,
          buyerTradeUrl: order.buyer.tradeUrl,
          status: 'SENT',
          tradeOfferId: buy.sourcePaymentId ?? null,
          sentAt: now,
        },
      }),
      prisma.order.update({
        where: { id: orderId },
        data: { status: 'FULFILLED', fulfilledAt: now },
      }),
    ]);
    log.info({ orderId, sourcePaymentId: buy.sourcePaymentId }, 'waxpeer p2p delivery dispatched, order fulfilled');
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

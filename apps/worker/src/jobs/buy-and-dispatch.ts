// Buy on source + dispatch to buyer.
//
// Triggered after Stripe success for a SourceItem-backed order. Flow:
//   1. Mark SourceTransaction EXECUTING.
//   2. Call dmarket.buyOffer(sourceOfferId, sourcePriceMinor).
//   3. On success → SourceTransaction SUCCESS + sourcePaymentId.
//      Create Trade(QUEUED), enqueue trade-dispatch (existing worker pulls from
//      bot inventory and sends to buyer).
//   4. On failure → SourceTransaction FAILED + Order REFUND_REQUIRED. Refund
//      hookup lives in webhook code; we just transition state here.
//
// Idempotent: if the SourceTransaction is already SUCCESS we skip the buy.

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

  // 3. Buy succeeded — record + hand off to trade dispatch.
  await prisma.sourceTransaction.update({
    where: { id: tx.id },
    data: {
      state: 'SUCCESS',
      sourcePaymentId: buy.sourcePaymentId ?? null,
      succeededAt: new Date(),
      rawResponse: buy.raw as object,
    },
  });

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
      jobId: `trade:${trade.id}`,
      attempts: 5,
      backoff: { type: 'exponential', delay: 30_000 },
      removeOnComplete: { age: 60 * 60 * 24, count: 1000 },
      removeOnFail: { age: 60 * 60 * 24 * 7 },
    },
  );

  log.info({ orderId, tradeId: trade.id, sourcePaymentId: buy.sourcePaymentId }, 'buy ok, trade queued');
}

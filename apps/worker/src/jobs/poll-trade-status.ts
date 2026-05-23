// Poll Waxpeer for the real outcome of P2P buys we've kicked off.
//
// Why this exists: /v1/buy-one-p2p only acknowledges Waxpeer queued the
// request. The seller bot may still fail to send the Steam trade offer,
// Waxpeer may decline mid-flight, or the buyer may reject. None of that is
// reflected in our DB without explicit polling. Before this worker existed,
// we marked Order=FULFILLED on the buy response, so the UI lied to buyers
// whose trades silently never arrived (live incident 2026-05-22).
//
// Flow: every 30s walk Trade rows with status SENDING|SENT and provider
// WAXPEER_P2P, call /v1/check-many-steam, then transition based on the raw
// Waxpeer status:
//   - sent (status 4)     → Trade.SENT  + Order.FULFILLED (fulfilledAt=now)
//   - accepted (status 5) → Trade.ACCEPTED (Order already FULFILLED)
//   - declined (status 6) → Trade.DECLINED + refund the buyer
//   - preparing (0..3) / unknown → leave alone, re-poll next tick
//
// Beyond a 25-minute SENDING window we flag the Trade with errorCode
// WAXPEER_TIMEOUT and emit an AuditLog row so an operator can resolve it
// manually — auto-refund is too risky in this window (Waxpeer may still
// deliver late).

import type { Job } from 'bullmq';
import pino from 'pino';
import { prisma } from '@rustskinpay/db';
import type { WaxpeerTradeStatus } from '@rustskinpay/shared/waxpeer';
import { waxpeer } from '../waxpeer-client.js';
import { refundOrder } from '../refund.js';

const log = pino({ name: 'poll-trade-status' });

const POLL_BATCH_SIZE = 50;
/** Don't probe Waxpeer before the buy has had a chance to register. */
const MIN_TRADE_AGE_MS = 60 * 1_000;
/** Beyond this window we stop polling SENDING trades and flag for manual review. */
const TIMEOUT_AGE_MS = 25 * 60 * 1_000;

type PollableTrade = {
  id: string;
  orderId: string;
  tradeOfferId: string;
  status: 'SENDING' | 'SENT';
};

export async function pollTradeStatus(_job: Job): Promise<void> {
  const now = new Date();
  const youngestPollable = new Date(now.getTime() - MIN_TRADE_AGE_MS);
  const oldestPollable = new Date(now.getTime() - TIMEOUT_AGE_MS);

  // Fast skip when nothing is in flight — most ticks fall into this branch
  // because trades typically resolve within minutes. Avoids the two findMany
  // queries below when there's nothing to do.
  const pendingCount = await prisma.trade.count({
    where: {
      botSteamId64: 'WAXPEER_P2P',
      status: { in: ['SENDING', 'SENT'] },
      errorCode: null,
    },
  });
  if (pendingCount === 0) return;

  // 1. Fan out: pick up trades inside the active polling window.
  const candidates = (await prisma.trade.findMany({
    where: {
      botSteamId64: 'WAXPEER_P2P',
      status: { in: ['SENDING', 'SENT'] },
      errorCode: null,
      tradeOfferId: { not: null },
      createdAt: { gte: oldestPollable, lte: youngestPollable },
    },
    select: { id: true, orderId: true, tradeOfferId: true, status: true },
    take: POLL_BATCH_SIZE,
    orderBy: { createdAt: 'asc' },
  })) as Array<{ id: string; orderId: string; tradeOfferId: string | null; status: 'SENDING' | 'SENT' }>;

  const polled: PollableTrade[] = candidates
    .filter((t): t is PollableTrade => t.tradeOfferId !== null)
    .map((t) => ({ id: t.id, orderId: t.orderId, tradeOfferId: t.tradeOfferId, status: t.status }));

  if (polled.length > 0) {
    log.info({ count: polled.length }, 'polling waxpeer for trade outcomes');
    let results: WaxpeerTradeStatus[];
    try {
      results = await waxpeer.checkTradeStatuses(polled.map((t) => t.tradeOfferId));
    } catch (err) {
      log.error({ err }, 'check-many-steam failed; will retry next tick');
      results = [];
    }

    const byWaxpeerId = new Map(results.map((r) => [r.id, r]));
    for (const trade of polled) {
      const status = byWaxpeerId.get(trade.tradeOfferId);
      if (!status) continue;
      try {
        await applyTradeStatus(trade, status);
      } catch (err) {
        log.error({ err, tradeId: trade.id, waxpeerId: trade.tradeOfferId }, 'failed to apply trade status');
      }
    }
  }

  // 2. Timeout sweep: any SENDING trade older than the window — flag for review.
  await flagTimeouts(oldestPollable);
}

async function applyTradeStatus(trade: PollableTrade, status: WaxpeerTradeStatus): Promise<void> {
  const now = new Date();
  const rawMeta = {
    waxpeerId: status.id,
    rawStatus: status.rawStatus,
    reason: status.reason,
  };

  switch (status.state) {
    case 'sent': {
      // Race-safe: only flip if still SENDING. If a sibling tick already
      // promoted us, updateMany no-ops.
      const tradeFlip = await prisma.trade.updateMany({
        where: { id: trade.id, status: 'SENDING' },
        data: { status: 'SENT', sentAt: now },
      });
      const orderFlip = await prisma.order.updateMany({
        where: { id: trade.orderId, status: 'FULFILLING' },
        data: { status: 'FULFILLED', fulfilledAt: now },
      });
      if (tradeFlip.count > 0 || orderFlip.count > 0) {
        log.info({ ...rawMeta, tradeId: trade.id, orderId: trade.orderId }, 'waxpeer reported trade sent — order fulfilled');
      }
      return;
    }
    case 'accepted': {
      // Buyer accepted on Steam. If we somehow jumped past status=4, fulfil now.
      await prisma.$transaction(async (tx) => {
        await tx.trade.updateMany({
          where: { id: trade.id, status: { in: ['SENDING', 'SENT'] } },
          data: { status: 'ACCEPTED', completedAt: now, sentAt: trade.status === 'SENDING' ? now : undefined },
        });
        await tx.order.updateMany({
          where: { id: trade.orderId, status: 'FULFILLING' },
          data: { status: 'FULFILLED', fulfilledAt: now },
        });
      });
      log.info({ ...rawMeta, tradeId: trade.id, orderId: trade.orderId }, 'waxpeer reported trade accepted by buyer');
      return;
    }
    case 'declined': {
      // Waxpeer refunded our wallet — refund the buyer. refundOrder owns the
      // Payment + Order state transitions, so we only mark the Trade here.
      const tradeFlip = await prisma.trade.updateMany({
        where: { id: trade.id, status: { in: ['SENDING', 'SENT'] } },
        data: {
          status: 'DECLINED',
          errorCode: 'WAXPEER_DECLINED',
          errorMessage: status.reason ?? null,
          completedAt: now,
        },
      });
      if (tradeFlip.count === 0) return; // sibling tick already handled it
      log.warn({ ...rawMeta, tradeId: trade.id, orderId: trade.orderId }, 'waxpeer reported trade declined — refunding buyer');
      const refund = await refundOrder(trade.orderId, `waxpeer_declined:${status.reason ?? 'unknown'}`);
      log.warn({ tradeId: trade.id, orderId: trade.orderId, refund }, 'refund issued after waxpeer decline');
      await prisma.auditLog.create({
        data: {
          actorType: 'SYSTEM',
          action: 'trade.declined',
          entityType: 'Trade',
          entityId: trade.id,
          metadata: { ...rawMeta, refund: { status: refund.status, refundId: refund.refundId } },
        },
      }).catch((err) => log.warn({ err }, 'audit log write failed'));
      return;
    }
    case 'preparing':
    case 'unknown':
      return;
  }
}

async function flagTimeouts(oldestPollable: Date): Promise<void> {
  // SENDING trades older than the window: Waxpeer never moved them forward.
  // We don't auto-refund — late deliveries are still possible — but we stop
  // polling and emit an AuditLog so an operator picks it up.
  const stalled = await prisma.trade.findMany({
    where: {
      botSteamId64: 'WAXPEER_P2P',
      status: 'SENDING',
      errorCode: null,
      createdAt: { lt: oldestPollable },
    },
    select: { id: true, orderId: true, tradeOfferId: true },
    take: POLL_BATCH_SIZE,
  });
  for (const s of stalled) {
    const flagged = await prisma.trade.updateMany({
      where: { id: s.id, status: 'SENDING', errorCode: null },
      data: { errorCode: 'WAXPEER_TIMEOUT' },
    });
    if (flagged.count === 0) continue;
    log.warn({ tradeId: s.id, orderId: s.orderId, waxpeerId: s.tradeOfferId }, 'waxpeer trade timed out — flagged for manual review');
    await prisma.auditLog.create({
      data: {
        actorType: 'SYSTEM',
        action: 'trade.timeout',
        entityType: 'Trade',
        entityId: s.id,
        metadata: { orderId: s.orderId, waxpeerId: s.tradeOfferId },
      },
    }).catch((err) => log.warn({ err }, 'audit log write failed'));
  }
}

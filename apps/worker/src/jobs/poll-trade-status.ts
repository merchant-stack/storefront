// Poll our P2P source providers for the real outcome of buys we've kicked off.
//
// Why this exists: P2P buy endpoints (Waxpeer /buy-one-p2p, rust.tm /buy-for)
// only acknowledge the source queued the request. The seller bot may still
// fail to send the Steam trade offer, the source may decline mid-flight, or
// the buyer may reject. None of that is reflected in our DB without explicit
// polling. Before this worker existed, we marked Order=FULFILLED on the buy
// response, so the UI lied to buyers whose trades silently never arrived
// (live incident 2026-05-22).
//
// Flow: every tick walk Trade rows with status SENDING|SENT, grouped by
// provider (botSteamId64 prefix tells us which source), call the matching
// provider's batch status endpoint, then transition based on normalised state:
//   - sent      → Trade.SENT     + Order.FULFILLED (fulfilledAt=now)
//   - accepted  → Trade.ACCEPTED (Order already FULFILLED, terminal)
//   - declined  → Trade.DECLINED + refund the buyer
//   - preparing / unknown → leave alone, re-poll next tick
//
// Beyond a 25-minute SENDING window we flag the Trade with errorCode
// {PROVIDER}_TIMEOUT and emit an AuditLog row so an operator can resolve it
// manually — auto-refund is too risky in this window (the source may still
// deliver late).

import type { Job } from 'bullmq';
import pino from 'pino';
import { prisma } from '@rustskinpay/db';
import { waxpeer } from '../waxpeer-client.js';
import { rusttm } from '../rusttm-client.js';
import { refundOrder } from '../refund.js';

const log = pino({ name: 'poll-trade-status' });

const POLL_BATCH_SIZE = 50;
/** Don't probe the source before the buy has had a chance to register. */
const MIN_TRADE_AGE_MS = 60 * 1_000;
/** Beyond this window we stop polling SENDING trades and flag for manual review. */
const TIMEOUT_AGE_MS = 25 * 60 * 1_000;

/** Source-agnostic state, normalised across Waxpeer + rust.tm. */
type NormalisedState = 'preparing' | 'sent' | 'accepted' | 'declined' | 'unknown';

type Provider = 'WAXPEER_P2P' | 'RUSTTM_P2P';

type PollableTrade = {
  id: string;
  orderId: string;
  /** Provider-specific polling key. For Waxpeer this is their trade id;
   *  for rust.tm this is our custom_id (= SourceTransaction.id). */
  pollKey: string;
  status: 'SENDING' | 'SENT';
  provider: Provider;
};

type StatusResult = {
  pollKey: string;
  state: NormalisedState;
  rawStatus: number | null;
  reason: string | null;
  sendUntil: number | null;
};

export async function pollTradeStatus(_job: Job): Promise<void> {
  const now = new Date();
  const youngestPollable = new Date(now.getTime() - MIN_TRADE_AGE_MS);
  const oldestPollable = new Date(now.getTime() - TIMEOUT_AGE_MS);

  // Fast skip: count across BOTH providers. Most ticks fall into this branch
  // because trades typically resolve within minutes.
  const pendingCount = await prisma.trade.count({
    where: {
      botSteamId64: { in: ['WAXPEER_P2P', 'RUSTTM_P2P'] },
      status: { in: ['SENDING', 'SENT'] },
      errorCode: null,
    },
  });
  if (pendingCount === 0) return;

  // Process both providers in parallel.
  await Promise.all([
    pollProvider('WAXPEER_P2P', youngestPollable, oldestPollable),
    pollProvider('RUSTTM_P2P', youngestPollable, oldestPollable),
  ]);

  // Timeout sweep: any SENDING trade older than the window — flag for review.
  await Promise.all([
    flagTimeouts('WAXPEER_P2P', oldestPollable),
    flagTimeouts('RUSTTM_P2P', oldestPollable),
  ]);
}

async function pollProvider(
  provider: Provider,
  youngestPollable: Date,
  oldestPollable: Date,
): Promise<void> {
  const candidates = (await prisma.trade.findMany({
    where: {
      botSteamId64: provider,
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
    .filter((t): t is { id: string; orderId: string; tradeOfferId: string; status: 'SENDING' | 'SENT' } => t.tradeOfferId !== null)
    .map((t) => ({ id: t.id, orderId: t.orderId, pollKey: t.tradeOfferId, status: t.status, provider }));

  if (polled.length === 0) return;

  log.info({ provider, count: polled.length }, 'polling source for trade outcomes');
  let results: StatusResult[];
  try {
    results = await fetchStatuses(provider, polled.map((t) => t.pollKey));
  } catch (err) {
    log.error({ provider, err }, 'status check failed; will retry next tick');
    return;
  }

  const byKey = new Map(results.map((r) => [r.pollKey, r]));
  for (const trade of polled) {
    const status = byKey.get(trade.pollKey);
    if (!status) continue;
    try {
      await applyTradeStatus(trade, status);
    } catch (err) {
      log.error({ err, tradeId: trade.id, pollKey: trade.pollKey }, 'failed to apply trade status');
    }
  }
}

async function fetchStatuses(provider: Provider, pollKeys: string[]): Promise<StatusResult[]> {
  if (pollKeys.length === 0) return [];
  if (provider === 'WAXPEER_P2P') {
    const raw = await waxpeer.checkTradeStatuses(pollKeys);
    return raw.map((r) => ({
      pollKey: r.id,
      state: r.state,
      rawStatus: r.rawStatus,
      reason: r.reason,
      sendUntil: r.sendUntil,
    }));
  }
  // RUSTTM_P2P
  const raw = await rusttm.checkTradeStatuses(pollKeys);
  return raw.map((r) => ({
    pollKey: r.customId,
    state: r.state,
    rawStatus: r.rawStage,
    reason: r.reason,
    sendUntil: r.sendUntil,
  }));
}

async function applyTradeStatus(trade: PollableTrade, status: StatusResult): Promise<void> {
  const now = new Date();
  const rawMeta = {
    provider: trade.provider,
    pollKey: status.pollKey,
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
        log.info({ ...rawMeta, tradeId: trade.id, orderId: trade.orderId }, 'source reported trade sent — order fulfilled');
      }
      return;
    }
    case 'accepted': {
      // Buyer accepted on Steam. If we somehow jumped past status=sent, fulfil now.
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
      log.info({ ...rawMeta, tradeId: trade.id, orderId: trade.orderId }, 'source reported trade accepted by buyer');
      return;
    }
    case 'declined': {
      // Source refunded our wallet — refund the buyer. refundOrder owns the
      // Payment + Order state transitions, so we only mark the Trade here.
      const errorCode = trade.provider === 'WAXPEER_P2P' ? 'WAXPEER_DECLINED' : 'RUSTTM_DECLINED';
      const refundReason = trade.provider === 'WAXPEER_P2P' ? 'waxpeer_declined' : 'rusttm_declined';
      const tradeFlip = await prisma.trade.updateMany({
        where: { id: trade.id, status: { in: ['SENDING', 'SENT'] } },
        data: {
          status: 'DECLINED',
          errorCode,
          errorMessage: status.reason ?? null,
          completedAt: now,
        },
      });
      if (tradeFlip.count === 0) return; // sibling tick already handled it
      log.warn({ ...rawMeta, tradeId: trade.id, orderId: trade.orderId }, 'source reported trade declined — refunding buyer');
      const refund = await refundOrder(trade.orderId, `${refundReason}:${status.reason ?? 'unknown'}`);
      log.warn({ tradeId: trade.id, orderId: trade.orderId, refund }, 'refund issued after source decline');
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

async function flagTimeouts(provider: Provider, oldestPollable: Date): Promise<void> {
  const errorCode = provider === 'WAXPEER_P2P' ? 'WAXPEER_TIMEOUT' : 'RUSTTM_TIMEOUT';
  const stalled = await prisma.trade.findMany({
    where: {
      botSteamId64: provider,
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
      data: { errorCode },
    });
    if (flagged.count === 0) continue;
    log.warn({ provider, tradeId: s.id, orderId: s.orderId, pollKey: s.tradeOfferId }, 'source trade timed out — flagged for manual review');
    await prisma.auditLog.create({
      data: {
        actorType: 'SYSTEM',
        action: 'trade.timeout',
        entityType: 'Trade',
        entityId: s.id,
        metadata: { provider, orderId: s.orderId, pollKey: s.tradeOfferId },
      },
    }).catch((err) => log.warn({ err }, 'audit log write failed'));
  }
}

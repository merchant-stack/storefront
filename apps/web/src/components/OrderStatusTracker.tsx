'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { fetchOrder, type OrderStatus, type OrderSummary, type SourceTransactionState } from '@/lib/api';
import { formatPrice } from '@/lib/format';
import { StatusTrackerSkeleton } from '@/components/Skeleton';

interface Props {
  orderId: string;
}

const TERMINAL_STATUSES: OrderStatus[] = ['FULFILLED', 'FAILED', 'CANCELLED', 'REFUNDED'];

const STATUS_META: Record<OrderStatus, { label: string; tone: 'pending' | 'progress' | 'success' | 'error' }> = {
  PENDING_PAYMENT: { label: 'Awaiting payment', tone: 'pending' },
  PAID: { label: 'Payment received', tone: 'progress' },
  FULFILLING: { label: 'Preparing your delivery', tone: 'progress' },
  FULFILLED: { label: 'Delivered to Steam', tone: 'success' },
  FAILED: { label: 'Failed', tone: 'error' },
  CANCELLED: { label: 'Cancelled', tone: 'error' },
  REFUNDED: { label: 'Refunded', tone: 'error' },
};

const SRC_TX_META: Record<SourceTransactionState, { label: string; tone: 'pending' | 'progress' | 'success' | 'error' }> = {
  PENDING: { label: 'Locating your skin', tone: 'pending' },
  EXECUTING: { label: 'Securing your skin', tone: 'progress' },
  SUCCESS: { label: 'Skin secured', tone: 'success' },
  FAILED: { label: 'Could not locate your skin', tone: 'error' },
  REFUND_REQUIRED: { label: 'Refund pending', tone: 'error' },
};

export const OrderStatusTracker = ({ orderId }: Props) => {
  const [order, setOrder] = useState<OrderSummary | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const tick = async () => {
      const o = await fetchOrder(orderId);
      if (stopped) return;
      setOrder(o);
      setLoaded(true);
      if (o && !TERMINAL_STATUSES.includes(o.status)) {
        timer = setTimeout(tick, 3000);
      }
    };

    void tick();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
  }, [orderId]);

  if (!loaded) {
    return <StatusTrackerSkeleton />;
  }
  if (!order) {
    return (
      <div className="card mt-8 p-6 text-center text-zinc-400">
        Order not found. Check{' '}
        <Link href="/account#orders" className="text-brand hover:underline">
          your history
        </Link>
        .
      </div>
    );
  }

  const orderMeta = STATUS_META[order.status];
  const srcTx = order.sourceTransactions[0];

  return (
    <div className="mt-10 space-y-6">
      <div className="card overflow-hidden">
        {order.items.map((it) => (
          <div key={it.id} className="flex items-center gap-4 p-5">
            {it.iconUrl ? (
              <img
                src={it.iconUrl}
                alt={it.itemName}
                className="h-16 w-16 rounded-lg bg-zinc-950/60 object-contain p-2"
              />
            ) : null}
            <div className="flex-1 min-w-0">
              <div className="truncate font-semibold">{it.itemName}</div>
              <div className="font-mono text-xs text-zinc-500">Order {order.id}</div>
            </div>
            <div className="text-right">
              <div className="label">Paid</div>
              <div className="font-display text-lg font-bold">
                {formatPrice(it.priceMinor, it.currency)}
              </div>
            </div>
          </div>
        ))}
      </div>

      <ol className="space-y-3">
        <Step
          done={order.payments.some((p) => p.status === 'SUCCEEDED')}
          tone="success"
          label="Payment confirmed"
          sub={
            order.payments.find((p) => p.status === 'SUCCEEDED')?.succeededAt
              ? new Date(order.payments.find((p) => p.status === 'SUCCEEDED')!.succeededAt!).toLocaleTimeString()
              : 'Just now'
          }
        />
        <Step
          done={srcTx ? ['SUCCESS', 'FAILED', 'REFUND_REQUIRED'].includes(srcTx.state) : false}
          active={srcTx?.state === 'EXECUTING' || srcTx?.state === 'PENDING'}
          tone={srcTx ? SRC_TX_META[srcTx.state].tone : 'pending'}
          label={srcTx ? SRC_TX_META[srcTx.state].label : 'Locating your skin'}
          sub={srcTx?.errorCode ? `Error: ${srcTx.errorCode}` : undefined}
        />
        <Step
          done={order.status === 'FULFILLED'}
          active={order.status === 'FULFILLING'}
          tone={
            order.status === 'FULFILLED' ? 'success' : order.status === 'FAILED' ? 'error' : 'pending'
          }
          label="Steam trade offer sent"
          sub={
            order.fulfilledAt
              ? new Date(order.fulfilledAt).toLocaleTimeString()
              : order.status === 'FULFILLING'
                ? 'Bot is preparing the trade…'
                : undefined
          }
        />
      </ol>

      <div
        className={`card flex items-center justify-between p-5 ${
          orderMeta.tone === 'success'
            ? 'border-emerald-500/30 bg-emerald-500/[0.04]'
            : orderMeta.tone === 'error'
              ? 'border-red-500/30 bg-red-500/[0.04]'
              : ''
        }`}
      >
        <div>
          <div className="label">Order status</div>
          <div className="mt-0.5 font-semibold">{orderMeta.label}</div>
        </div>
        <Link href="/account#orders" className="btn-secondary text-sm">
          See all orders
        </Link>
      </div>
    </div>
  );
};

const Step = ({
  done,
  active,
  tone,
  label,
  sub,
}: {
  done: boolean;
  active?: boolean;
  tone: 'pending' | 'progress' | 'success' | 'error';
  label: string;
  sub?: string;
}) => {
  const iconClass = done
    ? 'bg-emerald-500/20 text-emerald-300'
    : active
      ? 'bg-brand/20 text-brand'
      : tone === 'error'
        ? 'bg-red-500/20 text-red-300'
        : 'bg-white/[0.04] text-zinc-500';
  return (
    <li className="card flex items-center gap-4 p-4">
      <div className={`grid h-9 w-9 shrink-0 place-items-center rounded-full ${iconClass}`}>
        {done ? (
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={3}>
            <path strokeLinecap="round" strokeLinejoin="round" d="m5 13 4 4L19 7" />
          </svg>
        ) : active ? (
          <svg viewBox="0 0 24 24" className="h-4 w-4 animate-spin" fill="none">
            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity={0.25} strokeWidth={3} />
            <path d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" strokeWidth={3} strokeLinecap="round" />
          </svg>
        ) : tone === 'error' ? (
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
          </svg>
        ) : (
          <div className="h-2 w-2 rounded-full bg-current" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium">{label}</div>
        {sub ? <div className="mt-0.5 text-xs text-zinc-500">{sub}</div> : null}
      </div>
    </li>
  );
};

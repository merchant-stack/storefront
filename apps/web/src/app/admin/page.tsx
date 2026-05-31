'use client';

import { useEffect, useState } from 'react';
import { API_URL, fetchMe } from '@/lib/api';
import { formatPrice } from '@/lib/format';

interface FunnelData {
  period_days: number;
  funnel: { created: number; opened: number; interacted: number; paid: number };
  devices: { mobile: number; desktop: number; tablet: number };
  avg_time_on_page_ms: number | null;
  tab_closed_count: number;
  recent_sessions: Array<{
    order_id: string;
    amount_minor: number;
    currency: string;
    status: string;
    created_at: string;
    events: string[];
    device: string | null;
  }>;
}

const DAYS_OPTIONS = [1, 7, 30];

const pct = (n: number, of: number) =>
  of === 0 ? '—' : `${Math.round((n / of) * 100)}%`;

const fmt_time = (ms: number | null) => {
  if (ms === null) return '—';
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
  return `${Math.floor(ms / 60_000)}m ${Math.round((ms % 60_000) / 1000)}s`;
};

const EVENT_LABELS: Record<string, string> = {
  page_opened: 'opened',
  user_interacted: 'interacted',
  payment_complete: 'paid',
  tab_closed: 'left',
  error_shown: 'error',
};

const STATUS_DOT: Record<string, string> = {
  PENDING_PAYMENT: 'bg-amber-400',
  PAID: 'bg-sky-400',
  FULFILLING: 'bg-blue-400',
  FULFILLED: 'bg-emerald-400',
  FAILED: 'bg-red-400',
  CANCELLED: 'bg-zinc-400',
  REFUNDED: 'bg-purple-400',
};

export default function AdminPage() {
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [data, setData] = useState<FunnelData | null>(null);
  const [days, setDays] = useState(7);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchMe().then((u) => {
      if (!u || u.role !== 'ADMIN') { setAllowed(false); return; }
      setAllowed(true);
    }).catch(() => setAllowed(false));
  }, []);

  useEffect(() => {
    if (!allowed) return;
    setLoading(true);
    fetch(`${API_URL}/api/admin/analytics?days=${days}`, { credentials: 'include' })
      .then((r) => r.json())
      .then((d) => { setData(d as FunnelData); setLoading(false); })
      .catch(() => setLoading(false));
  }, [allowed, days]);

  if (allowed === false) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-zinc-500">Not found.</p>
      </main>
    );
  }

  if (allowed === null || loading || !data) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-zinc-400 text-sm animate-pulse">Loading…</p>
      </main>
    );
  }

  const { funnel, devices, avg_time_on_page_ms, tab_closed_count, recent_sessions } = data;
  const totalDevices = (devices.mobile ?? 0) + (devices.desktop ?? 0) + (devices.tablet ?? 0);

  const funnelSteps = [
    { label: 'Links created', value: funnel.created, of: funnel.created },
    { label: 'Page opened', value: funnel.opened, of: funnel.created },
    { label: 'Form interacted', value: funnel.interacted, of: funnel.opened },
    { label: 'Paid', value: funnel.paid, of: funnel.interacted },
  ];

  return (
    <main className="min-h-screen bg-zinc-50 px-6 py-10">
      <div className="mx-auto max-w-5xl space-y-8">

        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="font-display text-2xl font-bold text-zinc-900">Analytics</h1>
          <div className="flex gap-1 rounded-lg border border-zinc-200 bg-white p-1 shadow-sm">
            {DAYS_OPTIONS.map((d) => (
              <button
                key={d}
                onClick={() => setDays(d)}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  days === d
                    ? 'bg-zinc-900 text-white'
                    : 'text-zinc-500 hover:text-zinc-800'
                }`}
              >
                {d}d
              </button>
            ))}
          </div>
        </div>

        {/* Funnel */}
        <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          <h2 className="mb-5 text-sm font-semibold uppercase tracking-wide text-zinc-400">Funnel</h2>
          <div className="space-y-4">
            {funnelSteps.map((step, i) => (
              <div key={step.label}>
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="text-sm text-zinc-600">{step.label}</span>
                  <div className="flex items-center gap-3">
                    {i > 0 && (
                      <span className="text-xs text-zinc-400">{pct(step.value, step.of)} of prev</span>
                    )}
                    <span className="font-display text-xl font-bold tabular-nums text-zinc-900">
                      {step.value.toLocaleString()}
                    </span>
                  </div>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-100">
                  <div
                    className="h-full rounded-full bg-zinc-900 transition-all"
                    style={{ width: funnel.created > 0 ? `${(step.value / funnel.created) * 100}%` : '0%' }}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Stats row */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[
            { label: 'Avg time on page', value: fmt_time(avg_time_on_page_ms) },
            { label: 'Left without paying', value: tab_closed_count.toString() },
            { label: 'Conversion', value: pct(funnel.paid, funnel.created) },
            { label: 'Open rate', value: pct(funnel.opened, funnel.created) },
          ].map(({ label, value }) => (
            <div key={label} className="rounded-2xl border border-zinc-200 bg-white px-5 py-4 shadow-sm">
              <p className="text-xs text-zinc-400">{label}</p>
              <p className="mt-1 font-display text-2xl font-bold tabular-nums text-zinc-900">{value}</p>
            </div>
          ))}
        </div>

        {/* Devices */}
        <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          <h2 className="mb-5 text-sm font-semibold uppercase tracking-wide text-zinc-400">Devices</h2>
          <div className="space-y-3">
            {(['desktop', 'mobile', 'tablet'] as const).map((d) => {
              const count = devices[d] ?? 0;
              return (
                <div key={d} className="flex items-center gap-4">
                  <span className="w-16 text-sm capitalize text-zinc-600">{d}</span>
                  <div className="flex-1 overflow-hidden rounded-full bg-zinc-100 h-2">
                    <div
                      className="h-full rounded-full bg-zinc-900 transition-all"
                      style={{ width: totalDevices > 0 ? `${(count / totalDevices) * 100}%` : '0%' }}
                    />
                  </div>
                  <span className="w-16 text-right text-sm tabular-nums text-zinc-500">
                    {count} <span className="text-zinc-300">({pct(count, totalDevices)})</span>
                  </span>
                </div>
              );
            })}
          </div>
        </section>

        {/* Recent sessions */}
        <section className="rounded-2xl border border-zinc-200 bg-white shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-zinc-100">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-400">Recent sessions</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-100 text-xs text-zinc-400">
                  <th className="px-6 py-3 text-left font-medium">Order</th>
                  <th className="px-4 py-3 text-left font-medium">Amount</th>
                  <th className="px-4 py-3 text-left font-medium">Status</th>
                  <th className="px-4 py-3 text-left font-medium">Events</th>
                  <th className="px-4 py-3 text-left font-medium">Device</th>
                  <th className="px-4 py-3 text-left font-medium">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-50">
                {recent_sessions.map((s) => (
                  <tr key={s.order_id} className="hover:bg-zinc-50 transition-colors">
                    <td className="px-6 py-3 font-mono text-xs text-zinc-400">
                      {s.order_id.slice(-8)}
                    </td>
                    <td className="px-4 py-3 tabular-nums text-zinc-700">
                      {formatPrice(s.amount_minor, s.currency)}
                    </td>
                    <td className="px-4 py-3">
                      <span className="flex items-center gap-1.5">
                        <span className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[s.status] ?? 'bg-zinc-300'}`} />
                        <span className="text-xs text-zinc-500">{s.status.replace(/_/g, ' ').toLowerCase()}</span>
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {[...new Set(s.events)].map((e) => (
                          <span
                            key={e}
                            className={`inline-block rounded px-1.5 py-0.5 text-[11px] font-medium ${
                              e === 'payment_complete'
                                ? 'bg-emerald-50 text-emerald-700'
                                : e === 'tab_closed'
                                ? 'bg-red-50 text-red-600'
                                : e === 'user_interacted'
                                ? 'bg-blue-50 text-blue-600'
                                : 'bg-zinc-100 text-zinc-500'
                            }`}
                          >
                            {EVENT_LABELS[e] ?? e}
                          </span>
                        ))}
                        {s.events.length === 0 && (
                          <span className="text-xs text-zinc-300">no events</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs capitalize text-zinc-400">{s.device ?? '—'}</td>
                    <td className="px-4 py-3 text-xs tabular-nums text-zinc-400">
                      {new Date(s.created_at).toLocaleString('en-GB', {
                        day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
                      })}
                    </td>
                  </tr>
                ))}
                {recent_sessions.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-6 py-8 text-center text-sm text-zinc-400">
                      No sessions in this period.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

      </div>
    </main>
  );
}

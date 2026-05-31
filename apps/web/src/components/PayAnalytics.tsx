'use client';

// Funnel analytics for /pay pages.
//
// Fires lightweight beacons to POST /api/pay-events on:
//   page_opened  — on mount (user opened the pay link)
//   tab_closed   — visibilitychange=hidden (left without paying)
//
// user_interacted and payment_complete are fired from PayEmbed which owns
// the Whop iframe interaction context.
//
// Uses navigator.sendBeacon for tab_closed so the request survives page
// unload. Falls back to fetch with keepalive for browsers that lack it.

import { useEffect } from 'react';
import { API_URL } from '@/lib/api';

export function firePayEvent(
  orderId: string,
  eventType: string,
  extra?: { timeOnPageMs?: number; errorCode?: string },
) {
  const body = JSON.stringify({ orderId, eventType, ...extra });
  const url = `${API_URL}/api/pay-events`;
  if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
    navigator.sendBeacon(url, new Blob([body], { type: 'application/json' }));
  } else {
    fetch(url, {
      method: 'POST',
      body,
      headers: { 'Content-Type': 'application/json' },
      keepalive: true,
    }).catch(() => {});
  }
}

interface Props {
  orderId: string;
}

export const PayAnalytics = ({ orderId }: Props) => {
  useEffect(() => {
    const start = Date.now();

    firePayEvent(orderId, 'page_opened');

    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        firePayEvent(orderId, 'tab_closed', { timeOnPageMs: Date.now() - start });
      }
    };

    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, [orderId]);

  return null;
};

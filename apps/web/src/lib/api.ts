export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export interface SessionUser {
  id: string;
  steamId64: string;
  displayName: string;
  avatarUrl: string | null;
  tradeUrl: string | null;
  role: 'USER' | 'ADMIN';
  createdAt: string;
}

export const fetchMe = async (): Promise<SessionUser | null> => {
  try {
    const res = await fetch(`${API_URL}/auth/me`, {
      credentials: 'include',
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { user: SessionUser };
    return data.user;
  } catch {
    return null;
  }
};

export const logout = async (): Promise<void> => {
  await fetch(`${API_URL}/auth/logout`, {
    method: 'POST',
    credentials: 'include',
  });
};

export const steamLoginUrl = (): string => `${API_URL}/auth/steam/login`;

// ----- Orders -----

export type OrderStatus =
  | 'PENDING_PAYMENT'
  | 'PAID'
  | 'FULFILLING'
  | 'FULFILLED'
  | 'FAILED'
  | 'CANCELLED'
  | 'REFUNDED';

export type SourceTransactionState =
  | 'PENDING'
  | 'EXECUTING'
  | 'SUCCESS'
  | 'FAILED'
  | 'REFUND_REQUIRED';

export interface OrderItemDTO {
  id: string;
  itemName: string;
  iconUrl: string | null;
  priceMinor: number;
  currency: string;
}

export interface OrderSummary {
  id: string;
  status: OrderStatus;
  totalAmountMinor: number;
  currency: string;
  createdAt: string;
  paidAt: string | null;
  fulfilledAt: string | null;
  items: OrderItemDTO[];
  sourceTransactions: Array<{
    id: string;
    state: SourceTransactionState;
    errorCode: string | null;
    succeededAt: string | null;
  }>;
  payments: Array<{
    id: string;
    status: string;
    provider: string;
    succeededAt: string | null;
  }>;
}

export const fetchMyOrders = async (
  cursor?: string,
): Promise<{ orders: OrderSummary[]; nextCursor: string | null }> => {
  const q = cursor ? `?cursor=${encodeURIComponent(cursor)}` : '';
  const res = await fetch(`${API_URL}/api/me/orders${q}`, {
    credentials: 'include',
    cache: 'no-store',
  });
  if (!res.ok) return { orders: [], nextCursor: null };
  return (await res.json()) as { orders: OrderSummary[]; nextCursor: string | null };
};

export const fetchOrder = async (orderId: string): Promise<OrderSummary | null> => {
  const res = await fetch(`${API_URL}/api/orders/${orderId}`, {
    credentials: 'include',
    cache: 'no-store',
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { order: OrderSummary };
  return data.order;
};

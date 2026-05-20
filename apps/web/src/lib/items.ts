import { API_URL } from './api';

export interface ItemDTO {
  id: string;
  displayName: string;
  marketHashName: string;
  iconUrl: string | null;
  type: string | null;
  rarity: string | null;
  salePriceMinor: number;
  currency: string;
  provider: 'DMARKET' | 'SKINPORT' | 'LIS_SKINS';
  available?: boolean;
  lastSyncedAt: string;
}

export interface ItemsPage {
  items: ItemDTO[];
  nextCursor: string | null;
}

export interface ItemsFilters {
  q?: string;
  type?: string;
  rarity?: string;
  sort?: 'newest' | 'price_asc' | 'price_desc';
  cursor?: string;
  limit?: number;
}

const buildQuery = (filters: ItemsFilters): string => {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined || value === null || value === '') continue;
    params.set(key, String(value));
  }
  const qs = params.toString();
  return qs ? `?${qs}` : '';
};

export const getItems = async (filters: ItemsFilters = {}): Promise<ItemsPage> => {
  const res = await fetch(`${API_URL}/api/items${buildQuery(filters)}`, { cache: 'no-store' });
  if (!res.ok) return { items: [], nextCursor: null };
  return (await res.json()) as ItemsPage;
};

export const getItem = async (id: string): Promise<ItemDTO | null> => {
  const res = await fetch(`${API_URL}/api/items/${id}`, { cache: 'no-store' });
  if (!res.ok) return null;
  const data = (await res.json()) as { item: ItemDTO };
  return data.item;
};

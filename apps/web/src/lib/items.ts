import { API_URL } from './api';

export interface ItemDTO {
  id: string;
  displayName: string;
  marketHashName: string;
  iconUrl: string | null;
  /** Hex without leading `#`. May be null if the source didn't supply one. */
  iconBackgroundColor: string | null;
  type: string | null;
  rarity: string | null;
  salePriceMinor: number;
  currency: string;
  /** False when the item is currently above our fulfilment ceiling — UI shows "restocking soon". */
  purchasable: boolean;
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

export interface Facets {
  types: Array<{ value: string; count: number }>;
  rarities: Array<{ value: string; count: number }>;
}

export const getFacets = async (): Promise<Facets> => {
  const res = await fetch(`${API_URL}/api/items/facets`, { next: { revalidate: 60 } });
  if (!res.ok) return { types: [], rarities: [] };
  return (await res.json()) as Facets;
};

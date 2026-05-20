// API-side DMarket client. Thin wrapper around the shared factory bound to this
// app's env. Worker has its own client instance with its own env.

import { createDMarketClient, applyMarkup as sharedApplyMarkup } from '@rustskinpay/shared/dmarket';
import type {
  DMarketOffer,
  DMarketBuyResult,
  DMarketBalance,
} from '@rustskinpay/shared/dmarket';
import { env } from '../env.js';

const client = createDMarketClient({
  publicKey: env.DMARKET_PUBLIC_KEY,
  secretKey: env.DMARKET_SECRET_KEY,
  baseUrl: env.DMARKET_BASE_URL,
});

export const isMockMode = (): boolean => client.isMock();
export const searchItems = client.searchItems.bind(client);
export const buyOffer = client.buyOffer.bind(client);
export const getBalance = client.getBalance.bind(client);
export const applyMarkup = sharedApplyMarkup;

export type { DMarketOffer, DMarketBuyResult, DMarketBalance };

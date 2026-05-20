// Worker-side DMarket client bound to the worker's env.
import { createDMarketClient } from '@rustskinpay/shared/dmarket';
import { env } from './env.js';

export const dmarket = createDMarketClient({
  publicKey: env.DMARKET_PUBLIC_KEY,
  secretKey: env.DMARKET_SECRET_KEY,
  baseUrl: env.DMARKET_BASE_URL,
});

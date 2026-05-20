// Worker-side Waxpeer client bound to the worker's env.
import { createWaxpeerClient } from '@rustskinpay/shared/waxpeer';
import { env } from './env.js';

export const waxpeer = createWaxpeerClient({
  apiKey: env.WAXPEER_API_KEY,
});

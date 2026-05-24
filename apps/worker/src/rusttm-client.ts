// Worker-side rust.tm client bound to the worker's env.
import { createRustTmClient } from '@rustskinpay/shared/rusttm';
import { env } from './env.js';

export const rusttm = createRustTmClient({
  apiKey: env.RUSTTM_API_KEY,
});

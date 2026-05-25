// Merchant resolution for the deposit gateway.
//
// Phase 1 supports a single merchant (cobalt.skin) with secrets in env vars.
// The DB Merchant row is just a foreign-key anchor — no plaintext secrets in
// the DB (so a SQL-injection / leak doesn't expose the HMAC keys). Future
// Phase 2 with self-service onboarding will move secrets into encrypted-at-rest
// DB columns, but that's a deliberate trade-off, not a refactor we should
// pre-build for here.

import { prisma } from '@rustskinpay/db';
import type { Merchant } from '@rustskinpay/db';
import { env } from '../env.js';
import type { IpAllowEntry } from './ip-allowlist.js';

export interface MerchantContext {
  merchant: Merchant;
  /** HMAC secret used to verify inbound signed requests from this merchant. */
  apiSecret: string;
  /** Domains we accept in inbound return_url params (open-redirect defence). */
  allowedReturnDomains: Set<string>;
  /**
   * IP allowlist for inbound calls. Empty = disabled (HMAC alone protects).
   * Non-empty = caller IP must be present, or request is rejected with
   * generic 401 before signature verification runs.
   */
  allowedIps: IpAllowEntry[];
}

const COBALT_MERCHANT_ID = 'm_cobalt_skin';

/**
 * Resolve a merchant context by id (the value of the X-Merchant-Id header).
 * Returns null when:
 *   - the merchant id is unknown,
 *   - the merchant is not ACTIVE,
 *   - the merchant's secrets aren't configured in env (i.e. we'd accept the
 *     row but can't actually verify their signatures).
 *
 * The "unknown vs misconfigured" distinction is intentionally collapsed in
 * the return value so an attacker probing the API can't enumerate merchants.
 */
export async function resolveMerchantContext(
  merchantIdHeader: string,
): Promise<MerchantContext | null> {
  // Phase 1: only the cobalt.skin merchant is wired.
  if (merchantIdHeader !== COBALT_MERCHANT_ID) return null;
  if (!env.MERCHANT_COBALT_API_SECRET) return null;

  const merchant = await prisma.merchant.findUnique({ where: { id: merchantIdHeader } });
  if (!merchant) return null;
  if (merchant.status !== 'ACTIVE') return null;
  if (merchant.isInternal) return null; // internal merchant uses the storefront /api/checkout path, not /api/merchant

  return {
    merchant,
    apiSecret: env.MERCHANT_COBALT_API_SECRET,
    allowedReturnDomains: env.MERCHANT_COBALT_ALLOWED_RETURN_DOMAINS_SET,
    allowedIps: env.MERCHANT_COBALT_ALLOWED_IPS_ENTRIES,
  };
}

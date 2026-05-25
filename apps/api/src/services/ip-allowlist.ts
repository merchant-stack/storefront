// Tiny IP allowlist matcher. Defence-in-depth on the merchant gateway: even
// if an attacker steals the HMAC secret, requests from outside the merchant's
// known egress IPs are rejected before signature verification runs.
//
// Supported entry forms (comma-separated in env):
//   - "1.2.3.4"        — exact IPv4
//   - "1.2.3.0/24"     — IPv4 CIDR range
//   - "2001:db8::1"    — exact IPv6 (lowercase canonicalisation only; no
//                        IPv6 CIDR for now — add when a merchant actually
//                        needs it).
//
// IPv4-mapped IPv6 (`::ffff:1.2.3.4` — common when Node binds dual-stack and
// fastify reports the v6 form) is normalised to its v4 form before matching.

export interface Ipv4CidrEntry {
  kind: 'ipv4';
  /** Network address as a 32-bit unsigned int. */
  network: number;
  /** Subnet mask as a 32-bit unsigned int. */
  mask: number;
}
export interface IpExactEntry {
  kind: 'exact';
  /** Lowercased address string for direct comparison (used for IPv6). */
  value: string;
}
export type IpAllowEntry = Ipv4CidrEntry | IpExactEntry;

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  let n = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const v = Number(part);
    if (v < 0 || v > 255) return null;
    n = (n * 256) + v;
  }
  return n >>> 0;
}

/**
 * Parse a comma-separated allowlist string into a list of match entries.
 * Invalid items are silently dropped so a typo doesn't crash boot — but a
 * warning is logged so the operator notices. Use {@link describeAllowlist}
 * after parsing if you want to surface unparsed entries.
 */
export function parseIpAllowlist(raw: string): {
  entries: IpAllowEntry[];
  rejected: string[];
} {
  const entries: IpAllowEntry[] = [];
  const rejected: string[] = [];
  for (const item of raw.split(',').map((s) => s.trim()).filter(Boolean)) {
    if (item.includes('/')) {
      const [addr, bitsStr] = item.split('/');
      const bits = Number(bitsStr);
      const intAddr = addr != null ? ipv4ToInt(addr) : null;
      if (intAddr === null || !Number.isInteger(bits) || bits < 0 || bits > 32) {
        rejected.push(item);
        continue;
      }
      // bits=0 must produce mask=0; the shift trick (<< 32) is a no-op in JS so
      // handle it explicitly. Same for bits=32 → mask=0xFFFFFFFF.
      const mask = bits === 0 ? 0 : ((0xFFFFFFFF << (32 - bits)) >>> 0);
      entries.push({ kind: 'ipv4', network: (intAddr & mask) >>> 0, mask });
      continue;
    }
    const intAddr = ipv4ToInt(item);
    if (intAddr !== null) {
      entries.push({ kind: 'ipv4', network: intAddr, mask: 0xFFFFFFFF });
      continue;
    }
    // Assume anything else is IPv6 (or an IPv6-shaped string). Lowercase for
    // canonical comparison — Node sometimes reports `::FFFF:` upper-case.
    if (item.includes(':')) {
      entries.push({ kind: 'exact', value: item.toLowerCase() });
      continue;
    }
    rejected.push(item);
  }
  return { entries, rejected };
}

/**
 * Check whether a given client IP matches any entry in the allowlist.
 * An EMPTY allowlist returns true (i.e. "no allowlist configured = allow
 * all"). Callers that want a fail-closed default should check
 * `entries.length === 0` themselves before calling this.
 */
export function isIpAllowed(rawIp: string, entries: IpAllowEntry[]): boolean {
  if (entries.length === 0) return true;
  const normalised = normaliseIp(rawIp);
  const asInt = ipv4ToInt(normalised);
  if (asInt !== null) {
    for (const e of entries) {
      if (e.kind === 'ipv4' && ((asInt & e.mask) >>> 0) === e.network) return true;
    }
  }
  const lower = normalised.toLowerCase();
  for (const e of entries) {
    if (e.kind === 'exact' && e.value === lower) return true;
  }
  return false;
}

function normaliseIp(ip: string): string {
  // `::ffff:1.2.3.4` → `1.2.3.4`. This is the IPv4-in-IPv6 form Node uses
  // when the server is bound dual-stack and the client connects over IPv4.
  const m = ip.match(/^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/i);
  if (m && m[1]) return m[1];
  return ip;
}

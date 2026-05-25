import { describe, expect, it } from 'vitest';
import { isIpAllowed, parseIpAllowlist } from './ip-allowlist.js';

describe('parseIpAllowlist', () => {
  it('parses an empty string as no entries', () => {
    const { entries, rejected } = parseIpAllowlist('');
    expect(entries).toEqual([]);
    expect(rejected).toEqual([]);
  });

  it('parses a single IPv4 as a /32 entry', () => {
    const { entries, rejected } = parseIpAllowlist('1.2.3.4');
    expect(entries).toHaveLength(1);
    expect(entries[0]?.kind).toBe('ipv4');
    expect(rejected).toEqual([]);
  });

  it('parses an IPv4 CIDR range', () => {
    const { entries } = parseIpAllowlist('10.0.0.0/24');
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ kind: 'ipv4', mask: 0xffffff00 });
  });

  it('parses /0 as a wildcard ipv4 match', () => {
    const { entries } = parseIpAllowlist('0.0.0.0/0');
    expect(entries[0]).toMatchObject({ kind: 'ipv4', network: 0, mask: 0 });
  });

  it('parses /32 as exact-match mask', () => {
    const { entries } = parseIpAllowlist('1.2.3.4/32');
    expect(entries[0]).toMatchObject({ kind: 'ipv4', mask: 0xffffffff });
  });

  it('parses IPv6 as exact-match (lowercased)', () => {
    const { entries } = parseIpAllowlist('2001:DB8::1');
    expect(entries[0]).toEqual({ kind: 'exact', value: '2001:db8::1' });
  });

  it('drops malformed entries into rejected list', () => {
    const { entries, rejected } = parseIpAllowlist('1.2.3.4,nonsense,256.0.0.1,5.6.7.8/40');
    expect(entries).toHaveLength(1); // only 1.2.3.4 survives
    expect(rejected).toEqual(['nonsense', '256.0.0.1', '5.6.7.8/40']);
  });
});

describe('isIpAllowed', () => {
  it('returns true for an empty allowlist (disabled mode)', () => {
    expect(isIpAllowed('1.2.3.4', [])).toBe(true);
  });

  it('matches exact IPv4', () => {
    const { entries } = parseIpAllowlist('1.2.3.4');
    expect(isIpAllowed('1.2.3.4', entries)).toBe(true);
    expect(isIpAllowed('1.2.3.5', entries)).toBe(false);
  });

  it('matches inside a /24', () => {
    const { entries } = parseIpAllowlist('10.0.0.0/24');
    expect(isIpAllowed('10.0.0.1', entries)).toBe(true);
    expect(isIpAllowed('10.0.0.255', entries)).toBe(true);
    expect(isIpAllowed('10.0.1.0', entries)).toBe(false);
  });

  it('matches inside a /28', () => {
    const { entries } = parseIpAllowlist('203.0.113.0/28');
    expect(isIpAllowed('203.0.113.0', entries)).toBe(true);
    expect(isIpAllowed('203.0.113.15', entries)).toBe(true);
    expect(isIpAllowed('203.0.113.16', entries)).toBe(false);
  });

  it('strips ::ffff: IPv4-mapped IPv6 prefix before matching', () => {
    const { entries } = parseIpAllowlist('1.2.3.4');
    expect(isIpAllowed('::ffff:1.2.3.4', entries)).toBe(true);
    expect(isIpAllowed('::FFFF:1.2.3.4', entries)).toBe(true);
  });

  it('matches IPv6 by exact lowercased string', () => {
    const { entries } = parseIpAllowlist('2001:db8::1');
    expect(isIpAllowed('2001:DB8::1', entries)).toBe(true);
    expect(isIpAllowed('2001:db8::2', entries)).toBe(false);
  });

  it('handles a mixed allowlist of v4 + CIDR + v6', () => {
    const { entries } = parseIpAllowlist('1.2.3.4,10.0.0.0/8,2001:db8::1');
    expect(isIpAllowed('1.2.3.4', entries)).toBe(true);
    expect(isIpAllowed('10.99.99.99', entries)).toBe(true);
    expect(isIpAllowed('2001:db8::1', entries)).toBe(true);
    expect(isIpAllowed('8.8.8.8', entries)).toBe(false);
  });

  it('rejects when neither v4 nor v6 entries match', () => {
    const { entries } = parseIpAllowlist('1.2.3.4');
    expect(isIpAllowed('::1', entries)).toBe(false);
  });
});

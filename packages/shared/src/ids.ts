import { randomBytes } from 'node:crypto';

const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz';

const encode = (bytes: Buffer): string => {
  let out = '';
  for (const b of bytes) {
    out += ALPHABET[b % ALPHABET.length];
  }
  return out;
};

export const newId = (prefix: string, length = 24): string => {
  return `${prefix}_${encode(randomBytes(length))}`;
};

export const orderId = (): string => newId('ord');
export const listingId = (): string => newId('lst');
export const paymentId = (): string => newId('pay');
export const tradeId = (): string => newId('trd');
export const merchantId = (): string => newId('mrc');

export type Currency = 'USD' | 'EUR';

export interface Money {
  amountMinor: number;
  currency: Currency;
}

export const money = (amountMinor: number, currency: Currency = 'USD'): Money => ({
  amountMinor: Math.round(amountMinor),
  currency,
});

export const formatMoney = ({ amountMinor, currency }: Money): string => {
  const major = amountMinor / 100;
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(major);
};

export const addMoney = (a: Money, b: Money): Money => {
  if (a.currency !== b.currency) {
    throw new Error(`currency mismatch: ${a.currency} vs ${b.currency}`);
  }
  return { amountMinor: a.amountMinor + b.amountMinor, currency: a.currency };
};

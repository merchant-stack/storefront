// Single source of truth for the customer support contact + legal operator
// identity. Legal pages and the footer pick these up.
export const SUPPORT_EMAIL = 'RustSkinPay@proton.me';
export const SUPPORT_MAILTO = `mailto:${SUPPORT_EMAIL}`;

export const LEGAL_ENTITY = {
  name: 'I.E. Artem Shits',
  registrationNumber: '286.1573426',
  registrationLabel: 'State Registration Number',
  address: {
    line1: 'N. Zaryan Street, Building 22A',
    district: 'Arabkir District',
    city: 'Yerevan',
    country: 'Armenia',
  },
} as const;

export const LEGAL_ENTITY_ONE_LINE = `${LEGAL_ENTITY.name}, ${LEGAL_ENTITY.registrationLabel} ${LEGAL_ENTITY.registrationNumber}, ${LEGAL_ENTITY.address.line1}, ${LEGAL_ENTITY.address.district}, ${LEGAL_ENTITY.address.city}, ${LEGAL_ENTITY.address.country}`;

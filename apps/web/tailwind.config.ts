import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: '#ff5a1f',
          dark: '#cc4719',
        },
      },
    },
  },
  plugins: [],
};

export default config;

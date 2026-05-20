import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx,mdx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
        display: ['var(--font-display)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'ui-monospace', 'monospace'],
      },
      colors: {
        brand: {
          50: '#fff4ed',
          100: '#ffe6d4',
          200: '#ffc8a8',
          300: '#ffa170',
          400: '#ff7d3d',
          500: '#ff5a1f',
          DEFAULT: '#ff5a1f',
          600: '#f04111',
          700: '#c52f0d',
          800: '#9d2812',
          900: '#7e2412',
          dark: '#cc4719',
        },
        rarity: {
          common: '#9ca3af',
          uncommon: '#22c55e',
          rare: '#3b82f6',
          epic: '#a855f7',
          legendary: '#f59e0b',
        },
        surface: {
          DEFAULT: 'rgba(255,255,255,0.03)',
          elevated: 'rgba(255,255,255,0.05)',
          hover: 'rgba(255,255,255,0.07)',
        },
      },
      boxShadow: {
        glow: '0 0 30px -8px rgba(255,90,31,0.45)',
        'glow-lg': '0 0 60px -10px rgba(255,90,31,0.55)',
        card: '0 4px 24px -8px rgba(0,0,0,0.5)',
      },
      backgroundImage: {
        'gradient-radial':
          'radial-gradient(ellipse 80% 60% at 50% -10%, rgba(255,90,31,0.15), transparent 60%)',
        'gradient-card':
          'linear-gradient(180deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.01) 100%)',
      },
      animation: {
        'pulse-glow': 'pulse-glow 2.5s ease-in-out infinite',
        'fade-in': 'fade-in 0.3s ease-out',
        shimmer: 'shimmer 2s linear infinite',
      },
      keyframes: {
        'pulse-glow': {
          '0%, 100%': { opacity: '1', filter: 'drop-shadow(0 0 8px rgba(255,90,31,0.4))' },
          '50%': { opacity: '0.85', filter: 'drop-shadow(0 0 16px rgba(255,90,31,0.7))' },
        },
        'fade-in': {
          '0%': { opacity: '0', transform: 'translateY(4px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
      },
    },
  },
  plugins: [],
};

export default config;

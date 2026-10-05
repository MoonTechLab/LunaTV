import type { Config } from 'tailwindcss';
import defaultTheme from 'tailwindcss/defaultTheme';

const config: Config = {
  darkMode: 'class',
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      screens: {
        'mobile-landscape': {
          raw: '(orientation: landscape) and (max-height: 700px)',
        },
      },
      fontFamily: {
        primary: ['Inter', ...defaultTheme.fontFamily.sans],
      },
      colors: {
        // ponytail: 品牌粉，全站 green/emerald/lime 语义类重定向到此
        'pastel-pink': {
          50: '#fff1f4',
          100: '#ffe3e9',
          200: '#ffd3df',
          300: '#ffa2bb',
          400: '#fe6e99',
          500: '#f83b78',
          600: '#e51964',
          700: '#c20e55',
          800: '#a20f4e',
          900: '#8a1148',
          950: '#4d0424',
        },
        green: {
          50: '#fff1f4',
          100: '#ffe3e9',
          200: '#ffd3df',
          300: '#ffa2bb',
          400: '#fe6e99',
          500: '#f83b78',
          600: '#e51964',
          700: '#c20e55',
          800: '#a20f4e',
          900: '#8a1148',
          950: '#4d0424',
        },
        emerald: {
          50: '#fff1f4',
          100: '#ffe3e9',
          200: '#ffd3df',
          300: '#ffa2bb',
          400: '#fe6e99',
          500: '#f83b78',
          600: '#e51964',
          700: '#c20e55',
          800: '#a20f4e',
          900: '#8a1148',
          950: '#4d0424',
        },
        lime: {
          50: '#fff1f4',
          100: '#ffe3e9',
          200: '#ffd3df',
          300: '#ffa2bb',
          400: '#fe6e99',
          500: '#f83b78',
          600: '#e51964',
          700: '#c20e55',
          800: '#a20f4e',
          900: '#8a1148',
          950: '#4d0424',
        },
        primary: {
          50: '#f0f9ff',
          100: '#e0f2fe',
          200: '#bae6fd',
          300: '#7dd3fc',
          400: '#38bdf8',
          500: '#0ea5e9',
          600: '#0284c7',
          700: '#0369a1',
          800: '#075985',
          900: '#0c4a6e',
        },
        dark: '#222222',
      },
      keyframes: {
        flicker: {
          '0%, 19.999%, 22%, 62.999%, 64%, 64.999%, 70%, 100%': {
            opacity: '0.99',
            filter:
              'drop-shadow(0 0 1px rgba(252, 211, 77)) drop-shadow(0 0 15px rgba(245, 158, 11)) drop-shadow(0 0 1px rgba(252, 211, 77))',
          },
          '20%, 21.999%, 63%, 63.999%, 65%, 69.999%': {
            opacity: '0.4',
            filter: 'none',
          },
        },
        shimmer: {
          '0%': {
            backgroundPosition: '-700px 0',
          },
          '100%': {
            backgroundPosition: '700px 0',
          },
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { transform: 'translateY(10px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        slideDown: {
          '0%': { transform: 'translateY(-10px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        slideInFromRight: {
          '0%': { transform: 'translateX(100%)', opacity: '0' },
          '100%': { transform: 'translateX(0)', opacity: '1' },
        },
      },
      animation: {
        flicker: 'flicker 3s linear infinite',
        shimmer: 'shimmer 1.3s linear infinite',
        'fade-in': 'fadeIn 0.3s ease-in-out',
        'slide-up': 'slideUp 0.3s ease-in-out',
        'slide-down': 'slideDown 0.3s ease-in-out',
        'slide-in-from-right': 'slideInFromRight 0.3s ease-out',
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'gradient-conic':
          'conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))',
      },
    },
  },
  plugins: [require('@tailwindcss/forms')],
} satisfies Config;

export default config;

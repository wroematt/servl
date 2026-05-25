import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#5E6B43',
          light: '#EEF0E8',
          hover: '#4A5534',
        },
        surface: '#FFFFFF',
        bg: '#F5F4F0',
        border: {
          DEFAULT: '#E2E0D8',
          strong: '#C8C6BC',
        },
        accent: '#AA835B',
        muted: '#B7BFA8',
        brand: '#909C75',
        text: {
          DEFAULT: '#1A1A18',
          secondary: '#5C5C58',
          tertiary: '#9C9C96',
        },
        success: {
          DEFAULT: '#0F6E56',
          light: '#EAF3DE',
        },
        warning: {
          DEFAULT: '#854F0B',
          light: '#FAEEDA',
        },
        danger: {
          DEFAULT: '#A32D2D',
          light: '#FCEBEB',
        },
      },
      fontFamily: {
        sans: ['var(--font-dm-sans)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-dm-mono)', 'monospace'],
      },
    },
  },
  plugins: [],
};

export default config;

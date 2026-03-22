import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#f0f4ff',
          100: '#dbe4fe',
          500: '#3b63f3',
          600: '#2545e8',
          700: '#1d34d5',
        },
        pix: '#32BCAD',
      },
    },
  },
  plugins: [],
};

export default config;

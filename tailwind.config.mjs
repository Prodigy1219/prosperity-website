/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}'],
  theme: {
    extend: {
      colors: {
        emerald: {
          DEFAULT: '#0f8f4f',
          dark: '#064d32',
          600: '#0f8f4f',
          700: '#0a7040',
          800: '#064d32',
        },
        gold: {
          DEFAULT: '#d9a833',
          light: '#f2d27a',
        },
        charcoal: '#101418',
        slate: {
          900: '#1d252c',
          800: '#252e37',
          700: '#2e3942',
        },
        cream: '#f7f1dc',
      },
      fontFamily: {
        heading: ['Cinzel', 'Georgia', 'serif'],
        body: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Courier New', 'monospace'],
      },
    },
  },
  plugins: [],
};

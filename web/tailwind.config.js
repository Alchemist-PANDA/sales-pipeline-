/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: {
          950: '#0a0a0f',
          900: '#0f0f16',
          850: '#14141d',
          800: '#1a1a24',
          700: '#242430',
          600: '#33333f',
        },
        gold: {
          300: '#f4d58d',
          400: '#eec063',
          500: '#e0a83c',
          600: '#c98a1e',
        },
        emerald: { 400: '#34d399', 500: '#10b981' },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'monospace'],
      },
      boxShadow: {
        glow: '0 0 40px -12px rgba(224,168,60,0.35)',
      },
    },
  },
  plugins: [],
};

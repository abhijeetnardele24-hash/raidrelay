/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        charcoal: {
          950: '#0B0D0F',
          900: '#121417',
          800: '#1A1D21',
          700: '#24282F',
          600: '#323741',
        },
        relay: {
          amber: '#F59E0B',
          cyan: '#06B6D4',
          emerald: '#10B981',
          ruby: '#EF4444',
        },
        chalk: {
          100: '#F5F5F7',
          200: '#D0D3D9',
          400: '#8A909A',
          600: '#525866',
        },
      },
      fontFamily: {
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Monaco', 'Consolas', 'monospace'],
        display: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
      boxShadow: {
        'broadcast': '0 0 24px rgba(0, 0, 0, 0.6), 0 0 1px rgba(255, 255, 255, 0.1)',
        'amber-glow': '0 0 20px rgba(245, 158, 11, 0.35)',
        'cyan-glow': '0 0 20px rgba(6, 182, 212, 0.35)',
        'emerald-glow': '0 0 24px rgba(16, 185, 129, 0.4)',
      },
    },
  },
  plugins: [],
};


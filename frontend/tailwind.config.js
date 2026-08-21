/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: '#2563eb',
          dark: '#1d4ed8',
          light: '#3b82f6',
          soft: '#eff6ff',
        },
        emerald: {
          DEFAULT: '#10b981',
          soft: '#ecfdf5',
        },
        amber: {
          DEFAULT: '#f59e0b',
          soft: '#fffbeb',
        },
        ink: {
          DEFAULT: '#1e293b',
          soft: '#475569',
        },
      },
      boxShadow: {
        card: '0 1px 3px rgba(15,23,42,.06), 0 4px 16px rgba(15,23,42,.05)',
        cardHover: '0 2px 6px rgba(15,23,42,.08), 0 8px 24px rgba(15,23,42,.08)',
        glow: '0 4px 20px -4px rgba(139,92,246,.45)',
        glowIndigo: '0 8px 30px -6px rgba(99,102,241,.45)',
        glowFuchsia: '0 8px 30px -6px rgba(217,70,239,.45)',
        glowEmerald: '0 8px 30px -6px rgba(16,185,129,.45)',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      keyframes: {
        'fade-up': {
          from: { opacity: '0', transform: 'translateY(10px)' },
          to: { opacity: '1', transform: 'none' },
        },
        'fade-in': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        pop: {
          '0%': { opacity: '0', transform: 'scale(.94)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-7px)' },
        },
      },
      animation: {
        'fade-up': 'fade-up .45s ease-out both',
        'fade-in': 'fade-in .35s ease-out both',
        pop: 'pop .3s cubic-bezier(.2,.9,.3,1.35) both',
        float: 'float 5s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};

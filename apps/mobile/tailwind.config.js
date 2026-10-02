/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        primary: '#2563eb',
        'primary-hover': '#1d4ed8',
        danger: '#dc2626',
        surface: '#ffffff',
        'surface-muted': '#f8fafc',
        text: '#0f172a',
        'text-muted': '#64748b',
      },
    },
  },
  plugins: [],
}

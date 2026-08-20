/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'Helvetica Neue', 'sans-serif'],
      },
      colors: {
        // superficies e ink (paleta validada del sistema de dataviz)
        surface: '#fcfcfb',
        plane: '#f9f9f7',
        ink: { DEFAULT: '#0b0b0b', soft: '#52514e', mute: '#898781' },
        line: { DEFAULT: '#e1e0d9', strong: '#c3c2b7' },
        // series categóricas (personas) — validadas all-pairs
        s1: '#2a78d6',
        s2: '#eb6834',
        s3: '#1baf7a',
        // estado — nunca se reutilizan como serie
        good: '#0ca30c',
        goodink: '#006300',
        warning: '#fab219',
        serious: '#ec835a',
        critical: '#d03b3b',
        // rampa secuencial azul
        seq: {
          100: '#cde2fb', 150: '#b7d3f6', 200: '#9ec5f4', 250: '#86b6ef', 300: '#6da7ec',
          350: '#5598e7', 400: '#3987e5', 450: '#2a78d6', 500: '#256abf', 550: '#1c5cab',
          600: '#184f95', 650: '#104281', 700: '#0d366b',
        },
      },
      boxShadow: {
        card: '0 1px 2px rgba(11,11,11,.04), 0 1px 3px rgba(11,11,11,.06)',
        pop: '0 8px 28px rgba(11,11,11,.12)',
      },
      borderRadius: { xl2: '14px' },
    },
  },
  plugins: [],
}

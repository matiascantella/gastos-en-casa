import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { viteSingleFile } from 'vite-plugin-singlefile'

// SINGLE=1 produce un único index.html con todo adentro (para abrir con doble clic).
// Sin la variable, build normal para publicar en Firebase Hosting (con PWA y offline).
const single = process.env.SINGLE === '1'

export default defineConfig({
  base: './',
  plugins: [react(), ...(single ? [viteSingleFile()] : [])],
  build: {
    outDir: single ? 'dist-single' : 'dist',
    chunkSizeWarningLimit: 1200,
  },
})

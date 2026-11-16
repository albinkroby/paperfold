import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rolldownOptions: {
      output: {
        // Vendor chunks: smaller entry file, better caching between releases.
        codeSplitting: {
          groups: [
            { name: 'react',     test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/ },
            { name: 'highlight', test: /node_modules[\\/](highlight\.js|lowlight)[\\/]/ },
            { name: 'editor',    test: /node_modules[\\/](@tiptap|prosemirror-[^\\/]+|marked|turndown[^\\/]*)[\\/]/ },
          ],
        },
      },
    },
  },
  server: {
    port: 5173,
    strictPort: true,
  },
})

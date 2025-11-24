import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'
import { nodePolyfills } from 'vite-plugin-node-polyfills'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    nodePolyfills({
      // Include everything to be safe
      protocolImports: true,
    }),
    react(),
  ],
  resolve: {
    dedupe: ['react', 'react-dom'],
    alias: {
      'react': 'react',
      'react-dom': 'react-dom',
      // Force readable-stream to use the one provided by node-polyfills (which usually maps to stream-browserify)
      // or just let the polyfill plugin handle it.
      // 'readable-stream': 'stream', 
    },
  },
  optimizeDeps: {
    include: ['react', 'react-dom', 'agora-rtc-sdk-ng', 'agora-token'],
    force: true, // Force re-optimization
    esbuildOptions: {
        define: {
            global: 'globalThis'
        },
        // Plugins to handle node built-ins in dependencies if needed, 
        // but vite-plugin-node-polyfills should handle this at the vite level.
    }
  },
  build: {
    commonjsOptions: {
        transformMixedEsModules: true,
    },
    rollupOptions: {
      output: {
        entryFileNames: `assets/[name].[hash].${Date.now()}.js`,
        chunkFileNames: `assets/[name].[hash].${Date.now()}.js`,
        assetFileNames: `assets/[name].[hash].${Date.now()}.[ext]`,
      },
    },
  },
})

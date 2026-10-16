import { defineConfig } from 'vite';

export default defineConfig({
  base: './', // works under https://<user>.github.io/<repo>/
  build: {
    target: 'es2022',
    sourcemap: true,
    chunkSizeWarningLimit: 1600,
    rollupOptions: {
      output: { manualChunks: { three: ['three', 'three/webgpu', 'three/tsl'] } },
    },
  },
  server: { port: 5173 },
});

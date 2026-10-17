import { defineConfig, type Plugin } from 'vite';

// Strict CSP for the production build only: the dev server injects inline
// HMR scripts and styles that this policy would block. GitHub Pages cannot set
// response headers, so it ships as a <meta> tag (frame-ancestors is not
// available that way). style-src-attr allows the `--s` custom property that
// the contacts table sets per row; no inline <style> or <script> is allowed.
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "style-src-attr 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ');

const csp = (): Plugin => ({
  name: 'csp-meta',
  apply: 'build',
  transformIndexHtml: () => [
    { tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: CSP }, injectTo: 'head-prepend' },
    { tag: 'meta', attrs: { name: 'referrer', content: 'no-referrer' }, injectTo: 'head' },
  ],
});

export default defineConfig({
  base: './', // works under https://<user>.github.io/<repo>/
  plugins: [csp()],
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

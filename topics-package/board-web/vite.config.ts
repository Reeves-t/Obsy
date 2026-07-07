import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

// Builds the tldraw board app into ONE self-contained HTML file (all JS + CSS
// inlined) so it can be shipped as a bundled Expo asset and loaded by the
// Topic Board WebView with no network dependency.
//
// Output: ../assets/board/index.html  (consumed by components/topics/board)
export default defineConfig({
    plugins: [react(), viteSingleFile()],
    build: {
        outDir: '../assets/board',
        emptyOutDir: true,
        // Single-file output — keep everything inline, no code-splitting.
        assetsInlineLimit: 100_000_000,
        chunkSizeWarningLimit: 100_000_000,
        rollupOptions: {
            output: {
                inlineDynamicImports: true,
            },
        },
    },
});

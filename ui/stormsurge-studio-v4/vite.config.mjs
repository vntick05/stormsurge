import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import jsconfigPaths from 'vite-jsconfig-paths';
import path from 'path';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const API_URL = env.VITE_APP_BASE_NAME || '/';
  const PORT = 3004;
  const PWS_SERVICE_URL = env.VITE_PWS_SERVICE_URL || 'http://127.0.0.1:3200';
  const API_GATEWAY_URL = env.VITE_API_GATEWAY_URL || 'http://127.0.0.1:8460';
  const DOCUMENT_SERVICE_URL = env.VITE_DOCUMENT_SERVICE_URL || 'http://127.0.0.1:8181';
  const NORMALIZATION_SERVICE_URL = env.VITE_NORMALIZATION_SERVICE_URL || 'http://127.0.0.1:8191';
  const RETRIEVAL_SERVICE_URL = env.VITE_RETRIEVAL_SERVICE_URL || 'http://127.0.0.1:8481';
  const ANALYSIS_SERVICE_URL = env.VITE_ANALYSIS_SERVICE_URL || 'http://127.0.0.1:8192';

  return {
    base: API_URL,
    server: {
      open: false,
      port: PORT,
      host: true,
      proxy: {
        '/api/outline': {
          target: PWS_SERVICE_URL,
          changeOrigin: true,
          rewrite: () => '/v1/pws/merged-import/upload'
        },
        '/api/import': {
          target: PWS_SERVICE_URL,
          changeOrigin: true,
          rewrite: () => '/v1/pws/import/upload'
        },
        '/api/hierarchy': {
          target: PWS_SERVICE_URL,
          changeOrigin: true,
          rewrite: () => '/v1/pws/hierarchy/upload'
        },
        '/api/rich-import': {
          target: PWS_SERVICE_URL,
          changeOrigin: true,
          rewrite: () => '/v1/pws/rich-import/upload'
        },
        '/api/storm': {
          target: PWS_SERVICE_URL,
          changeOrigin: true
        },
        '/api/pws': {
          target: PWS_SERVICE_URL,
          changeOrigin: true
        },
        '/svc/api': {
          target: API_GATEWAY_URL,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/svc\/api/, '')
        },
        '/svc/document': {
          target: DOCUMENT_SERVICE_URL,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/svc\/document/, '')
        },
        '/svc/normalization': {
          target: NORMALIZATION_SERVICE_URL,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/svc\/normalization/, '')
        },
        '/svc/retrieval': {
          target: RETRIEVAL_SERVICE_URL,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/svc\/retrieval/, '')
        },
        '/svc/analysis': {
          target: ANALYSIS_SERVICE_URL,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/svc\/analysis/, '')
        }
      }
    },
    preview: {
      open: false,
      port: 4174,
      host: true,
      fs: {
        allow: ['..']
      }
    },
    define: {
      global: 'window'
    },
    resolve: {
      alias: {
        '@ant-design/icons': path.resolve(__dirname, 'node_modules/@ant-design/icons')
        // Add more aliases as needed
      }
    },
    plugins: [react(), jsconfigPaths()],
    build: {
      chunkSizeWarningLimit: 1000,
      sourcemap: true,
      cssCodeSplit: true,
      rollupOptions: {
        output: {
          chunkFileNames: 'js/[name]-[hash].js',
          entryFileNames: 'js/[name]-[hash].js',
          assetFileNames: (assetInfo) => {
            const name = assetInfo.name || '';
            const ext = name.split('.').pop();
            if (/\.css$/.test(name)) return `css/[name]-[hash].${ext}`;
            if (/\.(png|jpe?g|gif|svg|webp|ico)$/.test(name)) return `images/[name]-[hash].${ext}`;
            if (/\.(woff2?|eot|ttf|otf)$/.test(name)) return `fonts/[name]-[hash].${ext}`;
            return `assets/[name]-[hash].${ext}`;
          }
          // manualChunks: { ... } // Add if you want custom chunk splitting
        }
      },
      // Only drop console/debugger in production
      ...(mode === 'production' && {
        esbuild: {
          drop: ['console', 'debugger'],
          pure: ['console.log', 'console.info', 'console.debug', 'console.warn']
        }
      })
      // No need to set build.target unless you need to support older browsers
      // target: 'baseline-widely-available', // This is now the default
    },
    optimizeDeps: {
      include: ['@mui/material/Tooltip', 'react', 'react-dom', 'react-router-dom']
    }
  };
});

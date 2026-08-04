/**
 * esbuild wrapper for the offline read-cache e2e proof.
 */
const esbuild = require('esbuild');
const path = require('path');

const root = path.join(__dirname, '..');
const webCache = path.join(root, 'mobile/src/services/offlineReadCache.web.ts');
const outfile = path.join(root, 'scripts/_prove-read-cache.bundle.cjs');

async function main() {
  await esbuild.build({
    entryPoints: [path.join(__dirname, 'prove-read-cache-e2e.ts')],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    outfile,
    external: ['pg', 'pg-native', 'dotenv'],
    alias: {
      'react-native': path.join(__dirname, 'shims/react-native.js'),
      '@react-native-async-storage/async-storage': path.join(
        __dirname,
        'shims/async-storage.js'
      ),
      'expo-sqlite': path.join(__dirname, 'shims/expo-sqlite.js'),
      'expo-file-system': path.join(__dirname, 'shims/expo-file-system.js'),
      '@react-native-community/netinfo': path.join(__dirname, 'shims/netinfo.js'),
    },
    plugins: [
      {
        name: 'force-web-read-cache',
        setup(build) {
          build.onResolve({ filter: /offlineReadCache$/ }, (args) => {
            if (args.path.includes('offlineReadCache.web')) return undefined;
            if (args.path.includes('offlineReadCacheTypes')) return undefined;
            return { path: webCache };
          });
          build.onResolve({ filter: /offlineReadCache\.ts$/ }, () => ({ path: webCache }));
        },
      },
    ],
    logLevel: 'info',
  });
  console.log('Bundled →', outfile);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

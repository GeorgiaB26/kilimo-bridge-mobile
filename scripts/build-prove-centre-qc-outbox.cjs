/**
 * esbuild wrapper for centre_qc outbox + conflict proof.
 */
const esbuild = require('esbuild');
const path = require('path');

const root = path.join(__dirname, '..');
const webOutbox = path.join(root, 'mobile/src/services/offlineOutbox.web.ts');
const outfile = path.join(root, 'scripts/_prove-centre-qc-outbox.bundle.cjs');

async function main() {
  await esbuild.build({
    entryPoints: [path.join(__dirname, 'prove-centre-qc-outbox-e2e.ts')],
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
        name: 'force-web-outbox',
        setup(build) {
          build.onResolve({ filter: /offlineOutbox$/ }, (args) => {
            if (args.path.includes('offlineOutbox.web')) return undefined;
            if (args.path.includes('offlineOutboxTypes')) return undefined;
            if (args.path.includes('offlineOutboxHandlers')) return undefined;
            if (args.path.includes('offlineOutboxProcessor')) return undefined;
            if (args.path.includes('offlineOutboxExpected')) return undefined;
            return { path: webOutbox };
          });
          build.onResolve({ filter: /offlineOutbox\.ts$/ }, () => ({ path: webOutbox }));
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

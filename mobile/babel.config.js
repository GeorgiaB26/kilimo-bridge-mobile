const path = require('path');

module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      ['babel-preset-expo', { jsxImportSource: 'nativewind' }],
      'nativewind/babel',
    ],
    // Keep default React JSX runtime inside node_modules so Expo's own .tsx
    // (e.g. withDevTools.web.tsx) is not rewritten to nativewind/jsx-runtime.
    overrides: [
      {
        test: (filename) =>
          typeof filename === 'string' &&
          filename.includes(`${path.sep}node_modules${path.sep}`),
        presets: [['babel-preset-expo', { jsxImportSource: 'react' }]],
      },
    ],
  };
};

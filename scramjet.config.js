// Scramjet configuration — served at /scramjet.config.js
// The SW fetches this to know where all the assets are
self.$scramjet = self.$scramjet || {};
self.$scramjet.config = {
  prefix: '/sj/',
  globals: {
    wrapfn: '$scramjet$wrap',
    wrappropertybase: '$scramjet__',
    wrappropertyfn: '$scramjet$prop',
    cleanrestfn: '$scramjet$clean',
    importfn: '$scramjet$import',
    rewritefn: '$scramjet$rewrite',
    metafn: '$scramjet$meta',
    setrealmfn: '$scramjet$setrealm',
    pushsourcemapfn: '$scramjet$pushsourcemap',
    trysetfn: '$scramjet$tryset',
    templocid: '$scramjet$temploc',
    tempunusedid: '$scramjet$tempunused',
  },
  files: {
    wasm: '/sj-assets/scramjet.wasm.wasm',
    all: '/sj-assets/scramjet.all.js',
    sync: '/sj-assets/scramjet.sync.js',
  },
  flags: {
    serviceworkers: true,
    syncxhr: false,
    strictRewrites: true,
    rewriterLogs: false,
    captureErrors: true,
    cleanErrors: true,
    scramitize: false,
    sourcemaps: false,
    destructureRewrites: false,
    interceptDownloads: false,
    allowInvalidJs: true,
    allowFailedIntercepts: true,
  },
  siteFlags: {},
  codec: {
    encode: '(url) => url ? encodeURIComponent(url) : url',
    decode: '(url) => url ? decodeURIComponent(url) : url',
  },
};

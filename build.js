import esbuild from 'esbuild';

const isDev = process.argv.includes('--dev');
const isLite = process.argv.includes('--lite');

/** @type {esbuild.BuildOptions} */
const config = {
  entryPoints: ['src/client/main.js'],
  bundle: true,
  format: 'esm',
  outfile: isLite ? 'public/dist/lite_bundle.js' : 'public/dist/bundle.js',
  sourcemap: isDev,
  minify: !isDev,
  ...(isLite && {
    external: ['three', 'three/*', 'cannon-es', 'tweakpane'],
  }),
};

if (isDev) {
  const ctx = await esbuild.context(config);
  await ctx.watch();
  console.log(`esbuild watching${isLite ? ' (lite)' : ''}...`);
} else {
  await esbuild.build(config);
  console.log(`Build complete${isLite ? ' (lite)' : ''}.`);
}

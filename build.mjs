// Sestaví aplikaci do dist/ (esbuild). Volá se z `npm start`, takže se nic neděje ručně.
import { build } from 'esbuild';
import { cpSync, mkdirSync, readdirSync } from 'node:fs';

const tests = process.argv.includes('--tests');
mkdirSync('dist', { recursive: true });

const common = { bundle: true, sourcemap: 'inline', logLevel: 'warning', target: 'es2022' };

await build({ ...common, entryPoints: ['src/main/main.ts'], outfile: 'dist/main.js', platform: 'node', format: 'cjs', external: ['electron'] });
await build({ ...common, entryPoints: ['src/main/preload.ts'], outfile: 'dist/preload.js', platform: 'node', format: 'cjs', external: ['electron'] });
await build({ ...common, entryPoints: ['src/renderer/control.ts'], outfile: 'dist/control.js', platform: 'browser', format: 'iife' });
await build({ ...common, entryPoints: ['src/renderer/output.ts'], outfile: 'dist/output.js', platform: 'browser', format: 'iife' });
for (const f of ['control.html', 'output.html', 'style.css']) cpSync(`src/renderer/${f}`, `dist/${f}`);

if (tests) {
  const entries = readdirSync('test').filter(f => f.endsWith('.test.ts')).map(f => `test/${f}`);
  await build({ ...common, entryPoints: entries, outdir: 'dist/test', platform: 'node', format: 'cjs', outExtension: { '.js': '.cjs' } });
}

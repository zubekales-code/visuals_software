// Převod videa do formátu, který VJ software přehrává plynule.
// S alfou (výchozí): WebM VP9 yuva420p. Bez alfy (--bez-alfy): MP4 H.264.
// ffmpeg se bere z balíčku ffmpeg-static (nainstaluje se s aplikací), nic dalšího není potřeba.
import { spawnSync } from 'node:child_process';
import { basename, extname, join, resolve } from 'node:path';
import { mkdirSync, existsSync } from 'node:fs';
import ffmpeg from 'ffmpeg-static';

const args = process.argv.slice(2);
const noAlpha = args.includes('--bez-alfy');
const files = args.filter(a => !a.startsWith('--'));
const outDir = resolve('content', 'videos');
mkdirSync(outDir, { recursive: true });

if (!ffmpeg || !existsSync(ffmpeg)) { console.error('Chybí ffmpeg. Spusť nejdřív start.bat (npm install).'); process.exit(1); }

for (const f of files) {
  const name = basename(f, extname(f));
  const out = join(outDir, name + (noAlpha ? '.mp4' : '.webm'));
  console.log(`\n→ ${basename(f)}  →  ${out}`);
  const common = ['-hide_banner', '-y', '-i', f, '-an', '-vf', 'scale=min(1920\\,iw):-2'];
  const codec = noAlpha
    ? ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p', '-movflags', '+faststart']
    // VP9 s alfou: -auto-alt-ref 0 je nutné, jinak se alfa zahodí
    : ['-c:v', 'libvpx-vp9', '-pix_fmt', 'yuva420p', '-crf', '30', '-b:v', '0', '-auto-alt-ref', '0', '-row-mt', '1', '-deadline', 'good', '-cpu-used', '4'];
  const r = spawnSync(ffmpeg, [...common, ...codec, out], { stdio: 'inherit' });
  console.log(r.status === 0 ? '✓ hotovo' : '✗ převod se nepovedl');
}
console.log('\nVidea najdeš v content\\videos. Aplikace je načte sama (nebo po restartu).');

// Exporta la v3 ("Las preguntas de todos los días") a MP4: 1920×1080, 30 fps, con música y efectos.
//   node render-v3.js              → salida/gymgo-intro-v3.mp4
//   node render-v3.js 5 13.3 50    → solo esos segundos como imágenes de revisión (salida/v3-cuadro-*.jpg)
//   node render-v3.js audio        → solo el audio (salida/gymgo-intro-v3-audio.wav) para la vista previa del HTML
// Requiere puppeteer-core (ruta en PUPPETEER) y ffmpeg (ruta en FFMPEG o en el PATH).
// La música es una edición de la pista definida en window.MUSIC_EDIT (archivo y tramos) de gymgo-intro-v3.html.
// Para cambiarla: sustituir el archivo y ajustar los tramos. render.js (v1 y v2) no se toca.
const path = require('node:path');
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');

const FPS = 30;
const DIR = __dirname;
const OUT = path.join(DIR, 'salida');
const NAME = 'gymgo-intro-v3';
const FRAMES = path.join(OUT, `cuadros-${NAME}`);
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const FFMPEG = process.env.FFMPEG || 'ffmpeg';

const argv = process.argv.slice(2);
const onlyAudio = argv[0] === 'audio';
const stills = onlyAudio ? [] : argv.map(Number);

async function openPage(puppeteer) {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--allow-file-access-from-files', '--force-color-profile=srgb'] });
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.error('Error en la página:', e.message));
  await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
  await page.goto('file:///' + path.join(DIR, `${NAME}.html`).replace(/\\/g, '/') + '?render', { waitUntil: 'networkidle0' });
  await page.evaluate(() => document.fonts.ready);
  await new Promise((r) => setTimeout(r, 800));
  return { browser, page };
}

// Música editada + efectos → WAV final. Devuelve la ruta de la mezcla.
function buildAudio({ cues, edit, duration }) {
  const { renderSfx, writeWav } = require('./audio.js');
  fs.mkdirSync(OUT, { recursive: true });
  const sfx = path.join(OUT, `${NAME}-sfx.wav`);
  writeWav(sfx, renderSfx(cues, duration), 0.89);

  const src = path.join(DIR, edit.file);
  if (!fs.existsSync(src)) throw new Error('Falta la pista de música: ' + src);
  const n = edit.parts.length;
  let g = `[0:a]aformat=sample_rates=48000:channel_layouts=stereo,asplit=${n}${edit.parts.map((_, k) => `[s${k}]`).join('')};`;
  edit.parts.forEach((p, k) => {
    const len = p.to - p.from, ms = Math.round(p.at * 1000);
    g += `[s${k}]atrim=start=${p.from}:end=${p.to},asetpts=PTS-STARTPTS`;
    if (p.fin > 0) g += `,afade=t=in:st=0:d=${p.fin}`;
    if (p.fout > 0) g += `,afade=t=out:st=${(len - p.fout).toFixed(3)}:d=${p.fout}`;
    g += `,adelay=${ms}|${ms}[p${k}];`;
  });
  g += `${edit.parts.map((_, k) => `[p${k}]`).join('')}amix=inputs=${n}:normalize=0,apad,atrim=0:${duration}[mu]`;
  const music = path.join(OUT, `${NAME}-musica.wav`);
  execFileSync(FFMPEG, ['-v', 'error', '-y', '-i', src, '-filter_complex', g, '-map', '[mu]', '-ar', '48000', '-c:a', 'pcm_s16le', music], { stdio: 'inherit' });

  const mixed = path.join(OUT, `${NAME}-audio.wav`);
  const graph = `[0:a]volume=0.9[m];[1:a]volume=0.8[s];[m][s]amix=inputs=2:normalize=0,loudnorm=I=-14:TP=-1.5:LRA=11,alimiter=limit=0.89:level=false,atrim=0:${duration}[a]`;
  execFileSync(FFMPEG, ['-v', 'error', '-y', '-i', music, '-i', sfx, '-filter_complex', graph, '-map', '[a]', '-ar', '48000', '-c:a', 'pcm_s16le', mixed], { stdio: 'inherit' });
  console.log('Audio:', mixed);
  return mixed;
}

(async () => {
  const puppeteer = require(process.env.PUPPETEER || 'puppeteer-core');
  fs.mkdirSync(stills.length ? OUT : FRAMES, { recursive: true });
  const { browser, page } = await openPage(puppeteer);
  const spec = await page.evaluate(() => ({ cues: window.AUDIO_CUES, edit: window.MUSIC_EDIT, duration: window.T }));

  if (onlyAudio) { await browser.close(); buildAudio(spec); return; }

  if (stills.length) {
    for (const t of stills) {
      await page.evaluate((x) => window.seek(x), t);
      await page.screenshot({ path: path.join(OUT, `v3-cuadro-${String(t).replace('.', '_')}.jpg`), type: 'jpeg', quality: 88 });
      console.log('cuadro', t);
    }
    await browser.close();
    return;
  }

  const total = Math.round(FPS * spec.duration);
  for (let i = 0; i < total; i++) {
    await page.evaluate((x) => window.seek(x), i / FPS);
    await page.screenshot({ path: path.join(FRAMES, `f${String(i).padStart(5, '0')}.jpg`), type: 'jpeg', quality: 94 });
    if (i % 150 === 0) console.log(`cuadro ${i}/${total}`);
  }
  await browser.close();

  const audio = buildAudio(spec);
  const out = path.join(OUT, `${NAME}.mp4`);
  execFileSync(FFMPEG, ['-y', '-v', 'error', '-framerate', String(FPS), '-i', path.join(FRAMES, 'f%05d.jpg'), '-i', audio,
    '-map', '0:v', '-map', '1:a', '-c:a', 'aac', '-b:a', '256k', '-t', String(spec.duration), '-r', String(FPS),
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', out], { stdio: 'inherit' });
  fs.rmSync(FRAMES, { recursive: true, force: true });
  console.log('Listo:', out);
})().catch((e) => { console.error(e); process.exit(1); });

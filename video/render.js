// Exporta la animación a MP4 (1920×1080, 30 fps).
//   node render.js                      → v1 completa: salida/gymgo-intro.mp4
//   node render.js v2                   → v2 completa con audio: salida/gymgo-intro-v2.mp4
//   node render.js v2 3 16 25 44        → solo esos segundos como imágenes de revisión en salida/
//   node render.js v2 audio             → solo genera el audio (salida/gymgo-intro-v2-audio.wav)
// Requiere puppeteer-core (ruta en PUPPETEER) y ffmpeg (ruta en FFMPEG o en el PATH).
// Audio: si la página define AUDIO_CUES, los efectos se sintetizan con audio.js. La música es assets/musica.mp3 si existe;
// si no, una pista provisional sintetizada. La voz (assets/voz.m4a o voz.mp3) se mezcla encima y baja la música al hablar.
const path = require('node:path');
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');

const FPS = 30, DURATION = 60;
const DIR = __dirname;
const OUT = path.join(DIR, 'salida');
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const FFMPEG = process.env.FFMPEG || 'ffmpeg';

const argv = process.argv.slice(2);
const V2 = argv[0] === 'v2';
if (V2) argv.shift();
const NAME = V2 ? 'gymgo-intro-v2' : 'gymgo-intro';
const FRAMES = path.join(OUT, `cuadros-${NAME}`);
const onlyAudio = argv[0] === 'audio';
const stills = onlyAudio ? [] : argv.map(Number);

async function openPage(puppeteer) {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--allow-file-access-from-files', '--force-color-profile=srgb', '--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.error('Error en la página:', e.message));
  await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
  await page.goto('file:///' + path.join(DIR, `${NAME}.html`).replace(/\\/g, '/') + '?render', { waitUntil: 'networkidle0' });
  await page.evaluate(() => document.fonts.ready);
  await new Promise((r) => setTimeout(r, 800));
  return { browser, page };
}

// Genera los WAV de efectos y música, y la mezcla de vista previa. Devuelve las rutas.
function buildAudio(cues, marks) {
  const { renderSfx, renderMusic, writeWav } = require('./audio.js');
  fs.mkdirSync(OUT, { recursive: true });
  const sfx = path.join(OUT, `${NAME}-sfx.wav`);
  writeWav(sfx, renderSfx(cues, DURATION), 0.89);
  const userMusic = path.join(DIR, 'assets', 'musica.mp3');
  let music = userMusic;
  if (!fs.existsSync(userMusic)) { music = path.join(OUT, `${NAME}-musica.wav`); writeWav(music, renderMusic(DURATION, marks), 0.89); }
  const voice = ['voz.m4a', 'voz.mp3'].map((f) => path.join(DIR, 'assets', f)).find((f) => fs.existsSync(f));
  const mixed = path.join(OUT, `${NAME}-audio.wav`);
  const inputs = ['-i', music, '-i', sfx];
  let graph = `[0:a]atrim=0:${DURATION},volume=0.62[m];[1:a]volume=0.95[s];`;
  if (voice) {
    inputs.push('-i', voice);
    // La voz siempre encima: comprime la música cuando hay voz.
    graph += `[2:a]volume=1.25,asplit=2[v][vk];[m][vk]sidechaincompress=threshold=0.03:ratio=6:attack=20:release=350[md];[md][s][v]amix=inputs=3:normalize=0`;
  } else graph += `[m][s]amix=inputs=2:normalize=0`;
  graph += `,afade=t=out:st=${DURATION - 1.2}:d=1.2,alimiter=limit=0.89:level=false[a]`;
  execFileSync(FFMPEG, ['-v', 'error', '-y', ...inputs, '-filter_complex', graph, '-map', '[a]', '-t', String(DURATION), '-ar', '48000', '-c:a', 'pcm_s16le', mixed], { stdio: 'inherit' });
  console.log('Audio:', mixed, voice ? '(con voz)' : '(sin voz)', fs.existsSync(userMusic) ? '(música del equipo)' : '(música provisional)');
  return mixed;
}

(async () => {
  const puppeteer = require(process.env.PUPPETEER || 'puppeteer-core');
  fs.mkdirSync(stills.length ? OUT : FRAMES, { recursive: true });
  const { browser, page } = await openPage(puppeteer);
  const audioSpec = await page.evaluate(() => (window.AUDIO_CUES ? { cues: window.AUDIO_CUES, marks: window.MUSIC_MARKS } : null));

  if (onlyAudio) { await browser.close(); if (audioSpec) buildAudio(audioSpec.cues, audioSpec.marks); return; }

  if (stills.length) {
    for (const t of stills) {
      await page.evaluate((x) => window.seek(x), t);
      await page.screenshot({ path: path.join(OUT, `${V2 ? 'v2-' : ''}cuadro-${String(t).replace('.', '_')}.jpg`), type: 'jpeg', quality: 88 });
      console.log('cuadro', t);
    }
    await browser.close();
    return;
  }

  const total = FPS * DURATION;
  for (let i = 0; i < total; i++) {
    await page.evaluate((x) => window.seek(x), i / FPS);
    await page.screenshot({ path: path.join(FRAMES, `f${String(i).padStart(5, '0')}.jpg`), type: 'jpeg', quality: 94 });
    if (i % 150 === 0) console.log(`cuadro ${i}/${total}`);
  }
  await browser.close();

  const args = ['-y', '-framerate', String(FPS), '-i', path.join(FRAMES, 'f%05d.jpg')];
  if (audioSpec) {
    args.push('-i', buildAudio(audioSpec.cues, audioSpec.marks), '-map', '0:v', '-map', '1:a', '-c:a', 'aac', '-b:a', '256k');
  } else {
    const audio = ['musica.mp3', 'voz.m4a', 'voz.mp3'].map((f) => path.join(DIR, 'assets', f)).filter((f) => fs.existsSync(f));
    audio.forEach((f) => args.push('-i', f));
    if (audio.length === 1) args.push('-map', '0:v', '-map', '1:a', '-c:a', 'aac', '-b:a', '192k', '-af', `afade=t=out:st=${DURATION - 2}:d=2`);
    if (audio.length === 2) args.push('-filter_complex', `[1:a]volume=0.35[m];[2:a]volume=1.0[v];[m][v]amix=inputs=2:duration=longest,afade=t=out:st=${DURATION - 2}:d=2[a]`, '-map', '0:v', '-map', '[a]', '-c:a', 'aac', '-b:a', '192k');
  }
  const out = path.join(OUT, `${NAME}.mp4`);
  args.push('-t', String(DURATION), '-r', String(FPS), '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', out);
  execFileSync(FFMPEG, args, { stdio: 'inherit' });
  fs.rmSync(FRAMES, { recursive: true, force: true });
  console.log('Listo:', out);
})().catch((e) => { console.error(e); process.exit(1); });

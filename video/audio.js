// Síntesis de audio para el video: efectos de sonido al cuadro y una pista musical provisional.
// Todo es determinista (mismo resultado en cada exportación). Salida: WAV estéreo de 16 bits a 48 kHz.
const fs = require('node:fs');

const SR = 48000;
const TAU = Math.PI * 2;
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

function noiseGen(seed) {
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return (s / 4294967296) * 2 - 1; };
}

class Bus {
  constructor(seconds) { this.n = Math.ceil(seconds * SR); this.L = new Float32Array(this.n); this.R = new Float32Array(this.n); }
  add(i, v, pan = 0) {
    if (i < 0 || i >= this.n) return;
    const a = (Math.max(-1, Math.min(1, pan)) + 1) * Math.PI / 4;
    this.L[i] += v * Math.cos(a); this.R[i] += v * Math.sin(a);
  }
}

// Filtro de estado variable (Chamberlin): devuelve paso bajo, banda y alto.
function svf() {
  let low = 0, band = 0;
  return (x, fc, q = 0.7) => {
    const f = 2 * Math.sin(Math.PI * Math.min(fc, SR / 6) / SR);
    low += f * band; const high = x - low - q * band; band += f * high;
    return { low, band, high };
  };
}

/* ===================== Efectos ===================== */
const SFX = {
  whoosh(bus, t, g = 0.5, { dur = 0.8, dir = 1 } = {}) {
    const n = noiseGen(Math.round(t * 1000) + 7), f = svf(), i0 = Math.round(t * SR), len = Math.round(dur * SR);
    for (let k = 0; k < len; k++) {
      const p = k / len, env = Math.pow(Math.sin(Math.PI * Math.pow(p, 0.75)), 2);
      const fc = 300 + 4200 * Math.pow(Math.sin(Math.PI * Math.pow(p, 0.8)), 2);
      bus.add(i0 + k, f(n(), fc, 0.9).band * env * g * 1.6, dir * (p * 2 - 1) * 0.8);
    }
  },
  hit(bus, t, g = 0.5) {
    const n = noiseGen(Math.round(t * 977) + 3), i0 = Math.round(t * SR); let ph = 0, lp = 0;
    for (let k = 0; k < SR * 0.9; k++) {
      const x = k / SR; ph += TAU * (45 + 95 * Math.exp(-x / 0.05)) / SR;
      lp += 0.25 * (n() - lp);
      bus.add(i0 + k, (Math.sin(ph) * Math.exp(-x / 0.28) + lp * Math.exp(-x / 0.004) * 0.8) * g);
    }
  },
  blip(bus, t, g = 0.25, { f = 1500, pan = 0 } = {}) {
    const i0 = Math.round(t * SR);
    [[0, f, 0.07], [0.065, f * 1.5, 0.09]].forEach(([d, fr, dur]) => {
      const s0 = i0 + Math.round(d * SR);
      for (let k = 0; k < dur * SR; k++) {
        const x = k / SR, env = Math.min(1, x / 0.002) * Math.exp(-x / 0.03);
        bus.add(s0 + k, (Math.sin(TAU * fr * x) + 0.2 * Math.sin(TAU * fr * 2 * x)) * env * g, pan);
      }
    });
  },
  beep(bus, t, g = 0.22) {
    const i0 = Math.round(t * SR), len = 0.09 * SR;
    for (let k = 0; k < len; k++) {
      const x = k / SR, env = Math.min(1, x / 0.004, (0.09 - x) / 0.004);
      bus.add(i0 + k, (Math.sin(TAU * 2400 * x) + 0.3 * Math.sin(TAU * 7200 * x)) * env * g);
    }
  },
  confirm(bus, t, g = 0.3) {
    const i0 = Math.round(t * SR);
    [[0, 1046.5], [0.1, 1568]].forEach(([d, fr]) => {
      const s0 = i0 + Math.round(d * SR);
      for (let k = 0; k < 1.4 * SR; k++) {
        const x = k / SR, env = Math.min(1, x / 0.003) * Math.exp(-x / 0.45);
        const v = Math.sin(TAU * fr * x) + 0.35 * Math.sin(TAU * fr * 2.01 * x) * Math.exp(-x / 0.15);
        bus.add(s0 + k, v * env * g, -0.25); bus.add(s0 + k, Math.sin(TAU * (fr + 2) * x) * env * g * 0.5, 0.25);
      }
    });
  },
  error(bus, t, g = 0.22) {
    const i0 = Math.round(t * SR);
    [[0, 392], [0.13, 294]].forEach(([d, fr]) => {
      const s0 = i0 + Math.round(d * SR);
      for (let k = 0; k < 0.16 * SR; k++) {
        const x = k / SR, ph = (fr * x) % 1, tri = 4 * Math.abs(ph - 0.5) - 1;
        bus.add(s0 + k, tri * Math.min(1, x / 0.004) * Math.exp(-x / 0.08) * g);
      }
    });
  },
  impact(bus, t, g = 0.7) {
    const n = noiseGen(Math.round(t * 131) + 11), f = svf(), f2 = svf(), i0 = Math.round(t * SR); let ph = 0;
    for (let k = 0; k < 3.2 * SR; k++) {
      const x = k / SR; ph += TAU * (38 + 75 * Math.exp(-x / 0.08)) / SR;
      const sub = Math.sin(ph) * Math.exp(-x / 1.0);
      const burst = f(n(), 200 + 5000 * Math.exp(-x / 0.12), 0.8).low * Math.exp(-x / 0.25);
      const tail = f2(n(), 1800, 0.9).low * Math.exp(-x / 1.3) * 0.25;
      bus.add(i0 + k, (sub * 0.9 + burst * 0.7) * g); bus.add(i0 + k, tail * g, (k % 2) ? 0.6 : -0.6);
    }
  },
  riser(bus, t0, g = 0.3, { to } = {}) {
    const n = noiseGen(Math.round(t0 * 71) + 5), f = svf(), i0 = Math.round(t0 * SR), len = Math.round((to - t0) * SR); let ph = 0;
    for (let k = 0; k < len; k++) {
      const p = k / len, env = Math.pow(p, 2.2) * Math.min(1, (len - k) / (0.01 * SR));
      ph += TAU * (150 + 850 * p * p) / SR;
      bus.add(i0 + k, (f(n(), 400 + 6000 * p * p, 0.6).band * 1.4 + Math.sin(ph) * 0.25) * env * g, Math.sin(p * 9) * 0.3);
    }
  },
  glint(bus, t, g = 0.15) {
    [2800, 3700, 4700, 6200].forEach((fr, j) => {
      const s0 = Math.round((t + j * 0.045) * SR);
      for (let k = 0; k < 0.5 * SR; k++) {
        const x = k / SR; bus.add(s0 + k, Math.sin(TAU * fr * x) * Math.min(1, x / 0.002) * Math.exp(-x / 0.12) * g, -0.6 + j * 0.4);
      }
    });
  },
  tick(bus, t, g = 0.12) {
    const i0 = Math.round(t * SR);
    for (let k = 0; k < 0.012 * SR; k++) { const x = k / SR; bus.add(i0 + k, Math.sin(TAU * 3200 * x) * Math.exp(-x / 0.003) * g); }
  },
  // Golpe seco de madera (reloj de pared): más grave y corto que tick, sin tono de suspenso.
  tock(bus, t, g = 0.14) {
    const n = noiseGen(Math.round(t * 613) + 21), f = svf(), i0 = Math.round(t * SR);
    for (let k = 0; k < 0.05 * SR; k++) {
      const x = k / SR;
      const body = Math.sin(TAU * 820 * x) * Math.exp(-x / 0.012) + Math.sin(TAU * 1650 * x) * Math.exp(-x / 0.006) * 0.4;
      const click = f(n(), 2500, 0.7).band * Math.exp(-x / 0.0015);
      bus.add(i0 + k, (body * 0.8 + click * 0.9) * g);
    }
  },
  suck(bus, t0, g = 0.4, { to } = {}) {
    const n = noiseGen(Math.round(t0 * 53) + 9), f = svf(), i0 = Math.round(t0 * SR), len = Math.round((to - t0) * SR);
    for (let k = 0; k < len; k++) {
      const p = k / len, env = Math.pow(p, 3) * Math.min(1, (len - k) / (0.006 * SR));
      bus.add(i0 + k, f(n(), 300 + 3500 * p, 0.7).band * env * g * 1.8, (1 - p) * 0.7);
    }
  },
};

function renderSfx(cues, seconds) {
  const bus = new Bus(seconds);
  for (const [type, t, g, opts] of cues) SFX[type](bus, t, g, opts || {});
  return bus;
}

/* ===================== Música provisional ===================== */
// 120 BPM en La menor (Am–F–C–G, un compás de 2 s por acorde). Secciones según las marcas del video:
// intro oscura → energía con el logo → ritmo completo en el ecosistema → pausa tensa en el lector →
// golpe al autorizar → regreso del ritmo → crescendo → silencio → acorde final con el logotipo.
function renderMusic(seconds, M) {
  const bus = new Bus(seconds);
  const n = noiseGen(424242);
  const CH = [[57, 60, 64], [53, 57, 60], [60, 64, 67], [55, 59, 62]];
  const ROOT = [33, 29, 36, 31];
  const bar = (x) => Math.floor(x / 2) % 4;
  const inR = (x, a, b) => x >= a && x < b;
  const groove = (x) => inR(x, M.groove, M.breakStart) || inR(x, M.grooveBack, M.buildEnd);
  const padF = svf(), padF2 = svf(), bassF = svf(), hatF = svf(), clapF = svf(), finF = svf();
  const phases = new Float64Array(64);
  let arpL = new Float32Array(Math.round(0.375 * SR)), arpR = new Float32Array(arpL.length), arpI = 0;
  for (let i = 0; i < bus.n; i++) {
    const x = i / SR, beatPos = x % 0.5, b = bar(x);
    let L = 0, R = 0;
    // Bombo (y el "bombeo" que provoca en el resto)
    const kickOn = groove(x) || inR(x, M.buildStart, M.buildEnd);
    const kick = kickOn ? Math.sin(TAU * (48 * beatPos + 92 * 0.04 * (1 - Math.exp(-beatPos / 0.04)))) * Math.exp(-beatPos / 0.22) : 0;
    const duck = kickOn ? 1 - 0.4 * Math.exp(-beatPos / 0.12) : 1;
    // Dron grave: intro y pausa
    const droneG = (x < M.groove ? Math.min(1, x / 5) * 0.22 : 0) + (inR(x, M.breakStart, M.grooveBack) ? 0.2 : 0);
    if (droneG > 0) { const d = (Math.sin(TAU * 55 * x) + 0.5 * Math.sin(TAU * 110 * x + Math.sin(x * 0.7)) + 0.25 * Math.sin(TAU * 82.4 * x)) * droneG; L += d; R += d; }
    // Colchón de acordes (sierra filtrada)
    let padG = 0, cut = 500;
    if (inR(x, M.logo - 0.5, M.groove)) { padG = 0.07 * Math.min(1, (x - M.logo + 0.5) / 1.5); cut = 500 + 900 * (x - M.logo) / 6; }
    else if (inR(x, M.groove, M.breakStart)) { padG = 0.075; cut = 1900; }
    else if (inR(x, M.breakStart, M.grooveBack)) { padG = 0.04; cut = 600; }
    else if (inR(x, M.grooveBack, M.buildStart)) { padG = 0.065; cut = 1400; }
    else if (inR(x, M.buildStart, M.buildEnd)) { padG = 0.075; cut = 1400 + 2800 * (x - M.buildStart) / (M.buildEnd - M.buildStart); }
    if (padG > 0) {
      let s = 0;
      CH[b].forEach((m, j) => [-0.06, 0, 0.06].forEach((det, v) => {
        const k = j * 3 + v; phases[k] = (phases[k] + mtof(m + det) / SR) % 1; s += 2 * phases[k] - 1;
      }));
      const o = padF(s / 9, cut, 0.8).low * padG * duck;
      L += o * (1 + 0.15 * Math.sin(x * 0.9)); R += o * (1 - 0.15 * Math.sin(x * 0.9));
    }
    // Bajo pulsado en corcheas
    const bassOn = inR(x, M.logo + 0.8, M.breakStart) || inR(x, M.grooveBack, M.buildEnd);
    if (bassOn) {
      const eighth = x % 0.25, step = x < M.groove ? 0.5 : 0.25, pos = x % step;
      phases[40] = (phases[40] + mtof(ROOT[b] + 12) / SR) % 1;
      const o = bassF(2 * phases[40] - 1, 420, 0.6).low * Math.exp(-pos / 0.13) * 0.32 * duck;
      L += o; R += o; void eighth;
    }
    // Arpegio en semicorcheas con eco
    const arpOn = inR(x, M.groove, M.breakStart) || inR(x, M.grooveBack + 1.5, M.buildEnd);
    let arp = 0;
    if (arpOn) {
      const st = Math.floor(x / 0.125), pos = x % 0.125, pat = [0, 1, 2, 1, 2, 0, 1, 2];
      const m = CH[b][pat[st % 8]] + 12;
      arp = Math.sin(TAU * mtof(m) * pos) * Math.exp(-pos / 0.06) * 0.07;
    }
    const echoL = arpL[arpI], echoR = arpR[arpI];
    arpL[arpI] = arp + echoR * 0.35; arpR[arpI] = echoL * 0.35;
    arpI = (arpI + 1) % arpL.length;
    L += arp + echoL * 0.6; R += arp * 0.7 + echoR * 0.8;
    // Hi-hats a contratiempo y palmada en 2 y 4
    const hatOn = inR(x, M.groove + 4, M.breakStart) || inR(x, M.grooveBack + 3.5, M.buildEnd);
    const nz = n();
    if (hatOn) { const pos = (x + 0.25) % 0.5; const h = hatF(nz, 9000, 0.5).high * Math.exp(-pos / 0.018) * 0.06; L += h * 0.8; R += h; }
    if (inR(x, M.groove + 4, M.breakStart)) { const pos = (x - 0.5) % 1; const c = clapF(nz, 1500, 0.9).band * Math.exp(-Math.max(0, pos) / 0.07) * 0.18; L += c; R += c * 0.9; }
    // Tic tensión durante el lector
    if (inR(x, M.breakStart + 0.3, M.grooveBack - 0.2)) { const pos = x % 0.25; const tk = Math.sin(TAU * 2600 * pos) * Math.exp(-pos / 0.004) * 0.035; L += tk; R += tk; }
    // Redoble creciente antes del final
    if (inR(x, M.buildStart + 1.5, M.buildEnd)) {
      const p = (x - M.buildStart - 1.5) / (M.buildEnd - M.buildStart - 1.5), step = p < 0.5 ? 0.25 : p < 0.8 ? 0.125 : 0.0625, pos = x % step;
      const sn = clapF(nz, 2000, 0.8).band * Math.exp(-pos / 0.03) * (0.06 + 0.2 * p); L += sn; R += sn;
    }
    // Acorde final con el logotipo
    if (x >= M.final) {
      const y = x - M.final; let s = 0;
      [45, 52, 57, 60, 64, 71].forEach((m, j) => { phases[50 + j] = (phases[50 + j] + mtof(m) / SR) % 1; s += 2 * phases[50 + j] - 1; });
      const o = finF(s / 6, 700 + 2600 * Math.exp(-y / 1.5), 0.7).low * 0.24 * Math.exp(-y / 2.6) * Math.min(1, y / 0.01);
      const sub = Math.sin(TAU * 55 * y) * 0.3 * Math.exp(-y / 2.2);
      L += o + sub; R += o + sub;
    }
    L += kick * 0.55; R += kick * 0.55;
    // Fundido de salida
    const fade = x > seconds - 1.5 ? Math.max(0, (seconds - x) / 1.5) : 1;
    bus.L[i] = Math.tanh(L * 1.1) * fade; bus.R[i] = Math.tanh(R * 1.1) * fade;
  }
  void padF2;
  return bus;
}

function writeWav(file, bus, peak = 0.89) {
  let max = 1e-9;
  for (let i = 0; i < bus.n; i++) max = Math.max(max, Math.abs(bus.L[i]), Math.abs(bus.R[i]));
  const k = Math.min(1, peak / max) * (max > peak ? 1 : peak / max > 4 ? 1 : 1);
  const buf = Buffer.alloc(44 + bus.n * 4);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + bus.n * 4, 4); buf.write('WAVE', 8); buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22); buf.writeUInt32LE(SR, 24);
  buf.writeUInt32LE(SR * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34); buf.write('data', 36); buf.writeUInt32LE(bus.n * 4, 40);
  for (let i = 0; i < bus.n; i++) {
    buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, bus.L[i] * k)) * 32767), 44 + i * 4);
    buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, bus.R[i] * k)) * 32767), 46 + i * 4);
  }
  fs.writeFileSync(file, buf);
}

module.exports = { renderSfx, renderMusic, writeWav };

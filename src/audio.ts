// BACKBEAT audio engine: synthesized multi-velocity drum kit + produced-style backing (all original, procedural).
export const ctx = new (window.AudioContext || (window as any).webkitAudioContext)({ latencyHint: 'interactive' });
const master = ctx.createGain(); master.gain.value = 0.9;
const comp = ctx.createDynamicsCompressor();
comp.threshold.value = -16; comp.knee.value = 8; comp.ratio.value = 4; comp.attack.value = 0.004; comp.release.value = 0.18;
const limiter = ctx.createDynamicsCompressor();
limiter.threshold.value = -2; limiter.knee.value = 0; limiter.ratio.value = 20; limiter.attack.value = 0.001; limiter.release.value = 0.06;
master.connect(comp).connect(limiter).connect(ctx.destination);
export const analyser = ctx.createAnalyser(); analyser.fftSize = 256; limiter.connect(analyser);

// algorithmic reverb (generated IR)
function makeIR(sec: number, decay: number) {
  const len = Math.floor(ctx.sampleRate * sec), b = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) { const d = b.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay); }
  return b;
}
const verb = ctx.createConvolver(); verb.buffer = makeIR(2.4, 3.2);
const verbRet = ctx.createGain(); verbRet.gain.value = 0.32; verb.connect(verbRet).connect(master);
const roomVerb = ctx.createConvolver(); roomVerb.buffer = makeIR(0.6, 2.5);
const roomRet = ctx.createGain(); roomRet.gain.value = 0.25; roomVerb.connect(roomRet).connect(master);

// buses
const drumBus = ctx.createGain(); drumBus.gain.value = 1.15;
const drumComp = ctx.createDynamicsCompressor(); drumComp.threshold.value = -20; drumComp.ratio.value = 3; drumComp.attack.value = 0.006; drumComp.release.value = 0.1;
drumBus.connect(drumComp).connect(master); drumComp.connect(roomVerb);
const musicBus = ctx.createGain(); musicBus.gain.value = 0.42; musicBus.connect(master); musicBus.connect(verb);
const duck = ctx.createGain(); duck.connect(musicBus); // sidechain-style ducking target
const sfxBus = ctx.createGain(); sfxBus.gain.value = 0.5; sfxBus.connect(master);

const noiseBuf = (() => { const b = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate); const d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; return b; })();
function noise(t: number, dur: number) { const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.start(t, Math.random() * 1.5, dur + 0.05); return s; }
function env(g: GainNode, t: number, peak: number, a: number, d: number) {
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
}
const rv = (a: number) => 1 + (Math.random() * 2 - 1) * a; // round-robin humanize

export type Drum = 0 | 1 | 2 | 3 | 4 | 5 | 6; // KICK SNARE HAT HITOM CRASH FLOORTOM RIDE
// ---- recorded kit: Virtuosity Drums (CC0), see CREDITS.md ----
const kit: Record<string, AudioBuffer[]> = {};
export let kitReady = false;
export async function loadKit(onProgress?: (p: number) => void) {
  const ext = new Audio().canPlayType('audio/ogg; codecs="vorbis"') ? 'ogg' : 'm4a';
  const man: Record<string, string[]> = await (await fetch('./kit/kit.json')).json();
  const jobs = Object.entries(man).flatMap(([k, list]) => list.map((n, i) => ({ k, n, i })));
  let done = 0;
  await Promise.all(jobs.map(async j => { const buf = await (await fetch(`./kit/${j.n}.${ext}`)).arrayBuffer(); const ab = await ctx.decodeAudioData(buf); (kit[j.k] ??= [])[j.i] = ab; onProgress?.(++done / jobs.length); }));
  kitReady = true;
}
// layout: [levels][roundRobins] flattened
const LAYOUT: Record<string, [number, number, number]> = { kick: [4, 3, 0], snare: [5, 2, 0], ghost: [3, 1, 18], rim: [3, 1, -2], hhc: [4, 2, 2], hho: [3, 2, 9], htom: [3, 2, 0], ltom: [3, 2, 2], crash: [3, 2, 7], ride: [3, 2, 6] };
const lastRR: Record<string, number> = {};
let openHat: { g: GainNode } | null = null, crashVoice: { g: GainNode } | null = null;
function voice(name: string, vel: number, t: number, pan: number, rate = 1) {
  const list = kit[name]; if (!list) return null; const [lv, rr, db] = LAYOUT[name];
  const level = Math.max(0, Math.min(lv - 1, Math.floor(Math.min(1, vel / 1.15) * lv * 0.999 + (Math.random() - 0.5) * 0.6)));
  let r = Math.floor(Math.random() * rr); if (rr > 1 && r === lastRR[name]) r = (r + 1) % rr; lastRR[name] = r;
  const src = ctx.createBufferSource(); src.buffer = list[level * rr + r]; src.playbackRate.value = rate * rv(0.008);
  const g = ctx.createGain(); g.gain.value = Math.pow(10, db / 20) * (0.75 + 0.3 * Math.min(1.2, vel)) * 0.8;
  const p = ctx.createStereoPanner(); p.pan.value = pan; src.connect(g).connect(p).connect(drumBus); src.start(t);
  return { g };
}
export function drum(type: Drum, vel = 0.9, t = ctx.currentTime, opts: { open?: boolean; choke?: boolean; ghost?: boolean; rim?: boolean } = {}) {
  vel = Math.min(1.2, vel * rv(0.05));
  if (type === 0) { voice('kick', vel, t, 0); duck.gain.cancelScheduledValues(t); duck.gain.setValueAtTime(0.5, t); duck.gain.linearRampToValueAtTime(1, t + 0.2); }
  else if (type === 1) voice(opts.ghost ? 'ghost' : opts.rim ? 'rim' : 'snare', vel, t, -0.08);
  else if (type === 2) {
    if (openHat) { openHat.g.gain.setTargetAtTime(0, t, 0.03); openHat = null; }
    const v = voice(opts.open ? 'hho' : 'hhc', vel, t, -0.35); if (opts.open) openHat = v;
  } else if (type === 3) voice('htom', vel, t, -0.15);
  else if (type === 5) voice('ltom', vel, t, 0.3, opts.open ? 0.85 : 1);
  else if (type === 6) voice('ride', vel, t, 0.4);
  else if (type === 4) {
    if (crashVoice) crashVoice.g.gain.setTargetAtTime(0, t, 0.08);
    crashVoice = voice('crash', vel, t, 0.25);
    if (opts.choke && crashVoice) { crashVoice.g.gain.setTargetAtTime(0, t + 0.12, 0.03); crashVoice = null; }
  }
}
export function chokeCrash(t = ctx.currentTime) { if (crashVoice) { crashVoice.g.gain.setTargetAtTime(0, t, 0.025); crashVoice = null; } }

export function sfx(kind: 'ui' | 'perfect' | 'miss' | 'star' | 'fill') {
  const t = ctx.currentTime, o = ctx.createOscillator(), g = ctx.createGain(); o.connect(g).connect(sfxBus);
  if (kind === 'ui') { o.type = 'sine'; o.frequency.setValueAtTime(880, t); o.frequency.exponentialRampToValueAtTime(1320, t + 0.05); env(g, t, 0.25, 0.002, 0.08); }
  if (kind === 'perfect') { o.type = 'sine'; o.frequency.value = 2093; env(g, t, 0.05, 0.002, 0.12); }
  if (kind === 'miss') { o.type = 'sawtooth'; o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(70, t + 0.15); env(g, t, 0.12, 0.002, 0.15); }
  if (kind === 'star') { o.type = 'triangle'; o.frequency.setValueAtTime(1046, t); o.frequency.setValueAtTime(1568, t + 0.08); env(g, t, 0.3, 0.003, 0.4); }
  if (kind === 'fill') { o.type = 'sawtooth'; o.frequency.setValueAtTime(200, t); o.frequency.exponentialRampToValueAtTime(1600, t + 0.4); env(g, t, 0.15, 0.05, 0.4); }
  o.start(t); o.stop(t + 0.6);
}

// ---------- backing music ----------
const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);
function bass(t: number, m: number, d: number, v = 0.5) {
  const o1 = ctx.createOscillator(), o2 = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  o1.type = 'sawtooth'; o2.type = 'sine'; o1.frequency.value = mtof(m); o2.frequency.value = mtof(m - 12);
  f.type = 'lowpass'; f.Q.value = 6; f.frequency.setValueAtTime(1600, t); f.frequency.exponentialRampToValueAtTime(220, t + d * 0.8);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + 0.008); g.gain.setValueAtTime(v, t + d * 0.7); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
  o1.connect(f); o2.connect(g); f.connect(g).connect(duck); o1.start(t); o2.start(t); o1.stop(t + d + .05); o2.stop(t + d + .05);
}
function pad(t: number, notes: number[], d: number, v = 0.07) {
  const f = ctx.createBiquadFilter(), g = ctx.createGain(); f.type = 'lowpass'; f.frequency.setValueAtTime(600, t); f.frequency.linearRampToValueAtTime(2400, t + d * 0.5); f.frequency.linearRampToValueAtTime(900, t + d);
  g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(v, t + 0.25); g.gain.setValueAtTime(v, t + d - 0.2); g.gain.linearRampToValueAtTime(0.0001, t + d);
  f.connect(g).connect(duck);
  for (const n of notes) for (const det of [-9, 0, 8]) { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = mtof(n); o.detune.value = det; o.connect(f); o.start(t); o.stop(t + d + 0.05); }
}
function pluck(t: number, m: number, v = 0.12) {
  const o = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain(), p = ctx.createStereoPanner(); p.pan.value = Math.random() * 1.2 - 0.6;
  o.type = 'square'; o.frequency.value = mtof(m); f.type = 'lowpass'; f.frequency.setValueAtTime(5000, t); f.frequency.exponentialRampToValueAtTime(400, t + 0.18);
  env(g, t, v, 0.002, 0.22); o.connect(f).connect(g).connect(p).connect(duck); o.start(t); o.stop(t + 0.3);
  // dotted-eighth delay feel via reverb send
}
function shaker(t: number, v: number) { const n = noise(t, 0.05), f = ctx.createBiquadFilter(), g = ctx.createGain(); f.type = 'highpass'; f.frequency.value = 8000; env(g, t, v, 0.004, 0.04); n.connect(f).connect(g).connect(musicBus); }

export interface SongDef { id: string; title: string; artist: string; bpm: number; bars: number; key: number; prog: number[][]; bassPat: number[]; arp: boolean; color: string; style: string }

// Schedules the backing for bar `b` of song starting at songStart (AudioContext time)
export function scheduleBar(s: SongDef, b: number, songStart: number) {
  const spb = 60 / s.bpm, bar0 = songStart + b * 4 * spb, ch = s.prog[Math.floor(b) % s.prog.length];
  const section = Math.floor(b / 8) % 4, intro = b < 2, outro = b >= s.bars - 1;
  if (!outro) pad(bar0, ch.map(n => n + s.key + 60), 4 * spb, intro ? 0.05 : 0.065);
  if (!intro) for (let i = 0; i < 16; i++) {
    const t = bar0 + i * spb / 4 + (i % 2 ? spb * 0.03 : 0); // light swing
    if (s.bassPat[i]) bass(t, s.key + 36 + ch[0] + (s.bassPat[i] === 2 ? 12 : 0), spb / 4 * 1.6, 0.42);
    if (s.arp && section !== 0 && !outro) pluck(t, s.key + 72 + ch[i % ch.length] + (i % 8 >= 4 ? 12 : 0), 0.07);
    if (!outro && i % 2) shaker(t, 0.035);
  }
  if (outro) bass(bar0, s.key + 36 + ch[0], 4 * spb, 0.5);
}

export function click(t: number, accent = false) { const o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.value = accent ? 1760 : 1320; env(g, t, 0.5, 0.001, 0.05); o.connect(g).connect(sfxBus); o.start(t); o.stop(t + 0.1); }

export function tapOut() { const d = ctx.createMediaStreamDestination(); limiter.connect(d); return d.stream; }

import * as THREE from 'three';
import { tapOut, ctx, drum, sfx, scheduleBar, click, loadKit, chokeCrash, Drum } from './audio';
import { SONGS } from './songs';
import { buildChart, Note, Diff, DIFF_NAMES, approachSec } from './chart';
import * as Stage from './stage';
import { LANE_COLORS, LANE_NAMES, targets } from './stage';

const NL = 7;
const WIN = { perfect: 0.045, great: 0.08, good: 0.12 };
const LOWFX = Stage.LOW;
const hud = document.getElementById('hud') as HTMLCanvasElement, g = hud.getContext('2d')!, ui = document.getElementById('ui')!;
if (LOWFX) Object.defineProperty(g, 'shadowBlur', { set() {}, get() { return 0; } });
let W = 0, H = 0, DPR = 1;
function resize() { W = innerWidth; H = innerHeight; DPR = LOWFX ? 1 : Math.min(devicePixelRatio, 2); hud.width = W * DPR; hud.height = H * DPR; Stage.resize(W, H); }
addEventListener('resize', resize); resize();
const save = JSON.parse(localStorage.getItem('bb_save') || '{"offset":0,"best":{}}');
const persist = () => localStorage.setItem('bb_save', JSON.stringify(save));

type Mode = 'loading' | 'menu' | 'calib' | 'play' | 'fail' | 'result';
let mode: Mode = 'loading';
let song = SONGS[0], diff: Diff = 1, notes: Note[] = [], songStart = 0, nextBar = 0, approach = 1;
let score = 0, combo = 0, maxCombo = 0, health = 1, continues = 1, counts = { Perfect: 0, Great: 0, Good: 0, Miss: 0 };
let fillActive = false, lastBeat = -1, endT = 0;
let history: [number, number, number][] = []; // [songTime, score, combo] for Continue rewind
interface Pop { lane?: number; x: number; y: number; t: number; text: string; c: string }
interface Spark { x: number; y: number; vx: number; vy: number; life: number; c: string; s: number }
const pops: Pop[] = [], sparks: Spark[] = [], waves: { lane: number; t: number; big: boolean }[] = [];
const flash = new Array(NL).fill(0), missFlash = new Array(NL).fill(0);
const held = new Map<number, number>();
const songTime = () => ctx.currentTime - songStart - save.offset / 1000;

// ---- projected geometry of each piece (screen ellipses) ----
interface Geo { cx: number; cy: number; pts: { x: number; y: number }[]; rad: number }
const geo: Geo[] = [];
const U = new THREE.Vector3(), V = new THREE.Vector3(), P = new THREE.Vector3();
function updateGeo() {
  for (const tg of targets) {
    const n = tg.normal; U.set(1, 0, 0).sub(n.clone().multiplyScalar(n.x)).normalize(); V.crossVectors(n, U).normalize();
    const c = Stage.project(tg.center, W, H); const pts = [];
    for (let k = 0; k < 32; k++) { const a = (k / 32) * Math.PI * 2; P.copy(tg.center).addScaledVector(U, Math.cos(a) * tg.radius).addScaledVector(V, Math.sin(a) * tg.radius); pts.push(Stage.project(P, W, H)); }
    let rad = 0; for (const p of pts) rad = Math.max(rad, Math.hypot(p.x - c.x, p.y - c.y));
    geo[tg.lane] = { cx: c.x, cy: c.y, pts, rad };
  }
}
function ellipsePath(l: number, s: number, dx = 0, dy = 0) {
  const G = geo[l]; g.beginPath(); G.pts.forEach((p, i) => { const x = G.cx + (p.x - G.cx) * s + dx, y = G.cy + (p.y - G.cy) * s + dy; i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.closePath();
}
function arcPath(l: number, s: number, frac: number) {
  const G = geo[l], n = Math.max(1, Math.round(32 * frac)); g.beginPath();
  for (let i = 0; i <= n; i++) { const p = G.pts[(i + 24) % 32]; const x = G.cx + (p.x - G.cx) * s, y = G.cy + (p.y - G.cy) * s; i ? g.lineTo(x, y) : g.moveTo(x, y); }
}
function pieceAt(x: number, y: number): number {
  let best = -1, bestR = 1e9;
  for (let l = 0; l < NL; l++) { const G = geo[l]; if (!G) continue; const ang = Math.atan2(y - G.cy, x - G.cx); let edge = 0, bd = 9;
    for (const p of G.pts) { const d = Math.abs(((Math.atan2(p.y - G.cy, p.x - G.cx) - ang + 9.42) % 6.283) - 3.14); if (d < bd) { bd = d; edge = Math.hypot(p.x - G.cx, p.y - G.cy); } }
    edge = Math.max(edge, 30); const r = Math.hypot(x - G.cx, y - G.cy) / edge; if (r < bestR) { bestR = r; best = l; } }
  return bestR < 1.9 ? best : -1;
}

function startSong(s = song, d = diff) {
  song = s; diff = d; notes = buildChart(s, d); approach = approachSec(d, s.bpm);
  score = combo = maxCombo = 0; health = 1; continues = 1; counts = { Perfect: 0, Great: 0, Good: 0, Miss: 0 }; history = [[-99, 0, 0]];
  Stage.setTheme(s.color); endT = s.bars * 4 * 60 / s.bpm; beginAt(0); show('');
}
function beginAt(fromT: number) { const lead = 1.6; songStart = ctx.currentTime + lead - fromT; nextBar = Math.max(0, Math.floor(fromT / (240 / song.bpm))); mode = 'play'; }
function scheduler() { const bl = 240 / song.bpm; while (songStart + nextBar * bl < ctx.currentTime + 0.35 && nextBar < song.bars) { if (songStart + nextBar * bl >= ctx.currentTime - 0.01) scheduleBar(song, nextBar, songStart); nextBar++; } }
const velFor = (n: Note | null) => n?.type === 'accent' ? 1.15 : n?.type === 'ghost' ? 0.3 : 0.85;
function playLane(l: number, n: Note | null) {
  const v = velFor(n);
  if (l === 2) drum(2, v * 0.95, undefined, { open: n?.type === 'open' });
  else if (l === 4) drum(4, v, undefined, { choke: n?.type === 'choke' });
  else if (l === 1) { drum(1, v, undefined, { ghost: n?.type === 'ghost' }); if (n?.type === 'flam') drum(1, 0.5, ctx.currentTime + 0.028); }
  else drum(l as Drum, v);
  Stage.hit(l, n ? v + 0.1 : 0.5, { open: n?.type === 'open' });
  flash[l] = 1;
}
function addScore(v: number) { score += v; history.push([songTime(), score, combo]); }
function judge(n: Note, dt: number) {
  const a = Math.abs(dt), r = a <= WIN.perfect ? 'Perfect' : a <= WIN.great ? 'Great' : 'Good';
  n.judged = true; n.res = r; (counts as any)[r]++; combo++; maxCombo = Math.max(maxCombo, combo);
  const mult = Math.min(4, 1 + Math.floor(combo / 20)) * (n.fill ? 2 : 1);
  addScore(({ Perfect: 300, Great: 200, Good: 100 } as any)[r] * mult * (n.type === 'accent' ? 1.5 : 1));
  health = Math.min(1, health + 0.02);
  const c = r === 'Perfect' ? '#fff27a' : r === 'Great' ? '#7affd4' : '#9ab8ff', G = geo[n.lane];
  for (let i = pops.length - 1; i >= 0; i--) if (pops[i].lane === n.lane) pops.splice(i, 1);
  pops.push({ lane: n.lane, x: Math.max(52, Math.min(W - 52, G.cx)), y: G.cy - G.rad - 14, t: 0, text: r.toUpperCase(), c });
  waves.push({ lane: n.lane, t: 0, big: n.type === 'accent' || r === 'Perfect' });
  const N = r === 'Perfect' ? 14 : 8;
  for (let i = 0; i < N; i++) { const a2 = Math.random() * 6.283, s = 2 + Math.random() * 6; sparks.push({ x: G.cx + Math.cos(a2) * G.rad * 0.6, y: G.cy + Math.sin(a2) * G.rad * 0.4, vx: Math.cos(a2) * s, vy: Math.sin(a2) * s - 3, life: 1, c: i % 3 ? LANE_COLORS[n.lane] : '#fff', s: 1.5 + Math.random() * 2.2 }); }
  if (r === 'Perfect' && combo % 50 === 0) sfx('star');
  if (n.type === 'roll') { n.holding = true; n.rollDone = n.t; }
}
function miss(n: Note) {
  n.judged = true; n.res = 'Miss'; counts.Miss++; combo = 0; health -= n.fill ? 0.06 : 0.1; missFlash[n.lane] = 1;
  const G = geo[n.lane]; pops.push({ x: G.cx, y: G.cy - G.rad - 14, t: 0, text: 'MISS', c: '#ff4466' }); sfx('miss'); history.push([songTime(), score, 0]);
  if (health <= 0 && mode === 'play') { mode = 'fail'; show('fail'); }
}
function press(lane: number) {
  if (mode !== 'play') { if (mode === 'menu' || mode === 'result') { playLane(lane, null); } return; }
  const t = songTime(); let best: Note | null = null;
  for (const n of notes) { if (n.t - t > WIN.good) break; if (n.judged || n.lane !== lane) continue; if (Math.abs(n.t - t) <= WIN.good && (!best || Math.abs(n.t - t) < Math.abs(best.t - t))) best = n; }
  playLane(lane, best); if (best) judge(best, t - best.t);
}
function release(lane: number) {
  for (const n of notes) if (n.holding && n.lane === lane) { n.holding = false; if (songTime() < n.t + n.dur - 0.1) { combo = 0; const G = geo[lane]; pops.push({ x: G.cx, y: G.cy - G.rad - 34, t: 0, text: 'ROLL BROKEN', c: '#ff8a5c' }); } }
}
let lastResult = { acc: 0, stars: 0 };
function finish() {
  mode = 'result'; counts = { Perfect: 0, Great: 0, Good: 0, Miss: 0 }; for (const n of notes) if (n.res) (counts as any)[n.res]++;
  const acc = (counts.Perfect + counts.Great * 0.7 + counts.Good * 0.4) / Math.max(1, notes.length);
  const stars = acc >= 0.92 ? 3 : acc >= 0.75 ? 2 : acc >= 0.5 ? 1 : 0, k = song.id + diff;
  const prev = save.best[k] || { score: 0, stars: 0 }; save.best[k] = { score: Math.max(prev.score, Math.round(score)), stars: Math.max(prev.stars, stars) }; persist();
  lastResult = { acc, stars }; show('result'); for (let i = 0; i < stars; i++) setTimeout(() => sfx('star'), 300 + i * 260);
}
function doContinue() {
  continues--; health = 0.6; const rew = Math.max(0, songTime() - 240 / song.bpm * 2);
  for (const n of notes) if (n.t >= rew - WIN.good) { n.judged = false; n.res = undefined; n.holding = false; }
  // rewind score/combo to their value at the rewind point (fixes double counting)
  while (history.length > 1 && history[history.length - 1][0] >= rew - WIN.good) history.pop();
  [, score, combo] = history[history.length - 1];
  beginAt(rew); show(''); sfx('fill');
}

// ---- input: tap the drums themselves ----
hud.addEventListener('pointerdown', e => { e.preventDefault(); if (ctx.state !== 'running') ctx.resume(); if (mode === 'calib') return calibTap(); const l = pieceAt(e.clientX, e.clientY); if (l < 0) return; held.set(e.pointerId, l); press(l); });
const up = (e: PointerEvent) => { const l = held.get(e.pointerId); if (l !== undefined) { held.delete(e.pointerId); release(l); } };
hud.addEventListener('pointerup', up); hud.addEventListener('pointercancel', up);
const KEYS = 'xcvbnmz'; // kick snare hat tom crash floor ride
addEventListener('keydown', e => { if (e.repeat) return; const l = ' sdfjkl'.indexOf(e.key); const ll = e.key === ' ' ? 0 : l; if (mode === 'calib' && e.key === ' ') return calibTap(); if (ll >= 0) { held.set(-1 - ll, ll); press(ll); } });
addEventListener('keyup', e => { const l = e.key === ' ' ? 0 : ' sdfjkl'.indexOf(e.key); if (l >= 0) { held.delete(-1 - l); release(l); } });
void KEYS;

// ---- calibration ----
let calStart = 0; const calTaps: number[] = []; const CAL_BEATS = 16, CAL_SPB = 0.5;
function startCalib() { mode = 'calib'; calTaps.length = 0; calStart = ctx.currentTime + 1; for (let i = 0; i < CAL_BEATS; i++) click(calStart + i * CAL_SPB, i % 4 === 0); show('calib'); }
function calibTap() {
  const t = ctx.currentTime - calStart, nearest = Math.round(t / CAL_SPB); if (nearest < 4 || nearest >= CAL_BEATS) return;
  calTaps.push(t - nearest * CAL_SPB); drum(1, 0.5);
  if (calTaps.length >= 8) { const s = [...calTaps].sort((a, b) => a - b); save.offset = Math.round(s[Math.floor(s.length / 2)] * 1000); persist(); mode = 'menu'; show('menu', `Calibrated: ${save.offset} ms`); }
}

// ---- screens ----
function show(name: string, toast = '') {
  ui.innerHTML = ''; if (!name) return;
  const d = document.createElement('div'); d.className = 'scr on'; ui.appendChild(d);
  if (name === 'loading') { d.innerHTML = `<h1>BACKBEAT</h1><div class="sub">LOADING RECORDED KIT…</div><div id="lp" class="sub">0%</div>`; }
  else if (name === 'menu') {
    d.innerHTML = `<h1>BACKBEAT</h1><div class="sub">PLAY THE KIT · HIT ON THE RING</div>${toast ? `<div style="color:#7affd4;margin-bottom:8px">${toast}</div>` : ''}` +
      SONGS.map((s, i) => `<div class="card" style="--c:${s.color}"><b style="color:${s.color}">${s.title}</b><small>${s.artist} · ${s.style} · ${s.bpm} BPM</small><div class="diffs">${DIFF_NAMES.map((n, j) => { const b = save.best[s.id + j]; return `<div class="btn" data-s="${i}" data-d="${j}">${n}<br><span class="stars">${'★'.repeat(b?.stars || 0)}${'☆'.repeat(3 - (b?.stars || 0))}</span></div>`; }).join('')}</div></div>`).join('') +
      `<div class="btn big" id="cal" style="background:#ffffff18;box-shadow:none">⏱ Calibrate latency (${save.offset} ms)</div>`;
    d.querySelectorAll('[data-s]').forEach(b => b.addEventListener('pointerdown', ev => { ev.stopPropagation(); ctx.resume(); sfx('ui'); const el = b as HTMLElement; startSong(SONGS[+el.dataset.s!], +el.dataset.d! as Diff); }));
    d.querySelector('#cal')!.addEventListener('pointerdown', () => { ctx.resume(); sfx('ui'); startCalib(); });
  } else if (name === 'calib') {
    d.style.background = '#05030acc'; d.innerHTML = `<h1 style="font-size:30px">CALIBRATE</h1><div class="sub">LISTEN FOR 4 CLICKS, THEN TAP ANYWHERE ON THE BEAT</div><div id="calring" style="width:180px;height:180px;border-radius:50%;border:4px solid #2bd2ff;margin:40px;box-shadow:0 0 40px #2bd2ff"></div><div id="calc" class="sub">0 / 8 taps</div>`;
    d.addEventListener('pointerdown', () => calibTap());
  } else if (name === 'fail') {
    d.innerHTML = `<h1 style="font-size:36px">STAGE DOWN</h1><div class="sub">THE CROWD WANTS MORE</div><div class="res">${Math.round(score).toLocaleString()}</div>` +
      (continues > 0 ? `<div class="btn big" id="cont">▶ CONTINUE (free, 1 left)</div>` : '') + `<div class="btn big" id="retry" style="background:#ffffff18;box-shadow:none">↻ RETRY</div><div class="btn big" id="menu" style="background:#ffffff10;box-shadow:none">SONGS</div>`;
    d.querySelector('#cont')?.addEventListener('pointerdown', doContinue);
    d.querySelector('#retry')!.addEventListener('pointerdown', () => startSong());
    d.querySelector('#menu')!.addEventListener('pointerdown', () => { mode = 'menu'; show('menu'); });
  } else if (name === 'result') {
    const r = lastResult; d.innerHTML = `<div class="sub" style="margin-top:20px">${song.title.toUpperCase()} · ${DIFF_NAMES[diff]}</div><div class="stars" style="font-size:54px">${'★'.repeat(r.stars)}${'☆'.repeat(3 - r.stars)}</div><div class="res">${Math.round(score).toLocaleString()}</div><div class="sub">ACCURACY ${(r.acc * 100).toFixed(1)}% · MAX COMBO ${maxCombo}</div>` +
      Object.entries(counts).map(([k, v]) => `<div class="row"><span>${k}</span><b>${v}</b></div>`).join('') + `<div class="btn big" id="retry">↻ PLAY AGAIN</div><div class="btn big" id="menu" style="background:#ffffff18;box-shadow:none">SONGS</div>`;
    d.querySelector('#retry')!.addEventListener('pointerdown', () => startSong());
    d.querySelector('#menu')!.addEventListener('pointerdown', () => { mode = 'menu'; show('menu'); });
  }
}

// ---- render cues on the instruments ----
function draw(dt: number) {
  g.setTransform(DPR, 0, 0, DPR, 0, 0); g.clearRect(0, 0, W, H);
  updateGeo();
  const playing = mode === 'play' || mode === 'fail', t = songTime();
  // per-piece decays
  for (let l = 0; l < NL; l++) { flash[l] *= Math.pow(0.003, dt); missFlash[l] *= Math.pow(0.02, dt); }
  if (playing) {
    fillActive = false;
    const nextPer: Note[][] = Array.from({ length: NL }, () => []);
    for (const n of notes) {
      if (n.t - t > approach) break;
      if (n.fill && Math.abs(n.t - t) < 0.6) fillActive = true;
      if (n.type === 'roll' && n.holding) {
        const sub = 60 / song.bpm / 4; while ((n.rollDone ?? n.t) + sub <= Math.min(t, n.t + n.dur)) { n.rollDone = (n.rollDone ?? n.t) + sub; drum(1, 0.45 + Math.random() * 0.2); addScore(50); Stage.hit(1, 0.4); flash[1] = 0.7; }
        if (t >= n.t + n.dur) { n.holding = false; combo++; const G = geo[1]; pops.push({ x: G.cx, y: G.cy - G.rad - 34, t: 0, text: 'ROLL!', c: '#ffb000' }); }
      }
      if (!n.judged && t - n.t > WIN.good) { miss(n); continue; }
      if (!n.judged || n.holding) nextPer[n.lane].push(n);
    }
    // doubles: connector between the next ring pair
    for (let l = 0; l < NL; l++) { const n = nextPer[l][0]; if (!n?.pair) continue; for (let m = l + 1; m < NL; m++) { const o = nextPer[m][0]; if (o?.pair && Math.abs(o.t - n.t) < 0.001) { const a = geo[l], b = geo[m]; const al = 1 - (n.t - t) / approach; g.strokeStyle = `rgba(255,255,255,${0.35 * al})`; g.setLineDash([6, 6]); g.lineWidth = 2; g.beginPath(); g.moveTo(a.cx, a.cy); g.lineTo(b.cx, b.cy); g.stroke(); g.setLineDash([]); } } }
    for (let l = 0; l < NL; l++) {
      const list = nextPer[l]; if (!list.length) continue; const c = LANE_COLORS[l];
      // faint pre-rings for following hits (max 2)
      for (let k = Math.min(list.length, 3) - 1; k >= 1; k--) { const n = list[k], p = (n.t - t) / approach; g.strokeStyle = c; g.globalAlpha = 0.18 * (1 - p); g.lineWidth = 1.5; ellipsePath(l, 1 + 1.6 * p); g.stroke(); }
      g.globalAlpha = 1;
      const n = list[0], p = Math.max(0, (n.t - t) / approach), s = 1 + 1.6 * p, near = 1 - p;
      // brightening rim glow on the target
      g.save(); g.shadowColor = c; g.shadowBlur = 10 + 25 * near; g.strokeStyle = c; g.globalAlpha = 0.25 + 0.75 * near * near; g.lineWidth = 2 + 3 * near; ellipsePath(l, 1); g.stroke();
      if (n.type === 'roll' && n.holding) { // hold: filled target + progress arc
        const prog = Math.min(1, (t - n.t) / n.dur); g.globalAlpha = 0.3; g.fillStyle = c; ellipsePath(l, 1); g.fill(); g.globalAlpha = 1; g.lineWidth = 7; g.strokeStyle = '#fff'; arcPath(l, 1.12, prog); g.stroke();
        g.fillStyle = '#fff'; g.font = '900 13px system-ui'; g.textAlign = 'center'; g.fillText('HOLD', geo[l].cx, geo[l].cy + 4);
      } else {
        const acc = n.type === 'accent', gh = n.type === 'ghost';
        g.globalAlpha = Math.min(1, near * 2.2) * (gh ? 0.6 : 1); g.lineWidth = acc ? 7 : gh ? 2 : 4; g.strokeStyle = acc ? '#fff' : c; g.shadowBlur = acc ? 30 : 16;
        if (gh) g.setLineDash([5, 5]); ellipsePath(l, s); g.stroke(); g.setLineDash([]);
        if (acc) { g.lineWidth = 2; g.strokeStyle = c; ellipsePath(l, s * 1.08); g.stroke(); }
        if (n.type === 'flam') { g.lineWidth = 2; ellipsePath(l, s * 1.12); g.stroke(); }
        if (n.type === 'roll') { g.globalAlpha *= 0.35; g.fillStyle = c; ellipsePath(l, s); g.fill(); }
        g.globalAlpha = Math.min(1, near * 2.2); g.shadowBlur = 0; const G = geo[l];
        const tag = acc ? '!' : n.type === 'open' ? 'OPEN' : n.type === 'choke' ? 'CHOKE' : n.type === 'roll' ? 'ROLL' : n.type === 'flam' ? 'FLAM' : '';
        if (tag) { g.fillStyle = '#fff'; g.font = `900 ${acc ? 22 : 12}px system-ui`; g.textAlign = 'center'; g.fillText(tag, G.cx, G.cy + (acc ? 8 : 4)); }
      }
      g.restore();
    }
  }
  // hit flashes, miss flicker, shockwaves
  for (let l = 0; l < NL; l++) {
    if (!geo[l]) continue;
    if (flash[l] > 0.03) { g.save(); g.globalCompositeOperation = 'lighter'; g.globalAlpha = flash[l] * 0.35; g.fillStyle = LANE_COLORS[l]; ellipsePath(l, 1); g.fill(); g.restore(); }
    if (missFlash[l] > 0.03) { g.save(); g.globalAlpha = missFlash[l] * 0.45 * (0.6 + 0.4 * Math.sin(performance.now() / 25)); g.fillStyle = '#8a1022'; ellipsePath(l, 1); g.fill(); g.restore(); }
  }
  for (let i = waves.length - 1; i >= 0; i--) { const w = waves[i]; w.t += dt * 2.8; if (w.t > 1) { waves.splice(i, 1); continue; } g.save(); g.strokeStyle = LANE_COLORS[w.lane]; g.globalAlpha = 1 - w.t; g.lineWidth = 6 * (1 - w.t); ellipsePath(w.lane, 1 + w.t * (w.big ? 0.9 : 0.5)); g.stroke(); g.restore(); }
  g.globalCompositeOperation = 'lighter';
  for (let i = sparks.length - 1; i >= 0; i--) { const s = sparks[i]; s.x += s.vx * dt * 60; s.y += s.vy * dt * 60; s.vy += 0.3 * dt * 60; s.life -= dt * 1.9; if (s.life <= 0) { sparks.splice(i, 1); continue; } g.fillStyle = s.c; g.globalAlpha = s.life; g.beginPath(); g.arc(s.x, s.y, s.s * s.life + 0.5, 0, 6.283); g.fill(); }
  g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
  for (let i = pops.length - 1; i >= 0; i--) { const p = pops[i]; p.t += dt; if (p.t > 0.6) { pops.splice(i, 1); continue; } const e = 1 - Math.pow(1 - Math.min(1, p.t / 0.12), 3); g.save(); g.globalAlpha = 1 - Math.max(0, (p.t - 0.35) / 0.25); g.translate(p.x, p.y - p.t * 30); g.scale(0.6 + e * 0.4, 0.6 + e * 0.4); g.font = '900 18px system-ui'; g.textAlign = 'center'; g.shadowColor = p.c; g.shadowBlur = 10; g.lineWidth = 4; g.strokeStyle = 'rgba(0,0,0,0.6)'; g.strokeText(p.text, 0, 0); g.fillStyle = p.c; g.fillText(p.text, 0, 0); g.restore(); }
  // piece labels (subtle) when idle / early in song
  if (!playing || t < 3) for (let l = 0; l < NL; l++) { const G = geo[l]; if (!G) continue; g.font = '800 10px system-ui'; g.textAlign = 'center'; g.fillStyle = LANE_COLORS[l]; g.globalAlpha = 0.85; g.fillText(LANE_NAMES[l], G.cx, G.cy + G.rad * 0.25 + 4); g.globalAlpha = 1; }
  if (playing) {
    const grad = g.createLinearGradient(0, 0, 0, 110); grad.addColorStop(0, 'rgba(5,3,10,0.85)'); grad.addColorStop(1, 'rgba(5,3,10,0)'); g.fillStyle = grad; g.fillRect(0, 0, W, 110);
    g.fillStyle = '#fff'; g.font = '900 26px system-ui'; g.textAlign = 'left'; g.shadowColor = '#ff3cac'; g.shadowBlur = 10; g.fillText(Math.round(score).toLocaleString(), 16, 44); g.shadowBlur = 0;
    g.font = '600 11px system-ui'; g.fillStyle = 'rgba(255,255,255,0.6)'; g.fillText(`${song.title.toUpperCase()} · ${DIFF_NAMES[diff]}`, 16, 62);
    g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(16, 72, W - 32, 3); g.fillStyle = song.color; g.fillRect(16, 72, (W - 32) * Math.max(0, Math.min(1, t / endT)), 3);
    g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(W - 116, 30, 100, 8); g.fillStyle = health > 0.3 ? '#3dff9a' : '#ff3b5c'; g.fillRect(W - 116, 30, 100 * Math.max(0, health), 8);
    const mult = Math.min(4, 1 + Math.floor(combo / 20)); g.textAlign = 'right'; g.font = '800 12px system-ui'; g.fillStyle = '#ffd23f'; g.fillText(`x${mult}${fillActive ? ' · FILL x2' : ''}`, W - 16, 56);
    if (combo >= 5) { const pulse = 1 + Math.max(...flash) * 0.06; g.save(); g.translate(W / 2, 104); g.scale(pulse, pulse); g.textAlign = 'center'; g.font = '900 34px system-ui'; g.fillStyle = 'rgba(255,255,255,0.95)'; g.shadowColor = song.color; g.shadowBlur = 18; g.fillText(String(combo), 0, 0); g.font = '700 10px system-ui'; g.fillText('COMBO', 0, 14); g.restore(); }
    if (fillActive) { g.save(); g.textAlign = 'center'; g.font = '900 18px system-ui'; g.fillStyle = '#ffb000'; g.shadowColor = '#ffb000'; g.shadowBlur = 18; g.globalAlpha = 0.6 + 0.4 * Math.sin(performance.now() / 80); g.fillText('★ FILL TIME ★', W / 2, 140); g.restore(); }
    if (t < 0) { g.textAlign = 'center'; g.font = '900 64px system-ui'; g.fillStyle = '#fff'; g.fillText(String(Math.ceil(-t)), W / 2, H * 0.22); }
  }
  if (mode === 'calib') { const ct = ctx.currentTime - calStart, ph = ((ct % CAL_SPB) + CAL_SPB) % CAL_SPB / CAL_SPB; const el = document.getElementById('calring'); if (el) el.style.transform = `scale(${1 + 0.25 * Math.exp(-ph * 8)})`; const cc = document.getElementById('calc'); if (cc) cc.textContent = ct < 2 ? 'Listen…' : `${calTaps.length} / 8 taps`; if (ct > CAL_BEATS * CAL_SPB + 1 && calTaps.length < 8) startCalib(); }
}

let last = performance.now(), frames = 0, fpsT = 0, worst = 0; (window as any).__fps = 0;
function loop(now: number) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now; frames++; fpsT += dt; worst = Math.max(worst, dt); if (fpsT > 1) { (window as any).__fps = frames / fpsT; (window as any).__worst = worst; frames = 0; fpsT = 0; worst = 0; }
  if (mode === 'play') { scheduler(); const t = songTime(), b = Math.floor(t / (60 / song.bpm)); if (b !== lastBeat && t >= 0) { lastBeat = b; Stage.beat(b % 4 === 0); } if (t > endT + 0.5) finish(); }
  Stage.render(dt, mode === 'play' ? 1 : 0.3); draw(dt); requestAnimationFrame(loop);
}
show('loading'); requestAnimationFrame(loop);
loadKit(p => { const el = document.getElementById('lp'); if (el) el.textContent = Math.round(p * 100) + '%'; }).then(() => { mode = 'menu'; show('menu'); }).catch(e => { const el = document.getElementById('lp'); if (el) el.textContent = 'Kit failed to load: ' + e; });
void chokeCrash;
(window as any).__game = { get notes() { return notes; }, songTime, get mode() { return mode; }, press, release, geo: () => geo, get score() { return score; }, get combo() { return combo; }, counts: () => counts, tapOut, calInfo: () => ({ calStart, now: ctx.currentTime }) };

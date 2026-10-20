import type { SongDef } from './audio';
export type NType = 'tap' | 'accent' | 'roll' | 'flam' | 'choke' | 'open' | 'ghost';
export interface Note { t: number; lane: number; type: NType; dur: number; judged: boolean; res?: string; fill: boolean; pair?: boolean; holding?: boolean; rollDone?: number }
export type Diff = 0 | 1 | 2;
export const DIFF_NAMES = ['EASY', 'NORMAL', 'HARD'];
export const APPROACH_BEATS = [4, 3.2, 2.6]; // preview lead in beats
export const approachSec = (d: Diff, bpm: number) => Math.max(0.6, APPROACH_BEATS[d] * 60 / bpm);
const GROOVES: Record<string, { k: number[]; s: number[]; g: number[] }> = {
  neon: { k: [0, 6, 10], s: [4, 12], g: [7, 15] },
  iron: { k: [0, 8, 10], s: [4, 12], g: [14] },
  storm: { k: [0, 10], s: [4, 12], g: [7, 9] },
};
export function buildChart(s: SongDef, d: Diff): Note[] {
  const spb = 60 / s.bpm, st = spb / 4, gr = GROOVES[s.id], out: Note[] = [];
  const add = (bar: number, step: number, lane: number, type: NType = 'tap', dur = 0, fill = false) => out.push({ t: (bar * 16 + step) * st, lane, type, dur, judged: false, fill });
  for (let b = 2; b < s.bars; b++) {
    const last = b === s.bars - 1, fillBar = b % 8 === 7, sec = Math.floor(b / 8), ride = sec % 2 === 1 && d >= 1;
    if (last) { add(b, 0, 4, 'accent'); add(b, 0, 0, 'accent'); break; }
    const steps: Record<number, number[]> = {};
    const put = (i: number, l: number) => (steps[i] ??= []).includes(l) || steps[i].push(l);
    if (b % 8 === 0 || b === 2) put(0, 4);
    const kicks = d === 0 ? gr.k.filter(x => x % 8 === 0) : gr.k;
    const fillFrom = fillBar ? (d === 0 ? 12 : 8) : 99;
    for (const k of kicks) if (k < fillFrom) put(k, 0);
    for (const sn of gr.s) if (sn < fillFrom) put(sn, 1);
    if (d >= 1) for (let i = 0; i < Math.min(16, fillFrom); i += d === 2 ? 2 : 4) put(i, ride ? 6 : 2);
    if (d === 2 && sec % 2 === 1) for (const g of gr.g) if (g < fillFrom) put(g, 7);
    if (fillBar) { const pat = d === 0 ? [12, 14] : d === 1 ? [8, 10, 12, 14] : [8, 9, 10, 11, 12, 13, 14, 15]; pat.forEach((i, j) => put(i, j % 4 === 3 && d === 2 ? 1 : j < pat.length / 2 ? 3 : 5)); }
    for (const i of Object.keys(steps).map(Number).sort((a, b) => a - b)) {
      const PR = [4, 0, 1, 3, 5, 6, 2, 7]; const pr = steps[i].sort((a, b) => PR.indexOf(a) - PR.indexOf(b)).slice(0, 2);
      for (let l of pr) {
        let type: NType = 'tap'; if (l === 7) { l = 1; type = 'ghost'; }
        if (l === 4 || (l === 0 && i === 0 && b % 8 === 0)) type = 'accent';
        if (l === 1 && type === 'tap' && d === 2 && i === 12 && b % 4 === 1) type = 'flam';
        if (l === 2 && d >= 1 && i === 14 && b % 4 === 3) type = 'open';
        add(b, i, l, type, 0, fillBar && i >= fillFrom);
      }
    }
    // snare roll (hold) leading into the drop of each 16-bar block on normal/hard
    if (d >= 1 && b % 16 === 15) { out.splice(out.length - 0, 0); out.push({ t: (b * 16 + 0) * st, lane: 1, type: 'roll', dur: 6 * st, judged: false, fill: true }); }
    if (d === 2 && b % 16 === 14) out.push({ t: (b * 16 + 14) * st, lane: 4, type: 'choke', dur: 0, judged: false, fill: false });
  }
  out.sort((a, b) => a.t - b.t || a.lane - b.lane);
  // de-overlap: remove notes in roll lane during roll, mark pairs
  const rolls = out.filter(n => n.type === 'roll');
  const res = out.filter(n => !(n.type !== 'roll' && rolls.some(r => (n.lane === r.lane || true) && n.lane !== 0 && n.t >= r.t && n.t <= r.t + r.dur && !(n.lane === 4))));
  for (let i = 0; i < res.length; i++) for (let j = i + 1; j < res.length && res[j].t - res[i].t < 0.001; j++) { res[i].pair = res[j].pair = true; }
  return res;
}

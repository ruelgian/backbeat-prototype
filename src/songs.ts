import type { SongDef } from './audio';
// All original, procedurally composed. Chord degrees relative to key (semitones).
export const SONGS: SongDef[] = [
  { id: 'neon', title: 'Neon Backline', artist: 'BACKBEAT Originals', bpm: 100, bars: 34, key: 2, color: '#2bd2ff', style: 'Funk-pop groove',
    prog: [[0, 4, 7, 11], [9, 12, 16, 19], [5, 9, 12, 16], [7, 11, 14, 17]], bassPat: [1,0,0,1, 0,0,1,0, 1,0,0,0, 0,2,0,1], arp: true },
  { id: 'iron', title: 'Ironclad Pulse', artist: 'BACKBEAT Originals', bpm: 124, bars: 42, key: -3, color: '#ff3cac', style: 'Rock-electro drive',
    prog: [[0, 3, 7], [8, 12, 15], [3, 7, 10], [10, 14, 17]], bassPat: [1,0,1,0, 1,0,1,0, 1,0,1,0, 1,0,2,0], arp: true },
  { id: 'storm', title: 'Thunderline 160', artist: 'BACKBEAT Originals', bpm: 160, bars: 54, key: 4, color: '#ffb000', style: 'DnB rush',
    prog: [[0, 3, 7, 10], [5, 8, 12, 15], [8, 12, 15, 19], [7, 10, 14, 17]], bassPat: [1,0,0,0, 0,0,0,1, 0,0,1,0, 0,0,0,0], arp: true },
];

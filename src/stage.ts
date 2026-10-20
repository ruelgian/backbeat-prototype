import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

// lanes: 0 KICK 1 SNARE 2 HAT 3 HI-TOM 4 CRASH 5 FLOOR-TOM 6 RIDE
export const LANE_COLORS = ['#ff3b5c', '#ffb000', '#2bd2ff', '#b06bff', '#3dff9a', '#ff5fd2', '#4f8bff'];
export const LANE_NAMES = ['KICK', 'SNARE', 'HI-HAT', 'TOM', 'CRASH', 'FLOOR', 'RIDE'];
export const LOW = new URLSearchParams(location.search).get('q') === 'low';
const canvas = document.getElementById('gl') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: !LOW, powerPreference: 'high-performance' });
renderer.setPixelRatio(LOW ? 0.6 : Math.min(devicePixelRatio, 1.75));
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = !LOW; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene(); scene.background = new THREE.Color('#06040c'); scene.fog = new THREE.Fog('#06040c', 4, 11);
const pmrem = new THREE.PMREMGenerator(renderer); scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.03).texture; scene.environmentIntensity = 0.35;
export const camera = new THREE.PerspectiveCamera(40, 1, 0.05, 50);
const camBase = new THREE.Vector3(0, 2.25, 2.05), camLook = new THREE.Vector3(0, 0.88, 0.05);

// ---------- procedural textures ----------
function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, srgb = true) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
}
const wrapTex = canvasTex(512, 256, g => { // midnight sparkle wrap
  const gr = g.createLinearGradient(0, 0, 0, 256); gr.addColorStop(0, '#1b1440'); gr.addColorStop(0.5, '#3a1a6e'); gr.addColorStop(1, '#120c2a'); g.fillStyle = gr; g.fillRect(0, 0, 512, 256);
  for (let i = 0; i < 9000; i++) { const b = Math.random(); g.fillStyle = `rgba(${200 + b * 55},${170 + b * 80},255,${Math.random() * 0.5})`; g.fillRect(Math.random() * 512, Math.random() * 256, 1, 1); }
});
wrapTex.wrapS = THREE.RepeatWrapping;
const headTex = canvasTex(512, 512, g => { // coated head
  g.fillStyle = '#a9a294'; g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 40000; i++) { const v = 150 + Math.random() * 50; g.fillStyle = `rgba(${v},${v - 5},${v - 15},0.18)`; g.fillRect(Math.random() * 512, Math.random() * 512, 2, 2); }
  const rg = g.createRadialGradient(256, 256, 30, 256, 256, 256); rg.addColorStop(0, 'rgba(120,110,90,0.18)'); rg.addColorStop(0.25, 'rgba(0,0,0,0)'); rg.addColorStop(0.92, 'rgba(0,0,0,0)'); rg.addColorStop(1, 'rgba(60,55,45,0.5)'); g.fillStyle = rg; g.fillRect(0, 0, 512, 512);
});
const kickHeadTex = canvasTex(512, 512, g => {
  g.fillStyle = '#111018'; g.fillRect(0, 0, 512, 512);
  g.strokeStyle = '#ff3b5c'; g.lineWidth = 10; g.beginPath(); g.arc(256, 256, 200, 0, Math.PI * 2); g.stroke();
  g.fillStyle = '#f2f2f2'; g.font = '900 70px system-ui'; g.textAlign = 'center'; g.fillText('BACKBEAT', 256, 280);
  g.fillStyle = '#000'; g.beginPath(); g.arc(340, 380, 45, 0, Math.PI * 2); g.fill(); g.strokeStyle = '#888'; g.lineWidth = 6; g.stroke();
});
const latheTex = canvasTex(1024, 1024, g => { // lathing grooves as bump
  const c = 512; for (let r = 512; r > 0; r -= 1.5) { const v = 110 + Math.random() * 80 + Math.sin(r * 0.9) * 30; g.strokeStyle = `rgb(${v},${v},${v})`; g.lineWidth = 1.6; g.beginPath(); g.arc(c, c, r, 0, Math.PI * 2); g.stroke(); }
  g.fillStyle = '#888'; g.beginPath(); g.arc(c, c, 120, 0, Math.PI * 2); g.fill(); // bell (hammered)
  for (let i = 0; i < 400; i++) { g.fillStyle = `rgba(${Math.random() > 0.5 ? 255 : 0},0,0,0.08)`; g.beginPath(); g.arc(c + (Math.random() - 0.5) * 900, c + (Math.random() - 0.5) * 900, 6 + Math.random() * 10, 0, 7); g.fill(); }
}, false);

// ---------- materials ----------
const chrome = new THREE.MeshStandardMaterial({ color: '#e6e8ee', metalness: 1, roughness: 0.12 });
const darkMetal = new THREE.MeshStandardMaterial({ color: '#333640', metalness: 0.9, roughness: 0.35 });
const shellMat = new THREE.MeshPhysicalMaterial({ map: wrapTex, metalness: 0.55, roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.06, side: THREE.DoubleSide });
const brass = new THREE.MeshPhysicalMaterial({ color: '#c9933d', metalness: 1, roughness: 0.28, bumpMap: latheTex, bumpScale: 0.6, anisotropy: 0.9, side: THREE.DoubleSide });

// ripple shader injected into head material
interface Ripple { u: { t: { value: number }; a: { value: number }; flash: { value: number }; col: { value: THREE.Color } } }
function headMaterial(map: THREE.Texture, color: string): [THREE.MeshStandardMaterial, Ripple] {
  const r: Ripple = { u: { t: { value: 9 }, a: { value: 0 }, flash: { value: 0 }, col: { value: new THREE.Color(color) } } };
  const m = new THREE.MeshStandardMaterial({ map, roughness: 0.72, metalness: 0 });
  m.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, { rT: r.u.t, rA: r.u.a, rF: r.u.flash, rC: r.u.col });
    sh.vertexShader = 'uniform float rT, rA;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      float rr = length(position.xy); transformed.z += rA * sin(rr * 60.0 - rT * 70.0) * exp(-rT * 7.0) * (1.0 - smoothstep(0.0, 0.3, rr)) * 0.012 - rA * exp(-rT*14.0) * 0.006 * (1.0 - rr*3.0);`);
    sh.fragmentShader = 'uniform float rF; uniform vec3 rC;\n' + sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance += rC * rF * 1.6;');
  };
  return [m, r];
}

// ---------- kit construction ----------
export interface Target { lane: number; center: THREE.Vector3; normal: THREE.Vector3; radius: number; obj: THREE.Object3D }
export const targets: Target[] = [];
interface Anim { lane: number; ripple?: Ripple; cym?: THREE.Object3D; ang: number; vel: number; axis: THREE.Vector3; flashMat?: THREE.MeshStandardMaterial; flash: number }
const anims: Anim[] = [];
const kitGroup = new THREE.Group(); scene.add(kitGroup);
const tmpQ = new THREE.Quaternion();
function cyl(r: number, h: number, mat: THREE.Material, seg = 16) { const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, seg), mat); m.castShadow = !LOW; return m; }
function stand(from: THREE.Vector3, to: THREE.Vector3) { // tripod + tube
  const g = new THREE.Group(); const len = from.distanceTo(to); const tube = cyl(0.012, len, chrome, 10); tube.position.copy(from).add(to).multiplyScalar(0.5);
  tube.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), to.clone().sub(from).normalize()); g.add(tube);
  for (let i = 0; i < 3; i++) { const a = i * 2.094 + 0.5; const foot = new THREE.Vector3(from.x + Math.cos(a) * 0.22, 0.01, from.z + Math.sin(a) * 0.22); const top = new THREE.Vector3(from.x, Math.min(0.35, from.y), from.z);
    const l = cyl(0.008, foot.distanceTo(top), darkMetal, 8); l.position.copy(foot).add(top).multiplyScalar(0.5); l.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), top.clone().sub(foot).normalize()); g.add(l); }
  kitGroup.add(g);
}
function drum(lane: number, r: number, depth: number, pos: THREE.Vector3, tiltX: number, tiltZ: number, opts: { kick?: boolean } = {}) {
  const g = new THREE.Group(); g.position.copy(pos); g.rotation.set(tiltX, 0, tiltZ); kitGroup.add(g);
  const shell = new THREE.Mesh(new THREE.CylinderGeometry(r, r, depth, 64, 1, true), shellMat); shell.castShadow = !LOW; g.add(shell);
  const [hm, rip] = headMaterial(opts.kick ? kickHeadTex : headTex, LANE_COLORS[lane]);
  const head = new THREE.Mesh(new THREE.RingGeometry(0.0001, r * 0.985, 64, 24), hm); head.rotation.x = -Math.PI / 2; head.position.y = depth / 2 + 0.002; g.add(head);
  // circle geometry with rings for ripple
  const bottom = new THREE.Mesh(new THREE.CircleGeometry(r * 0.98, 48), new THREE.MeshStandardMaterial({ color: '#d8d4cc', roughness: 0.8 })); bottom.rotation.x = Math.PI / 2; bottom.position.y = -depth / 2 - 0.002; g.add(bottom);
  for (const y of [depth / 2, -depth / 2]) { const hoop = new THREE.Mesh(new THREE.TorusGeometry(r + 0.004, 0.007, 10, 64), opts.kick ? shellMat : chrome); hoop.rotation.x = Math.PI / 2; hoop.position.y = y; g.add(hoop); }
  const lugN = r > 0.25 ? 10 : r > 0.17 ? 8 : 6;
  for (let i = 0; i < lugN; i++) {
    const a = (i / lugN) * Math.PI * 2, cx = Math.cos(a) * (r + 0.012), cz = Math.sin(a) * (r + 0.012);
    for (const s of [1, -1]) { const lug = new THREE.Mesh(new THREE.CapsuleGeometry(0.008, 0.03, 4, 8), chrome); lug.position.set(cx, s * depth * 0.28, cz); g.add(lug);
      const rod = cyl(0.0028, depth * 0.2, chrome, 6); rod.position.set(Math.cos(a) * (r + 0.01), s * depth * 0.42, Math.sin(a) * (r + 0.01)); g.add(rod); }
  }
  const up = new THREE.Vector3(0, 1, 0).applyEuler(g.rotation);
  const center = pos.clone().add(up.clone().multiplyScalar(depth / 2));
  targets.push({ lane, center, normal: up, radius: r, obj: g });
  anims.push({ lane, ripple: rip, ang: 0, vel: 0, axis: new THREE.Vector3(1, 0, 0), flash: 0 });
  return g;
}
function cymbal(lane: number, r: number, pos: THREE.Vector3, tilt: number, opts: { hat?: boolean } = {}) {
  const pivot = new THREE.Group(); pivot.position.copy(pos); kitGroup.add(pivot);
  const tiltG = new THREE.Group(); tiltG.rotation.x = tilt; pivot.add(tiltG);
  const prof = [new THREE.Vector2(0.001, 0.022), new THREE.Vector2(r * 0.12, 0.02), new THREE.Vector2(r * 0.24, 0.006), new THREE.Vector2(r * 0.6, -0.006), new THREE.Vector2(r, -0.02)];
  const geo = new THREE.LatheGeometry(prof, 96);
  // planar uv for lathe bump
  const p = geo.attributes.position, uv = geo.attributes.uv; for (let i = 0; i < p.count; i++) uv.setXY(i, 0.5 + p.getX(i) / (2 * r), 0.5 + p.getZ(i) / (2 * r));
  const mat = brass.clone(); const m = new THREE.Mesh(geo, mat); m.castShadow = !LOW; tiltG.add(m);
  const nut = cyl(0.012, 0.03, darkMetal, 10); nut.position.y = 0.03; tiltG.add(nut);
  let bottomHat: THREE.Mesh | null = null;
  if (opts.hat) { bottomHat = new THREE.Mesh(geo, mat); bottomHat.rotation.x = Math.PI; bottomHat.position.y = -0.03; pivot.add(bottomHat);
    const clutch = cyl(0.016, 0.04, darkMetal, 12); clutch.position.y = 0.04; tiltG.add(clutch); }
  stand(new THREE.Vector3(pos.x, 0.0, pos.z), new THREE.Vector3(pos.x, pos.y - 0.02, pos.z));
  const up = new THREE.Vector3(0, 1, 0).applyEuler(new THREE.Euler(tilt, 0, 0));
  targets.push({ lane, center: pos.clone().add(new THREE.Vector3(0, 0.01, 0)), normal: up, radius: r, obj: tiltG });
  anims.push({ lane, cym: tiltG, ang: 0, vel: 0, axis: new THREE.Vector3(1, 0, Math.random() - 0.5).normalize(), flashMat: mat, flash: 0 });
  return { tiltG, bottomHat };
}
// Proportions in metres (22" kick, 14" snare, 12"/16" toms, 14" hats, 18" crash, 21" ride), arranged audience-3/4 for portrait tapping
const KICK_POS = new THREE.Vector3(0, 0.29, 0.02);
const kick = drum(0, 0.28, 0.42, KICK_POS, Math.PI / 2 - 0.0, 0, { kick: true }); // head faces camera
for (const s of [-1, 1]) { const spur = cyl(0.008, 0.25, chrome, 8); spur.position.set(s * 0.27, 0.12, 0.15); spur.rotation.z = s * 0.5; kitGroup.add(spur); }
drum(1, 0.178, 0.14, new THREE.Vector3(0.42, 0.66, 0.2), 0.62, -0.12); stand(new THREE.Vector3(0.42, 0, 0.2), new THREE.Vector3(0.42, 0.58, 0.2));
const hat = cymbal(2, 0.178, new THREE.Vector3(0.72, 0.98, 0.05), 0.55, { hat: true });
drum(3, 0.152, 0.2, new THREE.Vector3(0.0, 0.84, 0.08), 0.75, 0); { const arm = cyl(0.011, 0.25, chrome, 8); arm.position.set(0, 0.62, 0.02); kitGroup.add(arm); }
cymbal(4, 0.23, new THREE.Vector3(0.38, 1.38, -0.12), 0.7);
drum(5, 0.2, 0.36, new THREE.Vector3(-0.44, 0.5, 0.22), 0.6, 0.12);
for (let i = 0; i < 3; i++) { const a = i * 2.1 + 0.4; const leg = cyl(0.008, 0.42, chrome, 8); leg.position.set(-0.44 + Math.cos(a) * 0.22, 0.2, 0.22 + Math.sin(a) * 0.22); kitGroup.add(leg); }
cymbal(6, 0.27, new THREE.Vector3(-0.56, 1.16, -0.1), 0.62);
// kick pedal + beater
const pedal = new THREE.Group(); pedal.position.set(0, 0.02, 0.38); kitGroup.add(pedal);
const plate = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.012, 0.26), darkMetal); plate.position.set(0, 0.02, 0.06); plate.rotation.x = -0.18; pedal.add(plate);
const beaterPivot = new THREE.Group(); beaterPivot.position.set(0, 0.1, -0.06); pedal.add(beaterPivot);
const shaft = cyl(0.005, 0.2, chrome, 8); shaft.position.y = 0.1; beaterPivot.add(shaft);
const ball = new THREE.Mesh(new THREE.SphereGeometry(0.03, 16, 12), new THREE.MeshStandardMaterial({ color: '#f4f0e6', roughness: 0.5 })); ball.position.y = 0.2; beaterPivot.add(ball);
// hi-hat pedal rod
stand(new THREE.Vector3(0.72, 0, 0.05), new THREE.Vector3(0.72, 0.93, 0.05));
// throne hint & riser
const riser = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.06, 1.8), new THREE.MeshStandardMaterial({ color: '#09070c', metalness: 0.2, roughness: 0.7 })); riser.position.set(0, -0.03, -0.1); riser.receiveShadow = true; scene.add(riser);
const rug = new THREE.Mesh(new THREE.CircleGeometry(0.95, 64), new THREE.MeshStandardMaterial({ color: '#120a10', roughness: 1 })); rug.rotation.x = -Math.PI / 2; rug.position.set(0, 0.002, 0.05); rug.receiveShadow = true; scene.add(rug);
const floor = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), new THREE.MeshStandardMaterial({ color: '#0b0910', metalness: 0.7, roughness: 0.3 })); floor.rotation.x = -Math.PI / 2; floor.position.y = -0.06; scene.add(floor);

// ---------- lights ----------
scene.add(new THREE.HemisphereLight('#8a7cff', '#100810', 0.25));
const key = new THREE.SpotLight('#fff2e0', 4.5, 9, 0.62, 0.55, 1.2); key.position.set(0.8, 3.2, 2.2); key.target.position.set(0, 0.6, 0); key.castShadow = !LOW; key.shadow.mapSize.set(1024, 1024); key.shadow.bias = -0.0005; scene.add(key, key.target);
const rimL = new THREE.SpotLight('#ff3cac', 18, 8, 0.7, 0.6, 1); rimL.position.set(-2.2, 2.5, -1.6); rimL.target.position.set(0, 0.7, 0); scene.add(rimL, rimL.target);
const rimR = new THREE.SpotLight('#2bd2ff', 18, 8, 0.7, 0.6, 1); rimR.position.set(2.2, 2.5, -1.6); rimR.target.position.set(0, 0.7, 0); scene.add(rimR, rimR.target);
// volumetric beams (cheap additive cones)
const beams: { m: THREE.Mesh; mat: THREE.MeshBasicMaterial; ph: number }[] = [];
const coneGeo = new THREE.ConeGeometry(0.7, 6, 24, 1, true); coneGeo.translate(0, -3, 0);
for (let i = 0; i < 4; i++) { const mat = new THREE.MeshBasicMaterial({ color: ['#ff3cac', '#2bd2ff', '#ffb000', '#b06bff'][i], transparent: true, opacity: 0.025, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }); const m = new THREE.Mesh(coneGeo, mat); m.position.set(-2.4 + i * 1.6, 4.2, -3); scene.add(m); beams.push({ m, mat, ph: i * 1.3 }); }
// toned-down LED wall
const wallMat = new THREE.ShaderMaterial({ uniforms: { t: { value: 0 }, e: { value: 0 }, c: { value: new THREE.Color('#ff3cac') } },
  vertexShader: 'varying vec2 vU;void main(){vU=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
  fragmentShader: 'uniform float t,e;uniform vec3 c;varying vec2 vU;void main(){vec2 g=fract(vU*vec2(80.,30.))-.5;float d=smoothstep(.45,.15,length(g));float w=sin(vU.x*7.+t*.8)*.5+.5;float band=smoothstep(.02,0.,abs(vU.y-.5-.25*sin(vU.x*5.+t)*w));gl_FragColor=vec4(c*d*(.025+band*(.12+e*.35)),1.);}' });
const wall = new THREE.Mesh(new THREE.PlaneGeometry(14, 5), wallMat); wall.position.set(0, 2.2, -4.5); scene.add(wall);

const composer = new EffectComposer(renderer); composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.45, 0.4, 0.85); composer.addPass(bloom); composer.addPass(new OutputPass());

let energy = 0, shake = 0, punch = 0, time = 0, hatOpen = 0, hatTarget = 0, beater = 0;
export function resize(w: number, h: number) {
  renderer.setSize(w, h, false); composer.setSize(w, h); camera.aspect = w / h;
  // fit kit width (~1.9 m) in portrait
  const halfW = 1.0, dist = camBase.distanceTo(camLook); const fovH = 2 * Math.atan(halfW / dist); camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(fovH / 2) / camera.aspect));
  camera.fov = Math.max(34, Math.min(75, camera.fov)); camera.setViewOffset(w, h, 0, -h * 0.27, w, h); camera.updateProjectionMatrix();
}
export function setTheme(c: string) { wallMat.uniforms.c.value.set(c); }
export function hit(lane: number, vel: number, opts: { open?: boolean } = {}) {
  const a = anims.find(x => x.lane === lane)!;
  if (a.ripple) { a.ripple.u.t.value = 0; a.ripple.u.a.value = Math.min(1.4, vel); }
  if (a.cym) a.vel += (lane === 2 ? 1.5 : 4) * vel;
  a.flash = Math.min(1.2, vel);
  if (lane === 2) { hatTarget = opts.open ? 1 : 0; }
  if (lane === 0) { beater = 1; punch = Math.max(punch, 0.5 * vel); }
  if (lane === 4 || vel > 1.05) shake = Math.max(shake, 0.2 * vel);
  energy = Math.min(1.5, energy + 0.2 * vel);
}
export function beat(strong: boolean) { energy = Math.min(1.5, energy + (strong ? 0.3 : 0.12)); }
const tmp = new THREE.Vector3();
export function project(v: THREE.Vector3, W: number, H: number) { tmp.copy(v).project(camera); return { x: (tmp.x * 0.5 + 0.5) * W, y: (-tmp.y * 0.5 + 0.5) * H }; }
export function render(dt: number, intensity: number) {
  time += dt; energy *= Math.pow(0.05, dt); shake *= Math.pow(0.002, dt); punch *= Math.pow(0.001, dt);
  for (const a of anims) {
    a.flash *= Math.pow(0.004, dt);
    if (a.ripple) { a.ripple.u.t.value += dt; a.ripple.u.flash.value = a.flash * 0.5; }
    if (a.cym) { // damped spring wobble
      const k = a.lane === 2 ? 260 : 60, c = a.lane === 2 ? 14 : 2.2; a.vel += (-k * a.ang - c * a.vel) * dt; a.ang += a.vel * dt;
      tmpQ.setFromAxisAngle(a.axis, a.ang * 0.08); a.cym.quaternion.copy(tmpQ); a.cym.rotateY(time * 0.02);
      (a.flashMat as THREE.MeshPhysicalMaterial).emissive.set(LANE_COLORS[a.lane]); (a.flashMat as THREE.MeshPhysicalMaterial).emissiveIntensity = a.flash * 0.6;
    }
  }
  hatOpen += (hatTarget - hatOpen) * Math.min(1, dt * 25); if (hatTarget > 0 && hatOpen > 0.95) hatTarget = 0.6;
  hat.tiltG.position.y = hatOpen * 0.035;
  beater *= Math.pow(0.0005, dt); beaterPivot.rotation.x = -0.55 + (1 - beater) * 0.55 - 0.0 + beater * 0.0; beaterPivot.rotation.x = -0.15 - (beater > 0.7 ? (1 - beater) * 3 : beater * 0.9) * 0.8; plate.rotation.x = -0.18 + beater * 0.12;
  beams.forEach(b => { b.m.rotation.z = Math.sin(time * (0.4 + intensity * 0.5) + b.ph) * 0.45; b.mat.opacity = 0.012 + energy * 0.018; });
  wallMat.uniforms.t.value = time; wallMat.uniforms.e.value = energy;
  key.intensity = 4.2 + energy * 2; rimL.intensity = 5 + energy * 3; rimR.intensity = 5 + energy * 3;
  bloom.strength = 0.42 + energy * 0.3;
  camera.position.set(camBase.x + (Math.random() - 0.5) * shake * 0.03 + Math.sin(time * 0.25) * 0.04, camBase.y + (Math.random() - 0.5) * shake * 0.02, camBase.z - punch * 0.12);
  camera.lookAt(camLook);
  if (LOW) renderer.render(scene, camera); else composer.render();
}

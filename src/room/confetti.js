// 彩纸粒子：所有彩纸共用一个 Points 对象（一次绘制），在 CPU 上更新位置
import { BufferGeometry, BufferAttribute, Points, ShaderMaterial } from 'three';

const MAX = 360;
const FLOOR_Y = 0.03;

// 直接用 sRGB 颜色值（着色器不做颜色空间转换）
const hex = (h) => [((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255];
const PALETTE = [0xffb3c6, 0xd6c2ff, 0xffe39a, 0xb9ebc8, 0xffcfae, 0xeba3b3, 0xffffff].map(hex);

export function createConfetti() {
  const pos = new Float32Array(MAX * 3);
  const col = new Float32Array(MAX * 3);
  const size = new Float32Array(MAX);
  const vel = new Float32Array(MAX * 3);
  const life = new Float32Array(MAX);
  const phase = new Float32Array(MAX);
  const baseSize = new Float32Array(MAX);
  let next = 0;

  const geo = new BufferGeometry();
  geo.setAttribute('position', new BufferAttribute(pos, 3));
  geo.setAttribute('aColor', new BufferAttribute(col, 3));
  geo.setAttribute('aSize', new BufferAttribute(size, 1));

  const material = new ShaderMaterial({
    uniforms: { uScale: { value: 1 } },
    vertexShader: `
      attribute vec3 aColor;
      attribute float aSize;
      uniform float uScale;
      varying vec3 vColor;
      void main() {
        vColor = aColor;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = aSize * uScale;
      }`,
    fragmentShader: `
      varying vec3 vColor;
      void main() {
        vec2 c = gl_PointCoord - 0.5;
        if (abs(c.y) > 0.3) discard; // 长方形的小纸片
        gl_FragColor = vec4(vColor, 1.0);
      }`,
  });

  const points = new Points(geo, material);
  points.frustumCulled = false;

  // 从某个点炸开一团彩纸
  function burst(origin, { count = 60, speed = 2.2, up = 1.2, colors } = {}) {
    const palette = colors ? colors.map(hex) : PALETTE;
    for (let n = 0; n < count; n++) {
      const i = next;
      next = (next + 1) % MAX;
      const a = Math.random() * Math.PI * 2;
      const r = Math.random();
      pos.set([origin.x + (Math.random() - 0.5) * 0.08, origin.y + (Math.random() - 0.5) * 0.08, origin.z + (Math.random() - 0.5) * 0.08], i * 3);
      vel.set([Math.cos(a) * r * speed, up + Math.random() * speed * 0.8, Math.sin(a) * r * speed], i * 3);
      col.set(Math.random() < 0.5 ? palette[n % palette.length] : PALETTE[n % PALETTE.length], i * 3);
      life[i] = 2.2 + Math.random() * 1.2;
      phase[i] = Math.random() * 10;
      size[i] = baseSize[i] = 0.03 + Math.random() * 0.025;
    }
    geo.attributes.aColor.needsUpdate = true;
  }

  function update(dt, pxPerMeter) {
    material.uniforms.uScale.value = pxPerMeter;
    let alive = false;
    for (let i = 0; i < MAX; i++) {
      if (life[i] <= 0) continue;
      alive = true;
      life[i] -= dt;
      const k = i * 3;
      const drag = Math.max(0, 1 - 2.2 * dt);
      vel[k] = vel[k] * drag + Math.sin(phase[i] + life[i] * 6) * 0.6 * dt; // 飘来飘去
      vel[k + 1] = vel[k + 1] * drag - 5.5 * dt;
      vel[k + 2] = vel[k + 2] * drag;
      // 留在房间里，不穿墙
      pos[k] = Math.min(1.47, Math.max(-1.46, pos[k] + vel[k] * dt));
      pos[k + 1] = Math.max(FLOOR_Y, pos[k + 1] + vel[k + 1] * dt);
      pos[k + 2] = Math.min(1.47, Math.max(-1.46, pos[k + 2] + vel[k + 2] * dt));
      size[i] = life[i] <= 0 ? 0 : baseSize[i] * Math.min(1, life[i] / 0.5);
    }
    if (alive) {
      geo.attributes.position.needsUpdate = true;
      geo.attributes.aSize.needsUpdate = true;
    }
  }

  return { points, burst, update };
}

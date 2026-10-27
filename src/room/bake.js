// "烘焙"：在载入时一次性算好每个顶点的环境光遮蔽（AO），写进顶点颜色，
// 再把同一个单位里的小网格合并成一个，减少 draw call。
import {
  Box3, Matrix3, Matrix4, Vector3, Color, Mesh, BufferAttribute, MeshLambertMaterial, MeshBasicMaterial,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { INNER } from './scene.js';

// 阴影偏暖粉色，不用灰黑色
const SHADOW_TINT = new Color(0xb98a96);

export function collectOccluders(root) {
  const list = [];
  root.traverse((o) => {
    if (!o.isMesh || o.userData.shell || o.userData.noOcclude || !o.material.isMeshLambertMaterial) return;
    o.geometry.computeBoundingSphere();
    const sphere = o.geometry.boundingSphere.clone().applyMatrix4(o.matrixWorld);
    if (sphere.radius < 0.03) return;
    list.push({ mesh: o, sphere, box: new Box3().setFromObject(o), shade: !!o.userData.shade });
  });
  return list;
}

// 平面（地板、墙）造成的遮蔽：越贴近平面、法线越背离平面，越暗
const planeOcc = (nDot, dist) => (1 - nDot) * 0.5 * Math.exp(-dist / 0.16) * 0.75;

function vertexAO(p, n, occluders, self) {
  let occ = 0;
  if (p.y >= 0) occ += planeOcc(n.y, Math.max(p.y - 0.02, 0));
  if (p.x >= INNER - 0.02) occ += planeOcc(n.x, Math.max(p.x - INNER, 0));
  if (p.z >= INNER - 0.02) occ += planeOcc(n.z, Math.max(p.z - INNER, 0));
  for (const o of occluders) {
    if (o.mesh === self) continue;
    const c = o.sphere.center, r = o.sphere.radius;
    const dx = c.x - p.x, dy = c.y - p.y, dz = c.z - p.z;
    const d2 = dx * dx + dy * dy + dz * dz;
    if (d2 < r * r * 1.05) continue; // 在包围球里面（例如礼物上的丝带），不算
    const d = Math.sqrt(d2);
    const cos = (n.x * dx + n.y * dy + n.z * dz) / d;
    if (cos > 0) occ += ((r * r) / d2) * cos * 0.9;
  }
  return Math.max(1 - occ, 0.4);
}

const _p = new Vector3(), _n = new Vector3(), _m = new Matrix4(), _nm = new Matrix3();

function prepare(mesh, toUnit, occluders) {
  const geo = mesh.geometry.clone();
  for (const name of Object.keys(geo.attributes)) {
    if (name !== 'position' && name !== 'normal') geo.deleteAttribute(name);
  }
  if (!geo.index) geo.setIndex([...Array(geo.attributes.position.count).keys()]);

  const pos = geo.attributes.position, nor = geo.attributes.normal;
  const colors = new Float32Array(pos.count * 3);
  const base = mesh.material.color;
  const lit = mesh.material.isMeshBasicMaterial;
  _nm.getNormalMatrix(mesh.matrixWorld);
  for (let i = 0; i < pos.count; i++) {
    let ao = 1;
    if (!lit && !mesh.userData.shell) {
      _p.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld);
      _n.fromBufferAttribute(nor, i).applyMatrix3(_nm).normalize();
      ao = vertexAO(_p, _n, occluders, mesh);
    }
    colors[i * 3] = base.r * (SHADOW_TINT.r + (1 - SHADOW_TINT.r) * ao);
    colors[i * 3 + 1] = base.g * (SHADOW_TINT.g + (1 - SHADOW_TINT.g) * ao);
    colors[i * 3 + 2] = base.b * (SHADOW_TINT.b + (1 - SHADOW_TINT.b) * ao);
  }
  geo.setAttribute('color', new BufferAttribute(colors, 3));
  geo.applyMatrix4(_m.multiplyMatrices(toUnit, mesh.matrixWorld));
  return geo;
}

export const clayMaterial = new MeshLambertMaterial({ vertexColors: true });
// 柔和的边缘光：模拟参考图里物体边缘被环境照亮的感觉
clayMaterial.onBeforeCompile = (shader) => {
  shader.fragmentShader = shader.fragmentShader.replace('#include <opaque_fragment>', `
    {
      vec3 viewDir = isOrthographic ? vec3( 0.0, 0.0, 1.0 ) : normalize( vViewPosition );
      float rim = pow( 1.0 - saturate( dot( normal, viewDir ) ), 2.5 );
      outgoingLight += vec3( 1.0, 0.88, 0.84 ) * rim * 0.2;
    }
    #include <opaque_fragment>`);
};
const glowMaterial = new MeshBasicMaterial({ vertexColors: true });

// 把一个单位（unit）底下的网格合并。嵌套的单位单独处理。
export function bakeUnit(unit, occluders) {
  const toUnit = new Matrix4().copy(unit.matrixWorld).invert();
  const clay = [], glow = [];
  const visit = (obj) => {
    for (const child of [...obj.children]) {
      if (child.userData.unit) bakeUnit(child, occluders);
      else if (child.isMesh && !child.userData.keep) {
        (child.material.isMeshBasicMaterial ? glow : clay).push(prepare(child, toUnit, occluders));
        child.removeFromParent();
      } else visit(child);
    }
  };
  visit(unit);
  if (clay.length) unit.add(new Mesh(mergeGeometries(clay), clayMaterial));
  if (glow.length) unit.add(new Mesh(mergeGeometries(glow), glowMaterial));
}


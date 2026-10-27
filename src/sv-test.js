// sv-test-k4m2.html 的脚本：用网站同一个 intent 写法打开 Scene Viewer，只换模型文件
import { sceneViewerIntent } from './ar.js';

const MODELS = {
  // Google Scene Viewer 文档里用的示例模型
  avocado: { file: 'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/master/2.0/Avocado/glTF/Avocado.gltf', title: 'Avocado' },
  cake: { file: new URL('ar/cake.glb', location.href).href, title: '生日蛋糕' },
  cake3d: { file: new URL('ar/cake.glb', location.href).href, title: '生日蛋糕', mode: '3d_only' },
};
const NAMES = { avocado: '牛油果', cake: '蛋糕', cake3d: '蛋糕（只看 3D）' };

const result = document.getElementById('result');
document.getElementById('ua').textContent = navigator.userAgent;

// 打不开时 Chrome 会回到这一页并带上 #fallback-xxx
function showFallback() {
  const m = location.hash.match(/^#fallback-(\w+)$/);
  if (m) result.textContent = `${NAMES[m[1]] ?? m[1]}：没打开 Scene Viewer，回到了这一页（可能没装 Google 应用或被挡住）`;
}
window.addEventListener('hashchange', showFallback);
showFallback();

document.addEventListener('visibilitychange', () => {
  if (document.hidden && result.dataset.pending) {
    result.textContent = `${result.dataset.pending}：已经跳去 Scene Viewer。回来后请告诉我：正常显示 / 崩溃 / 黑屏`;
    delete result.dataset.pending;
  }
});

document.querySelectorAll('button[data-model]').forEach((b) => b.addEventListener('click', () => {
  const key = b.dataset.model;
  const { file, title, mode } = MODELS[key];
  let intent = sceneViewerIntent(file, location.href.split('#')[0] + '#fallback-' + key, title);
  if (mode) intent = intent.replace('mode=ar_preferred', `mode=${mode}`);
  result.textContent = `${NAMES[key]}：正在打开……`;
  result.dataset.pending = NAMES[key];
  location.href = intent;
}));

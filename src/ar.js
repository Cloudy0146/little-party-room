// "放到桌上看看"：用手机系统自带的 AR 查看器，不需要额外的库，也不需要任何权限。
//   iPhone：AR Quick Look（.usdz）
//   Android：Google Scene Viewer（.glb，要完整的 https 网址；打不开时回到 #no-ar）
//            排查用的测试页：sv-test-k4m2.html（不从网站任何地方链接）
//   微信：两种都被挡住，提示她用浏览器打开
//   其他（电脑等）：直接看能转的 3D 蛋糕
// 模型由 tools/ar-export.html 从房间里的蛋糕导出，真实大小（蛋糕直径约 20cm）。

const ua = navigator.userAgent;
export const NO_AR_HASH = '#no-ar';

export function arSupport() {
  if (/MicroMessenger/i.test(ua)) return 'wechat';
  const a = document.createElement('a');
  if (a.relList?.supports?.('ar')) return 'quicklook';
  if (/Android/i.test(ua)) return 'sceneviewer';
  return 'none';
}

// iPhone：<a rel="ar"> 里面一定要包一张图片，否则 Safari 会把 .usdz 当成普通下载
function openQuickLook() {
  const a = document.createElement('a');
  a.rel = 'ar';
  a.href = 'ar/cake.usdz#allowsContentScaling=0'; // 保持真实大小，不让双指缩放
  a.append(document.createElement('img'));
  a.click();
}

// Android：Scene Viewer 的 intent 网址（照 Google 文档：ar_preferred 搭配 Google 应用，
// 不支持 AR 的手机会自动退回 3D；com.google.ar.core 只用于 ar_only）。
// 没装 Google 应用时 Chrome 会打开 browser_fallback_url，也就是这一页加上 #no-ar，房间那边收到后改成显示 3D 蛋糕
export function sceneViewerIntent(file, fallback, title) {
  const params = new URLSearchParams({ file, mode: 'ar_preferred', resizable: 'false', title });
  return `intent://arvr.google.com/scene-viewer/1.0?${params}#Intent;scheme=https;`
    + 'package=com.google.android.googlequicksearchbox;action=android.intent.action.VIEW;'
    + `S.browser_fallback_url=${encodeURIComponent(fallback)};end;`;
}

function openSceneViewer(onFail) {
  const file = new URL('ar/cake.glb', location.href).href;
  const intent = sceneViewerIntent(file, location.href.split('#')[0] + NO_AR_HASH, '生日蛋糕');

  // 有些浏览器（例如其他 App 的内置浏览器）会悄悄挡掉 intent：页面一直没被切走，就当打不开
  let left = false;
  const onHide = () => { if (document.hidden) left = true; };
  document.addEventListener('visibilitychange', onHide);
  setTimeout(() => {
    document.removeEventListener('visibilitychange', onHide);
    if (!left && location.hash !== NO_AR_HASH) onFail();
  }, 2500);
  location.href = intent;
}

// 返回 true 表示交给系统 AR 了；false 表示这里打不开，调用方显示 3D 蛋糕或微信提示
export function launchAR(support, onFail) {
  if (support === 'quicklook') openQuickLook();
  else if (support === 'sceneviewer') openSceneViewer(onFail);
  else return false;
  return true;
}

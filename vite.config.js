import { defineConfig } from 'vite';
import { mkdirSync, writeFileSync } from 'node:fs';

// 只在本地开发服务器里生效：tools/ar-export.html 把导出的 AR 模型 POST 过来，写进 public/ar/
const arSave = {
  name: 'ar-save',
  apply: 'serve',
  configureServer(server) {
    server.middlewares.use('/__ar-save', (req, res) => {
      const name = new URL(req.url, 'http://x').searchParams.get('name');
      if (req.method !== 'POST' || !['cake.glb', 'cake.usdz'].includes(name)) {
        res.statusCode = 400;
        return res.end();
      }
      const chunks = [];
      req.on('data', (c) => chunks.push(c));
      req.on('end', () => {
        mkdirSync('public/ar', { recursive: true });
        writeFileSync(`public/ar/${name}`, Buffer.concat(chunks));
        res.end('ok');
      });
    });
  },
};

export default defineConfig({
  // 用相对路径，网站放在 /little-party-room/ 子目录下也能正常加载
  base: './',
  plugins: [arSave],
  build: {
    // 3D 要 iOS 15 以上，但入口和 2D 兜底页要让 iOS 14 也能运行
    target: 'safari14',
    assetsInlineLimit: 0,
  },
});

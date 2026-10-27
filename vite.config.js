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
    target: 'safari15',
    assetsInlineLimit: 0,
    rolldownOptions: {
      // 第二个页面是排查 Scene Viewer 用的测试页，网站里没有任何链接指向它
      input: { main: 'index.html', svTest: 'sv-test-k4m2.html' },
    },
  },
});

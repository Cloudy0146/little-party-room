// 测试脚本共用：临时起一个静态服务器，服务 dist/（先 npm run build）
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..', 'dist');
const TYPES = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.glb': 'model/gltf-binary', '.usdz': 'model/vnd.usdz+zip',
};

// fail(url) 返回 true 时直接断开连接，模拟网络失败
export async function serveDist(port, fail = () => false) {
  const server = http.createServer((req, res) => {
    if (fail(req.url)) return req.socket.destroy();
    const url = new URL(req.url, 'http://x');
    const file = path.join(ROOT, decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname));
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.statusCode = 404;
      return res.end();
    }
    res.setHeader('Content-Type', TYPES[path.extname(file)] ?? 'application/octet-stream');
    fs.createReadStream(file).pipe(res);
  });
  await new Promise((r) => server.listen(port, '127.0.0.1', r));
  return server;
}

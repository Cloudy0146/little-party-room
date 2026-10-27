import { defineConfig } from 'vite';

export default defineConfig({
  // 用相对路径，网站放在 /little-party-room/ 子目录下也能正常加载
  base: './',
  build: {
    target: 'safari15',
    assetsInlineLimit: 0,
  },
});

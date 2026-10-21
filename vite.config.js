import { defineConfig } from 'vite';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

// 构建时生成 service worker：把所有产物文件写入预缓存列表，版本号取内容哈希。
function serviceWorker() {
  return {
    name: 'aa-split-sw',
    apply: 'build',
    generateBundle(_options, bundle) {
      const files = Object.keys(bundle).filter((f) => !f.endsWith('.map'));
      const publicFiles = ['manifest.webmanifest', 'icon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/maskable-512.png', 'icons/apple-touch-icon.png'];
      const precache = ['./', './index.html', ...[...files, ...publicFiles].map((f) => './' + f)];
      const version = createHash('sha256').update(precache.join('\n')).digest('hex').slice(0, 10);
      const template = readFileSync(new URL('./src/sw-template.js', import.meta.url), 'utf8');
      this.emitFile({
        type: 'asset',
        fileName: 'sw.js',
        source: template
          .replace(/^\/\/.*\n/, '// 由构建脚本自动生成\n')
          .replace('__VERSION__', version)
          .replace('__PRECACHE__', JSON.stringify(precache, null, 2)),
      });
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [serviceWorker()],
  build: { target: 'es2020' },
});

/* 入口：画面を登録して起動する */
import { boot } from './app.js';
import './home.js';
import './project.js';
import './pages.js';

boot();

/*
 * Service Worker は現在のブラウザ環境で registration.update() 系の例外を
 * 発生させているため、ブラウザ版の安定動作を優先して一旦停止する。
 * KAKU は通常の HTTPS ページとしてオンライン利用できる。
 * このアプリの GitHub Pages 配下にある登録だけを解除し、他サイトの登録には触れない。
 */
if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
  window.addEventListener('load', async () => {
    try {
      const regs = await navigator.serviceWorker.getRegistrations();
      const basePath = new URL('./', location.href).pathname;
      await Promise.all(regs
        .filter(reg => new URL(reg.scope).pathname === basePath)
        .map(reg => reg.unregister()));
      const keys = await caches.keys();
      await Promise.all(keys
        .filter(key => key.startsWith('kaku-generation-'))
        .map(key => caches.delete(key)));
      console.info('KAKU: Service Worker を停止しました（オンライン動作）');
    } catch (e) {
      console.warn('KAKU: Service Worker の解除をスキップしました', e);
    }
  });
}

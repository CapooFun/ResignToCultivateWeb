import { expect, test } from '@playwright/test';

test('PWA 清单与离线脚本可访问', async ({ request }) => {
  const manifestResponse = await request.get('/manifest.webmanifest');
  expect(manifestResponse.ok()).toBe(true);
  const manifest = await manifestResponse.json();
  expect(manifest.name).toBe('辞职修仙传');
  expect(manifest.display).toBe('standalone');
  expect(manifest.orientation).toBe('portrait');
  expect(manifest.icons).toHaveLength(3);

  const workerResponse = await request.get('/sw.js');
  expect(workerResponse.ok()).toBe(true);
  expect(await workerResponse.text()).toContain('precacheAndRoute');
});

test('首次联网后可以离线刷新启动', async ({ browserName, context, page }) => {
  test.skip(browserName === 'webkit', 'Playwright WebKit 的离线网络模拟会触发内核错误，保留给真实 iPhone 验收。');
  await page.goto('/');
  await page.evaluate(async () => {
    if (!('serviceWorker' in navigator)) throw new Error('当前浏览器不支持 Service Worker');
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await expect(page.getByRole('heading', { name: '洞府' })).toBeVisible();

  await context.setOffline(true);
  try {
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: '洞府' })).toBeVisible();
  } finally {
    await context.setOffline(false);
  }
});

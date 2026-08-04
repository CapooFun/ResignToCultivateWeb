import { expect, test } from '@playwright/test';

test('洞府到小图的首个闭环入口可操作', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '洞府' })).toBeVisible();
  await page.getByRole('button', { name: '出发寻求机缘' }).click();
  await expect(page.getByRole('heading', { name: '选择地界' })).toBeVisible();
  await page.getByRole('button', { name: /青石谷/ }).click();
  await expect(page.getByText(/青石谷 · 1\/1层/)).toBeVisible();
  await expect(page.locator('canvas')).toBeVisible();
});

test('洞府设施、仓库与存档入口存在', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: /仓库/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /采矿/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /炼丹/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /炼器/ })).toBeVisible();
  await page.getByRole('button', { name: '存档与试玩信息' }).click();
  await expect(page.getByRole('dialog', { name: '存档与试玩信息' })).toBeVisible();
  await expect(page.getByRole('button', { name: '导出存档' })).toBeVisible();
});


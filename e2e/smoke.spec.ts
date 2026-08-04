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

test('采矿与炼丹弹层 fixed 贴底可开关', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '洞府' })).toBeVisible();

  await page.getByRole('button', { name: /^矿/ }).click();
  const mine = page.getByRole('dialog', { name: '采矿' });
  await expect(mine).toBeVisible();
  expect(await mine.evaluate((el) => getComputedStyle(el.closest('.modal-backdrop')!).position)).toBe('fixed');
  await mine.getByRole('button', { name: '叩击灵脉', exact: true }).click();
  await expect(mine.locator('.mine-stored-value b')).not.toHaveText('0');
  await mine.getByRole('button', { name: '关闭' }).click();
  await expect(mine).toHaveCount(0);
  expect(await page.evaluate(() => document.body.classList.contains('mine-lock'))).toBe(false);

  await page.getByRole('button', { name: /^丹/ }).click();
  const alchemy = page.getByRole('dialog', { name: '炼丹' });
  await expect(alchemy).toBeVisible();
  expect(await alchemy.evaluate((el) => getComputedStyle(el.closest('.modal-backdrop')!).position)).toBe('fixed');
  const box = await alchemy.boundingBox();
  expect(box).toBeTruthy();
  expect(box!.y).toBeLessThan(700);
});


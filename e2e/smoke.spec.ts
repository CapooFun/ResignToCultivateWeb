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

test('探索底栏贴底且可点血蓝条开行囊', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '出发寻求机缘' }).click();
  await page.getByRole('button', { name: /青石谷/ }).click();
  await expect(page.locator('.explore-hud')).toBeVisible();

  const layout = await page.evaluate(() => {
    const screen = document.querySelector('.explore-screen') as HTMLElement;
    const hud = document.querySelector('.explore-hud') as HTMLElement;
    const header = document.querySelector('.explore-header') as HTMLElement;
    const shell = document.querySelector('.app-shell') as HTMLElement;
    const screenBox = screen.getBoundingClientRect();
    const hudBox = hud.getBoundingClientRect();
    const headerBox = header.getBoundingClientRect();
    const shellBox = shell.getBoundingClientRect();
    return {
      hudBottomGap: Math.abs(screenBox.bottom - hudBox.bottom),
      headerInsideShell: headerBox.top >= shellBox.top - 1,
      headerVisibleHeight: headerBox.height,
      mapBelowHud: screenBox.bottom - hudBox.bottom < 1
    };
  });
  expect(layout.hudBottomGap).toBeLessThanOrEqual(2);
  expect(layout.headerInsideShell).toBe(true);
  expect(layout.headerVisibleHeight).toBeGreaterThanOrEqual(40);
  expect(layout.mapBelowHud).toBe(true);

  await page.getByRole('button', { name: '打开行囊与装配' }).click();
  await expect(page.getByRole('dialog', { name: '行囊与装配' })).toBeVisible();
  await page.getByRole('dialog', { name: '行囊与装配' }).getByRole('button', { name: '关闭' }).click();
});


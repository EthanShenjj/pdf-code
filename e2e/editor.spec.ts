import { expect, test } from "@playwright/test";
import path from "node:path";

test("imports, edits, autosaves and restores a PDF", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /把 PDF 处理得/ })).toBeVisible();
  await page.locator('input[type="file"]').first().setInputFiles(path.resolve("fixtures/sample.pdf"));
  await expect(page).toHaveURL(/\/editor\//);
  await expect(page.getByText("第 1 页，共 1 页")).toBeVisible();
  const canvas = page.locator("section canvas").first();
  await expect.poll(() => canvas.evaluate((element) => (element as HTMLCanvasElement).width)).toBeGreaterThan(300);
  const pinchPrevented = await canvas.evaluate((element) => !element.dispatchEvent(new WheelEvent("wheel", { bubbles: true, cancelable: true, ctrlKey: true, deltaY: -80, clientX: 500, clientY: 400 })));
  expect(pinchPrevented).toBe(true);
  await expect(page.getByText("122%", { exact: true })).toBeVisible();
  const scrollPrevented = await canvas.evaluate((element) => !element.dispatchEvent(new WheelEvent("wheel", { bubbles: true, cancelable: true, deltaY: 80 })));
  expect(scrollPrevented).toBe(false);
  await expect(page.getByText("122%", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "文字" }).click();
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await expect(page.getByText("双击输入文字", { exact: true })).toBeVisible();
  await expect(page.getByText("已保存")).toBeVisible({ timeout: 5000 });
  await page.reload();
  await expect(page.getByText("双击输入文字", { exact: true })).toBeVisible();
});

test("renders the first page before loading every thumbnail in a long PDF", async ({ page }) => {
  await page.goto("/");
  const card = page.getByRole("heading", { name: "编辑 PDF" }).locator("..");
  await card.locator('input[type="file"]').setInputFiles(path.resolve("fixtures/sample-30-pages.pdf"));
  await expect(page).toHaveURL(/\/editor\//);
  await expect(page.getByText("第 1 页，共 30 页")).toBeVisible();
  const mainCanvas = page.getByLabel("PDF 文档区域，可使用触控板双指缩放").locator("canvas").first();
  await expect.poll(() => mainCanvas.evaluate((element) => (element as HTMLCanvasElement).width), { timeout: 5000 }).toBeGreaterThan(300);
  expect(await page.locator("aside").first().locator("canvas").count()).toBeLessThan(30);
});

test("merges several PDFs and accepts another file", async ({ page }) => {
  await page.goto("/");
  const card = page.getByRole("heading", { name: "合并 PDF" }).locator("..");
  await card.locator('input[type="file"]').setInputFiles([path.resolve("fixtures/sample.pdf"), path.resolve("fixtures/sample-3-pages.pdf")]);
  await expect(page).toHaveURL(/mode=merge/);
  await expect(page.getByText("已加入 2 个文件，共 4 页")).toBeVisible();
  await expect(page.getByText("第 1 页，共 4 页")).toBeVisible();
  await page.locator('aside input[type="file"]').setInputFiles(path.resolve("fixtures/sample.pdf"));
  await expect(page.getByText("已加入 1 个 PDF、1 页")).toBeVisible();
  await expect(page.getByText("第 1 页，共 5 页")).toBeVisible();
});

test("selects and exports split pages", async ({ page }) => {
  await page.goto("/");
  const card = page.getByRole("heading", { name: "拆分 PDF" }).locator("..");
  await card.locator('input[type="file"]').setInputFiles(path.resolve("fixtures/sample-3-pages.pdf"));
  await expect(page).toHaveURL(/mode=split/);
  await expect(page.getByText("已选择 3/3 页")).toBeVisible();
  await page.getByRole("button", { name: "偶数页" }).click();
  await expect(page.getByText("已选择 1/3 页")).toBeVisible();
  await page.getByRole("button", { name: "奇数页" }).click();
  await expect(page.getByText("已选择 2/3 页")).toBeVisible();
  const pdfDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出所选 PDF" }).click();
  await pdfDownload;
  const zipDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "逐页 ZIP" }).click();
  await zipDownload;
});

import { expect, test } from "@playwright/test";

test("el acceso usa correo y contraseña y se adapta a escritorio y móvil", async ({ page }, testInfo) => {
  await page.goto("/acceso");
  await expect(page.getByLabel("Correo electrónico")).toHaveAttribute("type", "email");
  await expect(page.getByLabel("Contraseña", { exact: true })).toHaveAttribute("autocomplete", "current-password");
  await expect(page.getByLabel("Código de acceso")).toHaveCount(0);
  for (const [width, height, name] of [[1440, 960, "desktop"], [390, 844, "mobile"]] as const) {
    await page.setViewportSize({ width, height });
    await expect(page.getByRole("button", { name: "Ingresar" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    await page.evaluate(async () => {
      await document.fonts.ready;
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
      window.scrollTo({ top: 0, behavior: 'instant' });
      await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    });
    await page.screenshot({ path: testInfo.outputPath(`email-login-${name}.png`) });
  }
});

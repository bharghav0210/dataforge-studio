import { test as base, expect } from "@playwright/test";
export const API = process.env.DATAFORGE_E2E_API_URL || "http://localhost:8001";
export const test = base.extend({
  page: async ({ page, request }, runTest) => {
    const response = await request.get(`${API}/api/v1/settings`);
    const settings = await response.json();
    if (!settings.storage_location?.includes("dataforge-e2e-"))
      throw new Error(
        "Browser tests require isolated dataforge-e2e-* storage; refusing personal workspace",
      );
    const target = process.env.DATAFORGE_E2E_FRONTEND_TARGET;
    if (target) {
      await page.context().grantPermissions(["local-network-access"], {
        origin: "http://localhost:3001",
      });
      // Keep the real browser origin on 3001 while serving the disposable copy on a free port.
      // API requests (including multipart uploads) go directly to the real isolated backend.
      await page.context().route("http://localhost:3001/**", async (route) => {
        const url = new URL(route.request().url());
        const response = await route.fetch({
          url: `${target}${url.pathname}${url.search}`,
        });
        await route.fulfill({ response });
      });
    }
    await runTest(page);
  },
});
export { expect };

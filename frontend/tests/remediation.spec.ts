import type { APIRequestContext, Page } from "@playwright/test";
import { test, expect, API } from "./fixtures";

const unique = (name: string) => `${name}-${crypto.randomUUID().slice(0, 8)}`;
const get = async (request: APIRequestContext, path: string) =>
  (await request.get(`${API}/api/v1${path}`)).json();
const post = async (request: APIRequestContext, path: string, data: unknown) =>
  (await request.post(`${API}/api/v1${path}`, { data })).json();
async function dataset(request: APIRequestContext) {
  const response = await request.post(`${API}/api/v1/datasets`, {
    multipart: {
      file: {
        name: `${unique("regression")}.csv`,
        mimeType: "text/csv",
        buffer: Buffer.from("region,quantity\nNorth,1\nSouth,2\nNorth,1\n"),
      },
    },
  });
  expect(response.status()).toBe(201);
  return response.json();
}
async function notebook(request: APIRequestContext) {
  return post(request, "/notebooks", {
    name: unique("Notebook"),
    cells: [{ source: "print(42)" }],
  });
}
async function openNotebook(page: Page, name: string) {
  await page.goto("/python");
  await page.getByRole("button", { name: new RegExp(name) }).click();
}
function barrier() {
  let release!: () => void;
  let arrived!: () => void;
  return {
    gate: new Promise<void>((resolve) => {
      release = resolve;
    }),
    seen: new Promise<void>((resolve) => {
      arrived = resolve;
    }),
    release: () => release(),
    arrived: () => arrived(),
  };
}

for (const kind of ["notebook", "pipeline"] as const) {
  test(`H3 ${kind}: delayed saves preserve newer edits, failed saves retry`, async ({
    page,
    request,
  }) => {
    let id: string | undefined;
    const collection = kind === "notebook" ? "/notebooks" : "/pipelines";
    const label = kind === "notebook" ? "Notebook name" : "Pipeline name";
    const button = kind === "notebook" ? "Save" : "Save pipeline";
    if (kind === "notebook") {
      const n = await notebook(request);
      id = n.id;
      await openNotebook(page, n.name);
    } else {
      const d = await dataset(request);
      await page.goto("/pipelines");
      await page.getByLabel("Uploaded CSV or Excel").selectOption(d.id);
    }
    const snapshot = unique("Submitted");
    const newer = unique("Newer");
    await page.getByLabel(label).fill(snapshot);
    const save = page.getByRole("button", { name: button, exact: true });
    const indicator = page.locator(".notebook-toolbar .tiny");
    const held = barrier();
    const routePath = `${API}/api/v1${collection}${id ? "/" + id : ""}`;
    await page.route(routePath, async (route) => {
      held.arrived();
      await held.gate;
      await route.continue();
    });
    try {
      await save.click();
      await held.seen;
      const initialStatus = await indicator.textContent();
      await page.getByLabel(label).fill(newer);
      held.release();
      await expect(save).toBeEnabled();
      await expect(page.getByLabel(label)).toHaveValue(newer);
      await expect(indicator).toHaveText("UNSAVED");
      expect(initialStatus).toBe("SAVING");
    } finally {
      held.release();
      await page.unroute(routePath);
    }
    const records = await get(request, collection);
    id = id || records.find((r: { name: string }) => r.name === snapshot)?.id;
    expect(id).toBeTruthy();
    expect((await get(request, `${collection}/${id}`)).name).toBe(snapshot);
    await save.click();
    await expect(indicator).toHaveText("SAVED");
    expect((await get(request, `${collection}/${id}`)).name).toBe(newer);
    await page.getByLabel(label).fill(unique("Retry"));
    const pendingName = await page.getByLabel(label).inputValue();
    const endpoint = `${API}/api/v1${collection}/${id}`;
    await page.route(endpoint, (route) =>
      route.fulfill({
        status: 503,
        contentType: "application/json",
        headers: { "access-control-allow-origin": "http://localhost:3001" },
        body: JSON.stringify({ detail: "Injected save failure" }),
      }),
    );
    await save.click();
    await expect(indicator).toHaveText("SAVE FAILED");
    await expect(page.getByLabel(label)).toHaveValue(pendingName);
    await expect(page.locator(".notice.error")).toContainText(
      "Injected save failure",
    );
    await page.unroute(endpoint);
    await save.click();
    await expect(indicator).toHaveText("SAVED");
    expect((await get(request, `${collection}/${id}`)).name).toBe(pendingName);
  });
}

test("M1: identical ETL operations keep their parameters on reorder and deletion", async ({
  page,
  request,
}) => {
  const d = await dataset(request);
  const p = await post(request, "/pipelines", {
    name: unique("Reorder"),
    dataset_id: d.id,
    steps: [
      { op: "select", columns: ["region", "quantity"] },
      { op: "select", columns: ["region"] },
    ],
    destination: "csv",
  });
  await page.goto("/pipelines");
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: new RegExp(p.name) }).click();
  const inputs = page.locator(".step-fields input");
  await expect(inputs.nth(0)).toHaveValue("region, quantity");
  await page.getByRole("button", { name: "Move step up" }).nth(1).click();
  await expect(inputs.nth(0)).toHaveValue("region");
  await expect(inputs.nth(1)).toHaveValue("region, quantity");
  await page
    .getByRole("button", { name: "Remove transformation" })
    .first()
    .click();
  await expect(inputs).toHaveCount(1);
  await expect(inputs).toHaveValue("region, quantity");
  const submitted = page.waitForRequest(
    (r) =>
      r.url() === `${API}/api/v1/pipelines/preview` && r.method() === "POST",
  );
  await page.getByRole("button", { name: "Preview", exact: true }).click();
  const body = (await submitted).postDataJSON();
  expect(body.steps[0].columns).toEqual(["region", "quantity"]);
  expect(body.steps[0]).not.toHaveProperty("editorId");
  await expect(
    page.getByRole("heading", { name: "Transformation preview" }),
  ).toBeVisible();
});

test("M2: cancel deletion stays silent; confirmed deletion needs a real backend response", async ({
  page,
  request,
}) => {
  const d = await dataset(request);
  await page.goto("/datasets");
  await page.getByRole("button", { name: new RegExp(d.name) }).click();
  let deletes = 0;
  page.on("request", (r) => {
    if (r.method() === "DELETE") deletes += 1;
  });
  page.once("dialog", (dialog) => dialog.dismiss());
  await page
    .getByRole("button", { name: "Delete dataset", exact: true })
    .click();
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
  await expect(page.getByText("Dataset deleted.", { exact: true })).toHaveCount(
    0,
  );
  expect(deletes).toBe(0);
  expect(
    (await get(request, "/datasets")).some(
      (row: { id: string }) => row.id === d.id,
    ),
  ).toBe(true);
  page.once("dialog", (dialog) => dialog.accept());
  const response = page.waitForResponse(
    (r) =>
      r.url() === `${API}/api/v1/datasets/${d.id}` &&
      r.request().method() === "DELETE",
  );
  await page
    .getByRole("button", { name: "Delete dataset", exact: true })
    .click();
  expect((await response).status()).toBe(204);
  await expect(
    page.getByText("Dataset deleted.", { exact: true }),
  ).toBeVisible();
});

test("M3: sidebar toggle is visible and works at desktop and mobile widths", async ({
  page,
}) => {
  await page.goto("/dashboard");
  const toggle = page.getByRole("button", { name: "Toggle sidebar" });
  await expect(toggle).toBeVisible();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  expect((await page.locator(".sidebar").boundingBox())?.width).toBe(75);
  await toggle.click();
  expect((await page.locator(".sidebar").boundingBox())?.width).toBe(222);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await expect(toggle).toBeVisible();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  expect((await page.locator(".sidebar").boundingBox())?.width).toBe(222);
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  for (const name of [
    "Overview",
    "Python Lab",
    "SQL Lab",
    "Pipelines",
    "Datasets",
    "Execution history",
    "Settings",
  ])
    await expect(
      page.getByRole("navigation").getByRole("link", { name, exact: true }),
    ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("M6: filter failures clear results, retry works, and stale refresh responses cannot win", async ({
  page,
  request,
}) => {
  await post(request, "/sql/run", { sql: "SELECT 1 AS filter_test" });
  const n = await notebook(request);
  await post(request, "/python/run", { notebook_id: n.id });
  await page.goto("/history");
  await expect(page.locator("tbody tr").first()).toBeVisible();
  const old = barrier();
  let hold = true;
  const pattern = `${API}/api/v1/executions?*`;
  await page.route(pattern, async (route) => {
    const kind = new URL(route.request().url()).searchParams.get("kind");
    if (!kind && hold) {
      hold = false;
      old.arrived();
      await old.gate;
    }
    await route.continue();
  });
  try {
    await page.getByRole("button", { name: "Refresh", exact: true }).click();
    await old.seen;
    await expect(
      page.getByRole("status", { name: "Loading", exact: true }),
    ).toBeVisible();
    await page.getByLabel("Filter execution type").selectOption("sql");
    await expect(page.locator("tbody .kind").first()).toHaveText("sql");
    old.release();
    await page.evaluate(
      () => new Promise((resolve) => setTimeout(resolve, 150)),
    );
    const kinds = await page.locator("tbody .kind").allTextContents();
    expect(kinds.every((kind) => kind === "sql")).toBe(true);
  } finally {
    old.release();
    await page.unroute(pattern);
  }
  await page.route(pattern, (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      headers: { "access-control-allow-origin": "http://localhost:3001" },
      body: JSON.stringify({ detail: "Injected filter failure" }),
    }),
  );
  await page.getByLabel("Filter execution type").selectOption("python");
  await expect(page.locator(".notice.error")).toContainText(
    "Injected filter failure",
  );
  await expect(page.locator("tbody tr")).toHaveCount(0);
  await page.unroute(pattern);
  await page.getByRole("button", { name: "Refresh", exact: true }).click();
  await expect(page.locator("tbody .kind").first()).toHaveText("python");
  await expect(page.locator(".notice.error")).toHaveCount(0);
});

test("M7: import cancellation preserves unsaved content; confirmed import replaces it", async ({
  page,
  request,
}) => {
  const n = await notebook(request);
  await openNotebook(page, n.name);
  await page.getByLabel("Notebook name").fill("Unsaved draft to preserve");
  const file = {
    name: "confirmed-import.ipynb",
    mimeType: "application/x-ipynb+json",
    buffer: Buffer.from(
      JSON.stringify({
        nbformat: 4,
        cells: [{ cell_type: "code", source: ["print(123)"] }],
      }),
    ),
  };
  const count = (await get(request, "/notebooks")).length;
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.getByLabel("Import notebook", { exact: true }).setInputFiles(file);
  await expect(
    page.getByRole("button", { name: "Import .ipynb", exact: true }),
  ).toBeEnabled();
  await expect(page.getByLabel("Notebook name")).toHaveValue(
    "Unsaved draft to preserve",
  );
  expect((await get(request, "/notebooks")).length).toBe(count);
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByLabel("Import notebook", { exact: true }).setInputFiles(file);
  await expect(page.getByLabel("Notebook name")).toHaveValue(
    "confirmed-import",
  );
  expect((await get(request, "/notebooks")).length).toBe(count + 1);
});

test("M8: details dialog traps focus, supports Escape/Close and restores its opener", async ({
  page,
  request,
}) => {
  await post(request, "/sql/run", { sql: "SELECT 8 AS dialog_test" });
  await page.goto("/history");
  const opener = page
    .getByRole("button", { name: "Inspect execution" })
    .first();
  await opener.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  const close = dialog.getByRole("button", { name: "Close", exact: true });
  await expect(close).toBeFocused();
  for (let i = 0; i < 6; i++) {
    await page.keyboard.press(i % 2 ? "Shift+Tab" : "Tab");
    expect(
      await page.evaluate(() =>
        Boolean(document.activeElement?.closest("dialog")),
      ),
    ).toBe(true);
  }
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(opener).toBeFocused();
  await opener.click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Close", exact: true })
    .click();
  await expect(opener).toBeFocused();
});

test("end-to-end reliability: upload → dataset Python → SQL → ETL → history → dashboard", async ({
  page,
  request,
}) => {
  const name = unique("Flow");
  const filename = `${name}.csv`;
  const start = await get(request, "/executions?limit=200");
  const oldIds = new Set(start.map((r: { id: string }) => r.id));
  await page.goto("/datasets");
  await page
    .getByLabel("Upload dataset", { exact: true })
    .setInputFiles({
      name: filename,
      mimeType: "text/csv",
      buffer: Buffer.from("region,quantity\nNorth,1\nSouth,2\nNorth,1\n"),
    });
  await expect(
    page.getByText("Dataset uploaded and inspected.", { exact: true }),
  ).toBeVisible();
  const d = (await get(request, "/datasets")).find(
    (row: { name: string }) => row.name === name,
  );
  const n = await post(request, "/notebooks", {
    name,
    cells: [
      {
        source: `import pandas as pd\ndf = pd.read_csv(DATASET_DIR + '/${d.filename}')\nprint(int(df['quantity'].sum()))`,
      },
    ],
  });
  await openNotebook(page, n.name);
  await page.getByRole("button", { name: "Run all", exact: true }).click();
  await expect(page.locator(".console").first()).toHaveText("4\n");
  await page.goto("/datasets");
  await page.getByRole("button", { name: new RegExp(name) }).click();
  const table = `flow_${crypto.randomUUID().replaceAll("-", "").slice(0, 12)}`;
  await page.getByLabel("Destination table name").fill(table);
  await page.getByRole("button", { name: "Import to SQLite" }).click();
  await expect(page.getByRole("status")).toContainText(
    `Imported into ${table}`,
  );
  await page.goto("/sql");
  await expect(page.getByText(table, { exact: true })).toBeVisible();
  await expect(page.locator(".monaco-editor")).toBeVisible();
  await page.locator(".monaco-editor").click();
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.type(
    `SELECT region, SUM(quantity) AS quantity FROM ${table} GROUP BY region ORDER BY region;`,
  );
  await page.getByRole("button", { name: "Run query", exact: true }).click();
  await expect(page.locator(".execution-output tbody tr")).toHaveCount(2);
  await expect(page.locator(".execution-output tbody tr").first()).toHaveText(
    "North2",
  );
  await page.goto("/pipelines");
  await page.getByLabel("Pipeline name").fill(name);
  await page.getByLabel("Uploaded CSV or Excel").selectOption(d.id);
  await page.getByLabel("Output format").selectOption("sqlite");
  await page.getByRole("button", { name: "Save & run" }).click();
  await expect(page.getByRole("button", { name: "Save & run" })).toBeEnabled();
  await expect(
    page.getByText("3 input rows → 2 output rows", { exact: true }),
  ).toBeVisible();
  const events = (await get(request, "/executions?limit=200")).filter(
    (row: { id: string }) => !oldIds.has(row.id),
  );
  expect(events.map((row: { kind: string }) => row.kind).sort()).toEqual([
    "etl",
    "python",
    "sql",
  ]);
  expect(
    events.every((row: { status: string }) => row.status === "success"),
  ).toBe(true);
  await page.goto("/history");
  await page.getByLabel("Filter execution type").selectOption("etl");
  await page.getByRole("button", { name, exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText(
    "3 input rows → 2 output rows",
  );
  await page.keyboard.press("Escape");
  await page.getByLabel("Filter execution status").selectOption("running");
  await expect(
    page.getByText("No executions match these filters."),
  ).toBeVisible();
  await page.goto("/dashboard");
  const counts = (await get(request, "/dashboard")).counts;
  await expect(page.locator(".metric strong")).toHaveText(
    ["notebooks", "datasets", "queries", "pipelines", "success", "failed"].map(
      (key) => String(counts[key]),
    ),
  );
  expect(await page.locator(".notice.error").count()).toBe(0);
});

import { test, expect, API } from "./fixtures";
import path from "node:path";

test("complete local notebook → dataset → SQL → ETL → history workflow", async ({
  page,
  request,
}) => {
  // The harness requires an isolated backend on 8001; never run on personal storage.
  const settings = await (await request.get(`${API}/api/v1/settings`)).json();
  expect(settings.storage_location).toContain("dataforge-e2e-");
  const beforeExecutions = await (
    await request.get(`${API}/api/v1/executions?limit=200`)
  ).json();
  const beforeIds = new Set(
    beforeExecutions.map((row: { id: string }) => row.id),
  );
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/dashboard");
  await expect(
    page.getByRole("heading", { name: "Workspace overview" }),
  ).toBeVisible();
  await page.screenshot({
    path: "../artifacts/dashboard-desktop.png",
    fullPage: true,
  });
  await page.getByRole("link", { name: "Python Lab", exact: true }).click();
  await page.getByRole("button", { name: "New notebook" }).click();
  await page
    .getByRole("textbox", { name: "Notebook name" })
    .fill("Browser acceptance notebook");
  await expect(page.locator(".monaco-editor")).toBeVisible();
  // Exercise Monaco's keyboard input rather than changing the editor through APIs.
  await page.locator(".monaco-editor").click();
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.type("x = 21\nprint(x * 2)");
  await page.getByRole("button", { name: "Run all", exact: true }).click();
  await expect(page.locator(".console").first()).toContainText("42");
  await expect(page.getByText("Replayed 1 cells")).toBeVisible();
  await page.reload();
  await page
    .getByRole("button", { name: /Browser acceptance notebook/ })
    .click();
  await expect(
    page.getByRole("textbox", { name: "Notebook name" }),
  ).toHaveValue("Browser acceptance notebook");
  await page.getByRole("link", { name: "Datasets", exact: true }).click();
  await page
    .getByLabel("Upload dataset", { exact: true })
    .setInputFiles(path.resolve("../sample-data/retail_sales.csv"));
  await expect(
    page.getByRole("heading", { name: "retail_sales", exact: true }).last(),
  ).toBeVisible();
  await expect(page.getByText("Dataset uploaded and inspected.")).toBeVisible();
  await page
    .getByRole("textbox", { name: "Destination table name" })
    .fill("retail_browser");
  await page.getByRole("button", { name: "Import to SQLite" }).click();
  await expect(page.getByRole("status")).toContainText(
    "Imported into retail_browser",
  );
  await page.getByRole("link", { name: "SQL Lab", exact: true }).click();
  await expect(page.getByText("retail_browser", { exact: true })).toBeVisible();
  await expect(page.locator(".monaco-editor")).toBeVisible();
  await page.locator(".monaco-editor").click();
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.type(
    "SELECT region, SUM(quantity * unit_price) AS gross_revenue FROM retail_browser GROUP BY region ORDER BY gross_revenue DESC;",
  );
  await page.getByRole("button", { name: "Run query", exact: true }).click();
  await expect(page.locator(".execution-output .badge.success")).toBeVisible();
  await expect(page.locator(".execution-output tbody tr")).toHaveCount(4);
  await page
    .getByRole("textbox", { name: "Saved query name" })
    .fill("Browser regional revenue");
  await page.getByRole("button", { name: "Save query" }).click();
  await expect(page.getByText("Query saved.", { exact: true })).toBeVisible();
  const csv = page.waitForEvent("download");
  await page.getByRole("link", { name: "CSV", exact: true }).click();
  expect((await csv).suggestedFilename()).toBe("query-results.csv");
  await page.getByRole("link", { name: "Pipelines", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Pipeline name" })
    .fill("Browser retail cleaning");
  await page
    .getByRole("combobox", { name: "Uploaded CSV or Excel" })
    .selectOption({ label: "retail_sales · 245 rows" });
  await page
    .getByRole("combobox", { name: "Output format" })
    .selectOption("sqlite");
  await page.getByRole("button", { name: "Preview", exact: true }).click();
  await expect(page.getByText("245 INPUT → 233 OUTPUT")).toBeVisible();
  await page.getByRole("button", { name: "Save & run" }).click();
  await expect(page.getByRole("button", { name: "Save & run" })).toBeEnabled();
  await expect(page.locator(".execution-output .badge.success")).toBeVisible();
  await expect(
    page.getByText("245 input rows → 233 output rows"),
  ).toBeVisible();
  await page.getByRole("button", { name: "Save & run" }).click();
  await expect(page.getByRole("button", { name: "Save & run" })).toBeEnabled();
  await expect(page.locator(".execution-output .badge.success")).toBeVisible();
  await page.screenshot({
    path: "../artifacts/pipeline-desktop.png",
    fullPage: true,
  });
  await page
    .getByRole("link", { name: "Execution history", exact: true })
    .click();
  const executions = await (
    await request.get(`${API}/api/v1/executions?limit=200`)
  ).json();
  const newExecutions = executions.filter(
    (row: { id: string }) => !beforeIds.has(row.id),
  );
  expect(newExecutions.map((row: { kind: string }) => row.kind).sort()).toEqual(
    ["etl", "etl", "python", "sql"],
  );
  expect(
    newExecutions.every((row: { status: string }) => row.status === "success"),
  ).toBe(true);
  await expect(page.locator("tbody tr")).toHaveCount(
    Math.min(25, beforeExecutions.length + 4),
  );
  await page
    .getByRole("combobox", { name: "Filter execution type" })
    .selectOption("etl");
  await expect(page.locator("tbody tr")).toHaveCount(
    Math.min(
      25,
      beforeExecutions.filter((row: { kind: string }) => row.kind === "etl")
        .length + 2,
    ),
  );
  await page.getByRole("button", { name: "Inspect execution" }).first().click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(
    page.getByRole("dialog").getByText("245 input rows → 233 output rows"),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await page.getByRole("link", { name: "Settings", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Trusted local execution" }),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/dashboard");
  await expect(
    page.getByRole("heading", { name: "Workspace overview" }),
  ).toBeVisible();
  await page.screenshot({
    path: "../artifacts/dashboard-mobile.png",
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBeTruthy();
  expect(errors).toEqual([]);
});

import { test, expect, type Page } from "@playwright/test";
async function localResponses(page: Page, empty = false) {
  await page.route("http://127.0.0.1:11434/**", (route) =>
    route.fulfill({
      headers: { "Access-Control-Allow-Origin": "*" },
      json: {
        models: empty ? [] : [{ name: "already-installed", size: 1000000 }],
      },
    }),
  );
  for (const port of [1234, 8080])
    await page.route(`http://127.0.0.1:${port}/**`, (route) => route.abort());
}
async function settings(page: Page) {
  await expect(
    page.getByRole("button", { name: "Review setup", exact: true }),
  ).toBeVisible();
  const toggle = page.getByRole("button", { name: "Toggle navigation" });
  if (await toggle.isVisible()) await toggle.click();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Settings", exact: true })
    .click();
}
test("existing zero-model setup can complete, persist and reopen without installation", async ({
  page,
}) => {
  await localResponses(page, true);
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Local AI, made simple." }),
  ).toBeVisible();
  await page.screenshot({
    path: `/tmp/aether-setup-${test.info().project.name}.png`,
    fullPage: true,
  });
  await page.getByRole("button", { name: /Use an existing setup/ }).click();
  await expect(
    page.getByText("Connected · no models installed yet", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Use this connection", exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "Your connection is ready. Add a model.",
    }),
  ).toBeVisible();
  await expect(
    page.getByText("Managed outside Aether.", { exact: false }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Continue with this connection" })
    .click();
  await page
    .getByRole("button", { name: "Open workspace", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Review setup", exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Local AI, made simple." }),
  ).toHaveCount(0);
  await settings(page);
  await page
    .getByRole("button", { name: "Setup & storage", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Local AI, made simple." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close setup" }).click();
  await expect(
    page.getByRole("heading", { name: "Settings", exact: true }),
  ).toBeVisible();
});
test("fresh browser setup offers honest manual fallback and skip preserves workspace", async ({
  page,
}) => {
  await page.route("http://127.0.0.1:11434/**", (route) => route.abort());
  await page.goto("/");
  await page.getByRole("button", { name: /Set up AI on this device/ }).click();
  await expect(
    page.getByText(
      /Automatic runtime and drive setup needs the desktop application/,
    ),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Approve and start local AI" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Setup options" }).click();
  await page.getByRole("button", { name: "Skip setup for now" }).click();
  await expect(
    page.getByRole("button", { name: "Review setup", exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Local AI, made simple." }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Review setup" }),
  ).toBeVisible();
});
test("unavailable manual endpoint shows recovery and can reconnect", async ({
  page,
}) => {
  await localResponses(page);
  await page.route("http://127.0.0.1:11439/**", (route) => route.abort());
  await page.goto("/");
  await page.getByRole("button", { name: /Connect a server/ }).click();
  await page
    .getByRole("textbox", { name: "Server address", exact: true })
    .fill("http://127.0.0.1:11439");
  await page.getByRole("button", { name: "Test and connect" }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Cannot reach" }),
  ).toContainText("Cannot reach");
  await page
    .getByRole("textbox", { name: "Server address", exact: true })
    .fill("http://127.0.0.1:11434");
  await page.getByRole("button", { name: "Test and connect" }).click();
  await expect(
    page.getByRole("heading", { name: "Choose your first model" }),
  ).toBeVisible();
  await expect(
    page.getByRole("combobox", { name: "Model", exact: true }),
  ).toHaveValue("already-installed");
});
test("interrupted model pull is an error and retry can finish setup", async ({
  page,
}) => {
  await localResponses(page, true);
  let installed = false;
  let attempts = 0;
  await page.route("http://127.0.0.1:11434/api/tags", (r) =>
    r.fulfill({
      headers: { "Access-Control-Allow-Origin": "*" },
      json: { models: installed ? [{ name: "fixture:latest" }] : [] },
    }),
  );
  await page.route("http://127.0.0.1:11434/api/pull", (r) => {
    attempts++;
    if (attempts > 1) installed = true;
    return r.fulfill({
      headers: { "Access-Control-Allow-Origin": "*" },
      contentType: "application/x-ndjson",
      body:
        attempts === 1
          ? '\x7b"status":"downloading","completed":1,"total":2}\n'
          : '{"status":"success"}\n',
    });
  });
  page.on("dialog", (d) => void d.accept());
  await page.goto("/");
  await page.getByRole("button", { name: /Use an existing setup/ }).click();
  await page
    .getByRole("button", { name: "Use this connection", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Model name", exact: true })
    .fill("fixture");
  await page
    .getByRole("button", { name: "Download / resume selected model" })
    .click();
  await expect(
    page
      .getByRole("alert")
      .filter({ hasText: "Download stream ended before success" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Download / resume selected model" })
    .click();
  await expect(
    page.getByRole("combobox", { name: "Model", exact: true }),
  ).toHaveValue("fixture:latest");
  expect(attempts).toBe(2);
});

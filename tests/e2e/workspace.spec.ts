import { test, expect } from "@playwright/test";
test.beforeEach(async ({ page }) => {
  await page.route("http://127.0.0.1:11434/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (route.request().method() === "OPTIONS")
      return route.fulfill({
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Headers": "*",
          "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS",
        },
      });
    if (path === "/api/tags")
      return route.fulfill({
        headers: { "Access-Control-Allow-Origin": "*" },
        json: { models: [{ name: "test-model", size: 1000000 }] },
      });
    if (path === "/api/show")
      return route.fulfill({
        headers: { "Access-Control-Allow-Origin": "*" },
        json: { capabilities: ["completion"] },
      });
    if (path === "/api/chat")
      return route.fulfill({
        headers: { "Access-Control-Allow-Origin": "*" },
        contentType: "application/x-ndjson",
        body: '{"message":{"thinking":"supplied thinking","content":"Test answer"}}\n{"done":true,"eval_count":5,"eval_duration":1000000000}\n',
      });
    return route.fulfill({ json: {} });
  });
  await page.goto("/");
  await page
    .getByRole("button", { name: "Open workspace", exact: true })
    .click();
});
async function navigate(page: import("@playwright/test").Page, name: string) {
  const toggle = page.getByRole("button", { name: "Toggle navigation" });
  if (await toggle.isVisible()) await toggle.click();
  await page
    .getByRole("navigation")
    .getByRole("button", { name, exact: true })
    .click();
}
test("streams, persists history, and keeps temporary conversations out of IndexedDB", async ({
  page,
}) => {
  await expect(
    page.getByRole("combobox", { name: "Model", exact: true }),
  ).toHaveValue("test-model");
  await page
    .getByRole("textbox", { name: "Message", exact: true })
    .fill("Persistent question");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page.getByText("Test answer", { exact: true })).toBeVisible();
  await expect(page.getByText("Provider-supplied thinking")).toBeVisible();
  await page.reload();
  await page.getByText(/Local history/).click();
  await expect(
    page.getByRole("button", { name: "Persistent question", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Temporary chat", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Message", exact: true })
    .fill("Unsaved question");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page.getByText("Test answer", { exact: true })).toBeVisible();
  await page.reload();
  await page.getByText(/Local history/).click();
  await expect(
    page.getByRole("button", { name: "Unsaved question", exact: true }),
  ).toHaveCount(0);
});
test("profiles persist edits and all destinations open", async ({ page }) => {
  await navigate(page, "AI Profiles");
  await page.getByRole("button", { name: "Create profile" }).click();
  await page
    .getByRole("textbox", { name: "Name", exact: true })
    .fill("Browser test profile");
  await page.getByRole("button", { name: "Save profile" }).click();
  await expect(
    page.getByRole("heading", { name: "Browser test profile" }),
  ).toBeVisible();
  await page.reload();
  await navigate(page, "AI Profiles");
  await expect(
    page.getByRole("heading", { name: "Browser test profile" }),
  ).toBeVisible();
  for (const view of [
    "Models",
    "Providers",
    "Benchmarks",
    "Settings",
    "Backup",
    "About",
    "Research",
    "Voice",
    "Agents",
  ]) {
    await navigate(page, view);
    await expect(page.locator("header strong")).toHaveText(view);
    await expect(page.locator("body")).not.toContainText("coming soon");
  }
  await navigate(page, "Settings");
  await page
    .getByRole("combobox", { name: "Theme", exact: true })
    .selectOption("light");
  await page.getByRole("button", { name: "Save settings" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("renders untrusted Markdown without raw HTML execution or automatic remote image loading", async ({
  page,
}) => {
  await page.route("http://127.0.0.1:11434/api/chat", (route) =>
    route.fulfill({
      headers: { "Access-Control-Allow-Origin": "*" },
      contentType: "application/x-ndjson",
      body:
        JSON.stringify({
          message: {
            content:
              "Safe answer\n\n![remote](https://tracker.invalid/pixel.png)\n\n<script>window.__pwned=true</script>\n\n```js\nconst x = 1;\n```",
          },
        }) +
        "\n" +
        JSON.stringify({ done: true }) +
        "\n",
    }),
  );
  let requests = 0;
  await page.route("https://tracker.invalid/**", (route) => {
    requests++;
    return route.abort();
  });
  await expect(
    page.getByRole("combobox", { name: "Model", exact: true }),
  ).toHaveValue("test-model");
  await page
    .getByRole("textbox", { name: "Message", exact: true })
    .fill("Render safely");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page.getByText("Safe answer", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("link", { name: /remote \(open image/ }),
  ).toBeVisible();
  expect(requests).toBe(0);
  await expect(page.locator(".markdown img")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Copy code", exact: true }),
  ).toBeVisible();
  expect(await page.evaluate(() => Object.hasOwn(window, "__pwned"))).toBe(
    false,
  );
  await page.screenshot({
    path: `/tmp/aether-${test.info().project.name}.png`,
    fullPage: true,
  });
});

test("ignores stale inventory when switching providers during a connection request", async ({
  page,
}) => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  };
  await page.route("http://127.0.0.1:11435/**", (route) =>
    route.request().method() === "OPTIONS"
      ? route.fulfill({ status: 204, headers })
      : route.fulfill({
          headers,
          json:
            new URL(route.request().url()).pathname === "/api/tags"
              ? { models: [{ name: "second-model" }] }
              : { capabilities: ["completion"] },
        }),
  );
  await expect(
    page.getByRole("combobox", { name: "Model", exact: true }),
  ).toHaveValue("test-model");
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let finished!: () => void;
  const handled = new Promise<void>((resolve) => {
    finished = resolve;
  });
  await page.route("http://127.0.0.1:11434/api/tags", async (route) => {
    await gate;
    try {
      await route.fulfill({
        headers,
        json: { models: [{ name: "stale-model" }] },
      });
    } catch {
      /* Switching providers cancels the superseded request. */
    } finally {
      finished();
    }
  });
  const started = page.waitForRequest("http://127.0.0.1:11434/api/tags");
  await page.getByRole("button", { name: "Reconnect", exact: true }).click();
  await started;
  await navigate(page, "Providers");
  await page.getByRole("button", { name: "Add connection" }).click();
  await page
    .getByRole("textbox", { name: "Label", exact: true })
    .fill("Second server");
  await page
    .getByRole("textbox", { name: /Base URL/ })
    .fill("http://127.0.0.1:11435");
  await page.getByRole("button", { name: "Save connection" }).click();
  await navigate(page, "Chat");
  await page
    .getByRole("combobox", { name: "Provider", exact: true })
    .selectOption({ label: "Second server" });
  await expect(
    page.getByRole("combobox", { name: "Model", exact: true }),
  ).toHaveValue("second-model");
  release();
  await handled;
  await expect(
    page.getByRole("combobox", { name: "Model", exact: true }),
  ).toHaveValue("second-model");
  await expect(
    page
      .getByRole("combobox", { name: "Model", exact: true })
      .getByRole("option", { name: "stale-model" }),
  ).toHaveCount(0);
});

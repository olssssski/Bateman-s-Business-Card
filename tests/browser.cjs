const { chromium } = require("playwright");
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const root = path.resolve(__dirname, "..");
(async () => {
  const server = http
    .createServer((req, res) => {
      const file = path.resolve(
        root,
        "." + decodeURIComponent(req.url.split("?")[0]),
      );
      if (!file.startsWith(root + path.sep)) {
        res.writeHead(403).end();
        return;
      }
      try {
        res.setHeader(
          "Content-Type",
          file.endsWith(".js")
            ? "text/javascript"
            : file.endsWith(".otf")
              ? "font/otf"
              : file.endsWith(".md") || file.endsWith(".txt")
                ? "text/plain"
                : "text/html",
        );
        res.end(fs.readFileSync(file));
      } catch {
        res.writeHead(404).end();
      }
    })
    .listen(0, "127.0.0.1");
  await new Promise((resolve) => server.on("listening", resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  let browser;
  try {
    browser = await chromium.launch({
      executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
      args: [
        "--no-sandbox",
        "--disable-crashpad",
        "--enable-unsafe-swiftshader",
      ],
    });
    const page = await browser.newPage({
        viewport: { width: 1200, height: 1000 },
        hasTouch: true,
      }),
      errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(origin + "/examples/custom-ui.html");
    await page.waitForFunction(
      () => document.querySelector("#state").textContent !== "Preparing paper…",
    );
    await page.getByRole("button", { name: "Add water", exact: true }).click();
    await page.locator("#card").evaluate(async (container) => {
      const { createMaterialCard } = await import("/src/material-card.js");
      // Separate test mounts prevent interference from example UI state.
      const a = document.createElement("div"),
        b = document.createElement("div");
      a.style.cssText = b.style.cssText = "height:250px;width:400px";
      document.body.prepend(a, b);
      window.testA = await createMaterialCard(a);
      window.testB = await createMaterialCard(b);
      window.testMount = a;
      window.testA.apply("water");
    });
    await page.waitForTimeout(200);
    assert((await page.evaluate(() => testA.getState().wet)) > 0);
    assert.equal(await page.evaluate(() => testB.getState().wet), 0);
    await page.evaluate(() => {
      testA.fresh();
      testA.apply("burn");
    });
    await page.waitForTimeout(600);
    const dryChar = await page.evaluate(() => testA.getState().char);
    await page.evaluate(() => {
      testA.fresh();
      testA.apply("water");
      testA.apply("burn");
    });
    await page.waitForTimeout(600);
    assert((await page.evaluate(() => testA.getState().char)) < dryChar);
    await page.evaluate(() => {
      testA.inspect();
      testA.flip();
      testA.setLight(5);
      testA.setRakingLight(true);
      testA.setBrushSize(0.15);
      testA.dry();
      testA.apply("crease");
      testA.fresh();
    });
    await page.waitForTimeout(80);
    assert.equal(await page.evaluate(() => testA.getState().char), 0);
    assert.equal(await page.evaluate(() => testA.getState().wet), 0);
    await page.evaluate(async () => {
      testA.destroy();
      testA.destroy();
      testB.destroy();
      const { createMaterialCard } = await import("/src/material-card.js");
      window.testA = await createMaterialCard(testMount);
    });
    assert.equal(await page.evaluate(() => testMount.children.length), 1);
    // API state must update synchronously, even before the next animation frame.
    const apiChecks = await page.evaluate(() => {
      let events = 0;
      testMount.addEventListener("cardstatechange", () => events++);
      testA.flip();
      const published = events > 0;
      testA.apply("water");
      const immediateWet = testA.getState().wet;
      let invalidRejected = false;
      try {
        testA.apply("water", NaN);
      } catch {
        invalidRejected = true;
      }
      testA.fresh();
      return { published, immediateWet, invalidRejected };
    });
    assert(apiChecks.published);
    assert(apiChecks.immediateWet > 0);
    assert(apiChecks.invalidRejected);
    // Real touch input: the second finger must suspend painting and enable pinch zoom.
    await page.evaluate(() => {
      testA.setTool("water");
      testA.element.scrollIntoView();
    });
    const box = await page.locator("#card").evaluate(() => {
      const r = window.testA.element.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height };
    });
    const client = await page.context().newCDPSession(page);
    const x = box.x + box.width / 2,
      y = box.y + box.height / 2;
    const beforePinch = await page.evaluate(() => testA.getState().distance);
    await client.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x: x - 20, y, id: 1 }],
    });
    await client.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [
        { x: x - 20, y, id: 1 },
        { x: x + 20, y, id: 2 },
      ],
    });
    await client.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [
        { x: x - 45, y, id: 1 },
        { x: x + 45, y, id: 2 },
      ],
    });
    await client.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    assert(
      (await page.evaluate(() => testA.getState().distance)) < beforePinch,
    );
    await client.detach();
    // Losing focus while holding a material tool must not leave it painting.
    await page.evaluate(() => {
      testA.fresh();
      testA.setTool("burn");
    });
    const brushPoint = await page.evaluate(() => {
      testA.element.scrollIntoView();
      const r = testA.element.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    });
    await page.mouse.move(brushPoint.x, brushPoint.y);
    await page.mouse.down();
    await page.waitForFunction(() => testA.getState().heat > 0);
    const heatBeforeBlur = await page.evaluate(() => testA.getState().heat);
    await page.evaluate(() => window.dispatchEvent(new Event("blur")));
    await page.waitForTimeout(160);
    await page.mouse.up();

    assert((await page.evaluate(() => testA.getState().heat)) < heatBeforeBlur);
    // Context loss must stop the active renderer rather than loop on invalid resources.
    await page.evaluate(() =>
      testA.canvas
        .getContext("webgl")
        .getExtension("WEBGL_lose_context")
        .loseContext(),
    );
    await page.waitForFunction(() => testA.getState().contextLost);
    assert.equal(await page.evaluate(() => testA.getState().simulating), false);
    assert.equal(
      await page
        .locator("#card")
        .evaluate(
          () => testA.element.shadowRoot.querySelector("#fallback").hidden,
        ),
      false,
    );
    await page.evaluate(() => testA.destroy());
    const teardown = await page.evaluate(() => {
      let rejected = 0;
      for (const command of [
        () => testA.setTool("water"),
        () => testA.apply("burn"),
        () => testA.fresh(),
        () => testA.flip(),
        () => testA.dry(),
        () => testA.inspect(),
        () => testA.setBrushSize(0.1),
        () => testA.resetView(),
      ]) {
        try {
          command();
        } catch {
          rejected++;
        }
      }
      testA.destroy();
      return { rejected, children: testMount.children.length };
    });
    assert.equal(teardown.rejected, 8);
    assert.equal(teardown.children, 0);
    // Initialization failures must leave no orphan viewport, and retry must work.
    await page.evaluate(async () => {
      const { createMaterialCard } = await import("/src/material-card.js");
      const original = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (type, ...args) {
        return type === "webgl" ? null : original.call(this, type, ...args);
      };
      try {
        await createMaterialCard(testMount);
        throw new Error("Expected WebGL failure");
      } catch (error) {
        if (!/WebGL/.test(error.message)) throw error;
      } finally {
        HTMLCanvasElement.prototype.getContext = original;
      }
      if (testMount.children.length)
        throw new Error("Orphan viewport after failed initialization");
      const retry = await createMaterialCard(testMount);
      retry.destroy();
    });

    await page.goto(origin + "/index.html");
    await page.locator("#cardMount div").first().waitFor();
    await page.waitForTimeout(350);
    await page.getByRole("button", { name: "Water", exact: true }).click();
    await page.locator("#cardMount #stage").focus();
    await page.keyboard.press("Space");
    await page.waitForTimeout(150);
    assert.match(await page.locator("#status").innerText(), /water/);
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    const webglError = await page
      .locator("#cardMount canvas")
      .evaluate((canvas) => canvas.getContext("webgl").getError());
    assert.equal(webglError, 0);
    if (process.env.QA_SCREENSHOT_DIR) {
      await page.setViewportSize({ width: 1440, height: 1000 });
      await page.locator("#cardMount").scrollIntoViewIfNeeded();
      await page
        .getByRole("button", { name: "Fresh card", exact: true })
        .click();
      await page.screenshot({
        path: path.join(process.env.QA_SCREENSHOT_DIR, "material-card-qa.png"),
      });
    }
    const fontPage = await browser.newPage();
    await fontPage.goto(origin + "/README.md");
    await fontPage.route("**/copperplate.otf", (route) => route.abort());
    const failedFonts = await fontPage.evaluate(async () => {
      const { createMaterialCard } = await import("/src/material-card.js");
      const container = document.createElement("div");
      container.style.height = "250px";
      document.body.replaceChildren(container);
      window.fontMount = container;
      let rejected = false;
      try {
        await createMaterialCard(container);
      } catch {
        rejected = true;
      }
      return {
        rejected,
        children: container.children.length,
        installed: [...document.fonts].filter(
          (f) => f.family === "CardBook" || f.family === "CardCopperplate",
        ).length,
      };
    });
    assert.equal(failedFonts.rejected, true);
    assert.equal(failedFonts.children, 0);
    assert.equal(failedFonts.installed, 0);
    await fontPage.unroute("**/copperplate.otf");
    assert.equal(
      await fontPage.evaluate(async () => {
        const { createMaterialCard } = await import("/src/material-card.js");
        const card = await createMaterialCard(fontMount);
        card.destroy();
        return [...document.fonts].filter(
          (f) => f.family === "CardBook" || f.family === "CardCopperplate",
        ).length;
      }),
      2,
    );
    await fontPage.close();
    assert.deepEqual(errors, []);
    console.log(
      "PASS: public API, independent instances, wet/heat coupling, cleanup, re-mount, touch pinch in material mode, interrupted gestures, font failure/retry, immediate state/events, context loss, destroyed guards, initialization retry, original/custom UIs, mobile layout.",
    );
  } finally {
    if (browser) await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

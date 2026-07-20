// End-to-end harness: loads the real extension (unpacked, via a widened
// test copy of the manifest) in headless Chromium, points it at static
// fixtures that mimic each site's DOM, and checks the injection/calc/
// storage/popup pipeline works. This does NOT validate real-site selector
// accuracy (see the README's manual QA checklist for that) — it only
// proves the extension's own code path works end to end.
const path = require("path");
const { chromium } = require("playwright");
const { build, TMP_EXT } = require("./build-test-extension");
const { start, PORT } = require("./server");

// One entry per fixture. expectedContentType drives the content-type-tag
// assertion; "text" fixtures assert NO content-type tag is shown.
const TEST_CASES = [
  { site: "chatgpt", fixture: "chatgpt.html", expectedContentType: "text" },
  { site: "chatgpt", fixture: "chatgpt-image.html", expectedContentType: "image" },
  { site: "chatgpt", fixture: "chatgpt-canvas.html", expectedContentType: "artifact" },
  { site: "chatgpt", fixture: "chatgpt-research.html", expectedContentType: "research" },
  { site: "chatgpt", fixture: "chatgpt-image-decoy.html", expectedContentType: "image" },
  { site: "claude", fixture: "claude.html", expectedContentType: "text" },
  { site: "claude", fixture: "claude-artifact.html", expectedContentType: "artifact" },
  { site: "claude", fixture: "claude-research.html", expectedContentType: "research" },
  { site: "gemini", fixture: "gemini.html", expectedContentType: "text" },
  { site: "gemini", fixture: "gemini-image.html", expectedContentType: "image" },
  { site: "gemini", fixture: "gemini-video.html", expectedContentType: "video" },
  { site: "gemini", fixture: "gemini-canvas.html", expectedContentType: "artifact" },
  { site: "gemini", fixture: "gemini-research.html", expectedContentType: "research" },
  { site: "deepseek", fixture: "deepseek.html", expectedContentType: "text" },
];

const CONTENT_TYPE_TAG_TEXT = {
  artifact: "canvas/artifact",
  image: "image",
  video: "video",
  research: "research",
};

const USER_DATA_DIR = path.join(__dirname, ".pw-profile");

let failures = 0;
function check(label, cond, detail) {
  if (cond) {
    console.log(`  PASS: ${label}`);
  } else {
    console.log(`  FAIL: ${label}${detail ? ` — ${detail}` : ""}`);
    failures++;
  }
}

async function main() {
  build();
  const server = await start();
  console.log(`Fixture server listening on http://127.0.0.1:${PORT}`);

  const context = await chromium.launchPersistentContext(USER_DATA_DIR, {
    headless: false,
    args: [
      `--disable-extensions-except=${TMP_EXT}`,
      `--load-extension=${TMP_EXT}`,
      "--no-sandbox",
      "--headless=new",
    ],
  });

  let worker = context.serviceWorkers()[0];
  if (!worker) worker = await context.waitForEvent("serviceworker", { timeout: 15000 });
  const extensionId = worker.url().split("/")[2];
  console.log(`Extension loaded, id=${extensionId}`);

  for (const { site, fixture, expectedContentType } of TEST_CASES) {
    console.log(`\n[${fixture}] (expect contentType=${expectedContentType})`);
    const page = await context.newPage();
    const consoleErrors = [];
    page.on("pageerror", (e) => consoleErrors.push(String(e)));
    page.on("console", (msg) => {
      if (msg.type() !== "error") return;
      const loc = msg.location()?.url || "";
      if (/favicon\.ico/.test(msg.text()) || /favicon\.ico/.test(loc)) return; // browser auto-requests this; page never references it
      consoleErrors.push(msg.text());
    });

    await page.goto(`http://127.0.0.1:${PORT}/${fixture}`);
    try {
      await page.waitForSelector(".awm-card", { timeout: 8000 });
    } catch {
      check(`card injected`, false, "timed out waiting for .awm-card");
      await page.close();
      continue;
    }
    check("card injected", true);

    const mainstat = await page.locator(".awm-mainstat").innerText();
    check("mainstat non-empty", mainstat.trim().length > 0, mainstat);
    check("mainstat not zero", !/^0(\.0+)?\s*(mL|L)$/.test(mainstat.trim()), mainstat);

    const tokenRow = await page.locator(".awm-row").first().innerText();
    const tokenMatch = tokenRow.match(/(\d+)\s*in.*?(\d+)\s*(out|out-equiv)/);
    // deepseek.js deliberately passes "" as prompt text (can't reliably scope
    // it generically) and image/video responses have no "input text" of their
    // own beyond the prompt, so a 0 in-token count is expected there, not a bug.
    const minInTokens = site === "deepseek" ? 0 : 1;
    check(
      "token row shows sane in/out tokens",
      !!tokenMatch && Number(tokenMatch[1]) >= minInTokens && Number(tokenMatch[2]) > 0,
      tokenRow
    );

    const modelRow = await page.locator(".awm-model-name").innerText();
    check("model row shows a model name", modelRow.trim().length > 0, modelRow);
    console.log(`  INFO: detected model = "${modelRow}"`);

    // The "estimated model" fallback badge is plain .awm-model-badge; the
    // content-type tag reuses that class PLUS .awm-content-type-badge, so
    // excluding it here isolates the model-detection-fallback signal.
    const hasFallbackBadge = await page.locator(".awm-model-badge:not(.awm-content-type-badge)").count();
    check("model picker in fixture was detected (no fallback badge)", hasFallbackBadge === 0, "fell back to per-site default");

    const contentTypeBadge = page.locator(".awm-content-type-badge");
    const contentTypeBadgeCount = await contentTypeBadge.count();
    if (expectedContentType === "text") {
      check("no content-type tag shown for plain text response", contentTypeBadgeCount === 0, `found ${contentTypeBadgeCount}`);
    } else {
      const badgeText = contentTypeBadgeCount > 0 ? await contentTypeBadge.innerText() : "";
      check(
        `content-type tag shows "${CONTENT_TYPE_TAG_TEXT[expectedContentType]}"`,
        badgeText.toLowerCase().includes(CONTENT_TYPE_TAG_TEXT[expectedContentType]),
        badgeText
      );
    }

    check("no console/page errors", consoleErrors.length === 0, consoleErrors.join(" | "));

    await page.close();
  }

  console.log(`\n[popup]`);
  const popupPage = await context.newPage();
  const popupErrors = [];
  popupPage.on("pageerror", (e) => popupErrors.push(String(e)));
  popupPage.on("console", (msg) => {
    if (msg.type() === "error") popupErrors.push(msg.text());
  });
  await popupPage.goto(`chrome-extension://${extensionId}/popup/popup.html`);
  await popupPage.waitForTimeout(500);

  const totalWaterNum = await popupPage.locator("#totalWaterNum").innerText();
  check("popup total water renders", totalWaterNum.trim().length > 0 && totalWaterNum.trim() !== "—", totalWaterNum);

  const siteRows = await popupPage.locator("#siteBreakdown .awm-popup-site-row").count();
  check("popup site breakdown has rows", siteRows >= 4, `found ${siteRows}`);

  await popupPage.locator('.awm-popup-tab[data-tab="model"]').click();
  await popupPage.waitForTimeout(200);
  const modelVisible = await popupPage.locator("#modelBreakdown").isVisible();
  check("model tab switches breakdown view", modelVisible);
  const modelRows = await popupPage.locator("#modelBreakdown .awm-popup-site-row").count();
  check("popup model breakdown has rows", modelRows > 0, `found ${modelRows}`);
  // Expect entries for both text models AND the new mediaModels (image/video)
  // and research-tagged responses, since they all share the same storage path.
  console.log(`  INFO: ${modelRows} distinct model/media entries in popup breakdown`);

  check("no console/page errors in popup", popupErrors.length === 0, popupErrors.join(" | "));

  await popupPage.close();
  await context.close();
  await new Promise((resolve) => server.close(resolve));

  console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("Harness crashed:", err);
  process.exit(1);
});

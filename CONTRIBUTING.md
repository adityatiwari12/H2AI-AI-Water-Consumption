# Contributing to H2AI

Thanks for considering it. This is a small, no-build-system browser
extension — contributing doesn't require any tooling beyond a text editor,
Chrome, and (optionally) Node for the automated test suite.

The extension itself lives in the `ai-water-meter/` subfolder, not the repo
root — see [`ai-water-meter/README.md`](ai-water-meter/README.md) for the
full architecture writeup before making changes.

## The highest-value contribution: fixing a live selector

Every DOM selector in `ai-water-meter/content/<site>.js`
(`ASSISTANT_SELECTOR`, `MODEL_PICKER_SELECTORS`, `CONTENT_DETECTORS`) was
written by reasoning about typical DOM patterns, not by inspecting a live,
logged-in page — see the README's "Known limitation: selectors will break
over time." If you use one of the four supported sites (ChatGPT, Claude,
Gemini, DeepSeek) day to day and notice the card isn't appearing, or is
showing the wrong model, **that's the single most useful thing you can fix**,
and you don't need to understand the rest of the codebase to do it:

1. Open the site, send a message, right-click the finished response →
   **Inspect**.
2. Find a stable attribute (e.g. `data-message-author-role="assistant"`) or
   consistent class name.
3. Update the relevant selector constant at the top of that site's
   `content/<site>.js`.
4. Reload the extension in `chrome://extensions` and confirm the card
   appears correctly.

## Other ways to contribute

- **A new/updated model entry** in `content/models.config.json` — pricing
  changes often, and new models ship regularly. Every entry needs a
  `sourceUrl` and a `notes` field explaining exactly how the number was
  sourced or derived (see existing entries for the expected level of
  detail) — a number without a citation won't be merged, per this project's
  core promise that every figure traces back to something.
- **A new site adapter** — copy the shape of an existing
  `content/<site>.js` (`SITE`, `DEFAULT_MODEL`, `ASSISTANT_SELECTOR`,
  `MODEL_PICKER_SELECTORS`/`MODEL_PATTERNS`, a `MutationObserver` + debounce,
  `handleFinishedMessage`), add the site's domain to `manifest.json`'s
  `host_permissions` and `content_scripts`, and add at least one fixture +
  test case (see below).
- **Bug fixes** in `content/core.js` (the shared calc/storage/card-rendering
  engine) or `popup/`.
- **Test coverage** — `ai-water-meter/test/` is a headless Playwright
  harness with a static HTML fixture per site/content-type. New content
  types, sites, or edge cases should come with a new fixture in
  `test/fixtures/` and a matching entry in `test/run.js`'s `TEST_CASES`.

## Before opening a PR

```sh
cd ai-water-meter/test
npm install
npm test
```

All checks must pass. This harness proves the extension's own code path is
correct against fixtures — it can't catch live-site selector drift (nothing
outside a real browser session can), so for selector fixes, also manually
click-test the real site per the README's "Run it in your own browser"
section and mention what you tested in the PR description.

## Ground rules

- **No build step, no dependencies in the extension itself.** Everything
  under `ai-water-meter/manifest.json`, `content/`, `popup/`, `icons/`,
  `background.js` must run as plain, unbundled JS/HTML/CSS loaded directly
  by Chrome. (`test/` is the one place with an npm dependency —
  Playwright — since it never ships inside the extension.)
- **Every number needs a source.** This tool's entire premise is that the
  water/energy/cost estimates are honestly sourced, not made up. A config
  change that hardcodes a number without a `sourceUrl` and a `notes`
  explanation of the derivation will be asked to add one.
- **Don't remove or water down the estimate disclosure.** The (i) tooltip
  text in `core.js`'s `createCard()`/`buildTooltipText()` and the honesty
  comment at the top of `core.js` exist so nobody mistakes these numbers for
  measured data. Keep them intact even when refactoring around them.
- **Privacy stays absolute.** The extension makes zero outbound network
  requests today (its one `fetch()` reads a file bundled in the extension
  itself). A contribution that would send prompt text, response text, or
  usage data anywhere off the user's machine will not be accepted.
- **Match the existing style.** Plain ES2020+ JS, no framework, no
  TypeScript, no build tooling, IIFE-wrapped content scripts, comments only
  where they explain a non-obvious *why* (see `CLAUDE.md` if you're using an
  AI coding assistant on this repo — it documents the same conventions in
  more detail for that use case).

## Reporting a bug

Open a GitHub issue with: which site, what you expected vs. what happened,
and (for a detection bug) the relevant snippet of the page's DOM from
devtools if you can grab it — that's usually enough to fix a selector
without needing back-and-forth.

## License

By contributing, you agree your contribution is licensed under this
project's [MIT License](LICENSE).

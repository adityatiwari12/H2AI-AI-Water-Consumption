# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repo layout

The actual extension lives in the `ai-water-meter/` subfolder (not repo root):

```
ai-water-meter/
  manifest.json       Manifest V3 config — content script matches/order, permissions
  content/core.js      shared engine (loaded first on every site)
  content/<site>.js     one adapter per site: chatgpt.js, claude.js, gemini.js, deepseek.js
  content/styles.css    card styling
  popup/                toolbar popup (lifetime totals + reset)
  icons/
  README.md
```

## Commands

No build system, package manager, linter, or test suite — this is a plain
Manifest V3 Chrome extension of static JS/HTML/CSS, loaded unpacked.

To run/test changes:
1. `chrome://extensions` → enable Developer mode → **Load unpacked** → select `ai-water-meter/`
2. After editing any file, click the reload icon on the extension card in `chrome://extensions`
3. Visit chatgpt.com, claude.ai, gemini.google.com, or chat.deepseek.com, send a message, and confirm the card appears under the response ~1–1.5s after streaming ends
4. Click the toolbar icon to check the popup (lifetime totals per site + reset)

There is no automated test runner; verification is manual, in-browser, per site.

## Architecture

**Content script pipeline** (`manifest.json` loads `core.js` before the
site-specific file on each matched domain):

- `content/core.js` exposes `window.AIWaterMeter` with: `calc()` (token/water/cost
  estimation), `getTotals()`/`addTotals()` (chrome.storage.local read/write for
  session + lifetime, keyed `awm_session_<site>` / `awm_lifetime_<site>`),
  `createCard()` (builds the receipt DOM + glass/bucket/drum SVG icon + fill
  animation), and `estimateTokens()`. Guards against double-injection via
  `window.__aiWaterMeterCore`.
- `content/<site>.js` — one per site, each self-contained (IIFE). Pattern shared
  across all four: define `SITE` key, `TIER` (`small`/`medium`/`large`, picks
  water/cost rate from `core.js`'s `TIERS`), an `ASSISTANT_SELECTOR` (and often
  `USER_SELECTOR`) DOM selector, a `MutationObserver` watching for new/changed
  assistant messages, a **1.2s debounce per element** as a proxy for "streaming
  finished" (no site exposes a real streaming-done event), then reads
  `el.innerText`, calls `AIWaterMeter.calc()` → `addTotals()` → `createCard()`,
  and inserts the card into the DOM after the message turn. A `WeakSet`
  (`processed`) prevents re-processing the same element.
- `popup/popup.js` reads all four `awm_lifetime_<site>` keys from
  `chrome.storage.local`, renders a per-site breakdown + grand total, and wires
  the reset button (clears all `awm_`-prefixed storage keys).

**Water/cost math** (`content/core.js`): all numbers are estimates, not real
provider data — driven entirely by response length (`estimateTokens`: ~4
chars/token) times a per-tier rate in `TIERS`. Tune rates there, not per-site.
The three-tier system (`small`/`medium`/`large`) is the only calibration knob;
selecting the right tier per site/model happens via the `TIER` constant in
each `content/<site>.js`.

**Icon scaling**: 1 glass = 250ml → 10 glasses fills a bucket (2500ml) → 10
buckets fills a drum (25L). `iconFor()`/`GLASS_ML`/`BUCKET_ML`/`DRUM_ML` in
`core.js` control the thresholds; this is purely about *display* icon choice
per response, independent of the session/lifetime totals math.

## Known fragility — read before touching selectors

ChatGPT/Claude/Gemini/DeepSeek all change their DOM periodically (new React
builds, renamed classes), which breaks `ASSISTANT_SELECTOR`/`USER_SELECTOR` in
the corresponding `content/<site>.js`. DeepSeek and Gemini use the most
generic/fragile selectors and are most likely to need fixing first. To fix:
open the site, right-click a finished AI response → Inspect, find a stable
attribute (e.g. `data-message-author-role="assistant"`) or consistent class,
and update the selector constant at the top of that site's file.

## Non-negotiable: the estimate disclosure

No AI provider publishes real per-query water/energy figures. All numbers are
estimates derived from response length + public research ranges. The card's
(i) tooltip stating this (in `createCard()`) and the honesty comment at the
top of `core.js` must not be removed or watered down when editing.

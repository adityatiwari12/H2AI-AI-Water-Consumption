<div align="center">
<img src="ai-water-meter/icons/icon128.png" width="72" height="72" alt="H2AI icon" />

# H2AI

**See what every AI prompt actually costs — water, energy, tokens, and cash — right under the response.**

Free, open-source Chrome extension by [tokenistt](https://www.tokenistt.com).

[![License: MIT](https://img.shields.io/badge/License-MIT-1677FF.svg)](LICENSE)
[![Contributions welcome](https://img.shields.io/badge/contributions-welcome-16834B.svg)](CONTRIBUTING.md)
[![Manifest V3](https://img.shields.io/badge/manifest-V3-111111.svg)](ai-water-meter/manifest.json)
[![Zero telemetry](https://img.shields.io/badge/telemetry-none-111111.svg)](#privacy)

<img src="ai-water-meter/icons/brand/chatgpt.svg" width="18" height="18" alt="ChatGPT" title="ChatGPT" />&nbsp;&nbsp;<img src="ai-water-meter/icons/brand/claude.svg" width="18" height="18" alt="Claude" title="Claude" />&nbsp;&nbsp;<img src="ai-water-meter/icons/brand/gemini.svg" width="18" height="18" alt="Gemini" title="Gemini" />&nbsp;&nbsp;<img src="ai-water-meter/icons/brand/deepseek.svg" width="18" height="18" alt="DeepSeek" title="DeepSeek" />
<br/><sub>ChatGPT&nbsp;&nbsp;·&nbsp;&nbsp;Claude&nbsp;&nbsp;·&nbsp;&nbsp;Gemini&nbsp;&nbsp;·&nbsp;&nbsp;DeepSeek</sub>
</div>

---

Shows a small dark "receipt" card under every ChatGPT, Claude, Gemini, and
DeepSeek response, with an animated glass → bucket → drum icon estimating
water used and cost, plus a running session/lifetime total (popup). The
card also breaks out input/output tokens, input/output cost, and energy,
and detects which model produced the response where the page's DOM allows.
Beyond plain text, it also estimates image generation, video generation,
Canvas/Artifact responses, and Deep-Research-style answers — see
[Beyond text: image, video, canvas, and research](#beyond-text-image-video-canvas-and-research) below.

| | |
|---|---|
| **Sites supported** | ChatGPT, Claude, Gemini, DeepSeek (4) |
| **Models tracked** | 9 text + 3 media, config-driven ([schema](#ai-water-metercontentmodelsconfigjson-schema)) |
| **Network calls** | 0 — the one `fetch()` reads a file bundled in the extension itself |
| **Build step** | None — static MV3 JS/HTML/CSS, load unpacked |
| **License** | [MIT](LICENSE) |

> [!WARNING]
> **These numbers are estimates, not real data.** No AI provider publishes
> real, per-query water or energy figures for every model. Numbers come from
> [`ai-water-meter/content/models.config.json`](ai-water-meter/content/models.config.json)
> — a mix of Google's own disclosed comprehensive methodology (Gemini only)
> and derived/scaled estimates for everyone else. Every model entry carries a
> `methodologyTag` and `sourceUrl`; the card's (i) tooltip states which basis
> is in play and links to the source. If you plan to publish or promote this
> extension, keep that disclosure — presenting any of this as exact data
> would be misleading.
>
> See that file's `_meta.waterEnergyMethodology` block and each model's
> `notes` field for exactly how each number was sourced or derived, and
> `ai-water-meter-v2-prd.md` for the full research writeup.

## Water estimate basis

Every card shows each model's own best-sourced `models.config.json` figure
— Google's disclosed comprehensive methodology for Gemini, derived/scaled
estimates for everyone else (see each model's `notes` field and the card's
(i) tooltip for sourcing). There is no separate "playful" flat-rate mode;
what you see is what accumulates into the session/lifetime totals.

## Beyond text: image, video, canvas, and research

Each response is classified into one of five content types before `calc()`
runs — `content/core.js`'s `detectContentType()`, called with a per-site
`CONTENT_DETECTORS` selector set. A small tag appears next to the model name
for anything other than plain text.

- **image / video** — no vendor publishes water/energy data for media
  generation, so `models.config.json`'s `mediaModels` entries ground
  `energyWhPerUnit`/`waterMlPerUnit` (per image, or per second of video) in
  dedicated third-party research instead: Bertazzini et al.'s real
  GPU-metered study of image-generation models
  ([arXiv:2506.17016](https://arxiv.org/abs/2506.17016)) for images, and an
  architectural-scaling-law estimate targeting Veo specifically
  ([arXiv:2607.04553](https://arxiv.org/abs/2607.04553)) for video — not
  borrowed from an unrelated text model's per-token rate, which was v3's
  approach and is a proxy of a proxy (a diffusion/video model's compute
  doesn't scale like an autoregressive text model's). Cost uses the vendor's
  real per-unit price directly; `tokenEquivalentPerUnit` (a *real* count
  where the vendor publishes one — OpenAI tokenizes `gpt-image-1.5` output at
  272/1056/4160 tokens for low/medium/high quality — otherwise imputed from
  price) is display-only now, shown in the card's "out-equiv tok" chip, and
  no longer feeds the water/energy math. Only OpenAI's image models bill
  prompt tokens separately (`inputPricePerMTok`, each model's own published
  rate); Google's Imagen/Veo are flat per-unit prices with no separate input
  charge, so that field is omitted for them rather than fabricating a cost
  Google doesn't bill. Supported today: ChatGPT (image only), Gemini (image and
  video). Claude and DeepSeek have no native in-chat image/video generation
  to detect.
- **canvas / artifact** (ChatGPT Canvas, Claude Artifacts, Gemini Canvas) —
  the side-panel content is concatenated with the inline chat reply before
  tokenizing, so the total reflects everything actually generated, not just
  the short "I've created X" chat acknowledgment. DeepSeek has no such
  feature.
- **research** (ChatGPT/Gemini Deep Research, Claude's web-search/research
  mode) — hidden tool calls (web searches, page fetches) never appear in the
  DOM, so only the final visible answer can be tokenized directly, which
  would badly undercount a real research task. `models.config.json`'s
  `researchMode.defaultMultiplier` (currently 4x) scales the visible
  output-token count before cost/water/energy math runs, as a rough proxy.
  This number is grounded in one real published cost breakdown for Gemini
  Deep Research (see `_meta.waterEnergyMethodology.researchMode` for the
  derivation) — not a measurement, and extrapolated to every provider for
  lack of anything more specific. DeepSeek has no such feature.

All of this is exactly as best-effort as model detection (below) — the
selectors were written by reasoning about typical DOM patterns for each
feature, not by inspecting a live page.

## Table of contents

- [Water estimate basis](#water-estimate-basis)
- [Beyond text: image, video, canvas, and research](#beyond-text-image-video-canvas-and-research)
- [Repository layout](#repository-layout)
- [Architecture](#architecture)
  - [Request/response flow for a single AI reply](#requestresponse-flow-for-a-single-ai-reply)
  - [`calc()` reference](#calc-reference)
  - [`ai-water-meter/content/models.config.json` schema](#contentmodelsconfigjson-schema)
  - [Storage keys](#storage-keys)
  - [Card anatomy](#card-anatomy)
  - [Popup / standalone analysis window](#popup--standalone-analysis-window)
  - [Privacy](#privacy)
- [Run it in your own browser](#run-it-in-your-own-browser)
- [Automated tests](#automated-tests)
- [Known limitations](#known-limitation-selectors-will-break-over-time)
- [Publishing to the Chrome Web Store](#publishing-to-the-chrome-web-store)
- [Ideas for v4](#ideas-for-v4)
- [Contributing](#contributing)
- [License](#license)

## Repository layout

The actual extension lives in `ai-water-meter/`, not the repo root. Only the
files under `manifest.json`'s own references (`background.js`, `content/`,
`popup/`, `icons/`) ship to the Chrome Web Store — everything else in the
folder (`ai-water-meter-v2-prd.md`, `test/`, `index.html`) is
development-only and left out of the packaged zip (see "Publishing" below).

<details>
<summary><strong>Full file-by-file table</strong></summary>

| Path | Role |
|---|---|
| `ai-water-meter/manifest.json` | MV3 manifest: permissions, `host_permissions` (the four supported domains, no wildcards), `content_scripts` (which JS/CSS loads on which site, in what order), `web_accessible_resources` (exposes `models.config.json` to content scripts), `action`/`background` wiring. |
| `ai-water-meter/background.js` | The entire service worker: one `chrome.runtime.onMessage` listener that opens `popup/popup.html` as a small standalone window when a card's ↗ button is clicked. Nothing else — no alarms, no other listeners. |
| `ai-water-meter/content/core.js` | Shared engine, injected **first** on every matched site (guarded against double-injection via `window.__aiWaterMeterCore`). Exposes `window.AIWaterMeter` — see [Architecture](#architecture) below for everything it does. |
| `ai-water-meter/content/models.config.json` | The only place per-model water/cost/energy numbers live. Fetched at runtime by `core.js` via `chrome.runtime.getURL()` (a local file read, not a network call). See [schema](#contentmodelsconfigjson-schema) below. |
| `ai-water-meter/content/chatgpt.js` | Site adapter for chatgpt.com / chat.openai.com. Injected **second**, after `core.js`. |
| `ai-water-meter/content/claude.js` | Site adapter for claude.ai. |
| `ai-water-meter/content/gemini.js` | Site adapter for gemini.google.com. |
| `ai-water-meter/content/deepseek.js` | Site adapter for chat.deepseek.com. |
| `ai-water-meter/content/styles.css` | Card styling (glass/bucket/drum SVG, tooltip, chips, animation), loaded on every matched site alongside the adapter. |
| `ai-water-meter/popup/popup.html` | Markup for the toolbar popup **and** the ↗-triggered standalone window — the same file serves both entry points. |
| `ai-water-meter/popup/popup.js` | Reads every `awm_*` key from `chrome.storage.local` directly (no messaging needed), renders the "by site" and "by model" tabs, wires the reset button. |
| `ai-water-meter/popup/popup.css` | Popup-only styling (tabs, rows, badges). |
| `ai-water-meter/icons/icon16.png` `icon48.png` `icon128.png` | Toolbar/store icons, referenced from `manifest.json`. |
| `ai-water-meter/icons/tokenistt-logo.png` | Brand logo used in the popup header. |
| `ai-water-meter/icons/brand/*.svg` | Per-provider badge icons (`chatgpt.svg`, `claude.svg`, `gemini.svg`, `deepseek.svg`) used in the popup's site/model breakdown rows. |
| `ai-water-meter/test/` | Headless Playwright end-to-end harness — see [Automated tests](#automated-tests). Not shipped to the Web Store. |
| `ai-water-meter/ai-water-meter-v2-prd.md` | Full research/product writeup behind the water/cost/energy numbers — the primary source doc for `models.config.json`'s derivations. Not shipped. |
| `ai-water-meter/index.html` | Standalone marketing/landing page for the project (not loaded by the extension itself). Not shipped. |
| `CONTRIBUTING.md`, `LICENSE` | Repo-root contribution guide and MIT license text. |

</details>

## Architecture

```text
manifest.json           MV3 config: which files load on which site, in what order
content/
  core.js                shared engine, loaded FIRST on every matched site
  models.config.json      per-model pricing/water/energy data (fetched by core.js)
  chatgpt.js               adapter, loaded SECOND — one of these four per site
  claude.js
  gemini.js
  deepseek.js
  styles.css              card styling, loaded on every matched site
background.js            service worker — only job is opening popup/popup.html
                          in a standalone window (content scripts can't call
                          chrome.windows.create directly)
popup/                  toolbar popup AND the ↗-triggered standalone window
                          (same popup.html, two entry points)
icons/                  toolbar/store icons + per-provider brand SVGs
```

**Data flow at a glance** — one assistant turn finishing streaming, end to end:

```text
 site DOM                core.js               site adapter                storage / UI
┌───────────┐   mutation   ┌──────────┐   detectModel()   ┌─────────────┐
│ assistant │ ───────────► │ (loaded  │ ◄──────────────── │ MutationObs.│
│  message  │   observed   │  first,  │   detectContent-  │ + 1.2–1.4s  │
│  element  │              │  exposes │   Type()          │  debounce   │
└───────────┘              │  window. │ ─────────────────►│ per element │
                            │  AIWater │                    └──────┬──────┘
                            │  Meter}  │                            │ el.innerText
                            └────┬─────┘                            ▼
                                 │ calc(text, prompt, modelId, opts) 
                                 ▼
                     ┌────────────────────┐        ┌───────────────────────┐
                     │ models.config.json │──used──►│ tokens / cost / water │
                     │  (fetched once)    │  by     │ / energy result       │
                     └────────────────────┘  calc() └──────────┬────────────┘
                                                                 │
                                        addTotals(site, result)  │  createCard(result)
                                        ▼                        ▼
                              chrome.storage.local        receipt card DOM
                              (session/lifetime/           inserted after
                               per-model totals,            the message turn
                               queued to avoid races)
```

### Request/response flow for a single AI reply

1. `manifest.json`'s `content_scripts` block injects `core.js` then the
   matching `content/<site>.js` into the page at `document_idle`, scoped by
   `host_permissions`/`matches` to exactly the four supported domains — the
   extension has no access to any other site.
2. `core.js` immediately (self-invoking, guarded by
   `window.__aiWaterMeterCore` against double-injection) starts an async
   fetch of the bundled `ai-water-meter/content/models.config.json` via
   `chrome.runtime.getURL()` — this is a **local file read**, not a network
   call, so it works offline and needs no extra host permission. Every
   other exported function `await`s this fetch (`configReady`) before using
   the config, so call order relative to the fetch never matters. If the
   fetch fails for any reason (e.g. an extension update mid-flight), `core.js`
   falls back to one hardcoded `FALLBACK_MODEL`/`FALLBACK_MEDIA_MODEL` entry
   rather than throwing.
3. The site adapter sets up one `MutationObserver` on `document.body`
   watching for new/changed assistant-message elements (a per-site
   `ASSISTANT_SELECTOR`). Each time one appears or changes, a **1.2–1.4s
   debounce timer** resets — this is a proxy for "the model finished
   streaming," since none of the four sites expose a real
   streaming-complete DOM event or attribute the extension can hook. A
   `WeakSet` (`processed`) guarantees each element is ever handled once,
   even if the observer fires on it again later.
4. When the debounce fires, the adapter: reads the element's `innerText`;
   walks backward through the DOM to find the preceding user message (for
   input-token estimation); runs **best-effort model detection** (regex
   match against a model-picker element's text, falling back to a per-site
   default `modelId` if nothing matches — the card then shows an
   "estimated model" badge); runs **content-type detection**
   (`core.js`'s `detectContentType()`) to classify the response as plain
   text, an image, a video, a canvas/artifact panel, or a research-mode
   answer.
5. The adapter calls `AIWaterMeter.calc(responseText, promptText, modelId,
   { contentType, ... })`, which looks up the model (or media model) in the
   fetched config and returns token counts, cost, energy, and water — all
   pure arithmetic, no network call, no data leaves the function.
6. `AIWaterMeter.addTotals(site, calcResult)` persists the result: it reads
   the current session/lifetime-per-site/lifetime-per-model totals from
   `chrome.storage.local`, adds the new result, and writes all three keys
   back. Every call goes through a single in-memory promise queue
   (`addTotalsQueue` in `core.js`) so two responses finishing close
   together — e.g. two tabs open on the same site — can't race and drop an
   increment; each write's read is guaranteed to see the previous write.
7. `AIWaterMeter.createCard(...)` builds the receipt DOM (every
   interpolated value is either a formatted number or a string pulled from
   the *bundled* `models.config.json` — never raw page text — so there's no
   injection surface from a hostile page response), and the adapter inserts
   it right after the message turn.
8. Clicking a card's ↗ button sends `chrome.runtime.sendMessage({type:
   "OPEN_ANALYSIS"})`; `background.js`'s listener opens `popup/popup.html`
   in a small standalone window. `popup.js` reads every `awm_*` key out of
   `chrome.storage.local` directly (no messaging needed) and renders the
   site and per-model breakdowns.

### `calc()` reference

`window.AIWaterMeter.calc(responseText, promptText, modelId, options)` — the
one function that turns raw page text into a result. Always `async` (it
awaits `configReady` internally first).

<details>
<summary><strong>Parameter table, return shape, and the text vs. image/video branches</strong></summary>

| Parameter | Type | Meaning |
| --- | --- | --- |
| `responseText` | `string` | The assistant turn's `innerText` (adapters concatenate the canvas/artifact panel's text onto this before calling, for `contentType: "artifact"`). Ignored for `contentType: "image"`/`"video"` — pass `""`. |
| `promptText` | `string` | The preceding user message's `innerText`, used only for `inTokens` / input cost. |
| `modelId` | `string` | Key into `models.config.json`'s `models` map (text) or, when `options.contentType` is `"image"`/`"video"`, ignored in favor of `options.mediaModelId`. Unknown ids fall back to `FALLBACK_MODEL`. |
| `options.contentType` | `"text"` (default) `\| "artifact" \| "image" \| "video" \| "research"` | Drives which branch of `calc()` runs — see below. |
| `options.mediaModelId` | `string` | Required for `image`/`video`; key into `models.config.json`'s `mediaModels` map. Unknown ids fall back to `FALLBACK_MEDIA_MODEL`. |
| `options.unitCount` | `number` (default `1`) | Number of images, or seconds of video, this response produced. |

**Text / artifact / research branch** — `estimateTokens()` (≈4 chars/token,
`Math.max(1, Math.round(len/4))`) runs on both `promptText` and
`responseText`; for `"research"`, the output-token count is multiplied by
`RESEARCH_MODE.defaultMultiplier` (from `models.config.json`, currently 4x)
before cost/water/energy math. Returns:

```text
{ modelId, modelDisplayName, provider, contentType, researchMultiplier,
  inTokens, outTokens,               // outTokens is the *unmultiplied*, visible count
  costInUsd, costOutUsd, costUsd,
  energyWh, waterMl,
  methodologyTag, sourceUrl }
```

**Image / video branch** — no token estimation on `responseText` at all;
everything is unit-based. `outTokens` is `tokenEquivalentPerUnit *
unitCount` (display-only, does not feed cost/water/energy). `costOutUsd` is
the vendor's real `pricePerUnit * unitCount`; `costInUsd` is `0` unless the
model bills prompt tokens separately (`inputPricePerMTok`, OpenAI's image
models only). `energyWh`/`waterMl` are `energyWhPerUnit`/`waterMlPerUnit *
unitCount` from a dedicated research source, never derived from a text
model's per-token rate. Returns the same shape plus `unit`, `unitCount`,
`tokenEquivalentSource`.

</details>

### `ai-water-meter/content/models.config.json` schema

The **only** file that needs editing to add a model or correct a number —
`core.js` never hardcodes per-model figures (besides the two fallback
entries used only if the fetch itself fails). As of writing it holds **9
text models** and **3 media models**.

<details>
<summary><strong>Full annotated schema</strong></summary>

```jsonc
{
  "lastVerified": "YYYY-MM-DD",         // whole-file freshness marker
  "_meta": {
    "description": "…",
    "waterEnergyMethodology": { … },     // prose explaining each methodologyTag + how derived figures are cross-computed
    "mediaModels": "…",                  // prose explaining the image/video sourcing approach
    "researchMode": "…"                  // prose explaining the 4x multiplier's derivation
  },
  "models": {
    "<modelId>": {
      "provider": "Anthropic|OpenAI|Google|DeepSeek",
      "displayName": "Human-readable name shown on the card",
      "inputPricePerMTok": 0,            // USD per 1M input tokens
      "outputPricePerMTok": 0,           // USD per 1M output tokens
      "waterMlPerOutputMTok": 0,         // mL water per 1M output tokens
      "energyWhPerOutputMTok": 0,        // Wh energy per 1M output tokens
      "methodologyTag": "google-comprehensive|public-estimate|vendor-blog",
      "sourceUrl": "https://…",          // the (i) tooltip's "Methodology & source" link
      "notes": "how this figure was sourced or derived — required for any new/edited entry",
      "verified": "when/how pricing and water/energy were last checked"
    }
  },
  "mediaModels": {
    "<mediaModelId>": {
      "provider": "…", "displayName": "…",
      "mediaType": "image|video", "unit": "image|second",
      "pricePerUnit": 0,                 // USD per unit — vendor's real price
      "inputPricePerMTok": 0,            // optional; only set where the vendor bills prompt tokens separately
      "tokenEquivalentPerUnit": 0,       // display-only "out-equiv tok" chip value
      "tokenEquivalentSource": "vendor-tokenized|price-derived",
      "energyWhPerUnit": 0, "waterMlPerUnit": 0,  // per image, or per second of video
      "methodologyTag": "public-estimate",
      "sourceUrl": "https://…", "notes": "…", "verified": "…"
    }
  },
  "researchMode": {
    "defaultMultiplier": 4,              // applied to visible output tokens for contentType: "research"
    "sourceUrl": "https://…", "notes": "…"
  }
}
```

</details>

Every `models`/`mediaModels` entry's `notes` field is where the real
sourcing lives — several figures are *derived* (scaled from a sibling
model's price, or cross-computed between Wh and mL via Google's measured
ratio) rather than independently measured, and `notes` says which. See
`_meta.waterEnergyMethodology` for the two primary research sources this
file draws from (Google's Aug 2025 technical paper for Gemini, and a
University of Rhode Island AI Lab GPU-metering study for everything else)
and `ai-water-meter-v2-prd.md` for the full writeup.

### Storage keys

**Storage keys** (all in `chrome.storage.local`, all prefixed `awm_` so the
popup's "Reset all stats" button can wipe them in one pass):

| Key pattern | Contents |
|---|---|
| `awm_session_<site>` | Totals for the current browser session, per site |
| `awm_lifetime_<site>` | All-time totals, per site |
| `awm_lifetime_model_<modelId>` | All-time totals, per model (spans sites for a shared model id) |

Each total object has the same shape (`core.js`'s `EMPTY_TOTAL`):
`{ waterMl, costUsd, costInUsd, costOutUsd, energyWh, inTokens, outTokens,
count }` — `addTotal()` sums a new `calcResult` into all three keys on every
response (see step 6 above), and the per-model key additionally carries
`displayName`/`provider` for the popup's model tab to render without a
second lookup.

### Card anatomy

`createCard()` builds one receipt `<div class="awm-card">` per response,
inserted right after the message turn:

<details>
<summary><strong>Icon, header, model row, main stat, chip rows</strong></summary>

- **Icon** — `iconFor(waterMl)` picks `glass` (< 2500 mL), `bucket` (≥ 2500
  mL), or `drum` (≥ 25000 mL) based on *this single response's* water, not
  the session/lifetime total. `GLASS_ML` (250), `BUCKET_ML` (2500 = 10
  glasses), `DRUM_ML` (25000 = 10 buckets) in `core.js` control the
  thresholds. The SVG fills from empty to a target percentage (this
  response's water ÷ its icon's full capacity) via a `requestAnimationFrame`
  and a 60ms-delayed CSS transition, purely a display effect independent of
  the underlying numbers.
- **Header** — "Water Used" title, an (i) info icon whose tooltip text is
  built by `buildTooltipText()` (varies by content type — media, research,
  or plain text wording, always naming the `methodologyTag` and linking
  `sourceUrl`), and the ↗ button that opens the standalone analysis window.
- **Model row** — `modelDisplayName`, a content-type badge (`canvas/artifact`
  / `image` / `video` / `research ×N`, omitted for plain text), and an
  "estimated model" badge when `detectModel()` didn't find a match on the
  page (used the site's default `modelId` instead of a page-detected one).
- **Main stat** — the response's water in mL or L (`fmtMl()`), plus an
  animated horizontal bar at the same fill percentage as the icon.
- **Chip rows** — `{in} in · {out} {out-equiv|out} tok` alongside energy
  (`fmtWh()`); cost split into `{in} in + {out} out` (`fmtUsd()`); and a
  muted row with the running **session** total (`{water} / {cost} this
  session ({count})`) for quick context without opening the popup.

</details>

### Popup / standalone analysis window

`popup/popup.html` + `popup.js` serve **two entry points** with identical
markup: the toolbar popup (click the extension's icon) and the small
standalone window opened by a card's ↗ button (`background.js`'s
`OPEN_ANALYSIS` handler, 380×520). Both read straight from
`chrome.storage.local` — no messaging between the two.

<details>
<summary><strong>Site tab, model tab, reset behavior</strong></summary>

- **Site tab** (default) — one row per supported site (`awm_lifetime_<site>`),
  each showing a provider-colored badge, water, cost, and response count;
  a header total sums all four sites.
- **Model tab** — every `awm_lifetime_model_<modelId>` key, sorted by water
  descending, each row showing the provider badge (mapped from the stored
  `provider` string), `displayName`, water, cost, and count. Shows "No
  responses yet" if nothing has accumulated.
- **Reset all stats** — removes every key in storage whose name starts with
  `awm_` (session, lifetime-per-site, and lifetime-per-model alike), then
  re-renders both tabs empty. This is a hard, immediate reset with no
  confirmation dialog and no undo.

</details>

### Privacy

**Privacy:** the extension never makes an outbound network request. The
only `fetch()` call in the codebase reads a file bundled in the extension
itself. No prompt text, response text, or usage data is sent anywhere —
everything lives in `chrome.storage.local` on your own machine.

## Run it in your own browser

1. Clone or download this repo.
2. Open `chrome://extensions` (or `edge://extensions` — this also works
   unmodified in Chromium-based Edge).
3. Toggle **Developer mode** on (top right).
4. Click **Load unpacked** and select the `ai-water-meter/` folder (the one
   containing `manifest.json` — not the repo root).
5. Visit chatgpt.com, claude.ai, gemini.google.com, or chat.deepseek.com,
   send a message, and wait for it to finish streaming — the card appears
   ~1–1.5s after.
6. Click the extension's icon in the toolbar for lifetime totals across all
   sites and models, and a reset button. Click the ↗ button on any card to
   pop that same view open in a small standalone window instead.
7. After editing any file under `ai-water-meter/`, go back to
   `chrome://extensions` and click the reload icon (⟳) on the extension's
   card, then refresh any open tab on a supported site — content scripts
   already running in a tab don't pick up code changes until the tab
   reloads.

**If the card doesn't show up:** open devtools (F12) → Console on the chat
page. `core.js` and the site adapter log with an `[AI Water Meter]` prefix.
A missing card almost always means `ASSISTANT_SELECTOR` in that site's
`content/<site>.js` no longer matches the live DOM (see "Known limitation:
selectors will break over time" below) — right-click a finished response →
Inspect, and compare against the selector at the top of that file.

## Automated tests

`ai-water-meter/test/` is a headless Playwright harness that loads the real
unpacked extension against static HTML fixtures for every site and content
type (plain text, image, video, canvas/artifact, research) and asserts the
whole pipeline — injection, model/content-type detection, `calc()`, storage,
and the popup — works end to end, with zero page/console errors.

```sh
cd ai-water-meter/test
npm install
npm test
```

`run.js` drives it: `build-test-extension.js` copies the real extension into
a `tmp-extension/` scratch copy with a widened manifest (so it can match
`localhost`), `server.js` serves the fixtures over HTTP, then Playwright
(`chromium.launchPersistentContext`, headless) loads each fixture and
asserts the card's model/content-type/water/cost text against expectations.
Current fixture coverage (`test/fixtures/`):

| Site | Fixtures |
| --- | --- |
| ChatGPT | plain text, image, canvas, research, image-decoy (regression fixture for a false-positive image match) |
| Claude | plain text, artifact, research |
| Gemini | plain text, image, video, canvas, research |
| DeepSeek | plain text |

This does **not** validate real-site selector accuracy (it can't — it never
touches chatgpt.com/claude.ai/etc.) — only that the extension's own code
path is correct given DOM shaped the way each fixture assumes. Selector
drift against the real, live sites can only be caught by the manual
click-test in "Run it in your own browser" above.

## Known limitation: selectors will break over time

ChatGPT, Claude, Gemini, and DeepSeek all change their frontend DOM
structure periodically (new React builds, renamed classes, etc.), which
will eventually break message detection or model detection on one or more
sites. When that happens:

1. Open the site, open a chat, right-click a finished AI response → **Inspect**
2. Find a stable-looking selector (an attribute like
   `data-message-author-role="assistant"`, or a consistent class name)
3. Update `ASSISTANT_SELECTOR` (message detection), `MODEL_PICKER_SELECTORS`/
   `MODEL_PATTERNS` (model detection), or `CONTENT_DETECTORS` (image/video/
   canvas/research detection) at the top of that site's file in `content/`

DeepSeek and Gemini use the most generic/fragile selectors right now since
their class names are less stable — expect to touch those first. Model and
content-type detection were both written without live browser access (see
above) so treat them as unverified everywhere until manually checked.

### Known limitation: "Extension context invalidated"

If you reload the extension in `chrome://extensions` while a supported site
is already open in a tab, that tab's already-running content script becomes
orphaned — any `chrome.*` call it makes throws `Extension context
invalidated`. Every adapter now catches this specific error and bails
quietly instead of throwing, but the card still won't appear on that tab
until you refresh the page. This is normal Chrome MV3 behavior during
development, not a bug in the calc/detection logic.

## Publishing to the Chrome Web Store

Not required to run the extension locally — only relevant when you're ready
to ship it publicly.

<details>
<summary><strong>Full 8-step publishing checklist</strong></summary>

1. **Verify against real sites first.** The automated test suite (above)
   only proves the extension's own logic is correct against fixtures — it
   cannot catch live selector drift. Before submitting, manually click-test
   all four sites per "Run it in your own browser," confirming the card
   appears, the model name looks right (or gracefully shows "estimated
   model"), and the popup renders. Do this on a clean profile too (a fresh
   Chrome profile with only this extension loaded) to rule out interference
   from other installed extensions.
2. **Bump the version** in `manifest.json` (`"version": "2.0.0"` →
   whatever's next) — the Web Store rejects a re-upload with an unchanged
   version number.
3. **Package the zip.** From inside `ai-water-meter/`, zip only what
   `manifest.json` actually references — `manifest.json`, `background.js`,
   `content/`, `popup/`, `icons/`. Leave out `test/`, `README.md`,
   `ai-water-meter-v2-prd.md`, and `index.html` (the marketing landing
   page) — none of it is loaded by the extension, and a smaller package is
   faster for reviewers to check.

   ```sh
   cd ai-water-meter
   zip -r ../h2ai-extension.zip manifest.json background.js content popup icons
   ```

4. **Create a one-time Chrome Web Store developer account** at
   [chrome.google.com/webstore/devconsole](https://chrome.google.com/webstore/devconsole)
   (Google account + a one-time $5 registration fee).
5. **New item → upload the zip.**
6. **Fill in the store listing:**
   - *Description*: lead with what it does and, per the disclosure this
     project treats as non-negotiable (see above), say plainly that the
     water/energy/cost numbers are estimates, not measured provider data.
   - *Category*: Productivity (or Developer Tools).
   - *Screenshots*: at least one, 1280×800 or 640×400 PNG/JPEG — a
     screenshot of the card under a real response works well; `index.html`
     in this repo has matching brand colors if you want a promo tile to
     match.
   - *Icon*: `icons/icon128.png` is already the right size.
   - *Privacy practices tab*: declare `storage` as the only permission and
     justify it ("stores session/lifetime totals locally via
     chrome.storage.local; no data leaves the browser"); justify each of
     the four `host_permissions` entries as "read the page DOM to detect
     when an AI response finishes, to estimate its footprint" — the
     Architecture section above ("Privacy") is accurate copy for this.
     Since the extension collects no user data at all, the "single purpose"
     and data-use questions are the easiest part of the review.
7. **Submit for review.** Typical turnaround is a few hours to a few
   business days for a first submission; extensions with broad
   `host_permissions` sometimes get an extra manual look — the four exact
   domains here (no wildcards, no `<all_urls>`) are about as narrow as this
   kind of tool can be, which helps.
8. **After approval**, future updates are just: bump the version, re-zip,
   upload on the same listing, submit again — no new registration needed.

</details>

## Ideas for v4

- Settings page to let users edit `models.config.json` from the popup
  instead of hand-editing the file
- Weekly summary notification
- Export session data as CSV
- Per-model breakdown for the *session* total, not just lifetime (the
  popup's model tab currently only reads `awm_lifetime_model_<modelId>`)
- A remote-hosted `models.config.json` option so pricing/water updates
  don't require republishing the extension (see PRD §4.9, open question 2)

## Contributing

Contributions are welcome — this project runs on volunteer fixes to exactly
the kind of thing that breaks on its own: a site's DOM changing, a model's
price moving, a new model shipping. See
[`CONTRIBUTING.md`](CONTRIBUTING.md) at the repo root for the full guide,
but the short version:

- **The single highest-value contribution** is fixing a selector that's
  drifted on a real, live site — see "Known limitation: selectors will break
  over time" above. You don't need to understand the rest of the codebase to
  do this.
- Adding or correcting a `ai-water-meter/content/models.config.json` entry needs a
  `sourceUrl` and a `notes` field explaining the derivation — this project's
  whole premise is that every number traces back to something real.
- Run `cd ai-water-meter/test && npm install && npm test` before opening a
  PR; for selector fixes, also manually click-test the real site (automated
  fixtures can't catch live-DOM drift).

## License

[MIT](LICENSE) — free to use, modify, and redistribute, including
commercially. See the [LICENSE](LICENSE) file at the repo root for the
full text.

# H2AI (Chrome Extension)

Free, open-source browser extension by [tokenistt](https://www.tokenistt.com).
Shows a small dark "receipt" card under every ChatGPT, Claude, Gemini, and
DeepSeek response, with an animated glass → bucket → drum icon estimating
water used and cost, plus a running session/lifetime total (popup). The
card also breaks out input/output tokens, input/output cost, and energy,
and detects which model produced the response where the page's DOM allows.
Beyond plain text, it also estimates image generation, video generation,
Canvas/Artifact responses, and Deep-Research-style answers — see
"Beyond text: image, video, canvas, and research" below.

## ⚠️ Important: these numbers are estimates, not real data

No AI provider publishes real, per-query water or energy figures for every
model. Numbers come from `content/models.config.json` — a mix of Google's
own disclosed comprehensive methodology (Gemini only) and derived/scaled
estimates for everyone else. Every model entry carries a `methodologyTag`
and `sourceUrl`; the card's (i) tooltip states which basis is in play and
links to the source. If you plan to publish or promote this extension, keep
that disclosure — presenting any of this as exact data would be misleading.

Water/cost/energy config lives in one file: `content/models.config.json`.
See that file's `_meta.waterEnergyMethodology` block and each model's
`notes` field for exactly how each number was sourced or derived, and
`ai-water-meter-v2-prd.md` for the full research writeup.

### Water estimate basis

Every card shows each model's own best-sourced `models.config.json` figure
— Google's disclosed comprehensive methodology for Gemini, derived/scaled
estimates for everyone else (see each model's `notes` field and the card's
(i) tooltip for sourcing). There is no separate "playful" flat-rate mode;
what you see is what accumulates into the session/lifetime totals.

### Beyond text: image, video, canvas, and research

Each response is classified into one of five content types before `calc()`
runs — `content/core.js`'s `detectContentType()`, called with a per-site
`CONTENT_DETECTORS` selector set. A small tag appears next to the model name
for anything other than plain text.

- **image / video** — no vendor publishes water/energy data for media
  generation. Each entry in `models.config.json`'s new `mediaModels` section
  converts its unit (1 image, 1 second of video) into an output-token
  equivalent — a *real* one where the vendor publishes it (OpenAI tokenizes
  `gpt-image-1.5` output: 272/1056/4160 tokens for low/medium/high quality),
  otherwise imputed by dividing the real per-unit price by a reference text
  model's per-token rate (Google's Imagen/Veo, billed flat per unit with no
  published tokenization). Water/energy is then borrowed from that reference
  model's rate. Cost uses the vendor's real price directly, not the token
  conversion. Supported today: ChatGPT (image only), Gemini (image + video).
  Claude and DeepSeek have no native in-chat image/video generation to
  detect.
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

## Install (unpacked, for development)

1. Open `chrome://extensions`
2. Toggle **Developer mode** on (top right)
3. Click **Load unpacked**
4. Select this `ai-water-meter` folder
5. Visit chatgpt.com, claude.ai, gemini.google.com, or chat.deepseek.com
   and send a message — the card should appear under the response ~1-1.5s
   after it finishes streaming.
6. Click the extension icon in the toolbar for lifetime totals across all
   sites and models, and a reset button. Click the ↗ button on any card to
   pop that same view open in a small window.

## How it works

- `content/models.config.json` — per-model config: pricing, water, energy,
  methodology tag, and source URL. Fetched once via
  `fetch(chrome.runtime.getURL(...))` when `core.js` loads (see
  `web_accessible_resources` in `manifest.json`). Edit this file to update
  pricing/water numbers — no logic changes needed.
- `content/core.js` — shared engine: loads the config above, token
  estimation, cost/water/energy math (`calc()`), glass/bucket/drum SVG icon
  rendering + fill animation, and chrome.storage read/write for session +
  lifetime totals (per site *and* per model). Loaded first on every site.
- `content/<site>.js` — one adapter per site. Each uses a
  `MutationObserver` to watch the chat for new assistant messages, waits
  ~1.2-1.4s after the DOM stops changing (a simple proxy for "streaming
  finished"), reads the final text, does **best-effort model detection**
  (tries a couple of guessed model-picker selectors, maps the text to a
  `models.config.json` key, falls back to a per-site default model if
  nothing matches — the card shows an "estimated model" badge when that
  happens), and injects the card right after the message.
- `background.js` — service worker; opens `popup/popup.html` in a small
  standalone window when a card's ↗ button is clicked (content scripts
  can't call `chrome.windows.create` directly).
- `popup/` — toolbar popup (and the ↗-triggered window) showing lifetime
  totals per site, a per-model breakdown tab, and reset.

### Model detection is best-effort and largely unverified

The model-picker selectors in each `content/<site>.js` were written by
reasoning about typical DOM patterns, not by inspecting live pages (no
browser access was available while writing them). Expect most of them to
need correcting against the real sites — see the manual QA checklist below.
When detection fails, the card falls back to a per-site default model and
shows a small "estimated model" badge rather than pretending certainty.

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

## Ideas for v4

- Settings page to let users edit `models.config.json` from the popup
  instead of hand-editing the file
- Weekly summary notification
- Export session data as CSV
- Per-model breakdown for the *session* total, not just lifetime
- A remote-hosted `models.config.json` option so pricing/water updates
  don't require republishing the extension (see PRD §4.9, open question 2)

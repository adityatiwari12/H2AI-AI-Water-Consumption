# H2AI (Chrome Extension)

Free, open-source browser extension by [tokenistt](https://www.tokenistt.com).
Shows a small dark "receipt" card under every ChatGPT, Claude, Gemini, and
DeepSeek response, with an animated glass → bucket → drum icon estimating
water used and cost, plus a running session/lifetime total (popup). The
card also breaks out input/output tokens, input/output cost, and energy,
and detects which model produced the response where the page's DOM allows.

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

### Playful vs. Accurate water estimate

Because per-model water figures range from ~0.4 mL to ~75 mL per 1,000
output tokens depending on model and methodology, there's a global toggle
(popup → "Water estimate mode"), stored in `chrome.storage.local`:

- **Playful** (default) — flat ~45 mL per 1,000 output tokens for every
  model, the same order of magnitude as the original viral "46 L" screenshot
  format. Keeps the glass-fill animation visible and numbers comparable
  across models; not model-specific.
- **Accurate** — each model's own best-sourced `models.config.json` figure.
  For most non-Gemini models this is a derived estimate (see `notes`), so
  it's often close to the playful number anyway; only Gemini currently has
  an independently disclosed, much smaller figure, so its glass will barely
  move in this mode. That's expected, not a bug.

Lifetime/session totals in storage always accumulate the **accurate**
figure regardless of the display toggle, so flipping the toggle never makes
past totals jump.

## Install (unpacked, for development)

1. Open `chrome://extensions`
2. Toggle **Developer mode** on (top right)
3. Click **Load unpacked**
4. Select this `ai-water-meter` folder
5. Visit chatgpt.com, claude.ai, gemini.google.com, or chat.deepseek.com
   and send a message — the card should appear under the response ~1-1.5s
   after it finishes streaming.
6. Click the extension icon in the toolbar for lifetime totals across all
   sites and models, a playful/accurate toggle, and a reset button. Click
   the ↗ button on any card to pop that same view open in a small window.

## How it works

- `content/models.config.json` — per-model config: pricing, water, energy,
  methodology tag, and source URL. Fetched once via
  `fetch(chrome.runtime.getURL(...))` when `core.js` loads (see
  `web_accessible_resources` in `manifest.json`). Edit this file to update
  pricing/water numbers — no logic changes needed.
- `content/core.js` — shared engine: loads the config above, token
  estimation, cost/water/energy math (`calc()`), glass/bucket/drum SVG icon
  rendering + fill animation, chrome.storage read/write for session +
  lifetime totals (per site *and* per model), and the playful/accurate
  water-mode setting. Loaded first on every site.
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
  totals per site, a per-model breakdown tab, the playful/accurate toggle,
  and reset.

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
3. Update `ASSISTANT_SELECTOR` (message detection) or
   `MODEL_PICKER_SELECTORS`/`MODEL_PATTERNS` (model detection) at the top of
   that site's file in `content/`

DeepSeek and Gemini use the most generic/fragile selectors right now since
their class names are less stable — expect to touch those first. Model
detection was written without live browser access (see above) so treat it
as unverified everywhere until manually checked.

## Ideas for v3

- Settings page to let users edit `models.config.json` from the popup
  instead of hand-editing the file
- Weekly summary notification
- Export session data as CSV
- Per-model breakdown for the *session* total, not just lifetime
- A remote-hosted `models.config.json` option so pricing/water updates
  don't require republishing the extension (see PRD §4.9, open question 2)

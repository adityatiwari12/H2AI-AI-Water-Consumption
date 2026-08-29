# AI Water Meter — Methodology Engine Spec

**Status:** proposed, not yet implemented
**Date:** August 30, 2026
**Extends:** `ai-water-meter-v2-prd.md` (per-model config), `content/core.js`'s `calc()`, `content/models.config.json`

---

## 1. Why

`calc()` today already goes prompt → token estimate → model config → energy →
water → cost, but it's one flat function, and the result it returns
(`calcResult`) has no structured confidence signal and no carbon figure —
callers only get an informal read on trustworthiness from a `methodologyTag`
string and whatever the model's `notes` field says in prose.

This spec turns that into a named pipeline with two new estimate dimensions
(carbon, region-adjustable carbon) and a structured confidence field, without
changing the public shape of `window.AIWaterMeter` that the four site
adapters, the card, and the popup already depend on.

## 2. Pipeline

`calc()` remains the sole public entry point. Internally it becomes a
sequence of small, single-purpose stages instead of one function body:

```
gatherInputs            (prompt text, response text, modelId, contentType, region)
   -> resolveModel        (existing MODELS / MEDIA_MODELS lookup, unchanged)
   -> computeEnergy        (unchanged math, existing per-model/per-unit rates)
   -> computeWater         (unchanged math — no direct/indirect split; see §6)
   -> computeCarbon        (NEW — energyWh x region's grid carbon intensity)
   -> computeCost           (unchanged math)
   -> attachConfidenceAndMethodology  (NEW — promotes each config entry's informal
                                        confidence into a structured field)
   -> assembleResult
```

Each stage takes and returns plain data, no shared mutable state, so the
pipeline reads top-to-bottom and any stage can be picked up independently
later (e.g. if a real per-region water/energy source ever appears).

This is an internal refactor of `calc()`'s body — no adapter
(`content/{chatgpt,claude,gemini,deepseek}.js`) needs to change, since they
already just call `AIWaterMeter.calc(responseText, promptText, modelId,
options)` and use whatever comes back.

## 3. Data model additions (`models.config.json`)

### 3.1 `carbonIntensity`

New top-level block, keyed by region:

```json
"carbonIntensity": {
  "global": { "gCo2ePerKwh": 0, "source": "...", "lastVerified": "..." },
  "us":     { "gCo2ePerKwh": 0, "source": "...", "lastVerified": "..." },
  "eu":     { "gCo2ePerKwh": 0, "source": "...", "lastVerified": "..." },
  "asia":   { "gCo2ePerKwh": 0, "source": "...", "lastVerified": "..." }
}
```

Figures are placeholders here — implementation must pull real, current
numbers the same way every other entry in this file is sourced (a real
citation — e.g. Ember's Global Electricity Review, IEA, or EPA eGRID for the
`us` entry — verified via web search at build time, with a `lastVerified`
date, not invented in this doc). `eu` and `asia` are acknowledged in each
entry's notes as broad regional averages (France's grid and Poland's grid
are both "eu"; China's and Japan's are both "asia") — same honesty posture
the rest of this file already takes with `methodologyTag`/`notes`.

### 3.2 `confidence` field

Every entry under `models` and `mediaModels` gains a structured field:

```json
"confidence": "low" | "medium" | "high"
```

This is a mechanical promotion of what each entry's `notes` field already
states in prose (e.g. claude-sonnet-5's notes end in "Confidence: low.").
No new judgment calls — just making it parseable so the pipeline and the
card can read it directly instead of scraping free text.

## 4. Result shape

`calcResult` gains three fields:

- `carbonG` — grams CO2e, `= (energyWh / 1000) * carbonIntensity[region].gCo2ePerKwh`
- `region` — the region key actually used for this calc (`"global"` by default)
- `confidence` — copied straight from the resolved model/media-model entry's
  new `confidence` field

Existing fields (`modelId`, `methodologyTag`, `sourceUrl`, `waterMl`,
`energyWh`, `costUsd`, etc.) are **not** renamed. The task that prompted this
spec sketched a result shape using `model`/`methodology`/`source` as key
names; this spec keeps the current names instead — `modelId` is baked into
the `chrome.storage.local` key format
(`awm_lifetime_model_${modelId}`), and renaming the other two buys nothing
but diff churn through `createCard()` and the popup for no behavior change.
The new fields cover the actual ask (carbon + region + structured
confidence, all now present on every result); a pure rename is a follow-up
if anyone actually needs it.

## 5. Region selector

- New dropdown in `popup/popup.html` / `popup/popup.js`: Global average / US
  / EU / Asia. Default `"global"`.
- Persisted to `chrome.storage.local` under a new `awm_region` key.
- `content/core.js` reads it once at inject time (same pattern as the
  existing `configReady` IIFE) and subscribes to
  `chrome.storage.onChanged` to keep a module-level `CURRENT_REGION`
  variable live — so changing region in the popup takes effect on the next
  response without a page refresh, and without adding an async storage read
  to the per-response hot path.
- Region **only** feeds `computeCarbon`. Water and energy estimates stay
  global per-model figures, matching the fact that this repo's sources for
  those (Google's disclosure, the URI Lab study, Bertazzini et al., the
  video scaling-law paper) aren't broken out by region either — there is no
  honest per-region water/energy number to plug in here, so we don't
  pretend to have one. Cost is real vendor billing and is region-independent
  from the extension's point of view.
- The card's methodology tooltip must state plainly that regional carbon
  reflects **the viewer's own selected grid assumption**, not the real
  datacenter's actual location (no site exposes that, and guessing would
  violate the non-negotiable estimate-disclosure rule in this repo's
  `CLAUDE.md` and `CONTRIBUTING.md`).

## 6. Explicitly out of scope

- **Direct/indirect water split.** No provider publishes a breakdown for
  any model in this file except Google's own comprehensive-vs-active-chip
  methodology tiers (which measure something different — full-stack vs.
  chip-only power accounting, not on-site vs. off-site water). Modeling a
  direct/indirect split for every other model would mean applying a generic
  industry-average ratio with no per-provider grounding — the specific
  thing this repo's methodology culture tries to avoid. `waterMl` stays a
  single number.
- **Geolocation- or timezone-inferred region.** Region is a manual, explicit
  user choice, not a guess from browser signals — a proxy for a proxy is
  worse than an honest "unset."
- **Renaming existing `calcResult` fields** — see §4.

## 7. UI changes

**Card** (`createCard()` in `core.js`):
- New chip showing `carbonG` (formatted like the existing `fmtWh`/`fmtMl`
  helpers — e.g. `12.3 g CO2e`, `0.45 kg CO2e` above 1000g).
- Small confidence badge near the existing methodology `(i)` tooltip
  (e.g. a muted pill reading "low confidence" / "medium confidence").
- Tooltip copy extended per §5's disclosure requirement whenever `region !==
  "global"`.

**Popup** (`popup/popup.js`, `popup.html`):
- Region `<select>` wired to the new `awm_region` storage key.
- Lifetime carbon total added alongside the existing water/cost/energy
  totals — mechanical, since `EMPTY_TOTAL`/`addTotal()` in `core.js` are
  already generic over whatever numeric fields a `calcResult` carries.

## 8. Testing

- Existing Playwright suite (`test/run.js`, `test/fixtures/*.html`,
  `test/build-test-extension.js`) must pass unchanged for the four
  supported sites.
- Manual click-test per `CLAUDE.md`'s existing verification steps, plus:
  switch region in the popup mid-session and confirm the next card's
  `carbonG` changes without a page reload.
- No behavior change expected for `waterMl`, `energyWh`, or `costUsd` on any
  existing model — this is additive only.

## 9. Open items for the implementation plan

- Exact `gCo2ePerKwh` figures + citations for `global`/`us`/`eu`/`asia`
  (real web-search-verified numbers, not placeholders — see §3.1).
- Whether the pre-existing uncommitted `carbonG` derivation currently
  sitting in this repo's working tree (global-constant-only, sourced to
  IEA's *Electricity 2025* report at 445 g CO2/kWh, no region breakdown, no
  `confidence` field) should be reused as the `global` baseline figure and
  extended, or replaced outright — it predates this spec's region-selector
  decision and should be reconciled against §3.1/§5 before merging, not
  built on blindly.

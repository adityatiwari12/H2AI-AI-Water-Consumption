# AI Water Meter — PRD, Technical Plan & Continuation Prompt

**Version:** 2.0 (planning doc for the next build phase)
**Date:** July 19, 2026
**Author context:** Extends the v1 unpacked Chrome extension already built (manifest V3, `content/core.js` + per-site adapters, `popup/`)

---

## 1. Why v2 is needed

v1 proved the concept: a card appears under AI responses with a glass-fill animation. But it used one flat "tier" per site (`large`/`medium`) with made-up round numbers. That's fine for a demo, weak for anything you'd publish or show off — the whole point of the tool is credibility about environmental cost, so the numbers need to trace back to something real, and differ **by model**, not just by site.

v2's job: replace the flat tiers with a real, sourced, per-model configuration for water, energy, cost, and token usage — and surface all four in the card, not just water.

---

## 2. Grounding data (read before touching the formulas)

Public, methodology-disclosed water/energy figures are sparse and **disagree by orders of magnitude** depending on what's being measured. This matters for the product because it means "accurate" has to mean "clearly sourced and labeled," not "one true number."

**Google Gemini (most rigorous public disclosure to date, Aug 2025 technical paper + Google Cloud blog):**
Using Google's comprehensive methodology (full serving stack: accelerators, host system, idle capacity, data center overhead), the median Gemini Apps text prompt was measured at 0.24 Wh energy, 0.26 mL water, 0.03 g CO2e. Using a narrower methodology that only counts active chip power, the same median prompt came out to 0.10 Wh, 0.12 mL water. Google reported this was 33x lower energy and 44x lower carbon than their May 2024 baseline, driven by software/hardware efficiency work.

**OpenAI (Sam Altman's blog post, older models, single average figure, no methodology paper):**
An average ChatGPT query was described as using about 0.34 Wh and roughly 0.000085 gallons of water (~0.32 mL). This has no published methodology behind it, so it's directionally useful but not as trustworthy as Google's disclosure.

**GPT-5 (reported energy, notably higher):**
Later reporting on GPT-5 usage cited an average of roughly 18 Wh per response, with some responses reaching 40 Wh — nearly two orders of magnitude above the Gemini figure. This likely reflects GPT-5's reasoning/thinking-token behavior on harder queries, and different accounting than Google's paper. Treat as a rough upper-bound signal, not an apples-to-apples comparison.

**Mistral (Large 2 life-cycle assessment):**
A 400-token response was reported at 1.14 g CO2e and 45 mL of water — about 170x the Gemini water figure for a comparable-length response. This is very likely a full life-cycle assessment (amortized training + hardware manufacturing footprint included), not inference-only, which is the classic reason estimates vary this much.

**Earlier widely-cited public estimates (pre-2025, no vendor disclosure, theoretical modeling):**
Numbers commonly cited around 45–50 mL per prompt circulated widely before any vendor published real figures — these are the ones the original viral tweet screenshot format was almost certainly gesturing at (46 L was obviously satire, but the "tens of mL per prompt" range has real prior art).

**Takeaway for the product:** don't present a single number as ground truth. Show the estimate, show which methodology basis it's closest to, and let the (i) tooltip carry the caveat. Consider letting the user pick a "methodology stance" (conservative / Google-comprehensive / older-public-estimate) as a v2.5 stretch feature — see §7.

---

## 3. Cost data (per-model API pricing, verified July 2026 snapshot)

Pricing changes often — this table is a **starting config**, not a permanent source of truth. Store it as a single versioned JSON with a `lastVerified` date and revisit quarterly.

| Provider | Model | Input $/1M tok | Output $/1M tok | Notes |
|---|---|---|---|---|
| Anthropic | Claude Haiku 4.5 | $1.00 | $5.00 | cheapest current Claude |
| Anthropic | Claude Sonnet 5 | $2.00 (intro, through Aug 31 2026) → $3.00 | $10.00 → $15.00 | intro pricing expires Sept 1 2026 |
| Anthropic | Claude Opus 4.8 | $5.00 | $25.00 | Fast Mode: $10 / $50 |
| Anthropic | Claude Fable 5 (Mythos-tier) | $10.00 | $50.00 | |
| OpenAI | GPT-5 | $0.625 | $5.00 | Azure-hosted rate; other hosts up to $1.25 in |
| OpenAI | GPT-5.4 | $2.50 | $15.00 | |
| OpenAI | GPT-5.4 mini | $0.40 | ~$2 (est.) | |
| Google | Gemini 3.1 Pro | $2.00 | $12.00 | |
| Google | Gemini 3 Flash | $0.50 | $3.00 | |
| Google | Gemini 2.5 Flash | $0.30 | $2.50 | one source lists $0.15/$0.60 — reconcile at build time |
| Google | Gemini 3.1 Flash-Lite | $0.10 | $0.40 | |
| DeepSeek | DeepSeek V3 | $0.27 | $1.10 | |
| DeepSeek | DeepSeek V4 Flash | $0.14 | $0.28 | cached input ~$0.0028 |

Output tokens are consistently priced far above input (5–8x) across every provider — worth reflecting in the UI copy (e.g. "output tokens drive most of the cost").

---

## 4. Product Requirements Document

### 4.1 Problem statement
People have an intuitive but ungrounded sense that "AI uses a lot of water/energy." Existing viral content (the 46L screenshot) is satire, not data, but it points at a real appetite for a lightweight, always-on way to see an estimated per-response footprint while using the tools they already use daily.

### 4.2 Goals
- Show a differentiated, per-model (not per-site-flat) estimate of: input/output token count, water, energy (stretch), and USD cost, under every AI response on the four supported sites.
- Make every number traceable to a documented source or formula, visible via one tap/hover.
- Keep a running session total and a persistent lifetime total per site and per model.
- Ship as an unpacked, then Chrome Web Store-published, MV3 extension.

### 4.3 Non-goals (v2)
- Not claiming lab-grade accuracy — this is a literacy/awareness tool, not an audited metering device.
- Not supporting image/video/voice generation footprints (text-only for v2).
- Not intercepting network requests to read real token counts from provider responses (no official API access from a content script context in most cases) — token counts remain **character-based estimates** unless a specific site exposes real usage in the DOM (see §4.6).

### 4.4 Users
Primary: the builder (you) and people who install it after seeing it — casually curious users, not researchers. Secondary: people who screenshot the card for social content, same spirit as the original tweet.

### 4.5 Functional requirements

**FR1 — Model detection per site**
Each site adapter must attempt to read the actual model name being used from the DOM (e.g. a model-picker label) and map it to a config entry. Fallback: a per-site default model if detection fails, clearly flagged in the card as "model not detected, using default estimate."

**FR2 — Config-driven estimation engine**
Replace the `TIERS` object in `core.js` with a `MODELS` config keyed by model id, containing: `provider`, `displayName`, `inputPricePerMTok`, `outputPricePerMTok`, `waterMlPerOutputMTok`, `energyWhPerOutputMTok`, `methodologyTag` (`"google-comprehensive"` | `"public-estimate"` | `"vendor-blog"`), `sourceUrl`, `lastVerified`.

**FR3 — Token usage display**
Card shows estimated input tokens and output tokens separately (not just a combined number), plus the char→token heuristic used, so the estimate's rough nature is transparent.

**FR4 — Cost estimation**
Computed from FR2 config × FR3 token counts, split input/output in the card ("$0.0012 in + $0.0041 out").

**FR5 — Water estimation with methodology label**
Computed from FR2 config, scaled to output tokens (water is overwhelmingly driven by generation, not the prompt). The (i) tooltip states which named methodology basis is being used and links to the source.

**FR6 — Differentiated animation tiers**
Keep glass → bucket → drum, but scale thresholds sensibly now that per-model water numbers are much smaller (Gemini-basis: ~0.26 mL per prompt) — a literal glass will almost never fill on a single response. Options to resolve, pick one before building (see open question in §7):
  (a) keep per-response numbers tiny and accurate, drop the single-response glass-fill visual, animate the **session total** glass instead; or
  (b) keep the playful per-response glass-fill using the higher "public-estimate" methodology by default, and let accuracy-minded users switch to "Google-comprehensive" mode where the number is closer to true and the glass barely moves.
  Recommendation: (b), with methodology switch defaulting to public-estimate (satisfies the fun/viral use case) and a toggle for the accurate mode (satisfies the credibility goal).

**FR7 — Session + lifetime totals**
Unchanged from v1 structurally, but now aggregated per model as well as per site, so the popup can show "Claude Opus: 12 responses, 3.1 mL, $0.08."

**FR8 — Popup breakdown**
Extend `popup.js` to show a per-model breakdown, not just per-site.

**FR9 — Config update path**
Ship `models.config.json` as a separate file (not inlined in `core.js`) so pricing/water updates don't require touching logic code. Document the update process in README.

### 4.6 Data model (draft)

```json
{
  "lastVerified": "2026-07-19",
  "models": {
    "claude-opus-4-8": {
      "provider": "Anthropic",
      "displayName": "Claude Opus 4.8",
      "inputPricePerMTok": 5.00,
      "outputPricePerMTok": 25.00,
      "waterMlPerOutputMTok": 260,
      "energyWhPerOutputMTok": 240,
      "methodologyTag": "public-estimate",
      "sourceUrl": "https://cloud.google.com/blog/products/infrastructure/measuring-the-environmental-impact-of-ai-inference"
    }
  }
}
```
(Numbers above are illustrative placeholders to be filled in properly during Phase 2 — see roadmap.)

### 4.7 Non-functional requirements
- **Privacy:** all computation stays local (chrome.storage.local); no prompt/response text ever leaves the browser.
- **Performance:** card injection must not noticeably delay page interaction; keep the 1.2–1.4s debounce, profile on a long response.
- **Maintainability:** site selectors will break — isolate them at the top of each adapter file (already true in v1), and now also isolate pricing/water data in the external JSON.
- **Resilience:** if model detection fails, degrade gracefully to a labeled default rather than crashing or showing no card.

### 4.8 Success signals (informal, not instrumented/tracked — no telemetry in v2)
- Card correctly identifies model on Claude and ChatGPT in normal use.
- Numbers differ visibly between e.g. Haiku vs Opus responses of similar length.
- Popup per-model breakdown is legible and correct after a mixed-model session.

### 4.9 Risks / open questions
1. **Site DOM won't reliably expose the active model name** on all four platforms — Gemini and DeepSeek are the biggest risk. Decide per-site whether "best-effort detection + labeled default" is acceptable, or whether some sites just ship with a single default model config.
2. **Which water methodology is the default** (§4.5 FR6) — affects whether the product feels "fun" or "accurate." Needs a decision before building the UI, not after.
3. **Pricing drifts fast** (see §3, multiple conflicting sources for the same model). Decide whether to hardcode a `lastVerified` snapshot (simple, will go stale) or add a lightweight remote-fetch of `models.config.json` from a URL you control (requires `host_permissions` for that URL, a hosting spot, and a fallback to bundled JSON if fetch fails).

---

## 5. Roadmap / Phases

**Phase 1 — Config extraction (no behavior change)**
Move `TIERS` out of `core.js` into `models.config.json`, load it via `fetch(chrome.runtime.getURL(...))` at content-script init. Verify v1 behavior is unchanged.

**Phase 2 — Real per-model data**
Fill in the config with the sourced numbers from §2/§3 for at least: Claude Haiku 4.5 / Sonnet 5 / Opus 4.8, GPT-5 / GPT-5.4, Gemini 3 Flash / 3.1 Pro, DeepSeek V3 / V4 Flash. Add `methodologyTag` + `sourceUrl` per entry.

**Phase 3 — Model detection per site**
Implement DOM-based model-name detection in each adapter, map detected string → config key, fallback to a per-site default. This is the highest-effort, highest-risk phase — do Claude and ChatGPT first (better DOM stability), Gemini/DeepSeek after.

**Phase 4 — Card UI rework**
Add input/output token breakdown, input/output cost breakdown, methodology tooltip with source link, and resolve FR6 (glass-fill scaling decision).

**Phase 5 — Popup rework**
Per-model breakdown, keep per-site totals as a secondary view (tab or collapsible section).

**Phase 6 — Polish + packaging**
Icon/store listing assets, privacy-practice write-up for Chrome Web Store review, README update, changelog.

---

## 6. Continuation Prompt (paste this into the next session — Claude Code recommended for this phase)

```
I'm continuing work on a Chrome extension called "AI Water Meter" (MV3). The
existing v1 code is in the ai-water-meter/ folder (manifest.json,
content/core.js, content/{chatgpt,claude,gemini,deepseek}.js,
content/styles.css, popup/). It currently shows a dark card under every AI
response with an animated glass-fill icon, using a flat "tier" system
(small/medium/large) for water and cost estimates.

Goal for this session: implement Phase 1 and Phase 2 of the v2 plan below —
extract the tier config into an external, versioned JSON file, and replace
the placeholder numbers with real per-model data.

Do this:

1. Create /content/models.config.json with a top-level `lastVerified` date
   and a `models` object keyed by model id. For each of these models, include
   provider, displayName, inputPricePerMTok, outputPricePerMTok,
   waterMlPerOutputMTok, energyWhPerOutputMTok, methodologyTag ("google-
   comprehensive" | "public-estimate" | "vendor-blog"), and sourceUrl:
     - claude-haiku-4-5, claude-sonnet-5, claude-opus-4-8 (Anthropic)
     - gpt-5, gpt-5-4 (OpenAI)
     - gemini-3-flash, gemini-3-1-pro (Google)
     - deepseek-v3, deepseek-v4-flash (DeepSeek)
   Use these sourced figures as your starting point (verify/refresh via web
   search if anything looks stale — pricing moves fast):
     - Google Gemini median text prompt (comprehensive methodology, Aug 2025
       technical paper): 0.24 Wh, 0.26 mL water. Use this as the
       "google-comprehensive" basis and scale by output token count
       proportionally (the paper's figure is for a "median" prompt of
       unspecified but roughly typical length — treat ~500-700 output
       tokens as the baseline to scale from, and note this assumption in a
       comment).
     - Older, pre-2025 public estimates commonly cited ~45-50 mL per prompt
       with no vendor methodology — use as the "public-estimate" basis for
       whichever models don't have a vendor disclosure (i.e. everything
       except Gemini).
     - Pricing table is in the PRD doc (section 3) — pull current numbers,
       flag anything that looks like it changed since July 2026.

2. Update content/core.js to fetch and cache this JSON at init
   (chrome.runtime.getURL + fetch), replace the TIERS object and calc()
   function to look up by model id instead of a flat tier string, and add a
   fallback default model per site if lookup fails. Keep the public API
   shape of window.AIWaterMeter roughly compatible so the site adapters need
   minimal changes in this phase (adapters can still pass a hardcoded
   default model id for now — model *detection* is Phase 3, not this
   session).

3. Update manifest.json's web_accessible_resources so content scripts are
   allowed to fetch models.config.json bundled in the extension.

4. Don't touch model-detection logic, the card UI, or the popup yet — that's
   Phase 3/4/5. Keep this session scoped to config extraction + real data so
   it's easy to verify nothing broke before moving on.

5. After implementing, tell me exactly what to click-test in chrome://extensions
   to confirm Phase 1+2 works (reload steps, which site to test on, what
   numbers to sanity-check).

Full PRD with grounding data, decisions log, and remaining phases (3-6) is
in ai-water-meter-v2-prd.md — read it first for context on FR1-FR9 and the
open questions in section 4.9, especially the water-methodology default
decision (FR6) since Phase 4 will need it, even though it's out of scope for
this session.
```

---

## 7. Decisions still needed from you before Phase 3+

Quick-answer these when you're ready to continue (they gate later phases, not Phase 1-2):

1. **Glass-fill default methodology** — playful (~45mL/prompt, glass fills visibly) vs accurate (~0.26mL/prompt, Google-basis, glass barely moves) as the default, with a toggle for the other?
2. **Remote config vs bundled-only** — worth setting up a small hosted JSON you can update without republishing the extension, or is re-publishing on pricing changes acceptable?
3. **Publish target** — just for yourself/friends (stay unpacked) or Chrome Web Store (adds packaging/privacy-listing work in Phase 6)?

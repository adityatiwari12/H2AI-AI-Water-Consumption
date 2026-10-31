# AI Water Meter — Model Impact Spec

**Status:** proposed, not yet implemented
**Date:** August 30, 2026
**Extends:** `popup/popup.js`, `popup/popup.html`, `popup/popup.css` (the existing "By Model" tab and its `awm_lifetime_model_<modelId>` storage rows)

---

## 1. Why

The popup already tracks lifetime totals per model (`awm_lifetime_model_<modelId>`,
written by `addTotalsUnqueued()` in `content/core.js`) and lists them under a
"By Model" tab, sorted by raw lifetime water. That's a ledger, not a
decision tool: a model used twice shows a tiny total next to one used 200
times, so nothing in the current view actually answers "which model should
I reach for." This spec turns the same stored data into a comparison —
**Model Impact** — that ranks models by *rate*, not accumulated volume, and
surfaces the winners directly.

No new measurement and no new storage field is required. Every number this
feature needs (`waterMl`, `energyWh`, `costUsd`, `count`) is already written
per model by `addTotal()`'s generic spread over `calcResult`. This is a
popup-only, read-and-render feature.

## 2. Metric: per-response average, not lifetime total

Each model row derives three rates from its existing lifetime total:

```
avgWaterMl  = lifetime.waterMl  / lifetime.count
avgEnergyWh = lifetime.energyWh / lifetime.count
avgCostUsd  = lifetime.costUsd  / lifetime.count
```

This is the number the user's sketch ("GPT-5 3.0mL 2.7Wh $0.0008") is
actually shaped like — a typical single response, not a running total.
Lifetime totals remain visible (see §4) but are not what ranks the models.

## 3. Qualifying for comparison

Two guards keep the ranking honest:

- **Minimum sample size: `count >= 3`.** A model tried once on a two-word
  prompt would otherwise "win" every category by accident. Models below the
  threshold still appear in the table (so the user can see they exist) but
  are excluded from ranking and from the insight badges, with a muted
  "need `N` more to rank" note in place of a badge-eligible state.
- **Exclude fallback entries.** Rows whose `modelId` is `"fallback"` or
  `"fallback-media"` (`content/core.js`'s `FALLBACK_MODEL`/
  `FALLBACK_MEDIA_MODEL`, used when a site's model picker wasn't detected)
  are never ranked — they're an unknown blend of whatever model actually
  answered, not a real comparison point. They still list in the table under
  their existing "estimated model" treatment.

If fewer than 2 models qualify after both guards, the insight badges are
replaced with a single dim line: "Use 2+ models to see rankings" — no
badges half-render on a 1-model account.

## 4. UI changes

### 4.1 "By Model" tab becomes "Model Impact"

Same tab strip position (`awm-popup-tabs`), relabeled. Layout, top to
bottom:

1. **Insight badges** — up to three pills, one each for lowest `avgWaterMl`,
   lowest `avgEnergyWh`, lowest `avgCostUsd`, computed independently (a
   single model can sweep all three, or three different models can each win
   one — no forced diversity). Each badge shows the winning model's provider
   badge icon (`providerBadgeHtml()`, already exists) + display name + the
   category label ("Most water efficient" / "Lowest energy" / "Lowest
   cost"). Omitted entirely per §3 when fewer than 2 models qualify.
2. **Table**, one row per stored model (qualifying or not), columns Water /
   Energy / Cost showing the per-response average from §2, plus the
   existing count badge. Sort order: descending `avgWaterMl` among
   qualifying rows, non-qualifying rows pinned to the bottom (still visible,
   just not competing) — keeps the extension's water-first framing as the
   primary sort without hiding data.

Reuses `awm-popup-site-row` for each table row (same structure the current
list already uses — badge, name, provider sub-label, right-aligned stats,
chevron) so no new row-level CSS is needed. The stats column grows from
`${water} · ${cost}` to `${water} · ${energy} · ${cost}`, matching the
`awm-popup-site-stats` single-line style already used by the "By Site" tab
count parenthetical.

New CSS only for the insight badges: a small pill using the same palette
`.awm-popup-stat` already establishes (white card, `#e7ebf2` border,
`#2f7fed` accent) — not a new visual language, a smaller variant of the
existing stat-card pattern sized to sit three-across above the table.

### 4.2 Formatting

`popup.js` needs a `fmtWh()` matching `core.js`'s existing implementation
(`< 1000 Wh` → `"X.XX Wh"`, `>= 1000` → `"X.XX kWh"`) — `popup.js` doesn't
load `core.js` (it's a separate popup-page script, not a content script) so
this is a small duplicated helper, same as `fmtMl`/`fmtUsd` already are
today.

### 4.3 What's unchanged

- "By Site" tab: untouched.
- Lifetime hero numbers (total water/cost/chats) at the top of the popup:
  untouched — those already aggregate across all models via the per-site
  keys, not the per-model keys this feature reads.
- Reset button: untouched: it already clears every `awm_`-prefixed key,
  `awm_lifetime_model_*` included.

## 5. Data flow

No changes to `content/core.js`, `content/*.js` adapters, or
`models.config.json`. `renderModelBreakdown()` in `popup/popup.js` is the
only function that changes shape:

```
read awm_lifetime_model_* (unchanged read)
  -> compute avgWaterMl/avgEnergyWh/avgCostUsd per row (NEW, pure derivation)
  -> partition into qualifying / non-qualifying (NEW, count >= 3 && not fallback)
  -> render badges from qualifying set's per-category argmin (NEW)
  -> render table: qualifying rows sorted by avgWaterMl desc, then
     non-qualifying rows (NEW sort; current code sorts all rows by raw
     lifetime waterMl)
```

## 6. Explicitly out of scope

- **Carbon column.** `methodology-engine-spec.md` (this repo, proposed
  separately) adds a `carbonG` field to `calcResult`. Once that lands, a
  fourth Model Impact column and a fourth "Lowest carbon" badge are a
  natural follow-up — but this spec doesn't depend on or block on that
  work, and doesn't add a column for data that doesn't exist yet.
- **Per-token or per-1K-token normalization.** Per-response average was
  chosen because it answers "what does my next message on this model cost
  me," the question the badges are for. A token-normalized view answers a
  different question (raw model efficiency independent of how verbose a
  user's own prompts run) and isn't needed for this feature's goal.
- **Cross-session or time-windowed comparison** (e.g. "this week"). Only
  lifetime totals exist in storage today; adding a time-series would be a
  storage-schema change, not a popup-rendering one — separate spec if ever
  wanted.
- **Model-family grouping** (e.g. merging multiple dated snapshots of "the
  same" model into one row). Out of scope — one row per stored `modelId`,
  matching current behavior exactly.

## 7. Testing

- Existing Playwright suite (`test/run.js`, `test/fixtures/*.html`,
  `test/build-test-extension.js`) exercises content-script card creation,
  not the popup — unaffected, must still pass unchanged.
- No automated popup test exists today (per this repo's `CLAUDE.md`,
  verification is manual/in-browser). Manual check: load the extension,
  generate at least 3 responses each on 2+ different models (e.g. switch
  models on the same site, or use two sites), open the popup, confirm:
  - "Model Impact" tab shows badges for all three categories once both
    models clear the 3-response threshold, and shows the "need N more"
    state before that.
  - A single-model account (or a fresh install with <2 qualifying models)
    shows the "Use 2+ models to see rankings" line instead of badges.
  - Reset still clears the tab back to empty state.

## 8. Open items for the implementation plan

- Exact badge pill visual spec (padding/corner-radius/icon size) — left to
  implementation to match `.awm-popup-stat`'s existing proportions rather
  than dictated here.
- Whether ties (two models with identical `avgWaterMl` to the displayed
  precision) need explicit tie-breaking beyond "first encountered in
  storage iteration order" — low-stakes, not resolved here.

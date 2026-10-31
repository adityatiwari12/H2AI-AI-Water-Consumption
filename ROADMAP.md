# H2AI Roadmap

A living spec for future development, split by priority. This isn't a
promise of a timeline — it's a shared reference so contributors (human or
AI-assisted) know what's next and why, instead of guessing from the issue
tracker alone. Update it in the same PR as the work it describes, not
after the fact.

See [`README.md`](ai-water-meter/README.md) for how the extension works
today and [`CONTRIBUTING.md`](CONTRIBUTING.md) for how to submit a change.

## P0 — data correctness (time-sensitive, no live-DOM access needed)

These don't require inspecting a live, logged-in site — they're pure data
or logic fixes, which makes them the fastest wins available.

- **Claude Sonnet 5 pricing rollover** ([#4](https://github.com/adityatiwari12/H2AI-AI-Water-Consumption/issues/4)) —
  the intro rate ($2/$10 per MTok) expires 2026-08-31; `models.config.json`
  needs the standard $3/$15 rate applied the moment it does, or every
  Sonnet 5 card under-prices by 33%.
- **DeepSeek default-model deprecation** ([#5](https://github.com/adityatiwari12/H2AI-AI-Water-Consumption/issues/5)) —
  DeepSeek's own deprecation date for the V3-era API models (2026-07-24) has
  passed; confirm what replaced them and update `DEFAULT_MODEL` in
  `content/deepseek.js` accordingly.
- **A recurring freshness check** — every entry in `models.config.json`
  carries a `verified` field, but nothing currently prompts anyone to
  re-check it. Worth adding a lightweight process (even just a checklist
  item in a recurring issue, or a script that flags entries whose
  `verified` date is >60 days old) so pricing drift like the two items
  above gets caught before a user-filed bug, not after.

## P1 — live-site selector verification (needs a logged-in browser session)

The single highest-value, lowest-context-required contribution category —
see `CONTRIBUTING.md`'s "highest-value contribution" section. None of these
are fixable from reading the code; they need someone to open the real site
and paste back a DOM snippet.

- **Gemini: card never appears** ([#1](https://github.com/adityatiwari12/H2AI-AI-Water-Consumption/issues/1),
  open, `help wanted`) — `ASSISTANT_SELECTOR`, `MODEL_PICKER_SELECTORS`, and
  `CONTENT_DETECTORS` in `content/gemini.js` are all unverified guesses.
  Gemini is flagged in the README as the highest-risk site for exactly
  this reason.
- **DeepSeek selector audit** — bundled into #5 above, since DeepSeek is
  the other site called out as high-risk (hashed/versioned class names).
- **Ongoing**: ChatGPT and Claude's selectors are comparatively more
  stable (`data-message-author-role`, `data-testid`) but not immune —
  re-verify opportunistically whenever a card stops appearing.

## P2 — product surface gaps

Carried over from the README's "Ideas for v4" section, expanded with
implementation notes:

- **Settings page** to edit `models.config.json` from the popup instead of
  hand-editing the file. Would need: a schema-validated form (no build
  step, so likely hand-rolled validation against the shape documented in
  the README's "models.config.json schema" section), and a decision on
  whether edits persist to `chrome.storage.local` as an override layer or
  actually rewrite the bundled file (the latter isn't possible for an
  unpacked/store-installed extension — likely an override layer merged
  on top of the bundled config in `core.js`'s `configReady` fetch).
- **Per-model breakdown for the session total**, not just lifetime. Today
  `popup.js`'s model tab only reads `awm_lifetime_model_<modelId>` keys.
  Would need a parallel `awm_session_model_<modelId>` key written in
  `core.js`'s `addTotalsUnqueued()`, reset on... a definition of "session"
  that doesn't exist cleanly yet either (see below).
- **Export session data as CSV** — straightforward once the above exists;
  a button in the popup that serializes the current `awm_session_*` /
  `awm_session_model_*` totals to a downloadable CSV via a data URI (no
  new permissions needed).
- **Weekly summary notification** — would need the `notifications`
  permission (currently the extension only requests `storage`), plus a
  `chrome.alarms`-driven check in `background.js`. Worth scoping carefully
  against the "Privacy stays absolute" ground rule in `CONTRIBUTING.md` —
  a notification body summarizing totals is fine since it's derived from
  local storage only, but this is the first feature that would touch
  `background.js` beyond its current one-listener scope, so it deserves
  its own design pass before implementation.

## P3 — architecture-level options

Bigger changes that trade off against the project's current constraints
(no build step, no outbound network requests) — worth a discussion before
a PR, not just an implementation.

- **Remote-hosted `models.config.json` option** (see
  `ai-water-meter-v2-prd.md` §4.9, open question 2) — would let pricing/water
  updates ship without republishing the extension, at the cost of the
  current "zero outbound network requests" privacy guarantee. If pursued,
  it should be opt-in and clearly disclosed, not a silent default — this is
  the one roadmap item that cuts against a `CONTRIBUTING.md` ground rule as
  currently written, so it needs that rule amended deliberately, not routed
  around.
- **A new site adapter** (e.g. a fifth supported chat product) — the shape
  is already documented in `CONTRIBUTING.md`; the actual work is selector
  discovery (P1-style) plus a `models.config.json` entry for whatever model
  the new site serves.

## Out of scope (deliberately)

- Anything that would require the extension to send prompt or response
  text off the user's machine. Not a roadmap item — a hard constraint.
- Presenting any water/energy/cost figure as measured rather than
  estimated. The (i) tooltip disclosure and `core.js`'s honesty comment are
  non-negotiable per `CLAUDE.md` and `CONTRIBUTING.md` alike.

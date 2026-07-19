/**
 * AI Water Meter — shared core
 *
 * IMPORTANT HONESTY NOTE:
 * No AI provider (OpenAI, Anthropic, Google, DeepSeek) publishes real,
 * per-query water or energy figures for every model. Numbers here come from
 * content/models.config.json — a mix of Google's own disclosed comprehensive
 * methodology (Gemini only) and derived/scaled estimates for everyone else.
 * Every model entry carries a methodologyTag + sourceUrl, and the card's (i)
 * tooltip states which basis is in play. Don't strip that.
 */
(function () {
  if (window.__aiWaterMeterCore) return; // avoid double-injection
  window.__aiWaterMeterCore = true;

  // ---- config loading -------------------------------------------------------
  // Old flat TIERS (small/medium/large) is gone as of v2 — replaced by a
  // per-model config fetched from the bundled JSON (see manifest.json's
  // web_accessible_resources). Kept as a last-resort fallback in case the
  // fetch fails for any reason (e.g. extension update mid-flight).
  const FALLBACK_MODEL = {
    provider: "unknown",
    displayName: "Unknown model",
    inputPricePerMTok: 1.0,
    outputPricePerMTok: 5.0,
    waterMlPerOutputMTok: 18000,
    energyWhPerOutputMTok: 16000,
    methodologyTag: "public-estimate",
    sourceUrl: "https://cloud.google.com/blog/products/infrastructure/measuring-the-environmental-impact-of-ai-inference",
  };

  // Playful mode ignores per-model config and uses this single, flat,
  // widely-cited pre-2025 public estimate (~45mL per 1000 output tokens) for
  // every model — see FR6 in the PRD. It exists to keep the glass-fill
  // animation visually meaningful and to match the "meme" numbers people
  // expect from the original viral screenshot format, at the cost of losing
  // per-model differentiation.
  const PLAYFUL_WATER_ML_PER_OUTPUT_MTOK = 45000;

  // Media (image/video) generation has no per-token concept of its own —
  // each mediaModels entry converts its unit (1 image, 1 second of video) to
  // an output-token equivalent and borrows an existing text model's water/
  // energy rate via referenceModelId. See content/models.config.json's
  // _meta.waterEnergyMethodology.mediaModels for the full explanation.
  const FALLBACK_MEDIA_MODEL = {
    provider: "unknown",
    displayName: "Unknown media model",
    mediaType: "image",
    unit: "image",
    pricePerUnit: 0.04,
    tokenEquivalentPerUnit: 3000,
    tokenEquivalentSource: "price-derived",
    referenceModelId: "fallback",
    sourceUrl: "https://cloud.google.com/blog/products/infrastructure/measuring-the-environmental-impact-of-ai-inference",
  };

  // Deep-Research-style modes run many hidden tool calls before producing a
  // final answer; only the final text is visible to a content script. This
  // multiplier is applied to visible output tokens as a rough proxy for that
  // invisible work — see _meta.waterEnergyMethodology.researchMode for the
  // real cost breakdown this was derived from.
  const FALLBACK_RESEARCH_MODE = { defaultMultiplier: 4 };

  let MODELS = {};
  let MEDIA_MODELS = {};
  let RESEARCH_MODE = FALLBACK_RESEARCH_MODE;
  const configReady = (async () => {
    try {
      const url = chrome.runtime.getURL("content/models.config.json");
      const res = await fetch(url);
      const data = await res.json();
      MODELS = data.models || {};
      MEDIA_MODELS = data.mediaModels || {};
      RESEARCH_MODE = data.researchMode || FALLBACK_RESEARCH_MODE;
    } catch (err) {
      console.warn("[AI Water Meter] failed to load models.config.json, using fallback model only", err);
      MODELS = {};
      MEDIA_MODELS = {};
      RESEARCH_MODE = FALLBACK_RESEARCH_MODE;
    }
  })();

  function lookupModel(modelId) {
    return MODELS[modelId] || FALLBACK_MODEL;
  }

  function lookupMediaModel(mediaModelId) {
    return MEDIA_MODELS[mediaModelId] || FALLBACK_MEDIA_MODEL;
  }

  // ---- token + calc engine ---------------------------------------------------
  function estimateTokens(text) {
    if (!text) return 0;
    const trimmed = text.trim();
    if (!trimmed) return 0;
    // ~4 chars/token is the standard rough heuristic for English text.
    return Math.max(1, Math.round(trimmed.length / 4));
  }

  // contentType: "text" (default) | "artifact" | "image" | "video" | "research"
  // options.mediaModelId + options.unitCount are used for image/video (1
  // image, or N seconds of video). "research" applies RESEARCH_MODE's
  // multiplier to a normal text response. "artifact" is just a label — the
  // adapter is expected to have already concatenated chat + canvas/artifact
  // panel text into responseText before calling calc().
  async function calc(responseText, promptText, modelId, options = {}) {
    await configReady;
    const contentType = options.contentType || "text";
    const inTokens = estimateTokens(promptText);

    if (contentType === "image" || contentType === "video") {
      const media = lookupMediaModel(options.mediaModelId);
      const resolvedModelId = MEDIA_MODELS[options.mediaModelId] ? options.mediaModelId : "fallback-media";
      const unitCount = options.unitCount || 1;
      const refModel = lookupModel(media.referenceModelId);
      const outTokens = media.tokenEquivalentPerUnit * unitCount; // token-equivalent, not real generation tokens

      const costInUsd = (inTokens / 1e6) * refModel.inputPricePerMTok;
      const costOutUsd = media.pricePerUnit * unitCount; // real vendor price, not token-derived
      const costUsd = costInUsd + costOutUsd;

      const energyWh = (outTokens / 1e6) * refModel.energyWhPerOutputMTok;
      const waterMlAccurate = (outTokens / 1e6) * refModel.waterMlPerOutputMTok;
      const waterMlPlayful = (outTokens / 1e6) * PLAYFUL_WATER_ML_PER_OUTPUT_MTOK;

      return {
        modelId: resolvedModelId,
        modelDisplayName: media.displayName,
        provider: media.provider,
        contentType,
        unit: media.unit,
        unitCount,
        tokenEquivalentSource: media.tokenEquivalentSource,
        referenceModelDisplayName: refModel.displayName,
        inTokens,
        outTokens,
        costInUsd,
        costOutUsd,
        costUsd,
        energyWh,
        waterMlAccurate,
        waterMlPlayful,
        methodologyTag: refModel.methodologyTag,
        sourceUrl: media.sourceUrl,
      };
    }

    const model = lookupModel(modelId);
    const resolvedModelId = MODELS[modelId] ? modelId : "fallback";
    const outTokens = estimateTokens(responseText);

    const researchMultiplier = contentType === "research" ? RESEARCH_MODE.defaultMultiplier || 1 : 1;
    const effectiveOutTokens = outTokens * researchMultiplier;

    const costInUsd = (inTokens / 1e6) * model.inputPricePerMTok;
    const costOutUsd = (effectiveOutTokens / 1e6) * model.outputPricePerMTok;
    const costUsd = costInUsd + costOutUsd;

    const energyWh = (effectiveOutTokens / 1e6) * model.energyWhPerOutputMTok;
    const waterMlAccurate = (effectiveOutTokens / 1e6) * model.waterMlPerOutputMTok;
    const waterMlPlayful = (effectiveOutTokens / 1e6) * PLAYFUL_WATER_ML_PER_OUTPUT_MTOK;

    return {
      modelId: resolvedModelId,
      modelDisplayName: model.displayName,
      provider: model.provider,
      contentType,
      researchMultiplier,
      inTokens,
      outTokens, // visible/measured tokens (not multiplied) — used for display
      costInUsd,
      costOutUsd,
      costUsd,
      energyWh,
      waterMlAccurate,
      waterMlPlayful,
      methodologyTag: model.methodologyTag,
      sourceUrl: model.sourceUrl,
    };
  }

  // ---- water display mode (playful / accurate) -------------------------------
  const WATER_MODE_KEY = "awm_water_mode";

  async function getWaterMode() {
    const data = await chrome.storage.local.get([WATER_MODE_KEY]);
    return data[WATER_MODE_KEY] === "accurate" ? "accurate" : "playful";
  }

  async function setWaterMode(mode) {
    const value = mode === "accurate" ? "accurate" : "playful";
    await chrome.storage.local.set({ [WATER_MODE_KEY]: value });
    return value;
  }

  function displayWaterMl(calcResult, mode) {
    return mode === "accurate" ? calcResult.waterMlAccurate : calcResult.waterMlPlayful;
  }

  // ---- persistence ------------------------------------------------------------
  // Storage always accumulates the *accurate* per-model water figure, not the
  // mode-dependent display number — otherwise flipping the playful/accurate
  // toggle would make lifetime totals jump discontinuously. The toggle only
  // affects what a given card's mainstat/bar shows for its own response.
  function sessionKey(site) {
    return `awm_session_${site}`;
  }
  function lifetimeKey(site) {
    return `awm_lifetime_${site}`;
  }
  function modelLifetimeKey(modelId) {
    return `awm_lifetime_model_${modelId}`;
  }

  const EMPTY_TOTAL = { waterMl: 0, costUsd: 0, costInUsd: 0, costOutUsd: 0, energyWh: 0, inTokens: 0, outTokens: 0, count: 0 };

  function addTotal(total, calcResult) {
    return {
      waterMl: (total.waterMl || 0) + calcResult.waterMlAccurate,
      costUsd: (total.costUsd || 0) + calcResult.costUsd,
      costInUsd: (total.costInUsd || 0) + calcResult.costInUsd,
      costOutUsd: (total.costOutUsd || 0) + calcResult.costOutUsd,
      energyWh: (total.energyWh || 0) + calcResult.energyWh,
      inTokens: (total.inTokens || 0) + calcResult.inTokens,
      outTokens: (total.outTokens || 0) + calcResult.outTokens,
      count: (total.count || 0) + 1,
    };
  }

  async function getTotals(site) {
    const sKey = sessionKey(site);
    const lKey = lifetimeKey(site);
    const data = await chrome.storage.local.get([sKey, lKey]);
    return {
      session: { ...EMPTY_TOTAL, ...(data[sKey] || {}) },
      lifetime: { ...EMPTY_TOTAL, ...(data[lKey] || {}) },
    };
  }

  async function addTotals(site, calcResult) {
    const { session, lifetime } = await getTotals(site);
    const nextSession = addTotal(session, calcResult);
    const nextLifetime = addTotal(lifetime, calcResult);

    const mKey = modelLifetimeKey(calcResult.modelId);
    const modelData = await chrome.storage.local.get([mKey]);
    const modelTotal = { ...EMPTY_TOTAL, ...(modelData[mKey] || {}) };
    const nextModelTotal = addTotal(modelTotal, calcResult);
    nextModelTotal.displayName = calcResult.modelDisplayName;
    nextModelTotal.provider = calcResult.provider;

    await chrome.storage.local.set({
      [sessionKey(site)]: nextSession,
      [lifetimeKey(site)]: nextLifetime,
      [mKey]: nextModelTotal,
    });
    return { session: nextSession, lifetime: nextLifetime };
  }

  // ---- icon rendering ---------------------------------------------------
  const GLASS_ML = 250;              // 1 "glass" icon = 250ml
  const GLASSES_PER_BUCKET = 10;     // 10 glasses -> switch to bucket icon
  const BUCKET_ML = GLASS_ML * GLASSES_PER_BUCKET; // 2500ml per bucket
  const BUCKETS_PER_DRUM = 10;       // 10 buckets -> switch to drum icon (25L)
  const DRUM_ML = BUCKET_ML * BUCKETS_PER_DRUM;

  function iconFor(totalMl) {
    if (totalMl >= DRUM_ML * 0.999) return "drum";
    if (totalMl >= BUCKET_ML * 0.999) return "bucket";
    return "glass";
  }

  function glassSVG(fillPercent) {
    const p = Math.max(0, Math.min(100, fillPercent));
    const topY = 10 + (66 * (100 - p)) / 100; // glass body spans y=10..76
    return `<svg viewBox="0 0 60 84" class="awm-glass-svg">
      <defs>
        <clipPath id="awmClip"><rect x="0" y="${topY}" width="60" height="84"/></clipPath>
      </defs>
      <path d="M12 10 L48 10 L42 74 Q30 80 18 74 Z" fill="none" stroke="#5b6270" stroke-width="2.5"/>
      <path d="M12 10 L48 10 L42 74 Q30 80 18 74 Z" fill="url(#awmWaterGrad)" clip-path="url(#awmClip)"/>
      <linearGradient id="awmWaterGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#6cc4f5"/>
        <stop offset="100%" stop-color="#2f8fd8"/>
      </linearGradient>
    </svg>`;
  }

  function bucketSVG(fillPercent) {
    const p = Math.max(0, Math.min(100, fillPercent));
    const topY = 18 + (56 * (100 - p)) / 100;
    return `<svg viewBox="0 0 60 84" class="awm-glass-svg">
      <defs>
        <clipPath id="awmClipB"><rect x="0" y="${topY}" width="60" height="84"/></clipPath>
      </defs>
      <path d="M10 22 L50 22 L44 76 Q30 82 16 76 Z" fill="none" stroke="#5b6270" stroke-width="2.5"/>
      <path d="M10 22 L50 22 L44 76 Q30 82 16 76 Z" fill="url(#awmWaterGrad2)" clip-path="url(#awmClipB)"/>
      <path d="M16 24 Q30 8 44 24" fill="none" stroke="#5b6270" stroke-width="3"/>
      <linearGradient id="awmWaterGrad2" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#6cc4f5"/>
        <stop offset="100%" stop-color="#2f8fd8"/>
      </linearGradient>
    </svg>`;
  }

  function drumSVG() {
    return `<svg viewBox="0 0 60 84" class="awm-glass-svg">
      <rect x="10" y="14" width="40" height="62" rx="4" fill="#2f8fd8" stroke="#5b6270" stroke-width="2.5"/>
      <ellipse cx="30" cy="14" rx="20" ry="6" fill="#6cc4f5" stroke="#5b6270" stroke-width="2.5"/>
      <rect x="10" y="40" width="40" height="6" fill="#1f6ba8"/>
    </svg>`;
  }

  function renderIcon(kind, fillPercent) {
    if (kind === "drum") return drumSVG();
    if (kind === "bucket") return bucketSVG(fillPercent);
    return glassSVG(fillPercent);
  }

  function fmtMl(ml) {
    if (ml >= 1000) return `${(ml / 1000).toFixed(2)} L`;
    if (ml >= 1) return `${ml.toFixed(1)} mL`;
    return `${ml.toFixed(3)} mL`;
  }

  function fmtUsd(usd) {
    return `$${usd.toFixed(4)}`;
  }

  function fmtWh(wh) {
    if (wh >= 1000) return `${(wh / 1000).toFixed(2)} kWh`;
    return `${wh.toFixed(2)} Wh`;
  }

  const METHODOLOGY_LABELS = {
    "google-comprehensive": "Google comprehensive (full serving stack)",
    "public-estimate": "public estimate (no vendor methodology)",
    "vendor-blog": "vendor blog figure",
  };

  const SUBTITLE_BY_CONTENT_TYPE = {
    text: "Water used in this response",
    artifact: "Water used in this response (chat + canvas/artifact combined)",
    image: "Water used to generate this image",
    video: "Water used to generate this video",
    research: "Water used for this research response",
  };

  const CONTENT_TYPE_TAG_LABEL = {
    artifact: "canvas/artifact",
    image: "image",
    video: "video",
    research: "research",
  };

  function buildTooltipText(calcResult, mode) {
    const methodologyLabel = METHODOLOGY_LABELS[calcResult.methodologyTag] || calcResult.methodologyTag;

    if (calcResult.contentType === "image" || calcResult.contentType === "video") {
      const unitLabel = calcResult.unitCount > 1 ? `${calcResult.unitCount} ${calcResult.unit}s` : `1 ${calcResult.unit}`;
      const equivSource =
        calcResult.tokenEquivalentSource === "vendor-tokenized"
          ? "the provider's own published output-token count for this unit"
          : "imputed by dividing this unit's real price by a comparable text model's per-token rate (no vendor token count is published for this media)";
      return `${calcResult.modelDisplayName}: priced for ${unitLabel} at this vendor's real rate. Water/energy has no direct data for image/video generation, so it's estimated via a token-equivalent (${equivSource}) scaled by ${calcResult.referenceModelDisplayName}'s ${methodologyLabel} rate. ${mode === "accurate" ? "Accurate" : "Playful"} mode is applied on top of that, same as text responses.`;
    }

    if (calcResult.contentType === "research") {
      return `Research mode detected: this looks like a multi-step research/deep-search response. Hidden tool calls (web searches, page reads) aren't visible on the page, so output is scaled x${calcResult.researchMultiplier} as a rough proxy, based on a real published cost breakdown for one provider's Deep Research feature, applied uniformly since per-provider data doesn't exist. Not a measurement. ${mode === "accurate" ? "Accurate" : "Playful"} water basis applied on top.`;
    }

    return mode === "accurate"
      ? `Accurate mode: uses ${calcResult.modelDisplayName}'s best-sourced estimate (${methodologyLabel}). No AI provider publishes real per-query figures for every model — some numbers here are derived, not directly measured.`
      : `Playful mode: uses a flat, widely-cited pre-2025 public estimate (~45 mL per 1,000 output tokens) for every model, not ${calcResult.modelDisplayName}-specific data. Switch to Accurate mode in the popup for this model's best sourced estimate.`;
  }

  // ---- card builder -------------------------------------------------------
  async function createCard({ calcResult, session, modelDetected }) {
    const mode = await getWaterMode();
    const waterMl = displayWaterMl(calcResult, mode);
    const contentType = calcResult.contentType || "text";

    const card = document.createElement("div");
    card.className = "awm-card";

    const kind = iconFor(waterMl);
    const targetMl = kind === "bucket" ? BUCKET_ML : kind === "drum" ? DRUM_ML : GLASS_ML;
    const targetPercent = Math.min(100, (waterMl / targetMl) * 100);

    const tooltipText = buildTooltipText(calcResult, mode);
    const subtitle = SUBTITLE_BY_CONTENT_TYPE[contentType] || SUBTITLE_BY_CONTENT_TYPE.text;
    const contentTypeTag = CONTENT_TYPE_TAG_LABEL[contentType]
      ? `<span class="awm-model-badge awm-content-type-badge">${CONTENT_TYPE_TAG_LABEL[contentType]}${contentType === "research" ? ` x${calcResult.researchMultiplier}` : ""}</span>`
      : "";
    const outTokLabel = contentType === "image" || contentType === "video" ? "out-equiv" : "out";

    card.innerHTML = `
      <div class="awm-icon-wrap">${renderIcon(kind, 0)}</div>
      <div class="awm-body">
        <div class="awm-header">
          <span class="awm-title">Water Used</span>
          <span class="awm-header-icons">
            <span class="awm-info" tabindex="0">ⓘ
              <span class="awm-tooltip">
                ${tooltipText}
                <br/><a href="${calcResult.sourceUrl}" target="_blank" rel="noopener noreferrer">Methodology &amp; source ↗</a>
              </span>
            </span>
            <button type="button" class="awm-arrow-btn" title="Open full analysis" aria-label="Open full analysis">↗</button>
          </span>
        </div>
        <div class="awm-model-row">
          <span class="awm-model-name">${calcResult.modelDisplayName}</span>
          ${contentTypeTag}
          ${modelDetected ? "" : '<span class="awm-model-badge" title="Model not detected on this page — using this site\'s default estimate.">estimated model</span>'}
        </div>
        <div class="awm-sub">${subtitle} · ${mode} estimate</div>
        <div class="awm-mainstat">${fmtMl(waterMl)}</div>
        <div class="awm-bar"><div class="awm-bar-fill" style="width:0%"></div></div>
        <div class="awm-row">
          <span class="awm-chip">${calcResult.inTokens} in · ${calcResult.outTokens} ${outTokLabel} tok</span>
          <span class="awm-chip awm-chip-muted">${fmtWh(calcResult.energyWh)}</span>
        </div>
        <div class="awm-row">
          <span class="awm-chip">${fmtUsd(calcResult.costInUsd)} in + ${fmtUsd(calcResult.costOutUsd)} out</span>
        </div>
        <div class="awm-row">
          <span class="awm-chip awm-chip-muted">${fmtMl(session.waterMl)} / ${fmtUsd(session.costUsd)} this session (${session.count})</span>
        </div>
      </div>
    `;

    card.querySelector(".awm-arrow-btn").addEventListener("click", () => {
      if (!chrome.runtime?.id) return; // extension reloaded since this card was created — button is dead until page refresh
      chrome.runtime.sendMessage({ type: "OPEN_ANALYSIS" });
    });

    // animate fill in on next frame
    requestAnimationFrame(() => {
      setTimeout(() => {
        const iconWrap = card.querySelector(".awm-icon-wrap");
        const barFill = card.querySelector(".awm-bar-fill");
        iconWrap.innerHTML = renderIcon(kind, targetPercent);
        iconWrap.classList.add("awm-animate");
        barFill.style.width = `${targetPercent}%`;
      }, 60);
    });

    return card;
  }

  // ---- model detection helper -------------------------------------------
  // Shared by every site adapter: given raw text scraped from a model-picker
  // element (or "" if none was found), try each [regex, modelId] pattern in
  // order and return the first match. This is inherently best-effort — site
  // DOM for model pickers is exactly the kind of thing that changes without
  // notice, see each adapter's own comments for the selectors it tries.
  function detectModelFromText(text, patterns, defaultModelId) {
    const t = (text || "").trim();
    if (t) {
      for (const [regex, modelId] of patterns) {
        if (regex.test(t)) return { modelId, detected: true };
      }
    }
    return { modelId: defaultModelId, detected: false };
  }

  // A document-wide fallback match only counts if it actually has meaningful
  // content — otherwise a stray always-present element (a hidden feature-flag
  // container, an empty template slot) whose id/class loosely matches one of
  // our generic selectors (e.g. "[id*='canvas' i]") would hijack every single
  // response on the page into the wrong content type.
  const MIN_SIDE_PANEL_TEXT_LENGTH = 15;

  // ---- content type detection helper -------------------------------------
  // Shared by every site adapter. Given the assistant turn element, checks
  // (in order) for an image, a video, a canvas/artifact panel, and a
  // research-mode indicator, using the selectors passed in `detectors`
  // (each optional — a site that has no such feature just omits that key).
  // Image/video are checked first since they're scoped to the turn and thus
  // the least likely of the four to false-positive; artifact/research often
  // need a document-wide fallback (the side panel usually isn't a descendant
  // of the turn element) which is inherently riskier.
  // Returns { contentType, mediaEl } — mediaEl is the detected <img>/<video>
  // element when contentType is "image"/"video", else null.
  function detectContentType(turnEl, detectors) {
    if (detectors.videoSelector) {
      const videoEl = turnEl.querySelector(detectors.videoSelector);
      if (videoEl) return { contentType: "video", mediaEl: videoEl, artifactEl: null };
    }
    if (detectors.imageSelector) {
      const imgEl = turnEl.querySelector(detectors.imageSelector);
      if (imgEl) return { contentType: "image", mediaEl: imgEl, artifactEl: null };
    }
    if (detectors.artifactSelector) {
      const artifactEl = turnEl.querySelector(detectors.artifactSelector) || document.querySelector(detectors.artifactSelector);
      if (artifactEl && (artifactEl.innerText || "").trim().length >= MIN_SIDE_PANEL_TEXT_LENGTH) {
        return { contentType: "artifact", mediaEl: null, artifactEl };
      }
    }
    if (detectors.researchSelector) {
      const researchEl = turnEl.querySelector(detectors.researchSelector) || document.querySelector(detectors.researchSelector);
      if (researchEl && (researchEl.innerText || "").trim().length >= MIN_SIDE_PANEL_TEXT_LENGTH) {
        return { contentType: "research", mediaEl: null, artifactEl: null };
      }
    }
    return { contentType: "text", mediaEl: null, artifactEl: null };
  }

  window.AIWaterMeter = {
    calc,
    getTotals,
    addTotals,
    createCard,
    estimateTokens,
    getWaterMode,
    setWaterMode,
    detectModelFromText,
    detectContentType,
    configReady,
  };
})();

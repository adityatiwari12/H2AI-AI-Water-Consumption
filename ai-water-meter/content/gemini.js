(function () {
  const SITE = "gemini";
  const DEFAULT_MODEL = "gemini-3-flash";
  const DEFAULT_IMAGE_MODEL = "imagen-4-standard";
  const DEFAULT_VIDEO_MODEL = "veo-3-1-fast";

  // Gemini's response text lives in a "message-content" style container.
  // Selector guesses first, generic fallback second. Update if the UI shifts.
  const ASSISTANT_SELECTOR = "message-content, .model-response-text, .response-container-content";
  const USER_SELECTOR = "user-query, .query-text";

  // BEST-EFFORT model detection: this is the riskiest of the four sites —
  // Gemini's model switcher (e.g. "Fast" / "Thinking" / a named tier) uses
  // fragile, versioned class names we can't verify without live DOM access.
  // These are reasoned-from-pattern guesses, not confirmed selectors. If
  // detection never fires, that's expected until someone inspects the real
  // page and tightens these.
  const MODEL_PICKER_SELECTORS = [
    '[data-test-id="bard-mode-menu-button"]',
    ".gds-mode-switch-button",
    'button[aria-label*="model" i]',
  ];

  const MODEL_PATTERNS = [
    [/1\.5\s*pro|3\.1\s*pro|\bpro\b/i, "gemini-3-1-pro"],
    [/flash/i, "gemini-3-flash"],
  ];

  function detectModel() {
    for (const sel of MODEL_PICKER_SELECTORS) {
      const el = document.querySelector(sel);
      if (el && el.innerText) {
        return window.AIWaterMeter.detectModelFromText(el.innerText, MODEL_PATTERNS, DEFAULT_MODEL);
      }
    }
    return { modelId: DEFAULT_MODEL, detected: false };
  }

  // BEST-EFFORT content-type detection: none of these selectors have been
  // checked against a live page — Gemini is the highest-risk site for this
  // (see model-detection comment above). Gemini supports image gen (Imagen),
  // video gen (Veo), a Canvas side-panel, and Deep Research, so all four are
  // attempted. If a feature never fires, inspect a real example in devtools
  // and correct the selector.
  const CONTENT_DETECTORS = {
    artifactSelector: '[class*="canvas" i], [data-test-id*="immersive" i]',
    videoSelector: "video",
    imageSelector: 'img[alt*="Generated" i], generated-image img, [class*="generated-image" i] img',
    researchSelector: '[data-test-id*="research" i], [class*="deep-research" i]',
  };

  const processed = new WeakSet();
  const debounceTimers = new WeakMap();

  function findAssistantEls(root) {
    let els = Array.from(root.querySelectorAll?.(ASSISTANT_SELECTOR) || []);
    if (els.length === 0 && root.matches?.(ASSISTANT_SELECTOR)) els = [root];
    return els;
  }

  function getLastUserPromptBefore(el) {
    const userEls = document.querySelectorAll(USER_SELECTOR);
    let promptText = "";
    for (const u of userEls) {
      if (u.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_PRECEDING) break;
      promptText = u.innerText || "";
    }
    return promptText;
  }

  async function handleFinishedMessage(el) {
    if (processed.has(el)) return;
    // If the extension was reloaded/updated in chrome://extensions since
    // this page loaded, this content script instance is orphaned and any
    // chrome.* call below throws "Extension context invalidated" — bail
    // quietly rather than spamming the console (a page refresh fixes it).
    if (!chrome.runtime?.id) return;
    processed.add(el);

    try {
      const rawText = el.innerText || "";
      const promptText = getLastUserPromptBefore(el);
      const { modelId, detected } = detectModel();
      const { contentType, mediaEl, artifactEl } = window.AIWaterMeter.detectContentType(el, CONTENT_DETECTORS);

      let calcResult;
      if (contentType === "video") {
        const durationSec = mediaEl && isFinite(mediaEl.duration) && mediaEl.duration > 0 ? mediaEl.duration : 8;
        calcResult = await window.AIWaterMeter.calc("", promptText, modelId, {
          contentType,
          mediaModelId: DEFAULT_VIDEO_MODEL,
          unitCount: Math.max(1, Math.ceil(durationSec)),
        });
      } else if (contentType === "image") {
        const unitCount = el.querySelectorAll(CONTENT_DETECTORS.imageSelector).length || 1;
        calcResult = await window.AIWaterMeter.calc("", promptText, modelId, {
          contentType,
          mediaModelId: DEFAULT_IMAGE_MODEL,
          unitCount,
        });
      } else {
        const responseText = contentType === "artifact" && artifactEl ? `${rawText}\n${artifactEl.innerText || ""}` : rawText;
        if (!responseText.trim() || responseText.trim().length < 3) {
          // Debounce fired before innerText caught up to the final paint —
          // not a real "empty response". Un-mark so a later mutation gets a
          // real retry instead of a permanent, silent skip.
          processed.delete(el);
          return;
        }
        calcResult = await window.AIWaterMeter.calc(responseText, promptText, modelId, { contentType });
      }

      const { session } = await window.AIWaterMeter.addTotals(SITE, calcResult);
      const card = await window.AIWaterMeter.createCard({
        calcResult,
        session,
        modelDetected: detected,
      });

      el.insertAdjacentElement("afterend", card);
    } catch (err) {
      if (!chrome.runtime?.id || String(err?.message || err).includes("Extension context invalidated")) return;
      console.error("[AI Water Meter]", err);
      processed.delete(el); // transient failure — allow a retry on the next mutation rather than blacklisting this response forever
    }
  }

  function scheduleCheck(el) {
    if (debounceTimers.has(el)) clearTimeout(debounceTimers.get(el));
    const timer = setTimeout(() => handleFinishedMessage(el), 1200);
    debounceTimers.set(el, timer);
  }

  const rootObserver = new MutationObserver((mutations) => {
    for (const m of mutations) {
      m.addedNodes.forEach((node) => {
        if (!(node instanceof HTMLElement)) return;
        findAssistantEls(node).forEach((el) => scheduleCheck(el));
      });
      if (m.target instanceof HTMLElement) {
        findAssistantEls(m.target).forEach((el) => scheduleCheck(el));
      }
    }
  });

  rootObserver.observe(document.body, { childList: true, subtree: true, characterData: true });

  findAssistantEls(document.body).forEach((el) => scheduleCheck(el));
})();

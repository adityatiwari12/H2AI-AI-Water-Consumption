(function () {
  const SITE = "deepseek";
  // NOTE: DeepSeek has scheduled the V3-era API models (deepseek-chat /
  // deepseek-reasoner) for deprecation on 2026-07-24 — if the default below
  // stops matching what deepseek.com actually serves after that date, switch
  // it to "deepseek-v4-flash" (see content/models.config.json's deepseek-v3
  // entry notes).
  const DEFAULT_MODEL = "deepseek-v3";

  // DeepSeek's chat DOM classes are hashed/versioned and change often.
  // We use a generic heuristic here: any markdown-rendered block that
  // appears inside the chat scroll area and isn't the input box.
  // If this misfires, open devtools on a real response and tighten
  // ASSISTANT_SELECTOR to the specific class DeepSeek is using.
  const ASSISTANT_SELECTOR = '.ds-markdown, [class*="markdown"]';

  // BEST-EFFORT model detection: DeepSeek's model toggle (e.g. "DeepSeek-V3"
  // vs a faster/flash variant) uses hashed class names same as everything
  // else on this site — these selectors are reasoned guesses, not verified
  // against a live page.
  const MODEL_PICKER_SELECTORS = [
    '[class*="model-select"]',
    '[class*="ModelSelect"]',
    'button[class*="model"]',
  ];

  const MODEL_PATTERNS = [
    [/flash/i, "deepseek-v4-flash"],
    [/v3|v4/i, "deepseek-v3"],
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

  const processed = new WeakSet();
  const debounceTimers = new WeakMap();

  function findAssistantEls(root) {
    let els = Array.from(root.querySelectorAll?.(ASSISTANT_SELECTOR) || []);
    if (els.length === 0 && root.matches?.(ASSISTANT_SELECTOR)) els = [root];
    return els;
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
      const responseText = el.innerText || "";
      if (!responseText.trim() || responseText.trim().length < 3) {
        // Debounce fired before innerText caught up to the final paint —
        // not a real "empty response". Un-mark so a later mutation gets a
        // real retry instead of a permanent, silent skip.
        processed.delete(el);
        return;
      }

      // DeepSeek prompt text is harder to reliably scope generically, so we
      // pass an empty prompt (input-token cost contribution will read as 0).
      const { modelId, detected } = detectModel();
      const calcResult = await window.AIWaterMeter.calc(responseText, "", modelId);
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
    const timer = setTimeout(() => handleFinishedMessage(el), 1400);
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

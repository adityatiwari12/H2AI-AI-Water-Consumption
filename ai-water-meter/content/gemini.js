(function () {
  const SITE = "gemini";
  const DEFAULT_MODEL = "gemini-3-flash";

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
    processed.add(el);

    const responseText = el.innerText || "";
    if (!responseText.trim() || responseText.trim().length < 3) return;

    const promptText = getLastUserPromptBefore(el);
    const { modelId, detected } = detectModel();
    const calcResult = await window.AIWaterMeter.calc(responseText, promptText, modelId);
    const { session } = await window.AIWaterMeter.addTotals(SITE, calcResult);
    const card = await window.AIWaterMeter.createCard({
      calcResult,
      session,
      modelDetected: detected,
    });

    el.insertAdjacentElement("afterend", card);
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

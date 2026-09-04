(function () {
  const SITE = "claude";
  const DEFAULT_MODEL = "claude-sonnet-5";

  // Claude.ai's DOM changes fairly often between releases. Verified live
  // 2026-09-05: turns are `[data-testid="transcript-row"]` with
  // `data-perf-row="assistant"|"user"` giving role directly; assistant text
  // lives in a `.font-claude-response` div, user text in
  // `[data-testid="user-message"]`. If the card stops appearing after a
  // Claude UI update, inspect a response element in devtools and update
  // these selectors.
  const ASSISTANT_SELECTOR = '[data-testid="transcript-row"][data-perf-row="assistant"] .font-claude-response';
  const USER_SELECTOR = '[data-testid="transcript-row"][data-perf-row="user"] [data-testid="user-message"]';

  // BEST-EFFORT model detection: Claude's model picker is normally a button
  // near the composer showing text like "Claude Sonnet 5" or "Opus 4.8".
  // Selector guesses below, generic fallback (scan for any element with
  // "claude" in its text near the top of the page) after that. Update the
  // selector if this stops matching after a UI change.
  const MODEL_PICKER_SELECTORS = [
    '[data-testid="model-selector-dropdown"]',
    'button[aria-haspopup="menu"][aria-label*="model" i]',
    '[data-testid*="model-selector"]',
  ];

  const MODEL_PATTERNS = [
    [/opus/i, "claude-opus-4-8"],
    [/haiku/i, "claude-haiku-4-5"],
    [/sonnet/i, "claude-sonnet-5"],
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

  // BEST-EFFORT content-type detection: neither selector has been checked
  // against a live page. Claude has no native image/video generation in
  // chat, so only Artifacts (a side-panel document/code view) and Claude's
  // web-search/research mode are detected here. If these never fire,
  // inspect a real Artifact or research response in devtools and correct
  // the selector.
  const CONTENT_DETECTORS = {
    artifactSelector: '[data-testid="artifact"], [data-testid*="artifact" i]',
    researchSelector: '[data-testid*="research" i], [class*="research" i]',
  };

  const processed = new WeakSet();
  const debounceTimers = new WeakMap();

  function findAssistantEls(root) {
    let els = Array.from(root.querySelectorAll(ASSISTANT_SELECTOR));
    if (els.length === 0 && root.matches?.(ASSISTANT_SELECTOR)) els = [root];
    return els;
  }

  function getLastUserPromptBefore(el) {
    const turns = document.querySelectorAll('[data-testid="transcript-row"]');
    let promptText = "";
    const targetTurn = el.closest('[data-testid="transcript-row"]');
    for (const turn of turns) {
      if (turn === targetTurn) break;
      const userMsg = turn.querySelector('[data-testid="user-message"]');
      if (userMsg) promptText = userMsg.innerText || "";
    }
    return promptText;
  }

  async function handleFinishedMessage(el) {
    if (processed.has(el)) return;
    const turn = el.closest('[data-testid="transcript-row"]') || el;
    if (processed.has(turn)) return;
    // If the extension was reloaded/updated in chrome://extensions since
    // this page loaded, this content script instance is orphaned and any
    // chrome.* call below throws "Extension context invalidated" — bail
    // quietly rather than spamming the console (a page refresh fixes it).
    if (!chrome.runtime?.id) return;
    processed.add(el);
    processed.add(turn);

    try {
      const rawText = el.innerText || "";
      if (!rawText.trim() || rawText.trim().length < 3) {
        // Debounce fired before innerText caught up to the final paint —
        // not a real "empty response". Un-mark so a later mutation gets a
        // real retry instead of a permanent, silent skip.
        processed.delete(el);
        processed.delete(turn);
        return;
      }

      const promptText = getLastUserPromptBefore(el);
      const { modelId, detected } = detectModel();
      const { contentType, artifactEl } = window.AIWaterMeter.detectContentType(turn, CONTENT_DETECTORS);
      const responseText = contentType === "artifact" && artifactEl ? `${rawText}\n${artifactEl.innerText || ""}` : rawText;

      const calcResult = await window.AIWaterMeter.calc(responseText, promptText, modelId, { contentType });
      const { session } = await window.AIWaterMeter.addTotals(SITE, calcResult);
      const card = await window.AIWaterMeter.createCard({
        calcResult,
        session,
        modelDetected: detected,
      });

      turn.insertAdjacentElement("afterend", card);
    } catch (err) {
      if (!chrome.runtime?.id || String(err?.message || err).includes("Extension context invalidated")) return;
      console.error("[AI Water Meter]", err);
      processed.delete(el); // transient failure — allow a retry on the next mutation rather than blacklisting this response forever
      processed.delete(turn);
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
        findAssistantEls(m.target.closest('[data-testid="transcript-row"]') || m.target).forEach(
          (el) => scheduleCheck(el)
        );
      }
    }
  });

  rootObserver.observe(document.body, { childList: true, subtree: true, characterData: true });

  findAssistantEls(document.body).forEach((el) => scheduleCheck(el));
})();

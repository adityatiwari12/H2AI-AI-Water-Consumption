(function () {
  const SITE = "chatgpt";
  const DEFAULT_MODEL = "gpt-5";

  // BEST-EFFORT model detection: ChatGPT's model-switcher button usually
  // shows the active model's short label somewhere near the top of the
  // composer (e.g. a button with text like "ChatGPT 5" or "GPT-5.4"). The
  // exact selector changes across releases — we try a couple of known-ish
  // attribute patterns, then fall back to scanning header buttons for
  // recognizable model text. If detection stops working, inspect the model
  // switcher in devtools and update MODEL_PICKER_SELECTORS below.
  const MODEL_PICKER_SELECTORS = [
    '[data-testid="model-switcher-dropdown-button"]',
    'button[aria-label*="Model" i]',
    '[data-testid*="model-switcher"]',
  ];

  const MODEL_PATTERNS = [
    [/5\.4/i, "gpt-5-4"],
    [/\b5\b/i, "gpt-5"],
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

  function getLastUserPromptBefore(el) {
    const allTurns = document.querySelectorAll(
      '[data-message-author-role="user"], [data-message-author-role="assistant"]'
    );
    let promptText = "";
    for (const turn of allTurns) {
      if (turn === el) break;
      if (turn.getAttribute("data-message-author-role") === "user") {
        promptText = turn.innerText || "";
      }
    }
    return promptText;
  }

  async function handleFinishedMessage(el) {
    if (processed.has(el)) return;
    processed.add(el);

    const responseText = el.innerText || "";
    if (!responseText.trim()) return;

    const promptText = getLastUserPromptBefore(el);
    const { modelId, detected } = detectModel();
    const calcResult = await window.AIWaterMeter.calc(responseText, promptText, modelId);
    const { session } = await window.AIWaterMeter.addTotals(SITE, calcResult);
    const card = await window.AIWaterMeter.createCard({
      calcResult,
      session,
      modelDetected: detected,
    });

    // Insert after the assistant turn's outer article container if possible.
    const container = el.closest("article") || el;
    container.insertAdjacentElement("afterend", card);
  }

  function scheduleCheck(el) {
    // Debounce: wait for the DOM to stop changing (streaming finished) before
    // reading final text. Reset the timer on every mutation inside the turn.
    if (debounceTimers.has(el)) clearTimeout(debounceTimers.get(el));
    const timer = setTimeout(() => handleFinishedMessage(el), 1200);
    debounceTimers.set(el, timer);
  }

  const rootObserver = new MutationObserver((mutations) => {
    for (const m of mutations) {
      m.addedNodes.forEach((node) => {
        if (!(node instanceof HTMLElement)) return;
        const candidates = node.matches?.('[data-message-author-role="assistant"]')
          ? [node]
          : Array.from(node.querySelectorAll?.('[data-message-author-role="assistant"]') || []);
        candidates.forEach((el) => scheduleCheck(el));
      });
      // also catch text mutations inside an already-inserted assistant turn
      if (m.target instanceof HTMLElement) {
        const turn = m.target.closest?.('[data-message-author-role="assistant"]');
        if (turn && !processed.has(turn)) scheduleCheck(turn);
      }
    }
  });

  rootObserver.observe(document.body, { childList: true, subtree: true, characterData: true });

  // catch anything already on the page at load
  document
    .querySelectorAll('[data-message-author-role="assistant"]')
    .forEach((el) => scheduleCheck(el));
})();

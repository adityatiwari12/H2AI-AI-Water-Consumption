(function () {
  const SITE = "chatgpt";
  const DEFAULT_MODEL = "gpt-5";
  const DEFAULT_IMAGE_MODEL = "gpt-image-1-5";

  // BEST-EFFORT model detection: ChatGPT's model-switcher button usually
  // shows the active model's short label somewhere near the top of the
  // composer (e.g. a button with text like "ChatGPT 5" or "GPT-5.4").
  const MODEL_PICKER_SELECTORS = [
    '[data-testid="model-switcher-dropdown-button"]',
    'button[aria-label*="Model" i]',
    '[data-testid*="model-switcher"]',
    'button[id*="model" i]',
  ];

  const MODEL_PATTERNS = [
    [/5\.4/i, "gpt-5-4"],
    [/5/i, "gpt-5"],
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

  // CONTENT DETECTORS: Generated images, canvas, research
  const CONTENT_DETECTORS = {
    imageSelector: 'img[src*="oaiusercontent" i], img[src*="files.oaiusercontent" i], img[alt]:not([alt=""])',
    artifactSelector: '[data-testid*="canvas" i], #canvas-panel, [id*="canvas" i], [class*="writing-block" i]',
    researchSelector: '[data-testid*="research" i], [class*="deep-research" i], [class*="thinking" i]',
  };

  const processed = new WeakSet();
  const debounceTimers = new WeakMap();

  // Supports both modern ChatGPT (data-chatgpt-agent-turn-start) and legacy/fixtures (data-message-author-role="assistant")
  function findAssistantEls(root) {
    const results = [];
    if (!root || !(root instanceof HTMLElement)) return results;

    // 1. Check for legacy/fixture [data-message-author-role="assistant"]
    if (root.matches?.('[data-message-author-role="assistant"]')) {
      results.push(root);
    }
    const legacy = root.querySelectorAll?.('[data-message-author-role="assistant"]') || [];
    for (const el of legacy) {
      if (!results.includes(el)) results.push(el);
    }

    // 2. Check for modern OpenAI [data-chatgpt-agent-turn-start]
    const markers = [];
    if (root.matches?.('[data-chatgpt-agent-turn-start]')) {
      markers.push(root);
    }
    const modern = root.querySelectorAll?.('[data-chatgpt-agent-turn-start]') || [];
    for (const m of modern) {
      markers.push(m);
    }
    for (const m of markers) {
      const container = m.closest?.('[class*="block-"]') || m.parentElement || m;
      if (!results.includes(container)) {
        results.push(container);
      }
    }

    return results;
  }

  const USER_SELECTORS = '[data-message-author-role="user"], [data-user-message-bubble="true"], [class*="user-message"]';

  function getLastUserPromptBefore(el) {
    const allUsers = document.querySelectorAll(USER_SELECTORS);
    let promptText = "";
    for (const u of allUsers) {
      if (u.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_PRECEDING) break;
      promptText = u.innerText || "";
    }
    return promptText.replace(/^You said:\s*/i, "").trim();
  }

  async function handleFinishedMessage(el) {
    if (processed.has(el)) return;
    if (!chrome.runtime?.id) return;
    processed.add(el);

    try {
      let rawText = el.innerText || "";
      // Strip accessible prefix "ChatGPT said:" if present
      rawText = rawText.replace(/^ChatGPT said:\s*/i, "").trim();

      const promptText = getLastUserPromptBefore(el);
      const { modelId, detected } = detectModel();
      const { contentType, artifactEl } = window.AIWaterMeter.detectContentType(el, CONTENT_DETECTORS);

      let calcResult;
      if (contentType === "image") {
        const unitCount = el.querySelectorAll(CONTENT_DETECTORS.imageSelector).length || 1;
        calcResult = await window.AIWaterMeter.calc("", promptText, modelId, {
          contentType,
          mediaModelId: DEFAULT_IMAGE_MODEL,
          unitCount,
        });
      } else {
        const responseText = contentType === "artifact" && artifactEl ? `${rawText}\n${artifactEl.innerText || ""}` : rawText;
        if (!responseText.trim()) {
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

      // Insert after the assistant turn's outer container
      const container = el.closest('article, [class*="block-"], [data-talvt-turn-state], [data-turn-key]') || el;
      container.insertAdjacentElement("afterend", card);
    } catch (err) {
      if (!chrome.runtime?.id || String(err?.message || err).includes("Extension context invalidated")) return;
      console.error("[AI Water Meter]", err);
      processed.delete(el);
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
        const ancestor = m.target.closest?.('[data-message-author-role="assistant"], [class*="block-"], [data-talvt-turn-state], [data-turn-key]') || m.target;
        findAssistantEls(ancestor).forEach((el) => scheduleCheck(el));
      }
    }
  });

  rootObserver.observe(document.body, { childList: true, subtree: true, characterData: true });

  // Initial check on page load
  findAssistantEls(document.body).forEach((el) => scheduleCheck(el));
})();

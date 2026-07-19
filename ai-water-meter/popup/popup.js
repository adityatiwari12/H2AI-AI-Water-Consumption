const SITES = [
  { key: "chatgpt", label: "ChatGPT" },
  { key: "claude", label: "Claude" },
  { key: "gemini", label: "Gemini" },
  { key: "deepseek", label: "DeepSeek" },
];

const WATER_MODE_KEY = "awm_water_mode";
const MODEL_PREFIX = "awm_lifetime_model_";

const SITE_BADGES = {
  chatgpt: {
    bg: "#e8f8f3",
    svg: '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 4a5 5 0 0 0-4.8 3.6A4.5 4.5 0 0 0 4 12a4.5 4.5 0 0 0 2.2 3.9A5 5 0 0 0 11 20a5 5 0 0 0 4.8-3.6A4.5 4.5 0 0 0 20 12a4.5 4.5 0 0 0-2.2-3.9A5 5 0 0 0 12 4Z" stroke="#10a37f" stroke-width="1.6" stroke-linejoin="round"/></svg>',
  },
  claude: {
    bg: "#fbeee7",
    svg: '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 4l2 6.2L20 12l-6 1.8L12 20l-2-6.2L4 12l6-1.8L12 4Z" fill="#d97757"/></svg>',
  },
  gemini: {
    bg: "#eef0ff",
    svg: '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 3c0 4.5 3 8.5 8 9-5 0.5-8 4.5-8 9 0-4.5-3-8.5-8-9 5-0.5 8-4.5 8-9Z" fill="url(#awmGeminiGrad)"/><defs><linearGradient id="awmGeminiGrad" x1="4" y1="3" x2="20" y2="21" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#4c8dff"/><stop offset="1" stop-color="#9a6bff"/></linearGradient></defs></svg>',
  },
  deepseek: {
    bg: "#eaf0ff",
    svg: '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M4 13c2-5 8-7 11-4.5-1.5-.3-3 .1-3.8 1 1.8-.3 3.6.4 4.6 2-1.6-.6-3-.4-3.8.3 1.6 0 3 .8 3.5 2.2-3-1.6-9-1.4-11.5 3Z" fill="#4d6bfe"/></svg>',
  },
};

function badgeHtml(key) {
  const b = SITE_BADGES[key] || { bg: "#eef1f6", svg: "" };
  return `<span class="awm-popup-site-badge" style="background:${b.bg}">${b.svg}</span>`;
}

const MODE_HINTS = {
  playful: "Flat ~45 mL / 1,000 output tokens for every model — same basis the original viral screenshot used. Makes the glass-fill animation visible; not model-specific.",
  accurate: "Each model's best-sourced estimate (Google's comprehensive methodology for Gemini, derived figures elsewhere). Numbers are much smaller and mostly won't fill the glass — see each card's (i) tooltip for sourcing.",
};

function fmtMl(ml) {
  if (ml >= 1000) return `${(ml / 1000).toFixed(2)} L`;
  if (ml >= 1) return `${ml.toFixed(1)} mL`;
  return `${ml.toFixed(3)} mL`;
}
function fmtMlParts(ml) {
  if (ml >= 1000) return { num: (ml / 1000).toFixed(2), unit: "L" };
  if (ml >= 1) return { num: ml.toFixed(1), unit: "mL" };
  return { num: ml.toFixed(3), unit: "mL" };
}
function fmtUsd(usd) {
  return `$${usd.toFixed(4)}`;
}

async function getWaterMode() {
  const data = await chrome.storage.local.get([WATER_MODE_KEY]);
  return data[WATER_MODE_KEY] === "accurate" ? "accurate" : "playful";
}

async function setWaterMode(mode) {
  await chrome.storage.local.set({ [WATER_MODE_KEY]: mode });
}

function renderModeToggle(mode) {
  document.querySelectorAll(".awm-popup-mode-btn").forEach((btn) => {
    btn.classList.toggle("awm-active", btn.dataset.mode === mode);
  });
  document.getElementById("modeHint").textContent = MODE_HINTS[mode];
}

async function renderSiteBreakdown() {
  const keys = SITES.map((s) => `awm_lifetime_${s.key}`);
  const data = await chrome.storage.local.get(keys);

  let totalWater = 0;
  let totalCost = 0;
  let totalChats = 0;
  const breakdown = document.getElementById("siteBreakdown");
  breakdown.innerHTML = "";

  SITES.forEach((s) => {
    const stat = data[`awm_lifetime_${s.key}`] || { waterMl: 0, costUsd: 0, count: 0 };
    totalWater += stat.waterMl;
    totalCost += stat.costUsd;
    totalChats += stat.count || 0;

    const row = document.createElement("div");
    row.className = "awm-popup-site-row";
    row.innerHTML = `
      ${badgeHtml(s.key)}
      <span class="awm-popup-site-name">${s.label}</span>
      <span class="awm-popup-site-stats">${fmtMl(stat.waterMl)} · ${fmtUsd(stat.costUsd)} <span class="awm-dim">(${stat.count || 0})</span></span>
      <span class="awm-popup-chevron"></span>
    `;
    breakdown.appendChild(row);
  });

  const waterParts = fmtMlParts(totalWater);
  document.getElementById("totalWaterNum").textContent = waterParts.num;
  document.getElementById("totalWaterUnit").textContent = waterParts.unit;
  document.getElementById("totalCost").textContent = fmtUsd(totalCost);
  document.getElementById("totalChats").textContent = totalChats;
}

async function renderModelBreakdown() {
  const all = await chrome.storage.local.get(null);
  const modelBreakdown = document.getElementById("modelBreakdown");
  modelBreakdown.innerHTML = "";

  const rows = Object.keys(all)
    .filter((k) => k.startsWith(MODEL_PREFIX))
    .map((k) => ({ modelId: k.slice(MODEL_PREFIX.length), ...all[k] }))
    .sort((a, b) => (b.waterMl || 0) - (a.waterMl || 0));

  if (rows.length === 0) {
    const empty = document.createElement("div");
    empty.className = "awm-popup-site-row";
    empty.innerHTML = `<span class="awm-popup-site-name">No responses yet</span>`;
    modelBreakdown.appendChild(empty);
    return;
  }

  rows.forEach((r) => {
    const initial = (r.provider || r.displayName || r.modelId || "?").charAt(0).toUpperCase();
    const row = document.createElement("div");
    row.className = "awm-popup-site-row";
    row.innerHTML = `
      <span class="awm-popup-site-badge" style="background:#eef1f6;font-size:11px;font-weight:700;color:#6b7280;display:flex;align-items:center;justify-content:center">${initial}</span>
      <span class="awm-popup-site-name">${r.displayName || r.modelId}<div class="awm-popup-site-sub">${r.provider || ""}</div></span>
      <span class="awm-popup-site-stats">${fmtMl(r.waterMl || 0)} · ${fmtUsd(r.costUsd || 0)} <span class="awm-dim">(${r.count || 0})</span></span>
      <span class="awm-popup-chevron"></span>
    `;
    modelBreakdown.appendChild(row);
  });
}

function setActiveTab(tab) {
  document.querySelectorAll(".awm-popup-tab").forEach((btn) => {
    btn.classList.toggle("awm-active", btn.dataset.tab === tab);
  });
  document.getElementById("siteBreakdown").style.display = tab === "site" ? "flex" : "none";
  document.getElementById("modelBreakdown").style.display = tab === "model" ? "flex" : "none";
}

async function render() {
  const mode = await getWaterMode();
  renderModeToggle(mode);
  await renderSiteBreakdown();
  await renderModelBreakdown();
}

document.getElementById("modeToggle").addEventListener("click", async (e) => {
  const btn = e.target.closest(".awm-popup-mode-btn");
  if (!btn) return;
  await setWaterMode(btn.dataset.mode);
  renderModeToggle(btn.dataset.mode);
});

document.getElementById("breakdownTabs").addEventListener("click", (e) => {
  const btn = e.target.closest(".awm-popup-tab");
  if (!btn) return;
  setActiveTab(btn.dataset.tab);
});

document.getElementById("resetBtn").addEventListener("click", async () => {
  const all = await chrome.storage.local.get(null);
  const toRemove = Object.keys(all).filter((k) => k.startsWith("awm_") && k !== WATER_MODE_KEY);
  await chrome.storage.local.remove(toRemove);
  render();
});

setActiveTab("site");
render();

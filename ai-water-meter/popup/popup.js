const SITES = [
  { key: "chatgpt", label: "ChatGPT" },
  { key: "claude", label: "Claude" },
  { key: "gemini", label: "Gemini" },
  { key: "deepseek", label: "DeepSeek" },
];

const MODEL_PREFIX = "awm_lifetime_model_";

const SITE_BADGES = {
  chatgpt: { bg: "#e8f8f3", file: "chatgpt.svg" },
  claude: { bg: "#fbeee7", file: "claude.svg" },
  gemini: { bg: "#eef0ff", file: "gemini.svg" },
  deepseek: { bg: "#eaf0ff", file: "deepseek.svg" },
};

function badgeHtml(key) {
  const b = SITE_BADGES[key];
  if (!b) return `<span class="awm-popup-site-badge" style="background:#eef1f6"></span>`;
  return `<span class="awm-popup-site-badge" style="background:${b.bg}"><img src="../icons/brand/${b.file}" alt="" /></span>`;
}

function providerBadgeHtml(provider) {
  const key = (provider || "").toLowerCase();
  if (key.includes("openai")) return badgeHtml("chatgpt");
  if (key.includes("anthropic")) return badgeHtml("claude");
  if (key.includes("google")) return badgeHtml("gemini");
  if (key.includes("deepseek")) return badgeHtml("deepseek");
  const initial = (provider || "?").charAt(0).toUpperCase();
  return `<span class="awm-popup-site-badge" style="background:#eef1f6;font-size:11px;font-weight:700;color:#6b7280;display:flex;align-items:center;justify-content:center">${initial}</span>`;
}

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

function fmtCarbon(g) {
  if (g >= 1000) return `${(g / 1000).toFixed(2)} kg`;
  if (g >= 1) return `${g.toFixed(2)} g`;
  return `${g.toFixed(3)} g`;
}

async function renderSiteBreakdown() {
  const keys = SITES.map((s) => `awm_lifetime_${s.key}`);
  const data = await chrome.storage.local.get(keys);

  let totalWater = 0;
  let totalCost = 0;
  let totalCarbon = 0;
  let totalChats = 0;
  const breakdown = document.getElementById("siteBreakdown");
  breakdown.innerHTML = "";

  SITES.forEach((s) => {
    const stat = data[`awm_lifetime_${s.key}`] || { waterMl: 0, costUsd: 0, carbonG: 0, count: 0 };
    totalWater += stat.waterMl;
    totalCost += stat.costUsd;
    totalCarbon += stat.carbonG || 0;
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
  document.getElementById("totalCarbon").textContent = fmtCarbon(totalCarbon);
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
    const row = document.createElement("div");
    row.className = "awm-popup-site-row";
    row.innerHTML = `
      ${providerBadgeHtml(r.provider)}
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
  await renderSiteBreakdown();
  await renderModelBreakdown();
}

document.getElementById("breakdownTabs").addEventListener("click", (e) => {
  const btn = e.target.closest(".awm-popup-tab");
  if (!btn) return;
  setActiveTab(btn.dataset.tab);
});

document.getElementById("resetBtn").addEventListener("click", async () => {
  const all = await chrome.storage.local.get(null);
  const toRemove = Object.keys(all).filter((k) => k.startsWith("awm_"));
  await chrome.storage.local.remove(toRemove);
  render();
});

setActiveTab("site");
render();

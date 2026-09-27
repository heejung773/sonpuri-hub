// State
let loadedProblems = [];
let currentDiffFilter = "";
let currentUnitFilter = "";

// DOM Elements
const searchInput = document.getElementById("searchInput");
const searchSubmitBtn = document.getElementById("searchSubmitBtn");
const clearSearchBtn = document.getElementById("clearSearchBtn");
const problemsList = document.getElementById("problemsList");
const emptyState = document.getElementById("emptyState");
const loadingIndicator = document.getElementById("loadingIndicator");
const statsText = document.getElementById("statsText");
const resultCountBadge = document.getElementById("resultCountBadge");
const unitFilterSelect = document.getElementById("unitFilterSelect");
const onlySolToggle = document.getElementById("onlySolToggle");
const printBtn = document.getElementById("printBtn");
const syncBtn = document.getElementById("syncBtn");
const syncBtnText = document.getElementById("syncBtnText");
const toast = document.getElementById("toast");

// Initialize on load
document.addEventListener("DOMContentLoaded", () => {
  fetchSummary();
  setupEventListeners();

  // Initial search with default range (120-124)
  performSearch("120-124");
});

function setupEventListeners() {
  // Search submit
  searchSubmitBtn.addEventListener("click", () => {
    performSearch(searchInput.value.trim());
  });

  searchInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      performSearch(searchInput.value.trim());
    }
  });

  searchInput.addEventListener("input", () => {
    clearSearchBtn.classList.toggle("hidden", !searchInput.value.trim());
  });

  clearSearchBtn.addEventListener("click", () => {
    searchInput.value = "";
    clearSearchBtn.classList.add("hidden");
    searchInput.focus();
  });

  // Quick Preset Chips
  document.querySelectorAll(".chip[data-query]").forEach((chip) => {
    chip.addEventListener("click", () => {
      document.querySelectorAll(".chip").forEach((c) => c.classList.remove("active-preset"));
      chip.classList.add("active-preset");

      const queryType = chip.getAttribute("data-query");
      if (queryType === "all") {
        searchInput.value = "";
        onlySolToggle.checked = false;
        currentDiffFilter = "";
        currentUnitFilter = "";
        resetFilterUI();
        performSearch("");
      } else if (queryType === "sol") {
        onlySolToggle.checked = true;
        performSearch(searchInput.value.trim() || "");
      } else {
        searchInput.value = queryType;
        clearSearchBtn.classList.remove("hidden");
        performSearch(queryType);
      }
    });
  });

  // Unit filter dropdown
  unitFilterSelect.addEventListener("change", () => {
    currentUnitFilter = unitFilterSelect.value;
    performSearch(searchInput.value.trim());
  });

  // Difficulty filter buttons
  document.querySelectorAll(".diff-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".diff-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      currentDiffFilter = btn.getAttribute("data-diff");
      performSearch(searchInput.value.trim());
    });
  });

  // Filter toggle (손풀이 있는 문제만)
  onlySolToggle.addEventListener("change", () => {
    performSearch(searchInput.value.trim());
  });

  // Print Button
  printBtn.addEventListener("click", () => {
    window.print();
  });

  // Sync Notion DB
  syncBtn.addEventListener("click", triggerNotionSync);
}

function resetFilterUI() {
  unitFilterSelect.value = "";
  document.querySelectorAll(".diff-btn").forEach((b) => {
    b.classList.toggle("active", b.getAttribute("data-diff") === "");
  });
}

let staticDataCache = null;

function updateSummaryUI(total, solved, minNo, maxNo) {
  if (statsText) {
    statsText.textContent = `시너지 DB 총 ${total}문항 (영상 ${solved}건)`;
  }
  const dbSubtext = document.getElementById("dbRangeSubtext");
  if (dbSubtext && minNo && maxNo) {
    dbSubtext.textContent = `노션 DB 연동 (${minNo}~${maxNo}번)`;
  }
  const chipAll = document.getElementById("chipAllBtn");
  if (chipAll) {
    chipAll.textContent = `전체 (${total}문항)`;
  }
}

// Fetch Summary Stats
async function fetchSummary() {
  try {
    const res = await fetch("/api/summary");
    if (!res.ok) throw new Error("API not ok");
    const data = await res.json();
    updateSummaryUI(data.total_problems, data.solved_problems, data.min_no, data.max_no);
    populateUnits(data.units);
  } catch (err) {
    // Fallback: load static data with cache-busting
    try {
      if (!staticDataCache) {
        let cRes = await fetch(`/data_cache.json?_t=${Date.now()}`);
        if (!cRes.ok) cRes = await fetch(`/static/data_cache.json?_t=${Date.now()}`);
        staticDataCache = await cRes.json();
      }
      const vals = Object.values(staticDataCache);
      const total = vals.length;
      const solved = vals.filter(p => p.has_solution).length;
      const units = Array.from(new Set(vals.map(p => p.unit).filter(Boolean))).sort();
      const nums = Object.keys(staticDataCache).map(k => parseInt(k, 10)).filter(n => !isNaN(n));
      const minNo = nums.length > 0 ? String(Math.min(...nums)).padStart(4, "0") : "0001";
      const maxNo = nums.length > 0 ? String(Math.max(...nums)).padStart(4, "0") : "0000";

      updateSummaryUI(total, solved, minNo, maxNo);
      populateUnits(units);
    } catch (e2) {
      statsText.textContent = "상태 조회 실패";
    }
  }
}

function populateUnits(units) {
  unitFilterSelect.innerHTML = '<option value="">전체 단원</option>';
  if (units && units.length > 0) {
    units.forEach((u) => {
      const opt = document.createElement("option");
      opt.value = u;
      opt.textContent = u;
      unitFilterSelect.appendChild(opt);
    });
  }
}

// Helper to apply preset
window.applyPreset = function (query) {
  searchInput.value = query;
  clearSearchBtn.classList.toggle("hidden", !query);
  performSearch(query);
};

// Main Search & Load function
async function performSearch(query) {
  loadingIndicator.classList.remove("hidden");
  emptyState.classList.add("hidden");
  problemsList.innerHTML = "";

  const onlySol = onlySolToggle.checked;
  let url = `/api/search?q=${encodeURIComponent(query)}&only_sol=${onlySol ? "1" : "0"}`;
  if (currentUnitFilter) url += `&unit=${encodeURIComponent(currentUnitFilter)}`;
  if (currentDiffFilter) url += `&diff=${encodeURIComponent(currentDiffFilter)}`;

  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error("Server API not available");
    const data = await res.json();
    loadedProblems = data.problems || [];

    resultCountBadge.textContent = `${loadedProblems.length}건 (손풀이 ${data.solved_count || 0}건)`;

    if (loadedProblems.length === 0) {
      emptyState.classList.remove("hidden");
    } else {
      renderProblemsList(loadedProblems);
    }
  } catch (err) {
    // Client-side fallback using /static/data_cache.json with cache-busting
    try {
      if (!staticDataCache) {
        let cRes = await fetch(`/data_cache.json?_t=${Date.now()}`);
        if (!cRes.ok) cRes = await fetch(`/static/data_cache.json?_t=${Date.now()}`);
        staticDataCache = await cRes.json();
      }
      const data = clientSideSearch(staticDataCache, query, onlySol, currentUnitFilter, currentDiffFilter);
      loadedProblems = data.problems || [];
      resultCountBadge.textContent = `${loadedProblems.length}건 (손풀이 ${data.solved_count || 0}건)`;
      if (loadedProblems.length === 0) {
        emptyState.classList.remove("hidden");
      } else {
        renderProblemsList(loadedProblems);
      }
    } catch (e2) {
      console.error("Client search error:", e2);
      showToast("데이터 검색 중 오류가 발생했습니다.");
    }
  } finally {
    loadingIndicator.classList.add("hidden");
  }
}

function clientSideSearch(allMap, query, onlySol, unitFilter, diffFilter) {
  let matchedKeys = new Set();
  const allKeys = Object.keys(allMap);

  if (!query && !unitFilter && !diffFilter && !onlySol) {
    matchedKeys = new Set(allKeys);
  } else if (query) {
    const tokens = query.split(/[,;\s]+/);
    for (let rawToken of tokens) {
      let token = rawToken.trim();
      if (!token) continue;

      // 번호 검색 시 '#', '번' 접두/접미사 자동 제거 (예: '936번', '#936', '120-124번')
      const cleaned = token.replace(/^[#№\s]+/, "").replace(/번$/, "").trim();
      const m = cleaned.match(/^(\d+)[~-](\d+)$/);
      if (m) {
        let s = parseInt(m[1], 10), e = parseInt(m[2], 10);
        if (s > e) [s, e] = [e, s];
        for (let i = s; i <= e; i++) {
          const k4 = String(i).padStart(4, "0");
          if (allMap[k4]) matchedKeys.add(k4);
          else if (allMap[String(i)]) matchedKeys.add(String(i));
        }
      } else if (/^\d+$/.test(cleaned)) {
        const k4 = String(parseInt(cleaned, 10)).padStart(4, "0");
        if (allMap[k4]) matchedKeys.add(k4);
        else if (allMap[cleaned]) matchedKeys.add(cleaned);
      } else {
        const tl = token.toLowerCase();
        for (let k of allKeys) {
          const p = allMap[k];
          if ((p.unit && p.unit.toLowerCase().includes(tl)) ||
              (p.problem_type && p.problem_type.toLowerCase().includes(tl)) ||
              (p.intent && p.intent.toLowerCase().includes(tl))) {
            matchedKeys.add(k);
          }
        }
      }
    }
  } else {
    matchedKeys = new Set(allKeys);
  }

  let list = Array.from(matchedKeys).map(k => allMap[k]);
  if (unitFilter) list = list.filter(p => p.unit === unitFilter);
  if (diffFilter) list = list.filter(p => p.difficulty && p.difficulty.includes(diffFilter));
  if (onlySol) list = list.filter(p => p.has_solution);

  list.sort((a, b) => (parseInt(a.problem_no, 10) || 9999) - (parseInt(b.problem_no, 10) || 9999));
  const solvedCount = list.filter(p => p.has_solution).length;
  return { problems: list, solved_count: solvedCount };
}

// Render the list of problem cards (간소화 & 공간 최적화된 콤팩트 카드)
function renderProblemsList(problems) {
  problemsList.innerHTML = "";

  problems.forEach((p) => {
    const card = document.createElement("article");
    card.className = "problem-card";
    card.id = `problem-${p.problem_no}`;

    // 1. Difficulty badge styling
    const diff = p.difficulty || "미지정";
    let diffClass = "diff-none";
    if (diff.includes("상") || diff.includes("최상")) diffClass = "diff-high";
    else if (diff.includes("중")) diffClass = "diff-mid";
    else if (diff.includes("하")) diffClass = "diff-low";

    // 2. Solution link logic
    const link = p.solution_link;
    const hasSol = Boolean(link);
    const embedUrl = hasSol ? getYouTubeEmbedUrl(link) : null;

    card.innerHTML = `
      <!-- Line 1: 문제번호 + 단원 + 난이도 + 문제유형 (옆에 나란히) + 손풀이 버튼 -->
      <div class="card-main-row">
        <div class="card-meta-left">
          <span class="problem-no-badge"># ${p.problem_no}</span>
          <span class="badge-unit">${p.unit || "단원 미지정"}</span>
          <span class="badge-diff ${diffClass}">난이도: ${diff}</span>
          <span class="meta-divider">|</span>
          <span class="meta-type"><strong class="type-label">유형:</strong> <span class="math-target">${p.problem_type || "-"}</span></span>
        </div>

        <!-- 손풀이영상 버튼: 과한 영역 없이 깔끔한 버튼으로 제공 -->
        <div class="card-action-right">
          ${hasSol ? `
            <a href="${link}" target="_blank" rel="noopener noreferrer" class="btn-sol-cta">
              <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor">
                <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
              </svg>
              <span>손풀이 영상 보기 ↗</span>
            </a>
            <button class="btn-icon-copy" data-link="${link}" title="영상 링크 복사">📋 복사</button>
            ${embedUrl ? `
              <button class="btn-embed-toggle" data-target="embed-${p.problem_no}">▶ 미리보기</button>
            ` : ''}
          ` : `
            <span class="sol-missing-badge">영상 준비중</span>
          `}
        </div>
      </div>

      <!-- Line 2: 출제의도 (난이도/문제유형 바로 아래에 콤팩트하게 표시) -->
      ${p.intent ? `
        <div class="card-intent-row">
          <span class="intent-label">🎯 출제의도:</span>
          <span class="intent-body math-target">${p.intent}</span>
        </div>
      ` : ''}

      <!-- Collapsible Video Embed (미리보기 버튼 클릭 시에만 콤팩트하게 오픈) -->
      ${embedUrl ? `
        <div class="card-embed-box hidden" id="embed-${p.problem_no}">
          <div class="player-aspect-ratio">
            <iframe 
              src="" 
              data-src="${embedUrl}" 
              title="${p.problem_no}번 손풀이" 
              frameborder="0" 
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" 
              allowfullscreen>
            </iframe>
          </div>
        </div>
      ` : ''}
    `;

    // Attach copy event
    const copyBtn = card.querySelector(".btn-icon-copy");
    if (copyBtn) {
      copyBtn.addEventListener("click", () => {
        const linkToCopy = copyBtn.getAttribute("data-link");
        navigator.clipboard.writeText(linkToCopy).then(() => {
          showToast(`${p.problem_no}번 손풀이 링크 복사 완료!`);
        });
      });
    }

    // Attach embed toggle event (lazy load iframe on demand)
    const toggleBtn = card.querySelector(".btn-embed-toggle");
    if (toggleBtn) {
      toggleBtn.addEventListener("click", () => {
        const targetId = toggleBtn.getAttribute("data-target");
        const embedBox = document.getElementById(targetId);
        if (embedBox) {
          const isHidden = embedBox.classList.contains("hidden");
          if (isHidden) {
            const iframe = embedBox.querySelector("iframe");
            if (iframe && !iframe.src) {
              iframe.src = iframe.getAttribute("data-src");
            }
            embedBox.classList.remove("hidden");
            toggleBtn.textContent = "▲ 닫기";
          } else {
            embedBox.classList.add("hidden");
            toggleBtn.textContent = "▶ 미리보기";
          }
        }
      });
    }

    problemsList.appendChild(card);
  });

  // Trigger KaTeX math equations
  triggerKaTeX();
}

// Render KaTeX formulas
function triggerKaTeX() {
  if (typeof renderMathInElement === "function") {
    try {
      renderMathInElement(problemsList, {
        delimiters: [
          { left: "$$", right: "$$", display: true },
          { left: "$", right: "$", display: false },
          { left: "\\(", right: "\\)", display: false },
          { left: "\\[", right: "\\]", display: true }
        ],
        throwOnError: false
      });
    } catch (e) {
      console.warn("KaTeX render error:", e);
    }
  }
}

// YouTube URL parser
function getYouTubeEmbedUrl(url) {
  if (!url) return null;
  let videoId = "";
  let start = 0;

  const shortMatch = url.match(/youtu\.be\/([a-zA-Z0-9_-]{11})(?:\?t=(\d+))?/);
  if (shortMatch) {
    videoId = shortMatch[1];
    if (shortMatch[2]) start = parseInt(shortMatch[2], 10);
  } else {
    const longMatch = url.match(/[?&]v=([a-zA-Z0-9_-]{11})/);
    if (longMatch) {
      videoId = longMatch[1];
      const timeMatch = url.match(/[?&]t=(\d+)s?/);
      if (timeMatch) start = parseInt(timeMatch[1], 10);
    }
  }

  if (videoId) {
    return `https://www.youtube.com/embed/${videoId}?start=${start}&autoplay=0&rel=0`;
  }
  return null;
}

// Trigger Notion Sync
async function triggerNotionSync() {
  syncBtn.classList.add("spinning");
  syncBtn.disabled = true;
  syncBtnText.textContent = "동기화 중...";

  const isVercel = window.location.hostname.includes("vercel.app") || window.location.hostname !== "localhost" && window.location.hostname !== "127.0.0.1";

  if (isVercel) {
    // Online Vercel mode: reload freshest data from CDN with cache-busting
    try {
      const cacheBustUrl = `/data_cache.json?_t=${Date.now()}`;
      let cRes = await fetch(cacheBustUrl);
      if (!cRes.ok) cRes = await fetch(`/static/data_cache.json?_t=${Date.now()}`);
      if (cRes.ok) {
        staticDataCache = await cRes.json();
        const vals = Object.values(staticDataCache);
        const total = vals.length;
        const solved = vals.filter(p => p.has_solution).length;
        const units = Array.from(new Set(vals.map(p => p.unit).filter(Boolean))).sort();
        const nums = Object.keys(staticDataCache).map(k => parseInt(k, 10)).filter(n => !isNaN(n));
        const minNo = nums.length > 0 ? String(Math.min(...nums)).padStart(4, "0") : "0001";
        const maxNo = nums.length > 0 ? String(Math.max(...nums)).padStart(4, "0") : "0000";

        updateSummaryUI(total, solved, minNo, maxNo);
        populateUnits(units);
        performSearch(searchInput.value.trim());
        showToast("최신 배포 데이터가 갱신되었습니다!");
      } else {
        showToast("최신 데이터를 불러오지 못했습니다.");
      }
    } catch (e) {
      showToast("데이터 갱신 중 오류가 발생했습니다.");
    } finally {
      syncBtn.classList.remove("spinning");
      syncBtn.disabled = false;
      syncBtnText.textContent = "노션 동기화";
    }
    return;
  }

  // Local Flask Server mode: call /api/sync directly
  try {
    const res = await fetch("/api/sync", { method: "POST" });
    const data = await res.json();
    if (data.success) {
      showToast(data.message);
      fetchSummary();
      performSearch(searchInput.value.trim());
    } else {
      showToast("동기화 실패: " + data.error);
    }
  } catch (err) {
    showToast("동기화 중 오류가 발생했습니다.");
  } finally {
    syncBtn.classList.remove("spinning");
    syncBtn.disabled = false;
    syncBtnText.textContent = "노션 동기화";
  }
}

// Toast
let toastTimer = null;
function showToast(msg) {
  toast.textContent = msg;
  toast.classList.remove("hidden");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.classList.add("hidden");
  }, 2000);
}

// app.js - robust homepage script: fetch transformers, build filters, show cards,
// progressively load thumbnails from /api/transformers/<id>/images,
// and keep favorites + hidden compare features.

// ===== STARFIELD BACKGROUND EFFECT =====
(function() {
  const canvas = document.createElement("canvas");
  canvas.id = "starfield";
  Object.assign(canvas.style, { position: "fixed", top: "0", left: "0", width: "100%", height: "100%", zIndex: "-1", pointerEvents: "none" });
  document.body.appendChild(canvas);
  const ctx = canvas.getContext("2d");
  let stars = [];
  
  function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    createStars(Math.round((canvas.width * canvas.height) / 8000));
  }
  
  window.addEventListener("resize", resizeCanvas);
  
  function createStars(count) {
    stars = [];
    for (let i = 0; i < count; i++) {
      stars.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        r: Math.random() * 1.5 + 0.2,
        speed: Math.random() * 0.6 + 0.05,
        twinkle: Math.random() * 1.5
      });
    }
  }
  
  function animateStars() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (let s of stars) {
      ctx.globalAlpha = 0.6 + 0.4 * Math.sin(Date.now() / 1000 * s.twinkle);
      ctx.fillStyle = "#bfefff";
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();
      s.y += s.speed;
      if (s.y > canvas.height + 10) {
        s.y = -10;
        s.x = Math.random() * canvas.width;
      }
    }
    ctx.globalAlpha = 1;
    requestAnimationFrame(animateStars);
  }
  
  resizeCanvas();
  animateStars();
})();

// ===== END STARFIELD EFFECT =====

const SELECTION_KEY = "transformer_selection_v1";
const FAVORITES_KEY = "transformer_favorites_v1";
// theme removed: transformer_theme_v1 (reverted to pre-light-mode)

let ALL_ITEMS = []; // cached transformers

/* ---------- Storage helpers ---------- */
function loadSelection() {
  try {
    const raw = JSON.parse(localStorage.getItem(SELECTION_KEY));
    if (!Array.isArray(raw)) return [];
    // normalize to numbers, remove invalid entries and duplicates, keep up to 2
    const nums = raw.map(x => Number(x)).filter(n => Number.isFinite(n));
    const uniq = Array.from(new Set(nums)).slice(0, 2);
    // if cleaned differs from raw, persist the cleaned version
    if (JSON.stringify(uniq) !== JSON.stringify(raw)) {
      localStorage.setItem(SELECTION_KEY, JSON.stringify(uniq));
    }
    return uniq;
  } catch (e) { return []; }
}
function saveSelection(arr) { localStorage.setItem(SELECTION_KEY, JSON.stringify(arr)); }
function clearSelection() { saveSelection([]); }

function loadFavorites() {
  try {
    const raw = JSON.parse(localStorage.getItem(FAVORITES_KEY)) || [];
    // normalize to numbers
    const nums = Array.isArray(raw) ? raw.map(x => Number(x)).filter(n => Number.isFinite(n)) : [];
    return nums;
  } catch (e) { return []; }
}
function saveFavorites(arr) { localStorage.setItem(FAVORITES_KEY, JSON.stringify(arr)); }
function toggleFavorite(id) {
  console.log('toggleFavorite called with id=', id);
  const fav = loadFavorites();
  const n = Number(id);
  const has = fav.includes(n);
  if (has) {
    saveFavorites(fav.filter(x => x !== n));
    console.log('favorite removed', n);
    flash("Removed from favorites");
  } else {
    fav.push(n);
    saveFavorites(fav);
    console.log('favorite added', n);
    flash("Added to favorites");
  }
  // re-render visible cards to reflect favorite status
  renderCards(currentFiltered());
}

/* ---------- Small UI helpers ---------- */
function flash(text) {
  let el = document.getElementById("app-flash");
  if (!el) {
    el = document.createElement("div");
    el.id = "app-flash";
    Object.assign(el.style, {
      position: "fixed", right: "16px", bottom: "16px", zIndex: 10000,
      background: "rgba(3,6,23,0.9)", color: "#e6eef7", padding: "10px 12px",
      borderRadius: "8px", border: "1px solid rgba(255,255,255,0.04)"
    });
    document.body.appendChild(el);
  }
  el.textContent = text;
  el.style.opacity = "1";
  el.style.transition = "opacity 0.4s";
  setTimeout(()=>{ el.style.opacity = "0"; }, 1500);
}

/* Theme feature removed — no-op placeholders kept for compatibility. */
function createThemeToggle(){ /* removed */ }

/* ---------- Hidden compare context menu (same utility as before) ---------- */
function getContextMenu() {
  let menu = document.getElementById("cmp-context-menu");
  if (menu) return menu;
  menu = document.createElement("div");
  menu.id = "cmp-context-menu";
  Object.assign(menu.style, {
    position: "fixed", zIndex: 9999, minWidth: "180px",
    background: "rgba(3,6,23,0.95)", color: "#e6eef7",
    border: "1px solid rgba(255,255,255,0.04)", borderRadius: "8px",
    boxShadow: "0 8px 26px rgba(0,0,0,0.6)", padding: "6px",
    display: "none", fontSize: "14px", backdropFilter: "blur(4px)"
  });
  document.body.appendChild(menu);
  document.addEventListener("click", (e) => { if (!menu.contains(e.target)) menu.style.display = "none"; });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") menu.style.display = "none"; });
  return menu;
}
function showContextMenu(x, y, items) {
  const menu = getContextMenu();
  menu.innerHTML = "";
  items.forEach(it => {
    const el = document.createElement("div");
    el.textContent = it.label;
    el.style.padding = "8px 10px";
    el.style.cursor = "pointer";
    el.style.borderRadius = "6px";
    if (it.disabled) {
      el.style.opacity = "0.45";
      el.style.cursor = "not-allowed";
    } else {
      el.addEventListener("click", (ev) => {
        ev.stopPropagation();
        menu.style.display = "none";
        it.onClick && it.onClick();
      });
      el.addEventListener("mouseenter", () => el.style.background = "rgba(255,255,255,0.02)");
      el.addEventListener("mouseleave", () => el.style.background = "transparent");
    }
    menu.appendChild(el);
  });
  const pad = 8, mw = 220;
  if (x + mw > window.innerWidth - pad) x = window.innerWidth - mw - pad;
  if (y + 200 > window.innerHeight - pad) y = window.innerHeight - 200 - pad;
  menu.style.left = x + "px";
  menu.style.top = y + "px";
  menu.style.display = "block";
}

/* ---------- Filter helpers ---------- */
function buildFilterOptions(items) {
  const typeSet = new Set();
  const catSet = new Set();
  items.forEach(it => {
    const t = (it.type || "").trim();
    const c = (it.category || "").trim();
    if (t) typeSet.add(t);
    if (c) catSet.add(c);
  });
  const typeSelect = document.getElementById("filterType");
  const catSelect = document.getElementById("filterCat");
  if (!typeSelect || !catSelect) return;
  typeSelect.innerHTML = '<option value="all">All types</option>';
  catSelect.innerHTML = '<option value="all">All categories</option>';
  Array.from(typeSet).sort((a,b)=>a.localeCompare(b)).forEach(t => {
    const o = document.createElement("option"); o.value = t; o.textContent = t; typeSelect.appendChild(o);
  });
  Array.from(catSet).sort((a,b)=>a.localeCompare(b)).forEach(c => {
    const o = document.createElement("option"); o.value = c; o.textContent = c; catSelect.appendChild(o);
  });
}
function currentFiltered() {
  const qEl = document.getElementById("search");
  const ft = document.getElementById("filterType");
  const fc = document.getElementById("filterCat");
  const favOnly = document.getElementById("favOnly");

  const q = (qEl ? qEl.value : "").trim().toLowerCase();
  const type = (ft ? ft.value : "all");
  const category = (fc ? fc.value : "all");
  const favs = loadFavorites();
  const onlyFav = favOnly ? favOnly.checked : false;

  return ALL_ITEMS.filter(item => {
    if (onlyFav && !favs.includes(item.id)) return false;
    if (type !== "all" && ((item.type||"").toLowerCase() !== type.toLowerCase())) return false;
    if (category !== "all" && ((item.category||"").toLowerCase() !== category.toLowerCase())) return false;
    if (q) {
      const hay = ((item.name||"") + " " + (item.description||"") + " " + (item.type||"") + " " + (item.category||"")).toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}
function applyFilters() { renderCards(currentFiltered()); }

/* ---------- Render cards & progressively load thumbnails ---------- */
function renderCards(items) {
  const listEl = document.getElementById("list");
  if (!listEl) return;
  if (!items.length) {
    listEl.innerHTML = '<p class="hint">No transformers match your filters.</p>';
    return;
  }

  listEl.innerHTML = "";
  const favs = loadFavorites();

  items.forEach((item, idx) => {
    const safeName = escapeHtml(item.name || "");
    const card = document.createElement("article");
    card.className = "card";

    // placeholder thumbnail (updated later if an image exists)
    const thumbPlaceholder = `<div class="thumb-placeholder" data-item="${item.id}" style="height:160px;display:flex;align-items:center;justify-content:center;border-radius:8px;background:rgba(255,255,255,0.02);color:var(--muted)"><a href="/detail/${item.id}" style="color:inherit;text-decoration:none">Open gallery</a></div>`;

    const favClass = favs.includes(item.id) ? "fav-on" : "fav-off";

    card.innerHTML = `
      <div class="card-inner">
        ${thumbPlaceholder}
        <h3 style="margin-top:10px"><a href="/detail/${item.id}" style="color:inherit;text-decoration:none">${safeName}</a></h3>
        <div class="meta">${escapeHtml(item.type || "")} ${item.type && item.category ? "•" : ""} ${escapeHtml(item.category || "")}</div>
        <p>${escapeHtml(item.description || "")}</p>
      </div>
    `;
    listEl.appendChild(card);
    // staggered fade-in
    card.style.animationDelay = `${idx * 60}ms`;
    card.classList.add('fade-in');

    // show compare-selected state if this item is in selection
    try {
      const sel = loadSelection();
      if (sel.includes(Number(item.id))) {
        card.classList.add("compare-selected");
        const cb = document.createElement("div");
        cb.className = "compare-badge";
        cb.textContent = "Selected";
        card.appendChild(cb);
      }
    } catch (e) {}

    // show favorite badge only when this item is favorited
    try {
      if (favs.includes(Number(item.id))) {
        const fb = document.createElement("div");
        fb.className = "fav-badge";
        fb.textContent = "★ Favorite";
        card.appendChild(fb);
      }
    } catch (e) {}

    // (visible compare button removed) compare is available via right-click context menu

    // attach right-click context menu for compare / open actions
    card.addEventListener("contextmenu", (ev) => {
      ev.preventDefault();
      const isFav = favs.includes(Number(item.id));
      showContextMenu(ev.clientX, ev.clientY, [
        { label: isFav ? "Unfavorite" : "Add to favorites", onClick: () => { toggleFavorite(item.id); } },
        { label: "Compare", onClick: () => { addToSelection(item.id); } },
        { label: "Open detail", onClick: () => { window.location.href = `/detail/${item.id}`; } }
      ]);
    });

    // card tilt: bind mousemove and leave on card to tilt .card-inner
    const inner = card.querySelector('.card-inner');
    if (inner) {
      card.addEventListener('mousemove', (e) => {
        // don't apply tilt while interacting with controls (buttons/links/inputs)
        if (card._suppressTilt) return;
        const interactive = e.target.closest && e.target.closest('button, a, input, select, textarea, .fav-btn, .cmp-btn');
        if (interactive) return;
        const rect = card.getBoundingClientRect();
        const px = (e.clientX - rect.left) / rect.width; // 0..1
        const py = (e.clientY - rect.top) / rect.height;
        const rx = (py - 0.5) * 6; // rotateX
        const ry = (px - 0.5) * -6; // rotateY
        inner.style.transform = `rotateX(${rx}deg) rotateY(${ry}deg)`;
        card.classList.add('tilt');
      });
      card.addEventListener('mouseleave', () => {
        inner.style.transform = '';
        card.classList.remove('tilt');
      });
    }

    // Update thumbnail with image if available
    if (item.image_url) {
      const ph = listEl.querySelector(`.thumb-placeholder[data-item="${item.id}"]`);
      if (ph) {
        // show shimmer while loading
        ph.classList.add('img-loading');
        const img = document.createElement("img");
        img.src = item.image_url;
        img.alt = item.name || "";
        img.className = 'thumb-img';
        img.style.width = "100%";
        img.style.height = "160px";
        img.style.objectFit = "cover";
        img.style.borderRadius = "8px";
        img.style.cursor = "pointer";
        img.addEventListener("click", () => window.location.href = `/detail/${item.id}`);
        img.addEventListener('load', () => { if (ph) ph.classList.remove('img-loading'); });
        img.addEventListener('error', () => { if (ph) ph.classList.remove('img-loading'); });
        ph.replaceWith(img);
      }
    }
  });
}

/* ---------- Compare helpers (selection stored in localStorage) ---------- */
function addToSelection(id) {
  const sel = loadSelection();
  const n = Number(id);
  if (sel.includes(n)) return;
  if (sel.length >= 2) {
    // replace the oldest selection with the new one (FIFO) to avoid blocking
    sel.shift();
    sel.push(n);
    saveSelection(sel);
    renderCards(currentFiltered());
    flash("Replaced oldest selection with this transformer");
  } else {
    sel.push(n); saveSelection(sel);
    // re-render to reflect selection visually
    renderCards(currentFiltered());
    flash("Added to compare");
  }
  if (sel.length === 2) {
    if (confirm("Two items selected. Open comparison now?")) {
      window.location.href = `/compare.html?ids=${encodeURIComponent(sel.join(","))}`;
    }
  } else flash("Added to compare");
}
function removeFromSelection(id) {
  let sel = loadSelection();
  sel = sel.filter(x => Number(x) !== Number(id));
  saveSelection(sel);
  // re-render to reflect selection visually
  renderCards(currentFiltered());
  flash("Removed from compare");
}

/* ---------- Main loader ---------- */
async function loadTransformers() {
  const listEl = document.getElementById("list");
  if (listEl) listEl.innerHTML = '<p class="hint">Loading transformers…</p>';
  try {
    const res = await fetch("/api/transformers");
    if (!res.ok) throw new Error("Failed to fetch transformers");
    const items = await res.json();
    ALL_ITEMS = Array.isArray(items) ? items : [];
    buildFilterOptions(ALL_ITEMS);
    renderCards(ALL_ITEMS);
  } catch (err) {
    console.error("Failed to load transformers:", err);
    if (listEl) listEl.innerHTML = '<p class="hint">Unable to load transformers. Make sure the server is running.</p>';
  }
}

// Delegate favorite clicks to ensure reliable handling even after re-renders
window.addEventListener('DOMContentLoaded', () => {
  const listEl = document.getElementById('list');
  if (!listEl) return;
  listEl.addEventListener('pointerdown', (e) => {
    const btn = e.target.closest && e.target.closest('.fav-btn');
    if (!btn) return;
    console.log('delegated fav pointerdown on', btn.getAttribute('data-id'));
    e.preventDefault(); e.stopPropagation();
    const id = btn.getAttribute('data-id');
    toggleFavorite(id);
  });
});

/* ---------- Utilities ---------- */
function escapeHtml(s) {
  if (!s) return "";
  return s.replace(/[&<>"']/g, function(m) { return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[m]; });
}

/* ---------- Prevent native context menu on any dynamic image placeholders (optional) ---------- */
document.addEventListener("contextmenu", function(e) {
  if (e.target && (e.target.tagName === "IMG" || e.target.classList && e.target.classList.contains("thumb-placeholder"))) {
    // don't prevent for everything — only for our custom menu if you later attach it
    // e.preventDefault();
  }
});

// header shadow on scroll
window.addEventListener('scroll', () => {
  const h = document.querySelector('header');
  if (!h) return;
  if (window.scrollY > 8) h.classList.add('scrolled'); else h.classList.remove('scrolled');
});

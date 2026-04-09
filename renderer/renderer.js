const listEl = document.getElementById('headlines-list');
const countEl = document.getElementById('headline-count');
const settingsPanel = document.getElementById('settings-panel');

// ── Window controls ──
document.getElementById('btn-minimize').addEventListener('click', () => window.ticker.minimize());
document.getElementById('btn-close').addEventListener('click', () => window.ticker.close());
document.getElementById('btn-settings').addEventListener('click', () => settingsPanel.classList.remove('hidden'));
document.getElementById('btn-settings-close').addEventListener('click', () => settingsPanel.classList.add('hidden'));

// ── Settings controls ──
const bgColorInput = document.getElementById('set-bg-color');
const bgColorLabel = document.getElementById('set-bg-color-label');
const textColorInput = document.getElementById('set-text-color');
const textColorLabel = document.getElementById('set-text-color-label');
const accentColorInput = document.getElementById('set-accent-color');
const accentColorLabel = document.getElementById('set-accent-color-label');
const bgOpacityInput = document.getElementById('set-bg-opacity');
const bgOpacityLabel = document.getElementById('set-bg-opacity-label');
const intervalSelect = document.getElementById('set-interval');
const themeBtns = document.querySelectorAll('.theme-btn');

// Light/dark presets
const PRESETS = {
  dark: { bgColor: '#0a0e1a', textColor: '#ffffff', accentColor: '#ffa500' },
  light: { bgColor: '#f0f2f5', textColor: '#1a1a1a', accentColor: '#d47800' }
};

function applyTheme(settings) {
  const root = document.documentElement;
  root.style.setProperty('--bg', settings.bgColor);
  root.style.setProperty('--text', settings.textColor);
  root.style.setProperty('--accent', settings.accentColor);
  root.style.setProperty('--bg-opacity', (settings.bgOpacity / 100).toString());

  // Derived colors adjust based on lightness
  const isLight = isLightColor(settings.bgColor);
  root.style.setProperty('--text-secondary', isLight ? 'rgba(0,0,0,0.5)' : 'rgba(255,255,255,0.55)');
  root.style.setProperty('--border', isLight ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.1)');
  root.style.setProperty('--surface', isLight ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.04)');
  root.style.setProperty('--surface-hover', isLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.08)');

  // Update form controls
  bgColorInput.value = settings.bgColor;
  bgColorLabel.textContent = settings.bgColor;
  textColorInput.value = settings.textColor;
  textColorLabel.textContent = settings.textColor;
  accentColorInput.value = settings.accentColor;
  accentColorLabel.textContent = settings.accentColor;
  bgOpacityInput.value = settings.bgOpacity;
  bgOpacityLabel.textContent = settings.bgOpacity + '%';
  intervalSelect.value = settings.interval;

  themeBtns.forEach(btn => {
    btn.classList.toggle('active', btn.dataset.theme === settings.theme);
  });
}

function isLightColor(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 > 128;
}

function save(partial) {
  window.ticker.saveSettings(partial);
}

// Theme preset buttons
themeBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    const theme = btn.dataset.theme;
    const preset = PRESETS[theme];
    save({ theme, ...preset });
  });
});

bgColorInput.addEventListener('input', (e) => {
  save({ bgColor: e.target.value });
});
textColorInput.addEventListener('input', (e) => {
  save({ textColor: e.target.value });
});
accentColorInput.addEventListener('input', (e) => {
  save({ accentColor: e.target.value });
});
bgOpacityInput.addEventListener('input', (e) => {
  save({ bgOpacity: parseInt(e.target.value) });
});
intervalSelect.addEventListener('change', (e) => {
  save({ interval: parseInt(e.target.value) });
});

// ── Headlines (persistent local store — only adds, never removes) ──
const localHeadlines = new Map(); // guid -> headline object
let displayList = [];

function mergeHeadlines(incoming) {
  if (!incoming || incoming.length === 0) return;

  let added = false;
  for (const h of incoming) {
    if (h.guid && !localHeadlines.has(h.guid)) {
      localHeadlines.set(h.guid, { ...h });
      added = true;
    }
  }

  if (added || displayList.length === 0) {
    // Rebuild sorted list: newest first by timestamp, then by insertion order
    displayList = Array.from(localHeadlines.values())
      .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    renderList();
  }
}

function renderList() {
  if (displayList.length === 0) {
    listEl.innerHTML = '<div class="empty-state">Waiting for headlines\u2026</div>';
    countEl.textContent = '';
    return;
  }

  countEl.textContent = `${displayList.length}`;
  const scrollTop = listEl.scrollTop;

  listEl.innerHTML = '';
  displayList.forEach((h) => {
    const row = document.createElement('div');
    row.className = 'headline-row' + (h.isNew ? ' is-new' : '');

    const time = document.createElement('span');
    time.className = 'hl-time';
    time.textContent = h.time;
    row.appendChild(time);

    const title = document.createElement('span');
    title.className = 'hl-title';
    title.textContent = h.title;
    row.appendChild(title);

    if (h.description) {
      const info = document.createElement('span');
      info.className = 'hl-info';
      info.textContent = 'i';
      const tip = document.createElement('span');
      tip.className = 'hl-tooltip';
      tip.textContent = h.description;
      info.appendChild(tip);
      row.appendChild(info);
    }

    row.addEventListener('click', () => {
      if (h.link) window.ticker.openLink(h.link);
    });

    listEl.appendChild(row);

    if (h.isNew) {
      window.ticker.headlineSeen(h.guid);
      // Clear the new flag locally after animation
      setTimeout(() => { h.isNew = false; }, 2000);
    }
  });

  listEl.scrollTop = scrollTop;
}

// ── IPC listeners ──
window.ticker.onHeadlinesUpdate((data) => mergeHeadlines(data));
window.ticker.onSettingsUpdated((settings) => applyTheme(settings));

// Load initial settings
window.ticker.getSettings().then(applyTheme);

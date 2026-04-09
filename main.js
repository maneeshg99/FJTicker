const { app, BrowserWindow, Tray, Menu, screen, shell, ipcMain } = require('electron');
const path = require('path');
const https = require('https');
const { XMLParser } = require('fast-xml-parser');
const Store = require('electron-store');

const store = new Store({
  defaults: {
    interval: 15,
    opacity: 90,
    widgetX: -1,
    widgetY: -1,
    widgetWidth: 380,
    widgetHeight: 260,
    theme: 'dark',
    bgColor: '#0a0e1a',
    textColor: '#ffffff',
    accentColor: '#ffa500',
    bgOpacity: 100
  }
});

let tray = null;
let tickerWindow = null;
let pollTimer = null;
let headlines = [];
let seenGuids = new Set();

const RSS_URL = 'https://www.financialjuice.com/feed.ashx?xy=rss';
const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });

function getSettings() {
  return {
    theme: store.get('theme'),
    bgColor: store.get('bgColor'),
    textColor: store.get('textColor'),
    accentColor: store.get('accentColor'),
    bgOpacity: store.get('bgOpacity'),
    interval: store.get('interval')
  };
}

function createTickerWindow() {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width: screenW, height: screenH } = primaryDisplay.workAreaSize;

  let wx = store.get('widgetX');
  let wy = store.get('widgetY');
  const ww = store.get('widgetWidth');
  const wh = store.get('widgetHeight');

  if (wx < 0 || wy < 0) {
    wx = screenW - ww - 16;
    wy = screenH - wh - 16;
  }

  tickerWindow = new BrowserWindow({
    x: wx,
    y: wy,
    width: ww,
    height: wh,
    minWidth: 320,
    minHeight: 200,
    maxWidth: 700,
    maxHeight: 600,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: false,
    resizable: true,
    show: true,
    icon: path.join(__dirname, 'build', process.platform === 'darwin' ? 'icon.png' : 'icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'renderer', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  tickerWindow.setAlwaysOnTop(true, 'floating');
  tickerWindow.setOpacity(store.get('opacity') / 100);
  tickerWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  tickerWindow.on('moved', () => {
    if (tickerWindow && !tickerWindow.isDestroyed()) {
      const [x, y] = tickerWindow.getPosition();
      store.set('widgetX', x);
      store.set('widgetY', y);
    }
  });

  tickerWindow.on('resize', () => {
    if (tickerWindow && !tickerWindow.isDestroyed()) {
      const [w, h] = tickerWindow.getSize();
      store.set('widgetWidth', w);
      store.set('widgetHeight', h);
    }
  });

  tickerWindow.on('closed', () => {
    tickerWindow = null;
  });
}

function fetchRSS() {
  return new Promise((resolve, reject) => {
    const bustUrl = RSS_URL + '&_t=' + Date.now();
    https.get(bustUrl, {
      headers: {
        'User-Agent': 'FJTicker/1.0',
        'Cache-Control': 'no-cache, no-store',
        'Pragma': 'no-cache'
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = parser.parse(data);
          const items = parsed?.rss?.channel?.item;
          if (!items) { resolve([]); return; }
          const arr = Array.isArray(items) ? items : [items];
          const newHeadlines = [];

          for (const item of arr) {
            const guid = item.guid?.['#text'] || item.guid || item.link || item.title;
            if (seenGuids.has(guid)) continue;
            seenGuids.add(guid);

            let title = (item.title || '').toString();
            title = title.replace(/^FinancialJuice:\s*/i, '');

            const pubDate = item.pubDate ? new Date(item.pubDate) : new Date();
            const time = pubDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });

            newHeadlines.push({
              guid,
              title,
              time,
              description: (item.description || '').toString().trim(),
              link: (item.link || '').toString().trim(),
              isNew: true,
              timestamp: pubDate.getTime()
            });
          }

          if (newHeadlines.length > 0) {
            headlines = [...newHeadlines, ...headlines];
          }

          resolve(newHeadlines);
        } catch (e) {
          reject(e);
        }
      });
      res.on('error', reject);
    }).on('error', reject);
  });
}

async function pollFeed() {
  try {
    await fetchRSS();
    sendHeadlines();
  } catch (err) {
    console.error('RSS fetch failed:', err.message);
    if (headlines.length === 0) {
      sendHeadlines([{
        guid: '_error',
        title: 'Feed unavailable \u2014 retrying...',
        time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }),
        description: '',
        link: '',
        isNew: false,
        timestamp: Date.now()
      }]);
    }
  }
}

function sendHeadlines(override) {
  if (tickerWindow && !tickerWindow.isDestroyed()) {
    tickerWindow.webContents.send('headlines-update', override || headlines);
  }
}

function startPolling() {
  if (pollTimer) clearInterval(pollTimer);
  const interval = store.get('interval') * 1000;
  pollFeed();
  pollTimer = setInterval(pollFeed, interval);
}

function buildTrayMenu() {
  const isVisible = tickerWindow && !tickerWindow.isDestroyed() && tickerWindow.isVisible();
  const currentInterval = store.get('interval');

  return Menu.buildFromTemplate([
    {
      label: isVisible ? 'Hide Widget' : 'Show Widget',
      click: () => toggleTicker()
    },
    {
      label: 'Refresh Now',
      click: () => pollFeed()
    },
    { type: 'separator' },
    {
      label: 'Refresh Interval',
      submenu: [10, 15, 30, 45, 60, 120].map(sec => ({
        label: `${sec}s`,
        type: 'radio',
        checked: currentInterval === sec,
        click: () => {
          store.set('interval', sec);
          startPolling();
          if (tickerWindow && !tickerWindow.isDestroyed()) {
            tickerWindow.webContents.send('settings-updated', getSettings());
          }
        }
      }))
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => app.quit()
    }
  ]);
}

function toggleTicker() {
  if (!tickerWindow || tickerWindow.isDestroyed()) {
    createTickerWindow();
    tickerWindow.webContents.on('did-finish-load', () => {
      sendHeadlines();
      tickerWindow.webContents.send('settings-updated', getSettings());
    });
  } else if (tickerWindow.isVisible()) {
    tickerWindow.hide();
  } else {
    tickerWindow.show();
  }
  tray.setContextMenu(buildTrayMenu());
}

app.whenReady().then(() => {
  const trayIcon = process.platform === 'darwin'
    ? path.join(__dirname, 'build', 'trayTemplate.png')
    : path.join(__dirname, 'build', 'icon.ico');
  tray = new Tray(trayIcon);
  tray.setToolTip('FJ Ticker');
  tray.setContextMenu(buildTrayMenu());
  tray.on('click', () => toggleTicker());

  createTickerWindow();
  tickerWindow.webContents.on('did-finish-load', () => {
    tickerWindow.webContents.send('settings-updated', getSettings());
    startPolling();
  });
});

// ── IPC handlers ──

ipcMain.on('open-link', (event, url) => {
  if (url && url.startsWith('http')) shell.openExternal(url);
});

ipcMain.on('headline-seen', (event, guid) => {
  const h = headlines.find(h => h.guid === guid);
  if (h) h.isNew = false;
});

ipcMain.on('win-minimize', () => {
  if (tickerWindow && !tickerWindow.isDestroyed()) tickerWindow.minimize();
});

ipcMain.on('win-close', () => {
  if (tickerWindow && !tickerWindow.isDestroyed()) tickerWindow.hide();
  tray.setContextMenu(buildTrayMenu());
});

ipcMain.on('save-settings', (event, settings) => {
  for (const [key, val] of Object.entries(settings)) {
    store.set(key, val);
  }
  if (settings.interval !== undefined) {
    startPolling();
  }
  if (tickerWindow && !tickerWindow.isDestroyed()) {
    tickerWindow.webContents.send('settings-updated', getSettings());
  }
});

ipcMain.handle('get-settings', () => getSettings());

app.on('window-all-closed', (e) => {
  e.preventDefault();
});

// macOS: hide dock icon since this is a tray/menubar app
if (process.platform === 'darwin') {
  app.dock.hide();
}

app.on('activate', () => {
  if (!tickerWindow || tickerWindow.isDestroyed()) {
    createTickerWindow();
    tickerWindow.webContents.on('did-finish-load', () => {
      sendHeadlines();
      tickerWindow.webContents.send('settings-updated', getSettings());
    });
  }
});

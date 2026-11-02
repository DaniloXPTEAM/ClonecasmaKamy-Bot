"use strict";

const path = require("node:path");
const {app, BrowserWindow, ipcMain, session, shell, Tray, Menu, nativeImage} = require("electron");

const targetUrl = process.argv.find(value => /^http:\/\/(127\.0\.0\.1|localhost):\d+/.test(value));
if (!targetUrl) {
  console.error("Kamy Desktop: URL local do servidor não foi informada.");
  app.exit(1);
}

const isWayland = process.platform === "linux" &&
  (/wayland/i.test(process.env.XDG_SESSION_TYPE || "") ||
   Boolean(process.env.WAYLAND_DISPLAY));
let mainWindow = null;
let expanded = false;
let compactBounds = null;
let tray = null;
const trayDisabled = process.argv.includes('--no-tray');

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

function setExpanded(next) {
  if (!mainWindow || mainWindow.isDestroyed()) return expanded;
  const desired = Boolean(next);
  if (desired === expanded) return expanded;

  if (desired) {
    compactBounds = mainWindow.getBounds();
    expanded = true;
    mainWindow.setAlwaysOnTop(false);
    mainWindow.setFullScreen(true);
  } else {
    expanded = false;
    if (mainWindow.isFullScreen()) mainWindow.setFullScreen(false);
    if (mainWindow.isMaximized()) mainWindow.unmaximize();

    const restore = compactBounds || {width: 440, height: 620};
    setTimeout(() => {
      if (!mainWindow || mainWindow.isDestroyed() || expanded) return;
      mainWindow.setBounds({
        ...restore,
        width: Math.max(380, Math.min(480, restore.width || 440)),
        height: Math.max(500, Math.min(760, restore.height || 620))
      });
      if (!isWayland) mainWindow.setAlwaysOnTop(true, "floating");
      mainWindow.show();
    }, 180);
  }

  mainWindow.webContents.send("kamy:mode-changed", {expanded});
  return expanded;
}


function showWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}
function toggleWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.isVisible()) mainWindow.hide();
  else showWindow();
}
function createTray() {
  if (trayDisabled || tray) return;
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><rect x="1" y="1" width="30" height="30" rx="10" fill="#258b45"/><path d="M22.7 8.2H13a6.2 6.2 0 0 0-6.2 6.2v.2a6.2 6.2 0 0 0 6.2 6.2h6.1a1.6 1.6 0 0 1 0 3.2H9.1v-3.1" fill="none" stroke="#fff" stroke-width="2.7" stroke-linecap="round"/><path d="M9.3 23.8H19a6.2 6.2 0 0 0 6.2-6.2v-.2a6.2 6.2 0 0 0-6.2-6.2h-6.1a1.6 1.6 0 0 1 0-3.2h10" fill="none" stroke="#fff" stroke-width="2.7" stroke-linecap="round"/></svg>';
  const icon = nativeImage.createFromDataURL('data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64'));
  tray = new Tray(icon);
  tray.setToolTip('Kamy — Assistente pessoal');
  const refreshMenu = () => {
    const visible = Boolean(mainWindow && !mainWindow.isDestroyed() && mainWindow.isVisible());
    tray.setContextMenu(Menu.buildFromTemplate([
      {label: visible ? 'Ocultar ilha' : 'Mostrar ilha', click: toggleWindow},
      {label: expanded ? 'Recolher para ilha' : 'Expandir para tela cheia', click: () => setExpanded(!expanded)},
      {type: 'separator'},
      {label: 'Encerrar Kamy', click: () => app.quit()}
    ]));
  };
  refreshMenu();
  tray.on('click', toggleWindow);
  tray.on('right-click', refreshMenu);
  tray.on('double-click', showWindow);
}
function createWindow() {
  if (isWayland) {
    console.warn("Kamy: o Wayland pode impedir a janela de ficar sempre no topo.");
  }

  mainWindow = new BrowserWindow({
    width: 440,
    height: 620,
    minWidth: 360,
    minHeight: 480,
    maxWidth: 720,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: "#00000000",
    resizable: true,
    movable: true,
    fullscreenable: true,
    autoHideMenuBar: true,
    title: "Kamy Bot",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true
    }
  });

  if (!isWayland) mainWindow.setAlwaysOnTop(true, "floating");

  mainWindow.webContents.setWindowOpenHandler(({url}) => {
    if (/^https:\/\//i.test(url)) shell.openExternal(url);
    return {action: "deny"};
  });

  mainWindow.webContents.on("will-navigate", (event, destination) => {
    const local = destination.startsWith("http://127.0.0.1:") ||
      destination.startsWith("http://localhost:");
    if (!local) event.preventDefault();
  });

  mainWindow.once("ready-to-show", () => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.show();
  });

  mainWindow.on("close", event => {
    if (tray && !app.isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });
  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  mainWindow.loadURL(targetUrl).catch(error => {
    console.error("Não foi possível abrir a interface local do Kamy:", error.message);
    app.quit();
  });
}

ipcMain.handle("kamy:set-expanded", (event, value) => {
  if (!mainWindow || event.sender !== mainWindow.webContents) return expanded;
  return setExpanded(value);
});

ipcMain.handle("kamy:toggle-expanded", event => {
  if (!mainWindow || event.sender !== mainWindow.webContents) return expanded;
  return setExpanded(!expanded);
});

ipcMain.handle("kamy:quit", event => {
  if (mainWindow && event.sender !== mainWindow.webContents) return false;
  app.quit();
  return true;
});

app.whenReady().then(() => {
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback, details) => {
    const origin = details?.requestingUrl || webContents.getURL();
    const local = origin.startsWith("http://127.0.0.1:") ||
      origin.startsWith("http://localhost:");
    const audioOnly = Array.isArray(details?.mediaTypes) && details.mediaTypes.includes("audio") && !details.mediaTypes.includes("video");
    callback(local && permission === "media" && audioOnly);
  });

  session.defaultSession.setPermissionCheckHandler((_webContents, permission, origin) => {
    return permission === "media" &&
      (origin.startsWith("http://127.0.0.1:") || origin.startsWith("http://localhost:"));
  });

  createWindow();
});

app.on("window-all-closed", () => {
  app.quit();
});

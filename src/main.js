const { app, BrowserWindow, dialog, ipcMain, Menu, nativeImage, screen, Tray } = require('electron');
const { spawn } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { discoverPets, petFromSelectedPath } = require('./pet-store');
const { installPet, resolvePetDirectory } = require('./pet-installer');
const { StatusMonitor } = require('./status-monitor');

function argumentValue(name) {
  const equals = process.argv.find((value) => value.startsWith(`${name}=`));
  if (equals) return equals.slice(name.length + 1);
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

const projectPath = argumentValue('--project') ? path.resolve(argumentValue('--project')) : null;
const instanceKey = projectPath ? crypto.createHash('sha1').update(projectPath).digest('hex').slice(0, 10) : 'all';
app.setName('OrcaPet');
app.setPath('userData', path.join(app.getPath('appData'), 'OrcaPet', instanceKey));

const BASE_WIDTH = 220;
const BASE_HEIGHT = 250;
const SETTINGS_VERSION = 3;
const DEFAULT_SCALE = 1;
const PET_BASE_SCALE = 0.6;
let window;
let infoWindow;
let tray;
let monitor;
let pets = [];
let currentPet = null;
let status = { state: 'idle', detail: 'Starting…' };
let settings;
let wanderTimer;
let wanderDelayTimer;
let wanderDirection = 1;
let wandering = false;
let dragOrigin = null;
let menuOpen = false;
const IDLE_RUN_DELAY_MS = 12_000;
const RUN_STEP_PX = 4;

const home = process.env.ORCAPET_HOME || path.join(os.homedir(), '.orcapet');
const settingsPath = path.join(home, projectPath ? `settings-${instanceKey}.json` : 'settings.json');
const installedPetsRoot = path.join(home, 'pets');

function loadSettings() {
  try {
    const saved = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    const migratedScale = saved.settingsVersion === 2
      ? (Number(saved.scale) || 0.6) / PET_BASE_SCALE
      : DEFAULT_SCALE;
    return {
      scale: saved.settingsVersion === SETTINGS_VERSION ? saved.scale : migratedScale,
      wander: true,
      selectedPet: null,
      customPetDirectory: null,
      ...saved,
      ...(saved.settingsVersion === SETTINGS_VERSION ? {} : { scale: migratedScale }),
      settingsVersion: SETTINGS_VERSION
    };
  } catch {
    return { scale: DEFAULT_SCALE, wander: true, selectedPet: null, customPetDirectory: null, settingsVersion: SETTINGS_VERSION };
  }
}

function saveSettings() {
  fs.mkdirSync(home, { recursive: true });
  fs.writeFileSync(settingsPath, `${JSON.stringify(settings, null, 2)}\n`, { mode: 0o600 });
}

function serializablePet(pet) {
  if (!pet) return null;
  return { ...pet, spriteUrl: `file://${pet.spritesheetPath.split(path.sep).map(encodeURIComponent).join('/')}` };
}

function refreshPets(extraPet = null) {
  const discovered = discoverPets();
  pets = discovered.pets;
  if (!extraPet && settings.customPetDirectory) extraPet = petFromSelectedPath(settings.customPetDirectory);
  if (extraPet && !extraPet.error && !pets.some((pet) => pet.id === extraPet.id)) pets.unshift(extraPet);
  currentPet = pets.find((pet) => pet.id === settings.selectedPet) || pets[0] || null;
  if (currentPet) settings.selectedPet = currentPet.id;
  return discovered.errors;
}

function resizeWindow() {
  const scale = Math.min(2.5, Math.max(0.5, Number(settings.scale) || DEFAULT_SCALE));
  settings.scale = scale;
  if (!window) return;
  const previous = window.getBounds();
  const width = menuOpen ? 280 : Math.round(BASE_WIDTH * PET_BASE_SCALE * scale);
  const height = menuOpen ? 380 : Math.round(BASE_HEIGHT * PET_BASE_SCALE * scale);
  const next = {
    x: Math.round(previous.x + (previous.width - width) / 2),
    y: previous.y + previous.height - height,
    width,
    height
  };
  const area = screen.getDisplayMatching(previous).workArea;
  next.x = Math.max(area.x, Math.min(area.x + area.width - width, next.x));
  next.y = Math.max(area.y, Math.min(area.y + area.height - height, next.y));
  window.setBounds(next, true);
}

function createWindow() {
  window = new BrowserWindow({
    width: BASE_WIDTH,
    height: BASE_HEIGHT,
    transparent: true,
    frame: false,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  window.setAlwaysOnTop(true, 'floating');
  window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  window.loadFile(path.join(__dirname, 'index.html'));
  resizeWindow();
  const area = screen.getPrimaryDisplay().workArea;
  window.setPosition(area.x + area.width - window.getBounds().width - 28, area.y + area.height - window.getBounds().height - 12);
}

function positionInfoWindow() {
  if (!window || !infoWindow) return;
  const petBounds = window.getBounds();
  const area = screen.getDisplayMatching(petBounds).workArea;
  const infoBounds = infoWindow.getBounds();
  let x = petBounds.x + Math.round((petBounds.width - infoBounds.width) / 2);
  x = Math.max(area.x + 8, Math.min(area.x + area.width - infoBounds.width - 8, x));
  let y = petBounds.y - infoBounds.height - 4;
  if (y < area.y + 8) y = petBounds.y + petBounds.height + 4;
  infoWindow.setPosition(x, y);
}

function createInfoWindow() {
  infoWindow = new BrowserWindow({
    width: 300,
    height: 66,
    transparent: true,
    frame: false,
    resizable: false,
    focusable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  infoWindow.setAlwaysOnTop(true, 'floating');
  infoWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  infoWindow.setIgnoreMouseEvents(true);
  infoWindow.loadFile(path.join(__dirname, 'info.html'));
  positionInfoWindow();
  window.on('move', positionInfoWindow);
  window.on('resize', positionInfoWindow);
}

function buildTray() {
  const iconPath = app.isPackaged
    ? path.join(process.resourcesPath, 'icon.png')
    : path.join(__dirname, '..', 'assets', 'icon.png');
  const icon = nativeImage.createFromPath(iconPath).resize({ width: 18, height: 18, quality: 'best' });
  icon.setTemplateImage(true);
  tray = new Tray(icon);
  tray.setToolTip(projectPath ? `OrcaPet · ${path.basename(projectPath)}` : 'OrcaPet');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Pet を表示', click: () => window.show() },
    { label: 'Pet を選択…', click: () => choosePet() },
    { label: '別プロジェクトのPetを起動…', click: () => launchProjectPet() },
    { type: 'separator' },
    { label: '終了', click: () => app.quit() }
  ]));
}

async function launchProjectPet() {
  const result = await dialog.showOpenDialog(window, {
    title: 'Orcaプロジェクトのフォルダを選択',
    properties: ['openDirectory']
  });
  if (result.canceled) return;
  const selectedPath = result.filePaths[0];
  const args = app.isPackaged
    ? ['--project', selectedPath]
    : [app.getAppPath(), '--project', selectedPath];
  const child = spawn(process.execPath, args, { detached: true, stdio: 'ignore' });
  child.unref();
}

function startWandering() {
  clearInterval(wanderTimer);
  clearTimeout(wanderDelayTimer);
  wandering = false;
  if (!settings.wander || status.state !== 'idle') {
    window?.webContents.send('motion', { moving: false });
    return;
  }
  wanderDelayTimer = setTimeout(runToEdge, IDLE_RUN_DELAY_MS);
}

function runToEdge() {
  if (!settings.wander || status.state !== 'idle' || !window || window.isDestroyed()) return;
  const bounds = window.getBounds();
  const area = screen.getDisplayMatching(bounds).workArea;
  const leftDistance = bounds.x - area.x;
  const rightDistance = (area.x + area.width) - (bounds.x + bounds.width);
  wanderDirection = leftDistance <= rightDistance ? -1 : 1;
  wandering = true;
  window.webContents.send('motion', { moving: true, direction: wanderDirection > 0 ? 'right' : 'left' });
  wanderTimer = setInterval(() => {
    if (!window || window.isDestroyed() || status.state !== 'idle') {
      stopMotion(false);
      return;
    }
    const current = window.getBounds();
    const workArea = screen.getDisplayMatching(current).workArea;
    const destination = wanderDirection < 0 ? workArea.x : workArea.x + workArea.width - current.width;
    const nextX = wanderDirection < 0
      ? Math.max(destination, current.x - RUN_STEP_PX)
      : Math.min(destination, current.x + RUN_STEP_PX);
    window.setPosition(nextX, current.y);
    if (nextX === destination) stopMotion(false);
  }, 70);
}

function stopMotion(reschedule = true) {
  clearInterval(wanderTimer);
  clearTimeout(wanderDelayTimer);
  wanderTimer = null;
  wanderDelayTimer = null;
  if (wandering) window?.webContents.send('motion', { moving: false });
  wandering = false;
  if (reschedule && settings.wander && status.state === 'idle') {
    wanderDelayTimer = setTimeout(runToEdge, IDLE_RUN_DELAY_MS);
  }
}

async function choosePet() {
  const result = await dialog.showOpenDialog(window, {
    title: 'Codex Pet フォルダまたは pet.json を選択',
    properties: ['openFile', 'openDirectory'],
    filters: [{ name: 'Codex Pet manifest', extensions: ['json'] }]
  });
  if (result.canceled) return null;
  const pet = petFromSelectedPath(result.filePaths[0]);
  if (!pet || pet.error) {
    await dialog.showMessageBox(window, { type: 'error', message: 'Codex Pet を読み込めません', detail: pet?.error || 'pet.json がありません' });
    return null;
  }
  refreshPets(pet);
  currentPet = pet;
  settings.selectedPet = pet.id;
  settings.customPetDirectory = pet.directory;
  saveSettings();
  const value = serializablePet(pet);
  window.webContents.send('pet', value);
  return value;
}

async function installPetFromDialog() {
  const result = await dialog.showOpenDialog(window, {
    title: 'Codex Petをインストール',
    properties: ['openFile', 'openDirectory'],
    filters: [
      { name: 'Codex Pet', extensions: ['json', 'zip', 'codex-pet'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  });
  if (result.canceled) return null;
  let resolved;
  try {
    resolved = await resolvePetDirectory(result.filePaths[0]);
    const sourcePet = petFromSelectedPath(resolved.directory);
    if (!sourcePet || sourcePet.error) throw new Error(sourcePet?.error || 'Petパッケージを読み込めません');
    const existing = pets.find((pet) => pet.id === sourcePet.id && pet.directory.startsWith(installedPetsRoot));
    if (existing) {
      const confirmation = await dialog.showMessageBox(window, {
        type: 'question',
        buttons: ['更新する', 'キャンセル'],
        defaultId: 1,
        cancelId: 1,
        message: `${sourcePet.displayName} はインストール済みです`,
        detail: '現在のパッケージをバックアップして更新します。'
      });
      if (confirmation.response !== 0) return null;
    }
    const installed = installPet(resolved.directory, installedPetsRoot);
    refreshPets();
    currentPet = pets.find((pet) => pet.id === installed.pet.id) || installed.pet;
    settings.selectedPet = currentPet.id;
    settings.customPetDirectory = null;
    saveSettings();
    const value = serializablePet(currentPet);
    window.webContents.send('pet', value);
    await dialog.showMessageBox(window, {
      type: 'info',
      message: `${currentPet.displayName} をインストールしました`,
      detail: installed.backup ? '以前のパッケージはバックアップされています。' : 'すぐに利用できます。'
    });
    return { pet: value, pets: pets.map(serializablePet) };
  } catch (error) {
    await dialog.showMessageBox(window, { type: 'error', message: 'Petをインストールできません', detail: error.message });
    return null;
  } finally {
    resolved?.cleanup?.();
  }
}

app.whenReady().then(() => {
  if (process.platform === 'darwin') {
    const dockIconPath = app.isPackaged
      ? path.join(process.resourcesPath, 'icon.png')
      : path.join(__dirname, '..', 'assets', 'icon.png');
    const dockIcon = nativeImage.createFromPath(dockIconPath);
    if (!dockIcon.isEmpty()) app.dock.setIcon(dockIcon);
  }
  settings = loadSettings();
  refreshPets();
  createWindow();
  createInfoWindow();
  buildTray();
  monitor = new StatusMonitor((nextStatus) => {
    const previousState = status.state;
    status = nextStatus;
    window?.webContents.send('status', status);
    infoWindow?.webContents.send('status', status);
    if (status.state !== previousState) startWandering();
  }, { projectPath });
  monitor.start();
  startWandering();
});

app.on('window-all-closed', (event) => event.preventDefault());
app.on('before-quit', () => {
  monitor?.stop();
  clearInterval(wanderTimer);
  clearTimeout(wanderDelayTimer);
});

ipcMain.handle('get-initial-state', () => ({
  pet: serializablePet(currentPet),
  pets: pets.map(serializablePet),
  status,
  settings,
  projectPath
}));
ipcMain.handle('choose-pet', choosePet);
ipcMain.handle('select-pet', (_event, id) => {
  const selected = pets.find((pet) => pet.id === id);
  if (!selected) return null;
  currentPet = selected;
  settings.selectedPet = id;
  saveSettings();
  return serializablePet(selected);
});
ipcMain.handle('set-scale', (_event, scale) => {
  settings.scale = Number(scale);
  resizeWindow();
  saveSettings();
  return settings.scale;
});
ipcMain.handle('set-wander', (_event, enabled) => {
  settings.wander = Boolean(enabled);
  startWandering();
  if (!settings.wander) window?.webContents.send('motion', { moving: false });
  saveSettings();
  return settings.wander;
});
ipcMain.handle('stop-motion', () => {
  stopMotion(false);
  return true;
});
ipcMain.handle('set-menu-open', (_event, open) => {
  menuOpen = Boolean(open);
  stopMotion(false);
  resizeWindow();
  return menuOpen;
});
ipcMain.handle('launch-project-pet', async () => {
  await launchProjectPet();
  return true;
});
ipcMain.handle('install-pet', installPetFromDialog);
ipcMain.on('drag-begin', (_event, point) => {
  if (!window || !Number.isFinite(point?.x) || !Number.isFinite(point?.y)) return;
  stopMotion(false);
  const bounds = window.getBounds();
  dragOrigin = { mouseX: point.x, mouseY: point.y, windowX: bounds.x, windowY: bounds.y };
});
ipcMain.on('drag-move', (_event, point) => {
  if (!dragOrigin || !window || !Number.isFinite(point?.x) || !Number.isFinite(point?.y)) return;
  window.setPosition(
    Math.round(dragOrigin.windowX + point.x - dragOrigin.mouseX),
    Math.round(dragOrigin.windowY + point.y - dragOrigin.mouseY)
  );
});
ipcMain.on('drag-end', () => {
  dragOrigin = null;
});
ipcMain.handle('quit', () => app.quit());

import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import { spawn } from 'child_process';
import os from 'os';

let mainWindow = null;
let running = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 760,
    webPreferences: {
      preload: path.join(process.cwd(), 'application', 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    }
  });
  mainWindow.loadFile(path.join(process.cwd(), 'application', 'renderer.html'));
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

ipcMain.handle('run-scraper', async (_evt, payload) => {
  if (running) {
    return { ok: false, error: 'already_running' };
  }
  // Build CLI args
  const scriptPath = path.join(process.cwd(), 'scraper.js');
  const args = [scriptPath];
  if (payload?.buildingName) args.push('--building', String(payload.buildingName));
  if (payload?.searchParam) args.push('--search', String(payload.searchParam));
  if (payload?.maxProperties) args.push('--max', String(payload.maxProperties));
  if (payload?.headless) args.push('--headless', '1');
  if (payload?.contactMode) args.push('--contact', '1');

  // Prefer the real Node binary for reliability in dev
  const nodeCmd =
    process.env.npm_node_execpath ||
    process.env.NODE_BINARY ||
    process.env.NODE ||
    'node';
  const cwd = process.cwd();
  const env = {
    ...process.env,
    // If you need to force Chrome path locally, export PUPPETEER_EXECUTABLE_PATH before running Electron
    // Allow user to set PUPPETEER_EXECUTABLE_PATH etc. via environment if needed
  };
  const child = spawn(nodeCmd, args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
  running = child;

  const send = (type, line) => {
    mainWindow?.webContents.send('scraper-log', { type, line });
  };

  send('out', `spawn: ${nodeCmd} ${args.join(' ')}`);
  child.stdout.on('data', (buf) => {
    String(buf).split(/\r?\n/).forEach(l => l && send('out', l));
  });
  child.stderr.on('data', (buf) => {
    String(buf).split(/\r?\n/).forEach(l => l && send('err', l));
  });
  child.on('close', (code) => {
    send('status', code === 0 ? 'done' : `exit:${code}`);
    running = null;
  });
  child.on('error', (err) => {
    send('err', String(err?.message || err));
    running = null;
  });

  return { ok: true, pid: child.pid };
});

ipcMain.handle('cancel-scraper', async () => {
  if (!running) return { ok: false, error: 'not_running' };
  try {
    if (process.platform === 'win32') {
      spawn('taskkill', ['/pid', String(running.pid), '/t', '/f']);
    } else {
      running.kill('SIGTERM');
      setTimeout(() => running && running.kill('SIGKILL'), 2000);
    }
    running = null;
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e?.message || String(e) };
  }
});



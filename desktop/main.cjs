const { app, BrowserWindow, shell } = require('electron');
const path = require('node:path');
let instance;
// Finder-launched apps need the paths commonly used by coding-agent and media installers.
process.env.PATH = [path.join(app.getPath('home'), '.local/bin'), '/opt/homebrew/bin', '/usr/local/bin', process.env.PATH].join(path.delimiter);
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => { const win = BrowserWindow.getAllWindows()[0]; if (win) { win.restore(); win.focus(); } });
  const createWindow = () => {
    const win = new BrowserWindow({ width: 1420, height: 960, minWidth: 860, minHeight: 640, backgroundColor: '#f7f5f0', title: 'Lesson Library', webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true } });
    win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/.test(url)) shell.openExternal(url); return { action: 'deny' }; });
    win.webContents.on('will-navigate', (event, url) => { if (new URL(url).origin !== instance.url) { event.preventDefault(); if (/^https?:/.test(url)) shell.openExternal(url); } });
    win.loadURL(instance.url);
  };
  app.whenReady().then(async () => {
    const { startServer } = await import('../server/app.js');
    instance = await startServer({ port: 0 }); createWindow();
    app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createWindow(); });
  }).catch(error => { require('electron').dialog.showErrorBox('Lesson Library could not start', error.message); app.quit(); });
  app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
  app.on('before-quit', () => { instance?.server.close(); });
}

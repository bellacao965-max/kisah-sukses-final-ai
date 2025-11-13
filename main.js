const { app, BrowserWindow } = require('electron');
const path = require('path');
const { spawn } = require('child_process');

let mainWindow;
let serverProcess = null;

function startServer() {
  const serverPath = path.join(__dirname, '..', 'server', 'server.js');
  console.log('Starting backend server:', serverPath);
  try {
    serverProcess = spawn(process.execPath, [serverPath], {
      env: { ...process.env, NODE_ENV: app.isPackaged ? 'production' : 'development' },
      stdio: ['ignore', 'pipe', 'pipe']
    });

    serverProcess.stdout.on('data', (d) => console.log('[SERVER]', d.toString()));
    serverProcess.stderr.on('data', (d) => console.error('[SERVER ERROR]', d.toString()));
    serverProcess.on('exit', (code) => console.log('Server exited with code', code));
  } catch (err) {
    console.error('Failed to start server:', err);
  }
}

function stopServer() {
  if (serverProcess && !serverProcess.killed) {
    serverProcess.kill();
    console.log('Server stopped.');
    serverProcess = null;
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 800,
    backgroundColor: '#ffffff',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false
    },
    show: false
  });

  const devUrl = process.env.VITE_DEV_SERVER_URL || 'http://localhost:5173';
  const indexPath = app.isPackaged ? `file://${path.join(__dirname, '..', 'dist', 'index.html')}` : devUrl;

  mainWindow.loadURL(indexPath);
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// App lifecycle
app.whenReady().then(() => {
  startServer();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    stopServer();
    app.quit();
  }
});

app.on('before-quit', () => {
  stopServer();
});
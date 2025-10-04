import { app, BrowserWindow, session } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import http from 'http';
import handler from 'serve-handler';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// GPU 이슈 우회
app.disableHardwareAcceleration();

// ✅ 카메라 권한 자동 허용
app.whenReady().then(() => {
  session.defaultSession.setPermissionRequestHandler((wc, permission, cb) => {
    if (permission === 'media') return cb(true);
    cb(false);
  });
});

// ✅ public/를 127.0.0.1:5173 로 서빙
const STATIC_PORT = 5173;
let staticServer;
function startStaticServer() {
  const publicDir = path.join(__dirname, 'public');
  staticServer = http.createServer((req, res) => handler(req, res, { public: publicDir }));
  staticServer.listen(STATIC_PORT, '127.0.0.1', () =>
    console.log(`[static] http://127.0.0.1:${STATIC_PORT}/`));
}

function createWindow () {
  const win = new BrowserWindow({
    width: 1280, height: 720, autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  win.webContents.openDevTools({ mode: 'detach' });
  win.loadFile('index.html');
}

app.whenReady().then(() => { startStaticServer(); createWindow(); });
app.on('window-all-closed', () => {
  if (staticServer) staticServer.close();
  if (process.platform !== 'darwin') app.quit();
});

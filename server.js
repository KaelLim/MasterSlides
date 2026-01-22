const express = require('express');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { marked } = require('marked');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = 3000;

// 儲存房間狀態
const rooms = new Map();

// 讀取應用程式設定（支援環境變數覆蓋）
function loadAppConfig() {
  let config = { stage: 'beta', version: '1.0.0', showBadge: true };

  // 從 config.json 讀取
  const configPath = path.join(__dirname, 'config.json');
  if (fs.existsSync(configPath)) {
    try {
      config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    } catch (e) {
      console.error('讀取 config.json 失敗:', e.message);
    }
  }

  // 環境變數覆蓋（Docker 用）
  if (process.env.APP_STAGE) config.stage = process.env.APP_STAGE;
  if (process.env.APP_VERSION) config.version = process.env.APP_VERSION;
  if (process.env.APP_SHOW_BADGE !== undefined) {
    config.showBadge = process.env.APP_SHOW_BADGE === 'true';
  }

  return config;
}

const appConfig = loadAppConfig();
console.log(`應用程式版本: ${appConfig.stage} v${appConfig.version}`);

// 建立 docs 資料夾存放下載的 MD 檔案
const docsDir = path.join(__dirname, 'docs');
if (!fs.existsSync(docsDir)) {
  fs.mkdirSync(docsDir);
}

// 從 Google Docs URL 提取 Doc ID
function extractDocId(url) {
  const match = url.match(/\/document\/d\/([a-zA-Z0-9_-]+)/);
  return match ? match[1] : null;
}

// 生成純內容 HTML（無 CSS/JS，供 viewer 載入）
function generateContentHtml(contentHtml) {
  return contentHtml;
}

// 處理 Google Doc 下載與轉換（共用邏輯）
async function processGoogleDoc(docId) {
  const exportUrl = `https://docs.google.com/document/d/${docId}/export?format=md`;

  // 使用 Doc ID 作為目錄名稱
  const docDir = path.join(docsDir, docId);
  const imagesDir = path.join(docDir, 'images');
  const tempMdPath = path.join(docDir, 'temp.md');
  const contentFilepath = path.join(docDir, 'content.html');

  // 建立目錄結構（覆蓋舊檔案）
  if (!fs.existsSync(docDir)) {
    fs.mkdirSync(docDir, { recursive: true });
  }
  if (!fs.existsSync(imagesDir)) {
    fs.mkdirSync(imagesDir, { recursive: true });
  }

  // 使用 curl 下載 MD（-L 跟隨重定向，-f 失敗時回傳錯誤）
  const curlCmd = `curl -L -f -o "${tempMdPath}" "${exportUrl}"`;
  try {
    execSync(curlCmd, { timeout: 30000, stdio: 'pipe' });
  } catch (curlError) {
    const errMsg = curlError.stderr ? curlError.stderr.toString() : curlError.message;

    // 根據 HTTP 狀態碼判斷錯誤原因
    if (errMsg.includes('401')) {
      const err = new Error('文件需要登入才能存取');
      err.code = 'UNAUTHORIZED';
      err.hint = '請確認文件已設為「任何人都可檢視」';
      throw err;
    } else if (errMsg.includes('403')) {
      const err = new Error('沒有權限存取此文件');
      err.code = 'FORBIDDEN';
      err.hint = '請確認文件已設為「任何人都可檢視」';
      throw err;
    } else if (errMsg.includes('404')) {
      const err = new Error('找不到此文件');
      err.code = 'NOT_FOUND';
      err.hint = '請確認文件 ID 正確，且文件尚未被刪除';
      throw err;
    } else if (errMsg.includes('Could not resolve host')) {
      const err = new Error('無法連線到 Google');
      err.code = 'NETWORK';
      err.hint = '請檢查網路連線';
      throw err;
    } else {
      const err = new Error('下載失敗');
      err.code = 'UNKNOWN';
      err.hint = errMsg;
      throw err;
    }
  }

  // 檢查檔案是否存在且有內容
  if (!fs.existsSync(tempMdPath)) {
    throw new Error('下載失敗：檔案未建立');
  }

  const stats = fs.statSync(tempMdPath);
  if (stats.size === 0) {
    fs.unlinkSync(tempMdPath); // 刪除空檔案
    const err = new Error('無法存取文件。請確認：\n1. 文件已設為「任何人都可檢視」\n2. 網址正確無誤');
    err.code = 'FORBIDDEN';
    throw err;
  }

  // 讀取 MD 並轉換為 HTML
  let markdown = fs.readFileSync(tempMdPath, 'utf-8');

  // 將 base64 圖片轉換為實際檔案
  let imageCount = 0;

  // 逐行處理，找出圖片引用定義
  const lines = markdown.split('\n');
  const processedLines = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // 跳過「分頁 N」標記（可能是標題或純文字）
    if (/^#*\s*分頁\s*\d+\s*$/.test(line.trim())) {
      console.log(`移除分頁標記: ${line}`);
      continue;
    }

    // 檢查是否為圖片引用定義行: [image1]: <data:image/...;base64,...>
    const refMatch = line.match(/^\[([^\]]+)\]:\s*<data:image\/(png|jpeg|jpg|gif|webp);base64,(.+)>$/);

    if (refMatch) {
      const [, refName, format, base64Data] = refMatch;
      imageCount++;

      const ext = format === 'jpeg' ? 'jpg' : format;
      const imgFilename = `img_${imageCount}.${ext}`;
      const imgPath = path.join(imagesDir, imgFilename);

      // 清理 base64 數據
      const cleanBase64 = base64Data.replace(/[\r\n\s]/g, '');

      console.log(`找到圖片 ${refName}: format=${format}, base64長度=${cleanBase64.length}`);

      try {
        const buffer = Buffer.from(cleanBase64, 'base64');
        if (buffer.length > 0) {
          fs.writeFileSync(imgPath, buffer);
          console.log(`已儲存圖片: ${imgFilename} (${buffer.length} bytes)`);
          // 替換為檔案路徑（相對於 index.html）
          processedLines.push(`[${refName}]: images/${imgFilename}`);
        } else {
          console.error(`圖片 ${refName} buffer 為空`);
          processedLines.push(line);
        }
      } catch (err) {
        console.error(`圖片轉換失敗 ${refName}: ${err.message}`);
        processedLines.push(line);
      }
    } else {
      processedLines.push(line);
    }
  }

  markdown = processedLines.join('\n');

  console.log(`共處理 ${imageCount} 張圖片`);

  // 轉換為 HTML
  marked.setOptions({ breaks: true, gfm: true });
  const contentHtml = marked.parse(markdown);

  // 生成純內容 HTML
  const pureContent = generateContentHtml(contentHtml);

  // 儲存內容檔案
  fs.writeFileSync(contentFilepath, pureContent, 'utf-8');

  // 刪除暫存 MD 檔
  fs.unlinkSync(tempMdPath);

  return { success: true, docId };
}

// 靜態檔案服務
app.use(express.static(__dirname));
app.use('/docs', express.static(docsDir));

// 解析 JSON body
app.use(express.json());

// 路由重導向
app.get('/upload', (req, res) => {
  res.redirect('/upload.html');
});

app.get('/slides', (req, res) => {
  res.redirect('/slides.html' + (req.query.src ? '?src=' + req.query.src : ''));
});

// API: 取得應用程式設定（供 badge.js 使用）
app.get('/api/config', (req, res) => {
  res.json(appConfig);
});

// URL 直接轉換：模擬 Google Docs URL 格式
// 例如：/document/d/1EJi4AabcbPV2Eqhx.../edit?tab=t.0
// 使用 regex 匹配 docId（支援任何後續路徑）
app.get(/^\/document\/d\/([a-zA-Z0-9_-]+)/, async (req, res) => {
  const docId = req.params[0];

  console.log(`[URL 轉換] 收到請求: docId=${docId}`);

  try {
    await processGoogleDoc(docId);
    console.log(`[URL 轉換] 成功，重導向至 /slides.html?src=${docId}`);
    res.redirect(`/slides.html?src=${docId}`);
  } catch (error) {
    console.error(`[URL 轉換] 失敗: ${error.message}`);

    // 根據錯誤代碼決定 HTTP 狀態碼
    const statusCodes = {
      'UNAUTHORIZED': 401,
      'FORBIDDEN': 403,
      'NOT_FOUND': 404,
      'NETWORK': 503,
      'UNKNOWN': 500
    };
    const httpStatus = statusCodes[error.code] || 500;

    // 錯誤圖示 (Material Icons)
    const errorIcons = {
      'UNAUTHORIZED': 'lock',
      'FORBIDDEN': 'block',
      'NOT_FOUND': 'search_off',
      'NETWORK': 'wifi_off',
      'UNKNOWN': 'error_outline'
    };
    const icon = errorIcons[error.code] || 'error_outline';

    res.status(httpStatus).send(`
      <!DOCTYPE html>
      <html lang="zh-TW">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>轉換失敗</title>
        <link rel="preconnect" href="https://fonts.googleapis.com">
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
        <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@400;500;600&display=swap" rel="stylesheet">
        <link href="https://fonts.googleapis.com/icon?family=Material+Icons+Round" rel="stylesheet">
        <script src="/badge.js" defer></script>
        <style>
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body {
            font-family: "Noto Sans TC", -apple-system, BlinkMacSystemFont, sans-serif;
            min-height: 100vh;
            display: flex;
            justify-content: center;
            align-items: center;
            padding: 20px;
            background: #1a1a2e;
            background-image: url('/theme/default/background.jpg');
            background-size: cover;
            background-position: center;
          }
          .container {
            background: rgba(0, 0, 0, 0.85);
            backdrop-filter: blur(20px);
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 16px;
            padding: 50px;
            max-width: 500px;
            width: 100%;
            text-align: center;
          }
          .icon {
            font-size: 72px;
            color: #ff6b6b;
            margin-bottom: 24px;
          }
          h1 {
            color: #ff6b6b;
            font-size: 28px;
            font-weight: 600;
            margin-bottom: 16px;
          }
          .hint {
            color: rgba(255, 255, 255, 0.6);
            font-size: 18px;
            line-height: 1.8;
            margin-bottom: 30px;
          }
          .doc-id {
            display: inline-block;
            background: rgba(255, 255, 255, 0.1);
            padding: 8px 16px;
            border-radius: 6px;
            font-family: monospace;
            font-size: 13px;
            color: rgba(255, 255, 255, 0.4);
            margin-bottom: 24px;
            word-break: break-all;
          }
          .btn {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 10px;
            padding: 16px 28px;
            background: rgba(255, 255, 255, 0.1);
            border: 1px solid rgba(255, 255, 255, 0.2);
            border-radius: 8px;
            color: white;
            text-decoration: none;
            font-size: 18px;
            transition: all 0.2s;
          }
          .btn:hover {
            background: rgba(255, 255, 255, 0.2);
          }
          .material-icons-round {
            font-size: 24px;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="icon"><span class="material-icons-round" style="font-size: 72px;">${icon}</span></div>
          <h1>${error.message}</h1>
          <p class="hint">${error.hint || ''}</p>
          <div class="doc-id">${docId}</div>
          <br>
          <a href="/upload.html" class="btn">
            <span class="material-icons-round">arrow_back</span>
            返回上傳頁面
          </a>
        </div>
      </body>
      </html>
    `);
  }
});

// API: 下載 Google Docs 為 Markdown
app.post('/api/fetch-doc', async (req, res) => {
  const { url } = req.body;

  if (!url) {
    return res.status(400).json({ error: '請提供 Google Docs 網址' });
  }

  // 從 URL 擷取 document ID
  const docId = extractDocId(url);
  if (!docId) {
    return res.status(400).json({ error: '無效的 Google Docs 網址格式' });
  }

  try {
    await processGoogleDoc(docId);

    // 成功 - 返回 viewer URL
    res.json({
      success: true,
      docId: docId,
      slidesUrl: `/slides.html?src=${docId}`
    });

  } catch (error) {
    // 錯誤處理
    if (error.code === 'FORBIDDEN' || error.message.includes('exit code 22') || error.message.includes('403') || error.message.includes('401')) {
      return res.status(403).json({
        error: '權限不足！請確認文件已設為「任何人都可檢視」'
      });
    }

    return res.status(500).json({
      error: `下載失敗：${error.message}`
    });
  }
});

// Socket.io 遙控功能
io.on('connection', (socket) => {
  console.log('用戶連線:', socket.id);

  // 簡報端：建立房間
  socket.on('host', (roomId) => {
    socket.join(roomId);
    rooms.set(roomId, {
      hostId: socket.id,
      currentPage: 1,
      totalPages: 1
    });
    console.log(`簡報建立房間: ${roomId}`);
  });

  // 遙控端：加入房間
  socket.on('join', (roomId) => {
    if (rooms.has(roomId)) {
      socket.join(roomId);
      const room = rooms.get(roomId);
      socket.emit('sync', room);
      // 通知簡報端有遙控器連線
      socket.to(roomId).emit('remote-joined');
      console.log(`遙控加入房間: ${roomId}`);
    } else {
      socket.emit('error', '房間不存在');
    }
  });

  // 簡報端：同步狀態
  socket.on('state', (data) => {
    if (rooms.has(data.roomId)) {
      const room = rooms.get(data.roomId);
      room.currentPage = data.currentPage;
      room.totalPages = data.totalPages;
      room.images = data.images || [];
      socket.to(data.roomId).emit('sync', room);
    }
  });

  // 遙控端：發送指令
  socket.on('command', (data) => {
    console.log(`遙控指令: ${data.action} -> 房間 ${data.roomId}`);
    // 傳遞完整的 data 物件（包含 action 和可能的 src）
    socket.to(data.roomId).emit('command', data);
  });

  socket.on('disconnect', () => {
    console.log('用戶斷線:', socket.id);
    // 清理該用戶建立的房間
    for (const [roomId, room] of rooms.entries()) {
      if (room.hostId === socket.id) {
        rooms.delete(roomId);
        console.log(`房間已關閉: ${roomId}`);
      }
    }
  });
});

// 啟動伺服器
const HOST = process.env.HOST || '0.0.0.0';
server.listen(PORT, HOST, () => {
  console.log(`伺服器已啟動：http://${HOST}:${PORT}`);
  console.log(`上傳頁面：http://localhost:${PORT}/upload.html`);
  if (HOST === '0.0.0.0') {
    const os = require('os');
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
      for (const iface of interfaces[name]) {
        if (iface.family === 'IPv4' && !iface.internal) {
          console.log(`內網存取：http://${iface.address}:${PORT}`);
        }
      }
    }
  }
});

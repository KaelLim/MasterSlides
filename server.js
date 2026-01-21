const express = require('express');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { marked } = require('marked');

const app = express();
const PORT = 3000;

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

  const exportUrl = `https://docs.google.com/document/d/${docId}/export?format=md`;

  // 使用 Doc ID 作為目錄名稱
  const docDir = path.join(docsDir, docId);
  const imagesDir = path.join(docDir, 'images');
  const tempMdPath = path.join(docDir, 'temp.md');
  const contentFilepath = path.join(docDir, 'content.html');

  try {
    // 建立目錄結構（覆蓋舊檔案）
    if (!fs.existsSync(docDir)) {
      fs.mkdirSync(docDir, { recursive: true });
    }
    if (!fs.existsSync(imagesDir)) {
      fs.mkdirSync(imagesDir, { recursive: true });
    }

    // 使用 curl 下載 MD（-L 跟隨重定向，-f 失敗時回傳錯誤）
    const curlCmd = `curl -L -f -o "${tempMdPath}" "${exportUrl}"`;
    execSync(curlCmd, { timeout: 30000 });

    // 檢查檔案是否存在且有內容
    if (!fs.existsSync(tempMdPath)) {
      return res.status(500).json({ error: '下載失敗：檔案未建立' });
    }

    const stats = fs.statSync(tempMdPath);
    if (stats.size === 0) {
      fs.unlinkSync(tempMdPath); // 刪除空檔案
      return res.status(403).json({
        error: '無法存取文件。請確認：\n1. 文件已設為「任何人都可檢視」\n2. 網址正確無誤'
      });
    }

    // 讀取 MD 並轉換為 HTML
    let markdown = fs.readFileSync(tempMdPath, 'utf-8');

    // 將 base64 圖片轉換為實際檔案
    // Google Docs 格式: [image1]: <data:image/png;base64,XXXX>
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

    // 成功 - 返回 viewer URL
    res.json({
      success: true,
      docId: docId,
      slidesUrl: `/slides.html?src=${docId}`
    });

  } catch (error) {
    // 清理可能產生的暫存檔案
    if (fs.existsSync(tempMdPath)) {
      fs.unlinkSync(tempMdPath);
    }

    // curl 錯誤處理
    if (error.message.includes('exit code 22') || error.message.includes('403') || error.message.includes('401')) {
      return res.status(403).json({
        error: '權限不足！請確認文件已設為「任何人都可檢視」'
      });
    }

    return res.status(500).json({
      error: `下載失敗：${error.message}`
    });
  }
});

// 啟動伺服器
const HOST = process.env.HOST || '0.0.0.0';
app.listen(PORT, HOST, () => {
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

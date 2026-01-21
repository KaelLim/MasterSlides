const fs = require('fs');
const path = require('path');
const { marked } = require('marked');

// 讀取 Markdown
const mdPath = path.join(__dirname, 'content.md');
const markdown = fs.readFileSync(mdPath, 'utf-8');

// 轉換為 HTML
marked.setOptions({ breaks: true, gfm: true });

// 修正 Google Docs 圖片格式：移除 data URI 周圍的角括號
let processedMarkdown = markdown.replace(/\]: <(data:image\/[^>]+)>/g, ']: $1');

const contentHtml = marked.parse(processedMarkdown);

// 寫入純內容 HTML（供 viewer.html 載入）
const contentPath = path.join(__dirname, 'content.html');
fs.writeFileSync(contentPath, contentHtml, 'utf-8');

console.log('建置完成: content.html');
console.log('使用方式: 開啟 viewer.html?src=content.html');

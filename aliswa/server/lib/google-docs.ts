export function extractDocId(url: string): string | null {
  const match = url.match(/\/document\/d\/([a-zA-Z0-9_-]+)/);
  return match ? match[1] : null;
}

export async function fetchMarkdown(docId: string): Promise<string> {
  const exportUrl = `https://docs.google.com/document/d/${docId}/export?format=md`;

  const res = await fetch(exportUrl, {
    redirect: "follow",
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; Aliswa/1.0)",
    },
  });

  if (!res.ok) {
    const errorMap: Record<number, string> = {
      401: "文件需要登入才能存取，請確認已設為「任何人都可檢視」",
      403: "沒有權限存取此文件，請確認已設為「任何人都可檢視」",
      404: "找不到此文件，請確認文件 ID 正確",
    };
    throw new Error(errorMap[res.status] || `下載失敗 (HTTP ${res.status})`);
  }

  const text = await res.text();
  if (!text || text.length === 0) {
    throw new Error("文件內容為空");
  }

  return text;
}

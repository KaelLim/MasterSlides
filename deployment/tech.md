# Supabase + App 統一部署技術文件

本文件說明如何透過 Kong API Gateway 統一部署 Supabase 與任意應用程式，支援開發/正式兩種模式切換。

---

## 架構概述

### 開發模式（僅 Supabase）

```
┌─────────────────────────────────────────────────────────────────┐
│                     Kong API Gateway (:8000)                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   /studio/*          → Studio (:3000)                            │
│   /api/platform/*    → Studio (rewrite /studio/api/platform/*)   │
│   /api/v1/*          → Studio (rewrite /studio/api/v1/*)         │
│   /rest/v1/*         → PostgREST (:3000)                         │
│   /auth/v1/*         → GoTrue (:9999)                            │
│   /storage/v1/*      → Storage (:5000)                           │
│   /realtime/v1/*     → Realtime (:4000)                          │
│   /*                 → Studio (catch-all，開發用)                 │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 正式模式（Supabase + App）

```
┌─────────────────────────────────────────────────────────────────┐
│                     Kong API Gateway (:8000)                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   /studio/*          → Studio (:3000)                            │
│   /api/platform/*    → Studio (rewrite /studio/api/platform/*)   │
│   /api/v1/*          → Studio (rewrite /studio/api/v1/*)         │
│   /rest/v1/*         → PostgREST (:3000)                         │
│   /auth/v1/*         → GoTrue (:9999)                            │
│   /storage/v1/*      → Storage (:5000)                           │
│   /realtime/v1/*     → Realtime (:4000)                          │
│   /*                 → Your App (:3000)  [catch-all]             │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 快速開始

### 開發模式

```bash
docker compose up -d
```

- `http://localhost:8000/` → Studio Dashboard
- `http://localhost:8000/studio/` → Studio Dashboard
- 帳號：`.env` 中的 `DASHBOARD_USERNAME` / `DASHBOARD_PASSWORD`

### 正式模式（含 App）

```bash
# 1. 修改 kong.yml：啟用 [B] 區塊，註解 [A] 區塊（見下方說明）
# 2. 啟動
docker compose --profile app up -d
```

- `http://localhost:8000/` → Your App
- `http://localhost:8000/studio/` → Studio Dashboard

---

## 模式切換：kong.yml 根路徑設定

`volumes/api/kong.yml` 底部有兩個區塊，擇一啟用：

### [A] 開發模式（預設啟用）

```yaml
## [A] 開發模式：根路徑代理到 Studio
- name: root-to-studio
  url: http://studio:3000/studio
  routes:
    - name: root-to-studio-route
      strip_path: true
      paths:
        - /
  plugins:
    - name: cors
    - name: basic-auth
      config:
        hide_credentials: true
```

### [B] 正式模式（需手動啟用）

```yaml
## [B] 正式環境：根路徑轉發到 App
- name: my-app
  url: http://my-app:3000/
  routes:
    - name: my-app-all
      strip_path: false
      paths:
        - /
  plugins:
    - name: cors
```

### 切換步驟

```
開發 → 正式：註解 [A]，取消註解 [B]，重啟 Kong
正式 → 開發：註解 [B]，取消註解 [A]，重啟 Kong

docker compose restart kong
```

---

## 插入你的專案

### Step 1：在 docker-compose.yml 新增 App 服務

```yaml
# 你的應用程式（僅在 --profile app 時啟動）
my-app:
  container_name: my-app
  profiles: [app]
  build:
    context: /path/to/your/app
    dockerfile: Dockerfile
  restart: unless-stopped
  environment:
    NODE_ENV: production
    # 你的 App 環境變數
    SUPABASE_URL: http://kong:8000
    SUPABASE_ANON_KEY: ${ANON_KEY}
  healthcheck:
    test: ["CMD", "wget", "--spider", "http://localhost:3000/"]
    interval: 10s
    timeout: 5s
    retries: 3
```

### Step 2：修改 kong.yml [B] 區塊

```yaml
- name: my-app
  url: http://my-app:3000/       # container_name 對應
  routes:
    - name: my-app-all
      strip_path: false
      paths:
        - /
  plugins:
    - name: cors
```

### Step 3：啟動

```bash
docker compose --profile app up -d
```

### 範例：MasterSlides

```yaml
# docker-compose.yml
master-slides:
  container_name: master-slides
  profiles: [app]
  build:
    context: ../../..
    dockerfile: Dockerfile.dev
  volumes:
    - ../../..:/app
    - /app/node_modules
    - slides-data:/app/docs
  environment:
    NODE_ENV: development
    SUPABASE_URL: http://kong:8000
    SUPABASE_ANON_KEY: ${ANON_KEY}
```

```yaml
# kong.yml [B] 區塊
- name: master-slides
  url: http://master-slides:3000/
  routes:
    - name: master-slides-all
      strip_path: false
      paths:
        - /
  plugins:
    - name: cors
```

### 範例：替換成其他專案

```yaml
# docker-compose.yml
my-blog:
  container_name: my-blog
  profiles: [app]
  image: ghost:5-alpine
  environment:
    url: http://localhost:8000
```

```yaml
# kong.yml [B] 區塊
- name: my-blog
  url: http://my-blog:2368/
  routes:
    - name: my-blog-all
      strip_path: false
      paths:
        - /
  plugins:
    - name: cors
```

---

## 跨平台 Storage 設定

### 問題

macOS Docker 的 bind mount 不支援 xattr（extended attributes），導致 TUS 可續傳上傳失敗：

```
"The file system does not support extended attributes or has the feature disabled."
```

### 解決方案：docker-compose.override.yml

| 檔案 | 平台 | Volume 類型 |
|------|------|-------------|
| `docker-compose.yml` | Linux 正式 | bind mount（可直接存取檔案） |
| `docker-compose.override.yml` | macOS 開發 | named volume（支援 xattr） |

**`docker-compose.yml`**（正式環境）：
```yaml
storage:
  volumes:
    - ./volumes/storage:/var/lib/storage:z    # bind mount
```

**`docker-compose.override.yml`**（macOS 開發，已加入 .gitignore）：
```yaml
services:
  storage:
    volumes:
      - storage-data:/var/lib/storage         # named volume

volumes:
  storage-data:
```

### 原理

```
macOS bind mount:
  Container → Linux VM → VirtioFS 轉換 → macOS APFS  ❌ xattr 遺失

macOS named volume:
  Container → Linux VM ext4                            ✅ xattr 正常

Linux (兩者皆可):
  Container → Linux ext4                               ✅ 直接存取
```

### 運作方式

Docker Compose 自動載入 `override.yml`（如果存在）：
- **macOS 開發者**：保留 `docker-compose.override.yml`
- **Linux 部署**：不放這個檔案（已在 `.gitignore`）

---

## Studio 子路徑部署原理

### 為什麼需要自訂 Studio Image？

Supabase Studio 是 Next.js 應用，預設部署在 `/`。部署到 `/studio` 需要：

1. **建置時設定 basePath** → 影響頁面路由 + 靜態資源
2. **Kong 路由重寫** → 解決 API 呼叫路徑問題

### 建置自訂 Image

修改 `apps/studio/Dockerfile`：

```dockerfile
FROM dev AS builder

ARG NEXT_PUBLIC_BASE_PATH
ENV NEXT_PUBLIC_BASE_PATH=$NEXT_PUBLIC_BASE_PATH

RUN pnpm --filter studio exec next build
```

建置：

```bash
docker build . \
  -f apps/studio/Dockerfile \
  --target production \
  --build-arg NEXT_PUBLIC_BASE_PATH=/studio \
  -t masterslides-studio:latest
```

### basePath 影響範圍

設定 `NEXT_PUBLIC_BASE_PATH=/studio` 後：

| 類型 | 原始路徑 | 變更後 |
|------|----------|--------|
| 頁面 | `/project/default` | `/studio/project/default` |
| 靜態資源 | `/_next/static/...` | `/studio/_next/static/...` |
| API 路由 | `/api/platform/...` | `/studio/api/platform/...` |

### API 路徑重寫（關鍵）

問題：Studio 前端 JavaScript 呼叫 `/api/*` 而非 `/studio/api/*`

解決：Kong 設定 `url: http://studio:3000/studio`，自動加上前綴

```
瀏覽器請求: GET /api/platform/profile
    ↓ Kong 匹配 /api/platform 路由
    ↓ url = http://studio:3000/studio + /api/platform/profile
Studio 收到: GET /studio/api/platform/profile ✅
```

---

## 更新 Supabase

每次更新官方版本時的檢查清單：

```bash
cd supabase-official && git pull
```

| 檔案 | 確認事項 |
|------|----------|
| `apps/studio/next.config.js` | `basePath: process.env.NEXT_PUBLIC_BASE_PATH` 還在 |
| `apps/studio/Dockerfile` | build stage 結構是否大改 |
| `docker/.env.example` | 是否新增必要環境變數 |
| `docker/docker-compose.yml` | 是否新增服務或改 port |

更新後重建 Studio：

```bash
docker build . \
  -f apps/studio/Dockerfile \
  --target production \
  --build-arg NEXT_PUBLIC_BASE_PATH=/studio \
  -t masterslides-studio:latest

cd docker && docker compose up -d
```

---

## 驗證測試

```bash
# 基本服務
curl -s -o /dev/null -w "%{http_code}" http://localhost:8000/              # 開發: 401, 正式: App response
curl -s -o /dev/null -w "%{http_code}" -u user:pass http://localhost:8000/studio/  # 200/308

# Studio API
curl -s -o /dev/null -w "%{http_code}" -u user:pass http://localhost:8000/api/platform/profile    # 200
curl -s -o /dev/null -w "%{http_code}" -u user:pass http://localhost:8000/api/v1/projects/default  # 200

# Supabase API
curl -s -o /dev/null -w "%{http_code}" -H "apikey: $ANON_KEY" http://localhost:8000/rest/v1/          # 200
curl -s -o /dev/null -w "%{http_code}" -H "apikey: $ANON_KEY" http://localhost:8000/auth/v1/settings  # 200
curl -s -o /dev/null -w "%{http_code}" http://localhost:8000/storage/v1/status                         # 200
```

---

## 常見問題

### Q1: Studio 顯示 "This project doesn't exist"

Kong 缺少 `/api/platform` 和 `/api/v1` 路由。確認 `url` 指向 `http://studio:3000/studio`。

### Q2: Studio CSS/JS 載入失敗

建置時未傳入 `--build-arg NEXT_PUBLIC_BASE_PATH=/studio`。

### Q3: macOS Storage 上傳 500 錯誤

缺少 `docker-compose.override.yml`，或其內容未正確覆寫 storage volume。

### Q4: App 的 `/api/*` 路由被 Studio 攔截

確保你的 App API 路徑不使用 `/api/platform` 或 `/api/v1` 前綴，這兩個被 Studio 佔用。

### Q5: 切換模式後 Kong 沒生效

Kong 使用啟動時載入的配置，修改 `kong.yml` 後必須重啟：`docker compose restart kong`

---

## 檔案清單

| 檔案 | 用途 | 進版控 |
|------|------|--------|
| `docker-compose.yml` | 服務定義（含 profiles） | ✅ |
| `docker-compose.override.yml` | macOS Storage 修正 | ❌ (.gitignore) |
| `volumes/api/kong.yml` | Kong 路由配置 | ✅ |
| `.env` | 環境變數（含密鑰） | ❌ (.gitignore) |
| `apps/studio/Dockerfile` | Studio 建置（含 basePath） | ✅ |

---

## 參考資料

- [Next.js basePath](https://nextjs.org/docs/app/api-reference/next-config-js/basePath)
- [Kong Declarative Config](https://docs.konghq.com/gateway/latest/production/deployment-topologies/db-less-and-declarative-config/)
- [Docker Compose Profiles](https://docs.docker.com/compose/how-tos/profiles/)
- [Docker Compose Override](https://docs.docker.com/compose/how-tos/multiple-compose-files/merge/)
- [Supabase Self-Hosting](https://supabase.com/docs/guides/self-hosting)

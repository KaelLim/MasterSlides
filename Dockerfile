FROM node:20-alpine

# 安裝 curl（下載 Google Docs 用）和 git（clone 用）
RUN apk add --no-cache curl git

# 設定工作目錄
WORKDIR /app

# 從 GitHub clone 程式碼
ARG REPO_URL=https://github.com/KaelLim/MasterSlides.git
ARG BRANCH=main
RUN git clone --depth 1 --branch ${BRANCH} ${REPO_URL} .

# 安裝依賴
RUN npm ci --only=production

# 建立 docs 目錄
RUN mkdir -p /app/docs

# 環境變數（可被 docker run -e 或 docker-compose 覆蓋）
ENV NODE_ENV=production
ENV APP_STAGE=alpha
ENV APP_VERSION=1.0.0
ENV APP_SHOW_BADGE=true

# 開放 port
EXPOSE 3000

# 啟動
CMD ["node", "server.js"]

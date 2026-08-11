# =========================================================
# Stage 1: 构建 Vue 前端（产物 dist/）
# =========================================================
FROM node:24-slim AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY index.html vite.config.mjs ./
COPY src ./src
RUN npm run build

# =========================================================
# Stage 2: 运行时（Node 后端 + Playwright/Chromium + 构建产物）
# =========================================================
# 不用 playwright 官方镜像：它打包了 firefox/webkit 等全套浏览器，
# docker save 达 2.3GB，超过 GitHub 上传上限。改为 node:slim + 只装
# Chromium，镜像约 700MB。
FROM node:24-slim

WORKDIR /app

ENV NODE_ENV=production
ENV SP_DATA_DIR=/data
ENV SP_NO_SANDBOX=1
ENV PORT=3456
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

# Chromium 所需基础库 + Xvfb（headed 模式的虚拟显示器，xvfb-run 需要 xauth）
RUN apt-get update \
    && apt-get install -y --no-install-recommends xvfb xauth ca-certificates fonts-liberation \
    && rm -rf /var/lib/apt/lists/*

# 安装运行时依赖，并只下载 Chromium 及其系统依赖
COPY package.json package-lock.json ./
RUN npm ci --omit=dev \
    && npx playwright install --with-deps chromium \
    && rm -rf /var/lib/apt/lists/*

# 前端构建产物 + 服务端代码
COPY --from=build /app/dist ./dist
COPY server.js southplus.js ./

# 数据目录：auth.json、threads_analysis.json、scanned_cache.json、schedule.json 均在此，
# 通过卷挂载持久化（启动前请先把 auth.json 放入数据目录）
VOLUME /data

EXPOSE 3456

# 显式以 root 运行，确保挂载的 /data 卷可写（SP_NO_SANDBOX=1 已为 Chromium 关闭沙箱）
USER root

# xvfb-run 提供虚拟显示器供 Chromium 使用，-a 自动分配可用 DISPLAY
CMD ["xvfb-run", "-a", "node", "server.js"]

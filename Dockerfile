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
# Stage 2: 运行时（Node 后端 + Playwright + 构建产物）
# =========================================================
# 使用与 package.json 中 playwright 版本匹配的官方镜像（自带 Chromium 及其系统依赖）
FROM mcr.microsoft.com/playwright:v1.62.1-jammy

WORKDIR /app

ENV NODE_ENV=production
ENV SP_DATA_DIR=/data
ENV SP_NO_SANDBOX=1
ENV PORT=3456

# southplus.js 以 headless:false 启动 Chromium，容器内需 Xvfb 提供虚拟显示器
RUN apt-get update \
    && apt-get install -y --no-install-recommends xvfb \
    && rm -rf /var/lib/apt/lists/*

# 仅安装运行时依赖（playwright；浏览器由镜像自带，无需 playwright install）
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

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

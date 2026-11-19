# Nova web preview: the browser build of the window, served by nginx.
# The desktop app (voice on Windows, opening apps) is an Electron installer, not a container.
# This image chats with an Ollama running on your own PC, straight from the page.
#
#   docker build -t nova-web .
#   docker run --rm -p 8080:8080 nova-web      then open http://localhost:8080

FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
# Same install as CI: no install scripts, so the Electron binary is not downloaded.
RUN npm ci --ignore-scripts
COPY . .
# VERCEL=1 selects the web build, whose Content Security Policy allows localhost for Ollama.
ARG VERCEL=1
ENV VERCEL=$VERCEL
RUN npx electron-vite build && node scripts/check-csp.mjs web

FROM nginxinc/nginx-unprivileged:stable-alpine
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/out/renderer /usr/share/nginx/html
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s CMD wget -q --spider http://127.0.0.1:8080/ || exit 1

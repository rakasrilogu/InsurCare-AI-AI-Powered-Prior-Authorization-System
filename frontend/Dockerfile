# ── Stage 1: build ────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json* bun.lock* ./
RUN npm install

# Accept VITE_API_URL at build time (e.g. pass via docker build --build-arg)
# Falls back to empty string → runtime window.__API_URL__ override or /api proxy
ARG VITE_API_URL
ENV VITE_API_URL=${VITE_API_URL}

COPY . .
RUN npm run build

# ── Stage 2: serve with nginx ─────────────────────────────────────────────────
FROM nginx:1.27-alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]

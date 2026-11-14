FROM node:22-slim
WORKDIR /app
COPY package*.json bun.lock* ./
RUN npm install --no-audit --no-fund
COPY . .
# VITE_API_URL is empty: the page and the API are served by the same server
RUN npm run build
ENV NODE_ENV=production
ENV DATA_DIR=/data
EXPOSE 3000
CMD ["npx", "tsx", "server.ts"]

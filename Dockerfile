# Dockerfile for hive-mcp-attest — HiveAttest MCP shim
FROM node:20-alpine
WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund

COPY server.js ./

EXPOSE 3000
ENV PORT=3000
ENV HIVE_BASE=https://hivemorph.onrender.com

CMD ["node", "server.js"]

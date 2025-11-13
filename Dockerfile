# Simple Dockerfile for KisahSukses AI Proxy Server
FROM node:18-alpine

WORKDIR /app
COPY package*.json ./
RUN npm install --only=production

COPY . .
EXPOSE 3000

ENV PORT=3000
CMD ["node", "server.js"]

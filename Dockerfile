FROM node:20-bookworm-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY config ./config
COPY src ./src
COPY README.md ./

RUN mkdir -p logs loggers staging staging_loggers

EXPOSE 3001

CMD ["node", "src/server.js"]

FROM mcr.microsoft.com/playwright:v1.55.0-jammy

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install --omit=dev=false

COPY . .
RUN npx playwright install chromium --with-deps || true

ENV NODE_ENV=production
EXPOSE 3001

CMD ["npx", "tsx", "server/src/api/index.ts"]

# Playwright base image version must match package-lock playwright version.
FROM mcr.microsoft.com/playwright:v1.62.1-jammy

WORKDIR /app

ENV NODE_ENV=production \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
    ARTIFACT_DIR=/app/artifacts

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

RUN npx playwright install chromium \
    && chmod +x docker/entrypoint.sh \
    && mkdir -p /app/artifacts

EXPOSE 3001

ENTRYPOINT ["/app/docker/entrypoint.sh"]
CMD ["npx", "tsx", "server/src/api/index.ts"]

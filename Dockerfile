# Shared production image for the Fastify API and the BullMQ Playwright worker.
# Render: API CMD is `npx tsx server/src/api/index.ts`
#         worker CMD is `npx tsx server/src/worker/index.ts`
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
    && sed -i 's/\r$//' docker/entrypoint.sh docker/start-stack.sh \
    && chmod +x docker/entrypoint.sh docker/start-stack.sh \
    && mkdir -p /app/artifacts

EXPOSE 3001

ENTRYPOINT ["sh", "/app/docker/entrypoint.sh"]
CMD ["npx", "tsx", "server/src/api/index.ts"]

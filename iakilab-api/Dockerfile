FROM node:22-bookworm-slim AS build
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY prisma ./prisma
RUN npm run db:generate
COPY tsconfig.json ./
COPY src ./src
COPY scripts ./scripts
RUN npm run build

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production PATH="/opt/a1/bin:$PATH"
RUN apt-get update && apt-get install -y --no-install-recommends python3-venv openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY scripts/requirements-a1.txt /tmp/requirements-a1.txt
RUN python3 -m venv /opt/a1 && /opt/a1/bin/pip install --no-cache-dir -r /tmp/requirements-a1.txt
WORKDIR /app
COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/build ./build
COPY prisma ./prisma
COPY scripts/pdf-a1.py scripts/pdf-a1.py
COPY assets ./assets
RUN install -d -o node -g node -m 0700 /run/iakilab-a1 /app/private-storage
USER node
CMD ["node", "build/scripts/start-railway.js"]

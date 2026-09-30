FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM deps AS build
COPY . .
RUN npm run build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package.json ./
COPY tsconfig.json ./
# ponytail: full node_modules (incl. dev deps) so `migrate` can run TypeORM
# migrations via ts-node; switch to --omit=dev once migrations compile to dist/.
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/src/shared/database ./src/shared/database

# Command comes from docker-compose.yml (api, worker and migrate share this image; ADR-0003).

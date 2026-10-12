FROM node:22-bookworm-slim AS dependencies

WORKDIR /workspace
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/package.json
RUN npm ci

FROM dependencies AS build

COPY . .
ENV NODE_ENV=production
# Route handlers are collected during next build; they must see a syntactically
# valid URL even though no database connection is made during image creation.
ENV DATABASE_URL=postgresql://build:build@127.0.0.1:5432/sdm
RUN npm run build

FROM node:22-bookworm-slim AS runner

WORKDIR /workspace
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

COPY --from=build /workspace/package.json ./package.json
COPY --from=build /workspace/package-lock.json ./package-lock.json
COPY --from=build /workspace/node_modules ./node_modules
COPY --from=build /workspace/apps/web ./apps/web
COPY --from=build /workspace/workers ./workers

EXPOSE 3000
CMD ["npm", "--workspace", "@sdm/web", "run", "start"]

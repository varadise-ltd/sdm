#FROM node:22-bookworm-slim AS dependencies
#
#WORKDIR /workspace
#COPY package.json package-lock.json ./
#COPY apps/web/package.json apps/web/package.json
#RUN npm ci
#
#FROM dependencies AS build
#
#COPY . .
#ENV NODE_ENV=production
## Route handlers are collected during next build; they must see a syntactically
## valid URL even though no database connection is made during image creation.
#ENV DATABASE_URL=postgresql://build:build@127.0.0.1:5432/sdm
#RUN npm run build
#
#FROM node:22-bookworm-slim AS runner
#
#WORKDIR /workspace
#ENV NODE_ENV=production
#ENV NEXT_TELEMETRY_DISABLED=1
#
#COPY --from=build /workspace/package.json ./package.json
#COPY --from=build /workspace/package-lock.json ./package-lock.json
#COPY --from=build /workspace/node_modules ./node_modules
#COPY --from=build /workspace/apps/web ./apps/web
#COPY --from=build /workspace/workers ./workers
#
#EXPOSE 3000
#CMD ["npm", "--workspace", "@sdm/web", "run", "start"]

# based on repo's existing Dockerfile: only showing relevant additions
FROM node:22-bookworm-slim AS runner

WORKDIR /workspace
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# install psql client for migrations
RUN apt-get update && apt-get install -y --no-install-recommends postgresql-client curl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY --from=build /workspace/package.json ./package.json
COPY --from=build /workspace/package-lock.json ./package-lock.json
COPY --from=build /workspace/node_modules ./node_modules
COPY --from=build /workspace/apps/web ./apps/web
COPY --from=build /workspace/workers ./workers

# copy migrations / seeds into image (so entrypoint can run them)
# ensure your repository includes database/migrations and database/seeds
COPY database/migrations /opt/sdm/migrations
COPY database/seeds /opt/sdm/seeds

# copy entrypoint script and make executable
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

EXPOSE 3000

ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
CMD ["npm", "--workspace", "@sdm/web", "run", "start"]
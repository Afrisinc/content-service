# ---------- Build Stage ----------
FROM node:20-bullseye AS builder
WORKDIR /app
COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile --ignore-scripts
COPY . .
RUN npx prisma generate
RUN yarn build

# ---------- Production Stage ----------
FROM node:20-bullseye
WORKDIR /app

ENV NODE_ENV=production

# node_modules is copied whole rather than pruned to production dependencies:
# the deploy runs `prisma migrate deploy` in this image, and the prisma CLI is a
# devDependency. Pruning would save space and break the migration step.
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json

# Migrations must ship with the image; `migrate deploy` replays this directory.
COPY prisma ./prisma

USER node
EXPOSE 8093
CMD ["node", "dist/server.js"]

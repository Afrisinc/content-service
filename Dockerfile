# ---------- Build Stage ----------
FROM node:20-bullseye AS builder
WORKDIR /app
COPY package.json yarn.lock ./
RUN yarn install --ignore-scripts
COPY . .
RUN npx prisma generate
RUN yarn build

# ---------- Production Stage ----------
FROM node:20-bullseye
WORKDIR /app

# Copy built files and node_modules from builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/tsconfig.json ./tsconfig.json
COPY prisma ./prisma
USER node
EXPOSE 8093
CMD ["node", "--loader", "tsconfig-paths/esm", "dist/server.js"]

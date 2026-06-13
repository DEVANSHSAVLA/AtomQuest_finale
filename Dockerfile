FROM node:20
WORKDIR /app

# Install runtime dependencies and build essentials for Mediasoup
RUN apt-get update && apt-get install -y openssl python3 make g++ && rm -rf /var/lib/apt/lists/*

# Copy the entire monorepo code
COPY . .

# Install dependencies for NestJS API, shared types, and media-server workspaces
RUN npm install --workspace=apps/api --workspace=packages/shared-types --workspace=services/media-server

# Generate Prisma Client and build NestJS API
WORKDIR /app/apps/api
RUN npx prisma generate
RUN npm run build

# Build Mediasoup Media Server
WORKDIR /app/services/media-server
RUN npm run build

# Navigate back to root and configure startup script
WORKDIR /app
RUN chmod +x /app/scripts/start.sh

EXPOSE 7860
ENV PORT=7860
ENV NODE_ENV=production

CMD ["/app/scripts/start.sh"]

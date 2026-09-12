FROM node:22-alpine AS base
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --include=dev
COPY . .

RUN npx prisma generate

# 多阶段三个服务
FROM base AS api
CMD ["sh", "-c", "npx prisma db push --schema server/prisma/schema.prisma && npm run start:api"]

FROM base AS worker
CMD ["npm", "run", "start:worker"]

FROM base AS frontend
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]

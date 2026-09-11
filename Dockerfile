FROM node:22-alpine AS dependencies

WORKDIR /app
RUN apk add --no-cache libc6-compat \
  && corepack enable \
  && corepack prepare pnpm@10.34.5 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

FROM node:22-alpine AS builder

WORKDIR /app
RUN apk add --no-cache libc6-compat \
  && corepack enable \
  && corepack prepare pnpm@10.34.5 --activate

COPY --from=dependencies /app/node_modules ./node_modules
COPY . .

ARG NEXT_PUBLIC_MAP_DEFAULT_LAT=1.2136
ARG NEXT_PUBLIC_MAP_DEFAULT_LNG=-77.2811
ARG NEXT_PUBLIC_MAP_STYLE_URL=
ENV AWS_DEPLOYMENT=1 \
  NEXT_TELEMETRY_DISABLED=1 \
  NEXT_PUBLIC_MAP_DEFAULT_LAT=${NEXT_PUBLIC_MAP_DEFAULT_LAT} \
  NEXT_PUBLIC_MAP_DEFAULT_LNG=${NEXT_PUBLIC_MAP_DEFAULT_LNG} \
  NEXT_PUBLIC_MAP_STYLE_URL=${NEXT_PUBLIC_MAP_STYLE_URL}

RUN pnpm build

FROM node:22-alpine AS runner


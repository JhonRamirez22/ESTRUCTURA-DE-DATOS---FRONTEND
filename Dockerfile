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


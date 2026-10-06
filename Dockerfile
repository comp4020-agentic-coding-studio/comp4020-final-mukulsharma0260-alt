# syntax = docker/dockerfile:1

# Node runs src/server.ts directly via built-in type-stripping: no build step,
# no bundler. node:sqlite (also built in) needs no native build either.
FROM docker.io/library/node:24.21.0-alpine
WORKDIR /app
COPY migrations/ migrations/
COPY src/ src/
COPY public/ public/
COPY README.md .
ENV NODE_ENV=production
CMD ["node", "src/server.ts"]

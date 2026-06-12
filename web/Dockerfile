# Build from the repo root:  docker build -f web/Dockerfile .
FROM node:20-slim

WORKDIR /app

COPY web/package.json web/package-lock.json* ./
RUN npm install

COPY web/ ./

# Baked into the client bundle — the browser (on the host) reaches the engine
# via the published port, so localhost is correct for the default compose setup.
ENV NEXT_PUBLIC_API_BASE=http://localhost:8000
RUN npm run build

EXPOSE 3000
CMD ["npm", "start"]

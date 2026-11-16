FROM node:20-bookworm-slim
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY . .
RUN apt-get update && apt-get install -y --no-install-recommends unzip && rm -rf /var/lib/apt/lists/* \
 && mkdir -p /tmp/ten-term-src \
 && unzip -oq /app/Ten-Term-Customer-Admin-Corrected.zip -d /tmp/ten-term-src \
 && cp -a /tmp/ten-term-src/public /app/public \
 && mkdir -p /app/server \
 && rm -rf /tmp/ten-term-src
COPY server/index.js /app/server/index.js
EXPOSE 3000
CMD ["npm","start"]
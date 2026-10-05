FROM node:22-alpine

ENV NODE_ENV=production
WORKDIR /app

# Copy only the dependency manifests first: Docker caches this layer, so
# rebuilds are fast unless dependencies actually change.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY . .

# Never run as root inside a container: if the app is compromised, the attacker
# gets an unprivileged user instead of root.
USER node

EXPOSE 5000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||5000)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]

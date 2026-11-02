FROM node:22-alpine
WORKDIR /app
RUN apk add --no-cache python3
ENV NODE_ENV=production KAMY_AUTOMATION_HOST=0.0.0.0 KAMY_AUTOMATION_PORT=8766 KAMY_AUTOMATION_DATA_DIR=/data/automation
COPY automation/dist ./dist
RUN addgroup -S -g 10001 kamy && adduser -S -D -u 10001 -G kamy kamy && mkdir -p /data/automation && chown -R kamy:kamy /app /data
USER kamy
EXPOSE 8766
HEALTHCHECK --interval=20s --timeout=3s --retries=5 CMD node -e "fetch('http://127.0.0.1:8766/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node","dist/server.js"]

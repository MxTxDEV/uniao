FROM node:22-slim
WORKDIR /app
# openssl: exigido pelo Prisma; ca-certificates: conexão TLS com o Neon
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci

COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0
EXPOSE 3000
# Ao subir: aplica migrations; se RUN_SEED=true cria os dados de demonstração (só se o banco estiver vazio).
CMD ["sh", "-c", "npx prisma migrate deploy && if [ \"$RUN_SEED\" = \"true\" ]; then npm run db:seed; fi && exec npm start"]

# syntax=docker/dockerfile:1.7
# Imagen ``fms-web`` (Next 16, salida ``standalone``, ``basePath /finanzas``, puerto 3100). Misma base que la del CV.
#
# Node 22 LTS. La base va por **resumen (digest)**: la etiqueta se mueve, el resumen no. Es el mismo resumen que usa
# ``frontend/Dockerfile`` del CV (node 22.23.4 · bookworm); se sube a la vez que el de allí. Para cambiarlo:
# ``docker buildx imagetools inspect node:22-bookworm-slim`` y copiar el valor de abajo.
ARG NODE_IMAGE=node:22-bookworm-slim@sha256:de170b39439eb0e5a3444ad7d60b015614a381e10fecae2e30ec9e735122f38d

# ---- dependencias --------------------------------------------------------------------------------
FROM ${NODE_IMAGE} AS deps
WORKDIR /app
COPY package.json package-lock.json ./
# ``npm ci`` con el bloqueo: lo que se instala es lo que revisó ``npm audit`` en CI. Sin scripts de instalación.
RUN --mount=type=cache,target=/root/.npm npm ci --ignore-scripts

# ---- construcción --------------------------------------------------------------------------------
FROM ${NODE_IMAGE} AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# ``basePath`` (/finanzas) y ``output: standalone`` están en ``next.config.ts`` y se fijan AQUÍ: ``basePath`` queda dentro
# de los paquetes del cliente y no se puede cambiar al arrancar. Ningún secreto ni URL interna se necesita para construir.
RUN npm run build

# ---- ejecución -----------------------------------------------------------------------------------
FROM ${NODE_IMAGE} AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3100
# La imagen oficial de Node ya trae el usuario ``node`` (uid 1000): sin shell de acceso útil y no root. El código es de
# root y de solo lectura para ``node``; ``standalone`` ya incluye solo los módulos que el servidor usa, y los estáticos
# (``.next/static``) se copian a mano.
COPY --from=builder --chown=root:root /app/.next/standalone ./
COPY --from=builder --chown=root:root /app/.next/static ./.next/static
# Next escribe aquí su caché; en Compose es un tmpfs (``read_only: true`` en la raíz).
RUN mkdir -p /app/.next/cache && chown node:node /app/.next/cache
LABEL org.opencontainers.image.source="https://github.com/sebasmd-projects/financial-management-system" \
      org.opencontainers.image.description="FMS: web de Next.js (standalone) en /finanzas"
USER node
EXPOSE 3100
# Vivo = Next contesta ``/finanzas/healthz`` (no toca la API ni la sesión: si Django cae, reiniciar esto no lo arreglaría).
HEALTHCHECK --interval=30s --timeout=6s --start-period=30s --retries=3 \
    CMD ["node", "-e", "fetch('http://127.0.0.1:3100/finanzas/healthz',{signal:AbortSignal.timeout(4000)}).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
CMD ["node", "server.js"]

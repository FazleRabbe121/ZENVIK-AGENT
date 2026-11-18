# ZENVIK-AGENT backend + web frontend for Google Cloud Run.
# Node runs the Express API; Python runs the existing JobHunter bridge.
FROM node:22-bookworm-slim

ENV NODE_ENV=production \
    PORT=8080 \
    PYTHONUNBUFFERED=1

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 python3-venv python3-pip build-essential \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json* ./
RUN npm install --no-audit --no-fund

COPY jobhunter-agent/requirements.txt ./jobhunter-agent/requirements.txt
RUN python3 -m venv /opt/venv \
    && /opt/venv/bin/pip install --no-cache-dir -r jobhunter-agent/requirements.txt
ENV PATH="/opt/venv/bin:$PATH"

COPY . .

# Cloud Run serves the React app and its /api routes from one HTTPS origin.
RUN VITE_BASE_PATH=/ npm run build

EXPOSE 8080
CMD ["npm", "start"]

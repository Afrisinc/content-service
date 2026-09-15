FROM python:3.11-slim-bookworm

ARG RHUBARB_VERSION=1.13.0

ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONUNBUFFERED=1 \
    PYTHONPATH=/app \
    RHUBARB_BIN=/opt/rhubarb/rhubarb

RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates curl unzip ffmpeg libsndfile1 \
    && rm -rf /var/lib/apt/lists/*

RUN curl -fsSL "https://github.com/DanielSWolf/rhubarb-lip-sync/releases/download/v${RHUBARB_VERSION}/Rhubarb-Lip-Sync-${RHUBARB_VERSION}-Linux.zip" \
      -o /tmp/rhubarb.zip \
    && unzip -q /tmp/rhubarb.zip -d /tmp/rhubarb \
    && mkdir -p /opt/rhubarb \
    && cp -r /tmp/rhubarb/*/* /opt/rhubarb/ \
    && chmod +x /opt/rhubarb/rhubarb \
    && rm -rf /tmp/rhubarb /tmp/rhubarb.zip

WORKDIR /app

COPY workers/media-worker/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

COPY workers/shared ./shared
COPY workers/media-worker ./

RUN groupadd --system studio && useradd --system --gid studio --home /app studio \
    && mkdir -p /tmp/studio /models \
    && chown -R studio:studio /app /tmp/studio /models

USER studio

EXPOSE 8095

HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8095/health', timeout=5).status==200 else 1)"

CMD ["uvicorn", "studio_media.app:app", "--host", "0.0.0.0", "--port", "8095"]

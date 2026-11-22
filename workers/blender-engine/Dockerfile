FROM python:3.11-slim-bookworm AS base

ARG BLENDER_VERSION=4.2.5
ARG BLENDER_SERIES=4.2
ARG RHUBARB_VERSION=1.13.0

ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONUNBUFFERED=1 \
    BLENDER_BIN=/opt/blender/blender \
    RHUBARB_BIN=/opt/rhubarb/rhubarb \
    PATH="/opt/blender:/opt/rhubarb:${PATH}"

RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates curl xz-utils unzip \
      libx11-6 libxi6 libxxf86vm1 libxfixes3 libxrender1 libgl1 libglu1-mesa \
      libsm6 libice6 libxkbcommon0 libegl1 \
      ffmpeg \
    && rm -rf /var/lib/apt/lists/*

RUN curl -fsSL "https://download.blender.org/release/Blender${BLENDER_SERIES}/blender-${BLENDER_VERSION}-linux-x64.tar.xz" \
      -o /tmp/blender.tar.xz \
    && mkdir -p /opt/blender \
    && tar -xJf /tmp/blender.tar.xz -C /opt/blender --strip-components=1 \
    && rm /tmp/blender.tar.xz

RUN curl -fsSL "https://github.com/DanielSWolf/rhubarb-lip-sync/releases/download/v${RHUBARB_VERSION}/Rhubarb-Lip-Sync-${RHUBARB_VERSION}-Linux.zip" \
      -o /tmp/rhubarb.zip \
    && unzip -q /tmp/rhubarb.zip -d /tmp/rhubarb \
    && mkdir -p /opt/rhubarb \
    && cp -r /tmp/rhubarb/*/* /opt/rhubarb/ \
    && chmod +x /opt/rhubarb/rhubarb \
    && rm -rf /tmp/rhubarb /tmp/rhubarb.zip

WORKDIR /app

COPY workers/blender-engine/requirements.txt ./workers/blender-engine/requirements.txt
RUN pip install --no-cache-dir -r workers/blender-engine/requirements.txt

COPY workers/shared ./shared
COPY workers/blender-engine ./workers/blender-engine

RUN groupadd --system studio && useradd --system --gid studio --home /app studio \
    && mkdir -p /tmp/studio /assets \
    && chown -R studio:studio /app /tmp/studio /assets

USER studio

ENV PYTHONPATH=/app

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD python -c "import sys, pathlib; sys.exit(0 if pathlib.Path('/opt/blender/blender').exists() else 1)"

CMD ["python", "workers/blender-engine/worker.py"]

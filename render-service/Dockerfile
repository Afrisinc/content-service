FROM python:3.12-slim AS base

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

RUN groupadd --system render && useradd --system --gid render --home /app render

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY afrisinc_render ./afrisinc_render
COPY assets ./assets

ENV RENDER_FONT_DIR=/app/assets/fonts \
    RENDER_LOGO_PATH=/app/assets/brand/afrisinc-logo.png \
    RENDER_PHOTO_DIR=/data/photos \
    RENDER_OUTPUT_DIR=/data/render

RUN mkdir -p /data/photos /data/render && chown -R render:render /data /app

USER render

EXPOSE 8090

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8090/health', timeout=4).status == 200 else 1)"

CMD ["uvicorn", "afrisinc_render.app:app", "--host", "0.0.0.0", "--port", "8090", "--workers", "2"]

"""HTTP boundary. Auth, error mapping, and file delivery — no rendering logic lives here."""

from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, Header, HTTPException, Request
from fastapi.responses import FileResponse, JSONResponse

from .brand.geometry import FORMATS
from .config import settings
from .errors import RenderError
from .render import marks, post, typography
from .schema import PostSpec, RenderResult

TAG = "render"


def require_api_key(x_api_key: str | None = Header(default=None)) -> None:
    if not settings.api_key:
        return
    if x_api_key != settings.api_key:
        raise HTTPException(status_code=401, detail="invalid api key")


@asynccontextmanager
async def lifespan(_: FastAPI):
    typography.verify_fonts()
    marks.verify_logo()
    settings.output_dir.mkdir(parents=True, exist_ok=True)
    yield


app = FastAPI(title="AFRISINC render service", version="1.0.0", lifespan=lifespan)


@app.exception_handler(RenderError)
async def render_error_handler(_: Request, exc: RenderError) -> JSONResponse:
    return JSONResponse(
        status_code=exc.status_code,
        content={"success": False, "resp_msg": str(exc), "resp_code": exc.status_code},
    )


@app.get("/formats", tags=[TAG])
async def formats() -> dict[str, dict[str, int | str]]:
    return {
        name: {
            "width": geo.width,
            "height": geo.height,
            "safe_top": geo.safe_top,
            "safe_bottom": geo.safe_bottom,
            "filename_prefix": geo.filename_prefix,
        }
        for name, geo in FORMATS.items()
    }


@app.get("/health", tags=[TAG])
async def health() -> dict[str, str]:
    try:
        typography.verify_fonts()
        marks.verify_logo()
    except RenderError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    return {"status": "ok"}


@app.post(
    "/render/post",
    response_model=RenderResult,
    tags=[TAG],
    dependencies=[Depends(require_api_key)],
)
async def render_post(spec: PostSpec) -> RenderResult:
    return post.render_post(spec)


@app.get(
    "/render/{slug}/{filename}",
    tags=[TAG],
    dependencies=[Depends(require_api_key)],
)
async def fetch_slide(slug: str, filename: str) -> FileResponse:
    if not filename.endswith(".png") or "/" in filename or ".." in filename:
        raise HTTPException(status_code=400, detail="invalid filename")
    path = post.output_dir(slug) / filename
    if not path.is_file():
        raise HTTPException(status_code=404, detail="slide not found")
    return FileResponse(path, media_type="image/png")

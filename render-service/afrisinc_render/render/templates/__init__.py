from __future__ import annotations

from ...brand.geometry import Geometry
from ...schema import SlideSpec
from .. import slide
from . import registry


def render_frame(spec: SlideSpec, geo: Geometry) -> slide.RenderedFrame:
    if spec.template is None:
        return slide.render(spec, geo)
    return registry.get(spec.template).render(spec, geo)

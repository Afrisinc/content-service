from __future__ import annotations

from ...errors import SpecInvalidError
from .base import Template
from .breaking import Breaking
from .broadsheet import Broadsheet
from .bulletin import Bulletin
from .classic import Classic
from .duotone import Duotone
from .frame import Frame
from .split import Split
from .spotlight import Spotlight

_TEMPLATES: dict[str, Template] = {
    template.name: template
    for template in (
        Classic(),
        Split(),
        Frame(),
        Spotlight(),
        Bulletin(),
        Duotone(),
        Breaking(),
        Broadsheet(),
    )
}


def get(name: str) -> Template:
    try:
        return _TEMPLATES[name]
    except KeyError as exc:
        raise SpecInvalidError(
            f"unknown template '{name}', expected one of {sorted(_TEMPLATES)}"
        ) from exc


def catalog() -> list[Template]:
    return list(_TEMPLATES.values())

from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path

VERSIONED = re.compile(r"^(?P<slug>[a-z0-9]+(?:[_-][a-z0-9]+)*)_v(?P<version>\d+)$")


@dataclass(frozen=True)
class AssetRef:
    slug: str
    version: int

    @property
    def identifier(self) -> str:
        return f"{self.slug}_v{self.version}"


def parse_ref(identifier: str) -> AssetRef:
    match = VERSIONED.match(identifier)
    if not match:
        raise ValueError(f"not a versioned asset id: {identifier}")
    return AssetRef(slug=match.group("slug"), version=int(match.group("version")))


class AssetLibrary:
    def __init__(self, root: Path) -> None:
        self.root = root

    def character_dir(self, ref: AssetRef) -> Path:
        return self.root / "characters" / ref.slug / f"v{ref.version}"

    def environment_dir(self, ref: AssetRef) -> Path:
        return self.root / "environments" / ref.slug / f"v{ref.version}"

    def prop_dir(self, ref: AssetRef) -> Path:
        return self.root / "props" / ref.slug / f"v{ref.version}"

    def animation_clip(self, action: str) -> Path:
        return self.root / "animations" / f"{action}.blend"

    def expression_set(self, ref: AssetRef) -> Path:
        return self.character_dir(ref) / "expressions"

    def resolve(self, identifier: str, manifest: dict[str, str]) -> Path:
        mapped = manifest.get(identifier)
        if mapped:
            candidate = Path(mapped)
            return candidate if candidate.is_absolute() else self.root / candidate
        ref = parse_ref(identifier)
        for directory in (self.character_dir(ref), self.environment_dir(ref), self.prop_dir(ref)):
            model = directory / "model.blend"
            if model.exists():
                return model
        raise FileNotFoundError(f"no library asset for {identifier}")

    def available_actions(self) -> list[str]:
        directory = self.root / "animations"
        if not directory.exists():
            return []
        return sorted(path.stem for path in directory.glob("*.blend"))

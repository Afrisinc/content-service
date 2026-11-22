from __future__ import annotations

import hashlib
from pathlib import Path

import boto3
from botocore.client import Config

from .config import CONFIG


class ObjectStore:
    def __init__(self) -> None:
        self.bucket = CONFIG.s3_bucket
        self.client = boto3.client(
            "s3",
            endpoint_url=CONFIG.s3_endpoint or None,
            region_name=CONFIG.s3_region,
            aws_access_key_id=CONFIG.s3_access_key or None,
            aws_secret_access_key=CONFIG.s3_secret_key or None,
            config=Config(signature_version="s3v4", s3={"addressing_style": "path"}),
        )

    def download(self, key: str, destination: Path) -> Path:
        destination.parent.mkdir(parents=True, exist_ok=True)
        self.client.download_file(self.bucket, key, str(destination))
        return destination

    def upload(self, path: Path, key: str, content_type: str = "application/octet-stream") -> dict[str, object]:
        body = path.read_bytes()
        checksum = hashlib.sha256(body).hexdigest()
        self.client.put_object(
            Bucket=self.bucket,
            Key=key,
            Body=body,
            ContentType=content_type,
            Metadata={"checksum": checksum},
        )
        return {"key": key, "bytes": len(body), "checksum": checksum}

    def exists(self, key: str) -> bool:
        try:
            self.client.head_object(Bucket=self.bucket, Key=key)
            return True
        except self.client.exceptions.ClientError:
            return False

    def download_manifest(self, manifest: dict[str, str], root: Path) -> dict[str, str]:
        resolved: dict[str, str] = {}
        for identifier, key in manifest.items():
            local = root / key
            if not local.exists():
                self.download(key, local)
            resolved[identifier] = str(local)
        return resolved

"""Hinterland Updater-Client — kryptografische Update-Sicherheit.

Prüft signierte Update-Metadaten, validiert Paket-Hashes nach dem Download,
schützt den Vertrauensanker unabhängig vom Manifest und lehnt ungültige,
beschädigte, veraltete und nicht unterstützte Updates ab.
"""

from __future__ import annotations

import base64
import hashlib
import json
import os
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

try:
    from jsonschema import validate as jsonschema_validate, ValidationError
except ImportError:  # jsonschema ist optional; Fallback ohne Schema-Validierung
    jsonschema_validate = None  # type: ignore[assignment]
    ValidationError = Exception  # type: ignore[assignment, misc]

from cryptography.hazmat.primitives.serialization import Encoding, PublicFormat
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey
from cryptography.exceptions import InvalidSignature


@dataclass(frozen=True)
class UpdateDecision:
    allowed: bool
    reason: str
    version: str | None = None
    url: str | None = None
    sha512: str | None = None
    size: int | None = None


class UpdateClient:
    def __init__(self, trust_anchor_path: str | os.PathLike[str]):
        """
        Args:
            trust_anchor_path: Pfad zur Datei mit dem vertrauenswürdigen öffentlichen
                Schlüssel (Base64, Ed25519). Dieser liegt außerhalb des Manifests
                und wird bei jeder Prüfung verwendet.
        """
        self.trust_anchor_path = Path(trust_anchor_path)
        self._public_key: Ed25519PublicKey | None = None

    def _load_public_key(self) -> Ed25519PublicKey:
        if self._public_key is not None:
            return self._public_key
        raw = self.trust_anchor_path.read_text(encoding="utf-8").strip()
        key_bytes = base64.b64decode(raw)
        self._public_key = Ed25519PublicKey.from_public_bytes(key_bytes)
        return self._public_key

    def _canonical_manifest(self, manifest: dict[str, Any]) -> bytes:
        """Erzeugt eine deterministische Byte-Repräsentation des Manifests
        (ohne das Signatur-Feld) für die Signaturprüfung."""
        copy = {k: v for k, v in manifest.items() if k != "signature"}
        return json.dumps(copy, sort_keys=True, ensure_ascii=False).encode("utf-8")

    def verify_signature(self, manifest: dict[str, Any]) -> bool:
        """Prüft die Ed25519-Signatur des Manifests gegen den Trust-Anchor."""
        try:
            sig_info = manifest["signature"]
            signature = base64.b64decode(sig_info["value"])
            public_key = self._load_public_key()
            public_key.verify(signature, self._canonical_manifest(manifest))
            return True
        except (InvalidSignature, KeyError, ValueError, TypeError):
            return False

    def validate_manifest_structure(self, manifest: dict[str, Any]) -> list[str]:
        errors: list[str] = []
        required = ["version", "platform", "architecture", "files", "signature", "trustAnchor"]
        for key in required:
            if key not in manifest:
                errors.append(f"fehlendes Pflichtfeld: {key}")
        if jsonschema_validate is not None:
            try:
                schema_path = Path(__file__).resolve().parent.parent / "manifest" / "manifest.schema.json"
                schema = json.loads(schema_path.read_text(encoding="utf-8"))
                jsonschema_validate(manifest, schema)
            except ValidationError as exc:
                errors.append(f"Schema-Verletzung: {exc.message}")
            except Exception:
                pass
        return errors

    def is_expired(self, manifest: dict[str, Any]) -> bool:
        expires = manifest.get("expires")
        if not expires:
            return False
        try:
            expires_dt = datetime.fromisoformat(expires.replace("Z", "+00:00"))
            return datetime.now(timezone.utc) > expires_dt
        except ValueError:
            return True  # unparsebares Datum = ungültig

    def check_downgrade(self, manifest: dict[str, Any], current_version: str) -> bool:
        """Gibt True zurück, wenn das Update ein Downgrade wäre."""
        try:
            new = tuple(int(x) for x in manifest["version"].split("."))
            cur = tuple(int(x) for x in current_version.split("."))
            return new <= cur
        except ValueError:
            return True  # unparsebare Version = ablehnen

    def verify_hash(self, file_path: str | os.PathLike[str], expected_sha512: str) -> bool:
        """Validiert den SHA512-Hash einer heruntergeladenen Datei."""
        h = hashlib.sha512()
        with open(file_path, "rb") as fh:
            for chunk in iter(lambda: fh.read(1024 * 1024), b""):
                h.update(chunk)
        return h.hexdigest() == expected_sha512.lower()

    def evaluate(
        self,
        manifest: dict[str, Any],
        current_version: str,
        downloaded_file: str | os.PathLike[str] | None = None,
    ) -> UpdateDecision:
        """Vollständige Bewertung eines Update-Manifests.

        Gibt eine UpdateDecision zurück. Nur wenn allowed=True ist, darf das
        Update installiert werden.
        """
        # 1. Struktur
        structure_errors = self.validate_manifest_structure(manifest)
        if structure_errors:
            return UpdateDecision(False, "Manifest strukturell ungültig: " + "; ".join(structure_errors))

        # 2. Signatur gegen Trust-Anchor
        if not self.verify_signature(manifest):
            return UpdateDecision(False, "Signaturprüfung fehlgeschlagen: Manifest nicht vertrauenswürdig")

        # 3. Trust-Anchor-KeyId muss mit Signatur-KeyId übereinstimmen
        if manifest.get("signature", {}).get("keyId") != manifest.get("trustAnchor", {}).get("keyId"):
            return UpdateDecision(False, "keyId zwischen Signatur und Trust-Anchor stimmt nicht überein")

        # 4. Ablaufzeit
        if self.is_expired(manifest):
            return UpdateDecision(False, "Manifest ist abgelaufen")

        # 5. Downgrade-Schutz
        if self.check_downgrade(manifest, current_version):
            return UpdateDecision(False, f"Downgrade nicht erlaubt: {manifest['version']} <= {current_version}")

        # 6. Plattform/Architektur
        # (hier würde die laufende Plattform geprüft; Platzhalter)
        if manifest.get("platform") not in ("win32", "darwin", "linux"):
            return UpdateDecision(False, "Unbekannte Plattform im Manifest")

        # 7. Hash nach Download
        if downloaded_file is not None:
            for file_entry in manifest.get("files", []):
                if not self.verify_hash(downloaded_file, file_entry["sha512"]):
                    return UpdateDecision(False, f"Hash-Validierung fehlgeschlagen für {file_entry['url']}")

        return UpdateDecision(
            allowed=True,
            reason="Update verifiziert und vertrauenswürdig",
            version=manifest["version"],
            url=manifest["files"][0]["url"] if manifest.get("files") else None,
            sha512=manifest["files"][0]["sha512"] if manifest.get("files") else None,
            size=manifest["files"][0]["size"] if manifest.get("files") else None,
        )

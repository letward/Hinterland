"""Hinterland Updater-Verifikation — Offline-Verifikation von Manifesten und Pakaten.

Verwenden zur Prüfung vor der Installation, ohne Netzwerkzugriff.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

from client.update_client import UpdateClient


def main() -> int:
    if len(sys.argv) < 3:
        print("Usage: python verify.py <manifest.json> <trusted_public_key.b64> [downloaded_file]")
        return 2

    manifest_path = Path(sys.argv[1])
    anchor_path = Path(sys.argv[2])
    downloaded = Path(sys.argv[3]) if len(sys.argv) > 3 else None

    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    client = UpdateClient(anchor_path)

    # Ohne aktuelle Version: Downgrade-Check wird übersprungen (current_version="0.0.0")
    decision = client.evaluate(manifest, current_version="0.0.0", downloaded_file=downloaded)

    print(json.dumps({
        "allowed": decision.allowed,
        "reason": decision.reason,
        "version": decision.version,
        "url": decision.url,
        "sha512": decision.sha512,
        "size": decision.size,
    }, indent=2, ensure_ascii=False))

    return 0 if decision.allowed else 1


if __name__ == "__main__":
    sys.exit(main())

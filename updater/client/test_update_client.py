"""Tests für den Updater-Client (Signaturprüfung, Hash, Downgrade, Ablaufzeit)."""

import base64
import hashlib
import json
import tempfile
import unittest
from datetime import datetime, timezone, timedelta
from pathlib import Path

from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from cryptography.hazmat.primitives.serialization import Encoding, PublicFormat

from updater.client.update_client import UpdateClient, UpdateDecision


def make_manifest(version="2.0.0", expires=None, min_version=None, prevent_downgrade=False):
    now = datetime.now(timezone.utc)
    manifest = {
        "version": version,
        "platform": "win32",
        "architecture": "x64",
        "releaseDate": now.isoformat(),
        "files": [
            {
                "url": "https://github.com/letward/Hinterland/releases/download/v2.0.0/Hinterland-Setup-2.0.0.exe",
                "sha512": "0" * 128,
                "size": 1000000,
            }
        ],
        "signature": {"algorithm": "ed25519", "keyId": "key-1", "value": ""},
        "trustAnchor": {
            "keyId": "key-1",
            "algorithm": "ed25519",
            "publicKey": "",
        },
    }
    if min_version:
        manifest["minVersion"] = min_version
    if expires:
        manifest["expires"] = expires.isoformat()
    if prevent_downgrade:
        manifest["rollbackProtection"] = {"preventDowngrade": True, "previousVersion": "1.0.0"}
    return manifest


def sign_manifest(manifest, private_key):
    public_key_b64 = base64.b64encode(
        private_key.public_key().public_bytes(Encoding.Raw, PublicFormat.Raw)
    ).decode("ascii")
    manifest["trustAnchor"]["publicKey"] = public_key_b64
    canonical = json.dumps(
        {k: v for k, v in manifest.items() if k != "signature"},
        sort_keys=True,
        ensure_ascii=False,
    ).encode("utf-8")
    signature = private_key.sign(canonical)
    manifest["signature"]["value"] = base64.b64encode(signature).decode("ascii")
    return manifest


class TestUpdateClient(unittest.TestCase):
    def setUp(self):
        self.private_key = Ed25519PrivateKey.generate()
        self.tmpdir = tempfile.mkdtemp()
        self.anchor_path = Path(self.tmpdir) / "anchor.b64"
        self.anchor_path.write_text(
            base64.b64encode(
                self.private_key.public_key().public_bytes(Encoding.Raw, PublicFormat.Raw)
            ).decode("ascii"),
            encoding="utf-8",
        )

    def test_valid_signed_manifest_allowed(self):
        manifest = sign_manifest(make_manifest(), self.private_key)
        client = UpdateClient(self.anchor_path)
        decision = client.evaluate(manifest, current_version="1.0.0")
        self.assertTrue(decision.allowed, decision.reason)
        self.assertEqual(decision.version, "2.0.0")

    def test_invalid_signature_rejected(self):
        manifest = make_manifest()
        manifest["signature"]["value"] = base64.b64encode(b"fakesignature").decode("ascii")
        manifest["trustAnchor"]["publicKey"] = base64.b64encode(
            self.private_key.public_key().public_bytes(Encoding.Raw, PublicFormat.Raw)
        ).decode("ascii")
        client = UpdateClient(self.anchor_path)
        decision = client.evaluate(manifest, current_version="1.0.0")
        self.assertFalse(decision.allowed)
        self.assertIn("Signatur", decision.reason)

    def test_downgrade_rejected(self):
        manifest = sign_manifest(make_manifest(version="1.0.0"), self.private_key)
        client = UpdateClient(self.anchor_path)
        decision = client.evaluate(manifest, current_version="2.0.0")
        self.assertFalse(decision.allowed)
        self.assertIn("Downgrade", decision.reason)

    def test_expired_manifest_rejected(self):
        past = datetime.now(timezone.utc) - timedelta(days=1)
        manifest = sign_manifest(make_manifest(expires=past), self.private_key)
        client = UpdateClient(self.anchor_path)
        decision = client.evaluate(manifest, current_version="1.0.0")
        self.assertFalse(decision.allowed)
        self.assertIn("abgelaufen", decision.reason)

    def test_hash_validation_passes(self):
        with tempfile.NamedTemporaryFile(delete=False, dir=self.tmpdir, suffix=".bin") as fh:
            fh.write(b"hello world")
            tmpfile = fh.name
        expected = hashlib.sha512(b"hello world").hexdigest()
        manifest = make_manifest()
        manifest["files"][0]["sha512"] = expected
        manifest = sign_manifest(manifest, self.private_key)
        client = UpdateClient(self.anchor_path)
        decision = client.evaluate(manifest, current_version="1.0.0", downloaded_file=tmpfile)
        self.assertTrue(decision.allowed, decision.reason)

    def test_hash_validation_fails(self):
        with tempfile.NamedTemporaryFile(delete=False, dir=self.tmpdir, suffix=".bin") as fh:
            fh.write(b"hello world")
            tmpfile = fh.name
        manifest = make_manifest()
        manifest = sign_manifest(manifest, self.private_key)
        client = UpdateClient(self.anchor_path)
        decision = client.evaluate(manifest, current_version="1.0.0", downloaded_file=tmpfile)
        self.assertFalse(decision.allowed)
        self.assertIn("Hash", decision.reason)

    def test_structure_validation_rejects_missing_field(self):
        manifest = make_manifest()
        del manifest["files"]
        manifest = sign_manifest(manifest, self.private_key)
        client = UpdateClient(self.anchor_path)
        decision = client.evaluate(manifest, current_version="1.0.0")
        self.assertFalse(decision.allowed)
        self.assertIn("strukturell", decision.reason)

    def test_key_id_mismatch_rejected(self):
        manifest = sign_manifest(make_manifest(), self.private_key)
        manifest["signature"]["keyId"] = "key-other"
        manifest["trustAnchor"]["keyId"] = "key-other"
        client = UpdateClient(self.anchor_path)
        decision = client.evaluate(manifest, current_version="1.0.0")
        self.assertFalse(decision.allowed)


if __name__ == "__main__":
    unittest.main()

"""Verify release packages and their update metadata after building."""
import hashlib
import json
from pathlib import Path
import unittest
from zipfile import ZipFile

ROOT = Path(__file__).resolve().parents[1]


class ReleaseBuildTests(unittest.TestCase):
    def test_release_feed_matches_packaged_manifest_and_checksum(self):
        manifest = json.loads((ROOT / "manifest.json").read_text())
        version = manifest["version"]
        package = ROOT / "dist" / f"doi-citation-count-{version}.xpi"
        with ZipFile(package) as archive:
            self.assertIsNone(archive.testzip())
            self.assertEqual(json.loads(archive.read("manifest.json")), manifest)
            self.assertEqual(set(archive.namelist()), {"manifest.json", "bootstrap.js", "lib.js"})
        feed = json.loads((ROOT / "dist" / "updates.json").read_text())
        update = feed["addons"][manifest["applications"]["zotero"]["id"]]["updates"][0]
        self.assertEqual(update["version"], version)
        self.assertEqual(update["update_hash"], "sha256:" + hashlib.sha256(package.read_bytes()).hexdigest())
        self.assertTrue(update["update_link"].endswith(f"/v{version}/{package.name}"))
        self.assertEqual(update["applications"]["zotero"]["strict_max_version"], "10.*")

    def test_legacy_archive_and_checksums(self):
        version = json.loads((ROOT / "manifest.json").read_text())["version"]
        package = ROOT / "dist" / f"doi-citation-count-{version}-legacy.xpi"
        with ZipFile(package) as archive:
            self.assertIsNone(archive.testzip())
            self.assertIn("install.rdf", archive.namelist())
            self.assertNotIn("manifest.json", archive.namelist())
        for line in (ROOT / "dist" / "SHA256SUMS").read_text().splitlines():
            checksum, name = line.split("  ")
            self.assertEqual(checksum, hashlib.sha256((ROOT / "dist" / name).read_bytes()).hexdigest())

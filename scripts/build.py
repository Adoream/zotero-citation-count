"""Build an installable Zotero extension without third-party dependencies."""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
import json
import hashlib
import re
import xml.etree.ElementTree as ET

root = Path(__file__).resolve().parents[1]
manifest = json.loads((root / "manifest.json").read_text())
version = manifest["version"]
if not re.fullmatch(r"\d+\.\d+\.\d+", version):
    raise ValueError("Use a stable semantic version: MAJOR.MINOR.PATCH")
legacy = ET.parse(root / "legacy" / "install.rdf")
legacy_version = legacy.find(".//{http://www.mozilla.org/2004/em-rdf#}version").text
if legacy_version != version:
    raise ValueError("Modern and legacy package versions must match")
target = root / "dist" / f"doi-citation-count-{manifest['version']}.xpi"
target.parent.mkdir(exist_ok=True)
with ZipFile(target, "w", ZIP_DEFLATED) as archive:
    for name in ("manifest.json", "bootstrap.js", "lib.js"):
        archive.write(root / name, name)
print(target)

legacy_target = root / "dist" / f"doi-citation-count-{manifest['version']}-legacy.xpi"
with ZipFile(legacy_target, "w", ZIP_DEFLATED) as archive:
    for name in ("install.rdf", "chrome.manifest", "overlay.xul", "overlay.js"):
        archive.write(root / "legacy" / name, name)
    archive.write(root / "lib.js", "lib.js")
print(legacy_target)

checksum = hashlib.sha256(target.read_bytes()).hexdigest()
settings = manifest["applications"]["zotero"]
feed = {"addons": {settings["id"]: {"updates": [{
    "version": version,
    "update_link": f"https://github.com/Adoream/zotero-citation-count/releases/download/v{version}/{target.name}",
    "update_hash": f"sha256:{checksum}",
    "applications": {"zotero": {
        "strict_min_version": settings["strict_min_version"],
        "strict_max_version": settings["strict_max_version"]
    }}
}]}}}
(target.parent / "updates.json").write_text(json.dumps(feed, indent=2) + "\n")
(target.parent / "SHA256SUMS").write_text("".join(
    f"{hashlib.sha256(package.read_bytes()).hexdigest()}  {package.name}\n"
    for package in (target, legacy_target)
))

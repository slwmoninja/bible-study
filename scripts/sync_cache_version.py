#!/usr/bin/env python3
"""Derives CACHE_VERSION in service-worker.js from a content hash of CORE_ASSETS
plus the service worker's own fetch-handling code. Also stamps manifest.json's
icon src URLs with a content-hash query string whenever the icon files change.

Run automatically by the pre-commit hook (.githooks/pre-commit) so the service
worker's cache version always reflects what's actually precached -- no more
forgetting to bump it by hand when index.html/js/css/core data files change.
Safe to run manually too; it's a no-op if nothing precached has changed.

Hashing service-worker.js's own code (everything except the CACHE_VERSION line
itself, to avoid a self-referential hash) matters as much as CORE_ASSETS: a bug
in the fetch handler can write bad data into the cache under CACHE_VERSION's
name (e.g. the 2026-07-29 bug where a same-origin image navigation got cached
under the app-shell's own key), and fixing the handler doesn't retroactively
repair whatever an already-affected device has sitting in that cache -- only a
fresh cache name does, via the normal old-cache-gets-deleted-on-activate path.

The manifest icon versioning matters separately from CACHE_VERSION: Android/
Chrome's installed-PWA (WebAPK) icon update check only re-fetches an icon when
its URL in the manifest changes -- it compares the icons array, not pixel
bytes -- so overwriting icon-192.png/icon-512.png in place would never be
noticed by an existing install, or even by a fresh "Add to Home Screen" after
an Android uninstall (which does not clear Chrome's site data for the origin).
Appending a content hash to the src query string gives every icon change a new
URL, which is what actually triggers Chrome to pick it up.
"""
import hashlib
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SW_PATH = ROOT / "service-worker.js"
MANIFEST_PATH = ROOT / "manifest.json"


def sync_manifest_icon_versions():
    manifest_text = MANIFEST_PATH.read_text(encoding="utf-8")

    def replace_icon_src(m):
        rel_path = m.group(1)
        file_path = ROOT / rel_path
        if not file_path.is_file():
            sys.exit(f"manifest.json references missing icon: {rel_path}")
        digest = hashlib.sha256(file_path.read_bytes()).hexdigest()[:8]
        return f'"src": "{rel_path}?v={digest}"'

    new_manifest_text = re.sub(
        r'"src":\s*"(icons/icon-(?:192|512)\.png)(?:\?v=[0-9a-f]+)?"',
        replace_icon_src,
        manifest_text,
    )

    if new_manifest_text == manifest_text:
        return False

    MANIFEST_PATH.write_text(new_manifest_text, encoding="utf-8")
    subprocess.run(["git", "add", str(MANIFEST_PATH)], cwd=ROOT, check=True)
    return True


def main():
    if sync_manifest_icon_versions():
        print("manifest.json icon URLs updated")

    sw_text = SW_PATH.read_text(encoding="utf-8")

    match = re.search(r"const CORE_ASSETS = \[(.*?)\];", sw_text, re.S)
    if not match:
        sys.exit("Could not find CORE_ASSETS array in service-worker.js")

    rel_paths = [p for p in re.findall(r'"\./([^"]*)"', match.group(1)) if p]

    hasher = hashlib.sha256()
    for rel_path in rel_paths:
        file_path = ROOT / rel_path
        if not file_path.is_file():
            sys.exit(f"CORE_ASSETS references missing file: {rel_path}")
        hasher.update(rel_path.encode("utf-8"))
        hasher.update(file_path.read_bytes())

    # Include the SW's own fetch-handling code (not just what it precaches) --
    # strip the CACHE_VERSION line first so this hash doesn't depend on itself.
    sw_logic = re.sub(r'const CACHE_VERSION = "[^"]*";', "", sw_text)
    hasher.update(sw_logic.encode("utf-8"))

    new_version = f"bible-study-{hasher.hexdigest()[:12]}"

    new_sw_text, count = re.subn(
        r'const CACHE_VERSION = "[^"]*";',
        f'const CACHE_VERSION = "{new_version}";',
        sw_text,
        count=1,
    )
    if count == 0:
        sys.exit("Could not find CACHE_VERSION assignment in service-worker.js")

    if new_sw_text == sw_text:
        print("CACHE_VERSION already up to date")
        return

    SW_PATH.write_text(new_sw_text, encoding="utf-8")
    subprocess.run(["git", "add", str(SW_PATH)], cwd=ROOT, check=True)
    print(f"CACHE_VERSION updated -> {new_version}")


if __name__ == "__main__":
    main()

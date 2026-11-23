#!/usr/bin/env python3
"""Produce immutable ZIP snapshots with per-file SHA-256 manifest; no Drive credentials."""
import hashlib
import json
import pathlib
import sys
import zipfile
from datetime import datetime, timezone

EXCLUDE = {"backups", ".git", "node_modules", "__pycache__"}

def create_snapshot(root: pathlib.Path, output: pathlib.Path):
    root = root.resolve(strict=True)
    output = output.resolve(strict=False)
    if not root.is_dir():
        raise ValueError("Project root is not a directory")
    if output == root or root in output.parents:
        raise ValueError("Snapshot output must be outside the project directory")
    if output.exists():
        raise FileExistsError("Snapshot is immutable: output already exists")
    sources = []
    for p in sorted(root.rglob("*")):
        rel = p.relative_to(root)
        if any(part in EXCLUDE for part in rel.parts):
            continue
        if p.is_symlink():
            raise ValueError("Symlink not permitted in snapshot: " + str(rel))
        if p.is_file():
            if rel.as_posix() == "manifest.json":
                raise ValueError("Reserved manifest.json in project root")
            sources.append((p, rel.as_posix()))
    if not sources:
        raise ValueError("No project files to archive")
    if not (root / "02-写作计划.json").is_file():
        raise ValueError("Missing 02-写作计划.json")
    manifest = {
        "format": "chinese-novelist-v3-snapshot",
        "version": 1,
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "files": [],
    }
    output.parent.mkdir(parents=True, exist_ok=True)
    try:
        with zipfile.ZipFile(output, "x", compression=zipfile.ZIP_DEFLATED, compresslevel=6) as z:
            for p, name in sources:
                content = p.read_bytes()
                manifest["files"].append({"path": name, "size": len(content), "sha256": hashlib.sha256(content).hexdigest()})
                z.writestr(name, content)
            z.writestr("manifest.json", json.dumps(manifest, ensure_ascii=False, indent=2).encode())
    except Exception:
        output.unlink(missing_ok=True)
        raise
    digest = hashlib.sha256(output.read_bytes()).hexdigest()
    return {"zip": str(output), "sha256": digest, "files": len(sources)}

if __name__ == "__main__":
    if len(sys.argv) != 3:
        sys.exit("Usage: create_snapshot.py <project-dir> <new-snapshot.zip>")
    try:
        print(json.dumps(create_snapshot(pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2])), ensure_ascii=False))
    except Exception as error:
        sys.exit(str(error))

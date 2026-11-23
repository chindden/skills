#!/usr/bin/env python3
"""Validate ZIP snapshot paths and all bytes before restoring to a new directory."""
import hashlib
import json
import pathlib
import sys
import zipfile

def verify_snapshot(snapshot: pathlib.Path):
    with zipfile.ZipFile(snapshot) as z:
        names = z.namelist()
        if len(names) != len(set(names)) or "manifest.json" not in names:
            raise ValueError("Missing manifest or duplicate ZIP entries")
        for name in names:
            p = pathlib.PurePosixPath(name)
            if p.is_absolute() or ".." in p.parts or "\\" in name or not name or name.endswith("/"):
                raise ValueError("Unsafe ZIP path: " + name)
        manifest = json.loads(z.read("manifest.json"))
        if manifest.get("format") != "chinese-novelist-v3-snapshot" or manifest.get("version") != 1:
            raise ValueError("Unsupported manifest format")
        entries = manifest.get("files")
        if not isinstance(entries, list) or not entries:
            raise ValueError("Empty manifest")
        paths = [entry["path"] for entry in entries]
        if len(paths) != len(set(paths)) or set(paths) != set(names) - {"manifest.json"}:
            raise ValueError("Files do not match manifest")
        for entry in entries:
            blob = z.read(entry["path"])
            if len(blob) != entry["size"] or hashlib.sha256(blob).hexdigest() != entry["sha256"]:
                raise ValueError("File checksum mismatch: " + entry["path"])
        return {"snapshot": str(snapshot), "files": len(entries), "sha256": hashlib.sha256(snapshot.read_bytes()).hexdigest()}

if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit("Usage: verify_snapshot.py <snapshot.zip>")
    try:
        print(json.dumps(verify_snapshot(pathlib.Path(sys.argv[1])), ensure_ascii=False))
    except Exception as error:
        sys.exit(str(error))

#!/usr/bin/env python3
"""Verify, then restore a snapshot into a fresh directory without overwriting files."""
import json
import pathlib
import sys
import zipfile
from verify_snapshot import verify_snapshot

def restore_snapshot(archive: pathlib.Path, destination: pathlib.Path):
    verify_snapshot(archive)
    destination = destination.resolve(strict=False)
    if destination.exists() and any(destination.iterdir()):
        raise FileExistsError("Restore target must be absent or empty")
    destination.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(archive) as z:
        manifest = json.loads(z.read("manifest.json"))
        for record in manifest["files"]:
            output = destination / record["path"]
            output.parent.mkdir(parents=True, exist_ok=True)
            with open(output, "xb") as f:
                f.write(z.read(record["path"]))
    return {"restoredTo": str(destination), "files": len(manifest["files"])}

if __name__ == "__main__":
    if len(sys.argv) != 3:
        sys.exit("Usage: restore_snapshot.py <snapshot.zip> <empty-target-directory>")
    try:
        print(json.dumps(restore_snapshot(pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2])), ensure_ascii=False))
    except Exception as e:
        sys.exit(str(e))

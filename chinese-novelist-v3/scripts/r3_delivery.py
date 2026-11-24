#!/usr/bin/env python3
"""Create/verify a portable R3 reviewed-checkpoint ZIP using existing snapshot tools.

The project must be quiescent. All existing project files except the standard
backup/cache exclusions are archived. No remote uploads or approval mutations.
A successful verification reproduces the recorded gate decision, not literary
quality or the authenticity of claimed editor/author identities.
"""
import argparse
import hashlib
import json
import os
import pathlib
import stat
import subprocess
import sys
import tempfile
import zipfile

from create_snapshot import create_snapshot, EXCLUDE
from verify_snapshot import verify_snapshot
from restore_snapshot import restore_snapshot

SCRIPT = pathlib.Path(__file__).resolve().with_name("r3_delivery_check.mjs")


def checkpoint(root, upto):
    result = subprocess.run(["node", str(SCRIPT), str(root), "--upto", str(upto)],
                            capture_output=True, text=True, encoding="utf-8", check=False)
    if result.returncode:
        raise ValueError("Checkpoint verification failed: " + (result.stdout or result.stderr).strip())
    return json.loads(result.stdout)


def read_receipt(archive):
    checked = verify_snapshot(archive)
    with zipfile.ZipFile(archive) as z:
        # Stricter path checks for the portable delivery format, before restore.
        for info in z.infolist():
            name = info.filename
            if (any(not p or p in (".", "..") for p in name.split("/"))
                    or ":" in name or any(ord(c) < 32 for c in name)
                    or stat.S_ISLNK(info.external_attr >> 16)):
                raise ValueError("Unsafe delivery path: " + name)
        manifest = json.loads(z.read("manifest.json"))
    receipt = manifest.get("delivery")
    if (not isinstance(receipt, dict) or receipt.get("kind") != "r3-reviewed-checkpoint"
            or receipt.get("schemaVersion") != 1 or type(receipt.get("upto")) is not int
            or receipt["upto"] < 1 or not isinstance(receipt.get("checkpoint"), dict)):
        raise ValueError("Not a complete R3 reviewed-checkpoint delivery; generic backup/review-only ZIP")
    return checked, receipt, manifest


def verify_delivery(archive):
    checked, receipt, _ = read_receipt(archive)
    with tempfile.TemporaryDirectory(prefix="r3-delivery-restore-") as temp:
        destination = pathlib.Path(temp) / "project"
        restore_snapshot(archive, destination)
        actual = checkpoint(destination, receipt["upto"])
        if actual != receipt["checkpoint"]:
            raise ValueError("Restored gate/checkpoint differs from recorded source checkpoint")
    return {**checked, "kind": receipt["kind"], "checkpoint": actual, "restorationVerified": True}


def verify_source_unchanged(root, manifest):
    entries = {item["path"]: item for item in manifest["files"]}
    names = set()
    for p in root.rglob("*"):
        rel = p.relative_to(root)
        if any(part in EXCLUDE for part in rel.parts):
            continue
        if p.is_symlink():
            raise ValueError("Source changed or contains a symlink: " + str(rel))
        if p.is_file():
            name = rel.as_posix()
            names.add(name)
            record = entries.get(name)
            if record is None or hashlib.sha256(p.read_bytes()).hexdigest() != record["sha256"]:
                raise ValueError("Source changed during delivery: " + name)
    if names != set(entries):
        raise ValueError("Project file set changed during delivery")


def create_delivery(root, output, upto):
    root = root.resolve(strict=True)
    if output.is_symlink():
        raise ValueError("Delivery destination cannot be a symlink")
    output = output.resolve()
    if output == root or root in output.parents:
        raise ValueError("Delivery ZIP must be outside project directory")
    if output.exists():
        raise FileExistsError("Delivery ZIP already exists")
    before = checkpoint(root, upto)
    receipt = {"schemaVersion": 1, "kind": "r3-reviewed-checkpoint",
               "upto": upto, "checkpoint": before}
    output.parent.mkdir(parents=True, exist_ok=True)
    # Private staging on the output filesystem; publish only after restoration
    # verification. Hard link is atomic and cannot replace another delivery.
    with tempfile.TemporaryDirectory(prefix=".r3-delivery-", dir=output.parent) as temp:
        staged = pathlib.Path(temp) / "delivery.zip"
        create_snapshot(root, staged, delivery=receipt)
        verified = verify_delivery(staged)
        _, _, manifest = read_receipt(staged)
        verify_source_unchanged(root, manifest)
        if checkpoint(root, upto) != before:
            raise ValueError("Source checkpoint changed during delivery")
        os.link(staged, output)
    return {**verified, "snapshot": str(output)}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    create = commands.add_parser("create")
    create.add_argument("project", type=pathlib.Path)
    create.add_argument("output", type=pathlib.Path)
    create.add_argument("--upto", type=int, required=True)
    verify = commands.add_parser("verify")
    verify.add_argument("archive", type=pathlib.Path)
    args = parser.parse_args()
    try:
        result = (create_delivery(args.project, args.output, args.upto)
                  if args.command == "create" else verify_delivery(args.archive))
        print(json.dumps(result, ensure_ascii=False))
    except Exception as error:
        print(json.dumps({"status": "error", "error": str(error)}, ensure_ascii=False))
        sys.exit(2)


if __name__ == "__main__":
    main()

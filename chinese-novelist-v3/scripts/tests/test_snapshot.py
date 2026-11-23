import sys
import tempfile
import pathlib
import unittest
import zipfile
sys.path.insert(0, str(pathlib.Path(__file__).parents[1]))
from create_snapshot import create_snapshot
from verify_snapshot import verify_snapshot
from restore_snapshot import restore_snapshot

class SnapshotTest(unittest.TestCase):
    def test_roundtrip_and_tamper(self):
        with tempfile.TemporaryDirectory() as td:
            base = pathlib.Path(td)
            project = base / "project"
            project.mkdir()
            (project / "02-写作计划.json").write_text('{"chapters":[]}', encoding="utf-8")
            (project / "第01章.md").write_text("中文正文\n", encoding="utf-8")
            out = base / "snapshot.zip"
            result = create_snapshot(project, out)
            self.assertEqual(result["files"], 2)
            self.assertEqual(verify_snapshot(out)["files"], 2)
            restored = base / "restored"
            self.assertEqual(restore_snapshot(out, restored)["files"], 2)
            self.assertEqual((restored / "第01章.md").read_text(encoding="utf-8"), "中文正文\n")
            with self.assertRaises(FileExistsError):
                create_snapshot(project, out)
            broken = base / "broken.zip"
            with zipfile.ZipFile(broken, "w") as zipf:
                zipf.writestr("../escape.md", "bad")
                zipf.writestr("manifest.json", "{}")
            with self.assertRaises(ValueError):
                verify_snapshot(broken)

    def test_reject_symlinks(self):
        with tempfile.TemporaryDirectory() as td:
            root = pathlib.Path(td) / "project"
            root.mkdir()
            (root / "02-写作计划.json").write_text("{}")
            (root / "external").symlink_to(pathlib.Path(td))
            with self.assertRaises(ValueError):
                create_snapshot(root, pathlib.Path(td) / "file.zip")

if __name__ == "__main__":
    unittest.main()

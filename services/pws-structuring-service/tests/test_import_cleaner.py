import importlib.util
import pathlib
import unittest


MODULE_PATH = pathlib.Path(__file__).resolve().parents[1] / "import_cleaner.py"
SPEC = importlib.util.spec_from_file_location("import_cleaner", MODULE_PATH)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(MODULE)


class ImportCleanerTests(unittest.TestCase):
    def test_prepare_outline_markdown_removes_toc_noise(self) -> None:
        raw = """
(Unclassified//FOUO)
Table of Contents
Overview .................................................. 9
3 Requirements ........................................... 15

1 (U) Overview
(U) Intro paragraph.

1.1 (U) Purpose
(U) Purpose text.
"""
        cleaned = MODULE.prepare_outline_markdown(raw)
        self.assertNotIn("Table of Contents", cleaned)
        self.assertNotIn("................................", cleaned)
        self.assertIn("# 1 Overview", cleaned)
        self.assertIn("## 1.1 Purpose", cleaned)


if __name__ == "__main__":
    unittest.main()

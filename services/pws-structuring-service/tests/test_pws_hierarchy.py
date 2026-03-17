import importlib.util
import pathlib
import sys
import unittest
from io import BytesIO
from zipfile import ZipFile


MODULE_PATH = pathlib.Path(__file__).resolve().parents[1] / "pws_hierarchy.py"
sys.path.insert(0, str(MODULE_PATH.parent))
SPEC = importlib.util.spec_from_file_location("pws_hierarchy", MODULE_PATH)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(MODULE)


class PWSHierarchyTests(unittest.TestCase):
    def test_build_pws_hierarchy_artifact_from_text(self) -> None:
        raw = """
1 (U) Overview
1.1 (U) Purpose
Purpose text.
2 (U) Applicable Documents
3 (U) Requirements
3.1 (U) Program Management
"""
        artifact = MODULE.build_pws_hierarchy_artifact(
            "sample.txt",
            raw.encode("utf-8"),
        )
        self.assertEqual(artifact["source_kind"], "plain_text")
        self.assertEqual(
            [section["section_number"] for section in artifact["root_sections"]],
            ["1", "2", "3"],
        )
        self.assertTrue(any(item["section_number"] == "3.1" for item in artifact["section_index"]))

    def test_build_pws_hierarchy_artifact_from_docx(self) -> None:
        buffer = BytesIO()
        xml = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:r><w:t>1 (U) Overview</w:t></w:r></w:p>
    <w:p><w:r><w:t>1.1 (U) Purpose</w:t></w:r></w:p>
    <w:p><w:r><w:t>Purpose text.</w:t></w:r></w:p>
    <w:p><w:r><w:t>2 (U) Applicable Documents</w:t></w:r></w:p>
  </w:body>
</w:document>
"""
        with ZipFile(buffer, "w") as archive:
            archive.writestr("word/document.xml", xml)

        artifact = MODULE.build_pws_hierarchy_artifact(
            "sample.docx",
            buffer.getvalue(),
        )
        self.assertEqual(artifact["source_kind"], "docx_xml")
        self.assertEqual(
            [section["section_number"] for section in artifact["root_sections"]],
            ["1", "2"],
        )


if __name__ == "__main__":
    unittest.main()

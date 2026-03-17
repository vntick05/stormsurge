import importlib.util
import pathlib
import unittest
from io import BytesIO
from zipfile import ZipFile


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

    def test_extract_docx_hierarchy_text_reads_word_document_xml(self) -> None:
        buffer = BytesIO()
        xml = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:r><w:t>1 (U) Overview</w:t></w:r></w:p>
    <w:p><w:r><w:t>1.1 (U) Purpose</w:t></w:r></w:p>
    <w:p><w:r><w:t>(U) Purpose text.</w:t></w:r></w:p>
  </w:body>
</w:document>
"""
        with ZipFile(buffer, "w") as archive:
            archive.writestr("word/document.xml", xml)

        extracted = MODULE.extract_docx_hierarchy_text(buffer.getvalue())
        self.assertIsNotNone(extracted)
        self.assertIn("1 (U) Overview", extracted)
        cleaned = MODULE.prepare_outline_markdown(extracted or "")
        self.assertIn("# 1 Overview", cleaned)

    def test_extract_docx_hierarchy_text_preserves_numbered_list_paragraphs_as_bullets(self) -> None:
        buffer = BytesIO()
        xml = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:r><w:t>1 (U) Overview</w:t></w:r></w:p>
    <w:p>
      <w:pPr>
        <w:numPr>
          <w:ilvl w:val="0"/>
          <w:numId w:val="2"/>
        </w:numPr>
      </w:pPr>
      <w:r><w:t>(U) First bullet</w:t></w:r>
    </w:p>
  </w:body>
</w:document>
"""
        with ZipFile(buffer, "w") as archive:
            archive.writestr("word/document.xml", xml)

        extracted = MODULE.extract_docx_hierarchy_text(buffer.getvalue())
        self.assertIsNotNone(extracted)
        self.assertIn("- (U) First bullet", extracted)

    def test_prepare_outline_markdown_infers_missing_parent_headings(self) -> None:
        raw = """
3.1 (U) Program Management
(U) Program Management
(U) The Contractor Shall:
3.1.1.1 (U) Manage the overall scope and performance of the contract.

(U) Corporate Commitment
(U) The Contractor Shall:
3.1.2.1 (U) Communicate and consult with Ecosystem stakeholders.
"""
        cleaned = MODULE.prepare_outline_markdown(raw)
        self.assertIn("### 3.1.1 Program Management", cleaned)
        self.assertIn("### 3.1.2 Corporate Commitment", cleaned)
        self.assertNotIn("The Contractor Shall:", cleaned)

    def test_clean_line_strips_common_word_artifact_fragments(self) -> None:
        cleaned = MODULE.clean_line(
            "(U) This section applies to all services in Error! Reference source not found. "
            "Error! Bookmark not defined."
        )
        self.assertEqual(cleaned, "This section applies to all services in")

    def test_prepare_outline_markdown_rebuilds_headings_from_toc_map(self) -> None:
        raw = """
1 Purpose3
2 Scope3
3 Performance Objectives3
3.1 Operation and Sustainment3
3.1.1 Map Stack5

Purpose This task order defines the work.
Scope Provide the technical expertise required.
Performance Objectives The Contractor must perform the following.
Operation and Sustainment The Contractor must provide operations support.
Map Stack The Contractor must sustain the Map Stack capability.
"""
        cleaned = MODULE.prepare_outline_markdown(raw)
        self.assertIn("# 1 Purpose", cleaned)
        self.assertIn("# 2 Scope", cleaned)
        self.assertIn("# 3 Performance Objectives", cleaned)
        self.assertIn("## 3.1 Operation and Sustainment", cleaned)
        self.assertIn("### 3.1.1 Map Stack", cleaned)
        self.assertIn("This task order defines the work.", cleaned)

    def test_prepare_outline_markdown_synthesizes_standalone_body_headings(self) -> None:
        raw = """
1 Purpose3
2 Scope3
3 Performance Objectives3

Purpose
This task order defines the work.
Scope
Provide the technical expertise required.
Performance Objectives
The Contractor must perform the following.
"""
        cleaned = MODULE.prepare_outline_markdown(raw)
        self.assertIn("# 1 Purpose", cleaned)
        self.assertIn("# 2 Scope", cleaned)
        self.assertIn("# 3 Performance Objectives", cleaned)

    def test_prepare_outline_markdown_preserves_strong_explicit_hierarchy(self) -> None:
        raw = """
Table of Contents
Overview .................................................. 9
Purpose .................................................. 9
Applicable Documents ..................................... 15
Requirements ............................................. 16

1.1 (U) Purpose
(U) Purpose text.
1.2 (U) Background
(U) Background text.
2 (U) Applicable Documents
(U) Applicable documents text.
3 (U) Requirements
3.1 (U) Program Management
(U) Program management text.
"""
        cleaned = MODULE.prepare_outline_markdown(raw)
        self.assertIn("## 1.1 Purpose", cleaned)
        self.assertIn("## 1.2 Background", cleaned)
        self.assertIn("# 2 Applicable Documents", cleaned)
        self.assertIn("# 3 Requirements", cleaned)
        self.assertNotIn("# 1 Purpose", cleaned)

    def test_prepare_outline_markdown_preserves_indented_bullets(self) -> None:
        raw = "3.2.2.7 (U) Attend meetings\n- (U) Weekly Pre-RRB\n  - Present NSSR RITMs\n"
        cleaned = MODULE.prepare_outline_markdown(raw)
        self.assertIn("- Weekly Pre-RRB", cleaned)
        self.assertIn("  - Present NSSR RITMs", cleaned)

    def test_drop_front_matter_prefers_first_real_numbered_heading(self) -> None:
        lines = [
            "Non-Key Personnel",
            "The Contractor Shall:",
            "3.1.15.1 Adhere to labor categories.",
            "1 (U) Overview",
            "1.1 (U) Purpose",
            "Purpose text.",
        ]
        kept = MODULE.drop_front_matter(lines, heading_map=[("Overview", "1"), ("Non-Key Personnel", "3.1.15")])
        self.assertEqual(kept[0], "1 (U) Overview")

    def test_prepare_outline_markdown_keeps_first_child_heading_after_synthesized_parent(self) -> None:
        raw = """
3.3 (U) Standard Service Delivery
Service Delivery
The Contractor Shall:
3.3.1.1 (U) Recognize the Senior COMM Lead.
3.3.1.2 (U) Promptly coordinate with the COTR.
"""
        cleaned = MODULE.prepare_outline_markdown(raw)
        self.assertIn("#### 3.3.1.1 Recognize the Senior COMM Lead.", cleaned)
        self.assertIn("#### 3.3.1.2 Promptly coordinate with the COTR.", cleaned)

    def test_prepare_outline_markdown_synthesizes_parent_from_title_and_child_heading(self) -> None:
        raw = """
3.3.1.19 (U) Create reports in HN.
- Highlight deliveries completed within the delivery timelines and deliveries exceeding the delivery timelines with justifications
Change Management
The Contractor Shall:
3.3.2.1 (U) Utilize the authoritative NRO PB Change Management process.
"""
        cleaned = MODULE.prepare_outline_markdown(raw)
        self.assertIn("### 3.3.2 Change Management", cleaned)
        self.assertIn("#### 3.3.2.1 Utilize the authoritative NRO PB Change Management process.", cleaned)


if __name__ == "__main__":
    unittest.main()

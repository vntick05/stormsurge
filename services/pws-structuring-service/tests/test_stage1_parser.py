import json
import pathlib
import sys
import unittest


SERVICE_DIR = pathlib.Path(__file__).resolve().parents[1]
if str(SERVICE_DIR) not in sys.path:
    sys.path.insert(0, str(SERVICE_DIR))

from stage1_parser import build_stage1_section_tree


def sample_structured_document() -> dict[str, object]:
    return {
        "body": {
            "children": [
                {"$ref": "#/texts/0"},
                {"$ref": "#/texts/1"},
                {"$ref": "#/texts/2"},
                {"$ref": "#/texts/3"},
                {"$ref": "#/texts/4"},
                {"$ref": "#/texts/5"},
            ]
        },
        "texts": [
            {"text": "Table of Contents", "label": "text", "formatting": {"bold": True}},
            {"text": "1 Scope 3", "label": "text", "formatting": {}},
            {"text": "1 Scope", "label": "section_header", "formatting": {"bold": True}, "prov": [{"page_no": 3}]},
            {"text": "1.1 Mission", "label": "section_header", "formatting": {"bold": True}, "prov": [{"page_no": 3}]},
            {"text": "1.1.1 Systems", "label": "section_header", "formatting": {"bold": True}, "prov": [{"page_no": 4}]},
            {"text": "Appendix A Acronyms", "label": "section_header", "formatting": {"bold": True}, "prov": [{"page_no": 9}]},
        ],
    }


class Stage1ParserTests(unittest.TestCase):
    def test_builds_numeric_hierarchy(self) -> None:
        result = build_stage1_section_tree(
            filename="sample.docx",
            structured_document=sample_structured_document(),
        )
        sections = result["sections"]
        self.assertEqual(sections[0]["section_number"], "1")
        self.assertEqual(sections[1]["parent_section_number"], "1")
        self.assertEqual(sections[2]["parent_section_number"], "1.1")
        self.assertEqual(sections[2]["depth"], 3)

    def test_detects_appendix_as_root(self) -> None:
        result = build_stage1_section_tree(
            filename="sample.docx",
            structured_document=sample_structured_document(),
        )
        appendix = result["sections"][-1]
        self.assertEqual(appendix["section_number"], "APPENDIX A")
        self.assertIsNone(appendix["parent_section_number"])
        self.assertEqual(appendix["depth"], 1)

    def test_markdown_fallback(self) -> None:
        result = build_stage1_section_tree(
            filename="sample.md",
            normalized_markdown="# 2 Scope\n\n## 2.1 Tasks\n\nBody text",
        )
        self.assertEqual([item["section_number"] for item in result["sections"]], ["2", "2.1"])

    def test_markdown_fallback_strips_margin_line_numbers(self) -> None:
        result = build_stage1_section_tree(
            filename="sample.md",
            normalized_markdown="# 3 Performance Objectives\n\n48\n49 The contractor shall provide support.\n50 The contractor shall maintain records.",
        )
        self.assertEqual([item["section_number"] for item in result["sections"]], ["3"])


if __name__ == "__main__":
    unittest.main()

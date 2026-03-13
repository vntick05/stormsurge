import pathlib
import sys
import unittest


SERVICE_DIR = pathlib.Path(__file__).resolve().parents[1]
if str(SERVICE_DIR) not in sys.path:
    sys.path.insert(0, str(SERVICE_DIR))

from outline_view import build_outline, count_outline_stats


class OutlineViewTests(unittest.TestCase):
    def test_build_outline_attaches_bullets_to_previous_paragraph(self) -> None:
        markdown = """## 3.1 Operation and Sustainment

First paragraph.

Second paragraph:

- Bullet one
- Bullet two

### 3.1.1 Map Stack

Child paragraph.
"""
        outline = build_outline(markdown)
        self.assertEqual(len(outline), 1)
        parent = outline[0]
        self.assertEqual(parent["section_number"], "3.1")
        self.assertEqual(parent["children"][0]["id"], "3.1.p1")
        self.assertEqual(parent["children"][1]["id"], "3.1.p2")
        self.assertEqual(parent["children"][1]["children"][0]["id"], "3.1.p2.b1")
        self.assertEqual(parent["children"][2]["section_number"], "3.1.1")

    def test_count_outline_stats_counts_nested_nodes(self) -> None:
        outline = build_outline(
            "## 1 Purpose\n\nPara.\n\n## 2 Scope\n\nText.\n\n- Bullet.\n"
        )
        stats = count_outline_stats(outline)
        self.assertEqual(stats["sections"], 2)
        self.assertEqual(stats["paragraphs"], 2)
        self.assertEqual(stats["bullets"], 1)

    def test_splits_inline_ordered_items(self) -> None:
        outline = build_outline(
            "### 3.1.5 USFK\n\nIntro text: 1. First item. 2. Second item. 3. Third item.\n"
        )
        paragraph = outline[0]["children"][0]
        self.assertEqual(paragraph["text_exact"], "Intro text:")
        self.assertEqual([child["marker"] for child in paragraph["children"]], ["1.", "2.", "3."])
        self.assertEqual(paragraph["children"][0]["text_exact"], "First item.")

    def test_ignores_front_matter_and_normalizes_numbering_offset(self) -> None:
        outline = build_outline(
            "## 1 Table of Contents\n\nStuff.\n\n## 2 Figures\n\nStuff.\n\n## 3 Purpose\n\nPara.\n\n## 4 Scope\n\nPara.\n\n## 6 Performance Objectives\n\nPara.\n\n### 6.1 Tasks\n\nPara.\n"
        )
        self.assertEqual([section["section_number"] for section in outline], ["1", "2", "4"])
        self.assertEqual(outline[0]["section_title"], "Purpose")
        self.assertEqual(outline[2]["section_title"], "Performance Objectives")
        self.assertEqual(outline[2]["children"][1]["section_number"], "4.1")


if __name__ == "__main__":
    unittest.main()

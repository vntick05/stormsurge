import pathlib
import sys
import unittest


SERVICE_DIR = pathlib.Path(__file__).resolve().parents[1]
if str(SERVICE_DIR) not in sys.path:
    sys.path.insert(0, str(SERVICE_DIR))

from outline_view import build_generic_outline, build_outline, count_outline_stats


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

    def test_parses_alpha_prefixed_section_numbers(self) -> None:
        outline = build_outline(
            "## L.10 Page Limitations\n\nPara.\n\n### L.10.1 Volume I\n\nChild para.\n"
        )
        self.assertEqual([section["section_number"] for section in outline], ["L.10"])
        self.assertEqual(outline[0]["section_title"], "Page Limitations")
        self.assertEqual(outline[0]["children"][1]["section_number"], "L.10.1")

    def test_parses_bold_standalone_section_lines(self) -> None:
        outline = build_outline(
            "**L.4 Proposal Preparation and Delivery**\n\nPara.\n\n**L.5 General Instructions**\n\nNext.\n"
        )
        self.assertEqual([section["section_number"] for section in outline], ["L.4", "L.5"])
        self.assertEqual(outline[0]["section_title"], "Proposal Preparation and Delivery")
        self.assertEqual(outline[1]["children"][0]["text_exact"], "Next.")

    def test_preserves_pipe_table_as_single_paragraph(self) -> None:
        outline = build_outline(
            "**L.8 Proposal Volumes and Organization**\n\n"
            "| **Volume** | **Volume Title** | **Page Limit** | **Contents & Format** |\n"
            "|--------------|------------------|----------------|-----------------------|\n"
            "| **1** | **Offer** | **Page Limit** | **Cover Letter and Table of Contents. MS Word File.** |\n"
            "| Appendix 1-A | Cover Letter | 2 | MS Word File or Adobe PDF |\n"
        )
        paragraph = outline[0]["children"][0]
        self.assertIn("| **Volume** | **Volume Title** |", paragraph["text_exact"])
        self.assertEqual(paragraph["children"], [])

    def test_build_generic_outline_preserves_paragraphs_and_bullets_without_headings(self) -> None:
        outline = build_generic_outline(
            "Appendix A Map Stack\n\n"
            "The contractor shall provide the map stack platform.\n\n"
            "The submission shall include:\n\n"
            "- Architecture overview\n"
            "- Deployment approach\n\n"
            "Digital PDF copies are acceptable.\n",
            "Appendix A Map Stack",
        )
        self.assertEqual(len(outline), 1)
        self.assertEqual(outline[0]["section_number"], "DOC")
        self.assertEqual(outline[0]["section_title"], "Appendix A Map Stack")
        self.assertEqual(outline[0]["children"][0]["text_exact"], "Appendix A Map Stack")
        self.assertEqual(
            outline[0]["children"][2]["children"][0]["text_exact"],
            "Architecture overview",
        )
        self.assertEqual(
            outline[0]["children"][3]["text_exact"],
            "Digital PDF copies are acceptable.",
        )


if __name__ == "__main__":
    unittest.main()

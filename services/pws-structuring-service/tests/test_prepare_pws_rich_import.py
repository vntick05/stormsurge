import importlib.util
import pathlib
import unittest


MODULE_PATH = pathlib.Path(__file__).resolve().parents[1] / "rich_import.py"
SPEC = importlib.util.spec_from_file_location("rich_import", MODULE_PATH)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(MODULE)


class PreparePwsRichImportTests(unittest.TestCase):
    def test_extracts_headings_tables_and_images(self) -> None:
        structured_document = {
            "body": {
                "children": [
                    {"$ref": "#/texts/0"},
                    {"$ref": "#/texts/1"},
                    {"$ref": "#/tables/0"},
                    {"$ref": "#/pictures/0"},
                ]
            },
            "texts": [
                {"text": "1 Overview", "prov": [{"page_no": 1}]},
                {"text": "Body paragraph.", "prov": [{"page_no": 1}]},
                {"text": "Figure 1-1, System Context", "prov": [{"page_no": 2}]},
            ],
            "tables": [
                {
                    "data": {
                        "grid": [
                            [{"text": "Col A"}, {"text": "Col B"}],
                            [{"text": "A1"}, {"text": "B1"}],
                        ]
                    },
                    "prov": [{"page_no": 2}],
                }
            ],
            "pictures": [
                {
                    "children": [{"$ref": "#/texts/2"}],
                    "prov": [{"page_no": 2}],
                }
            ],
        }

        blocks = MODULE.extract_structured_blocks(structured_document)
        self.assertEqual([block["block_type"] for block in blocks], ["heading", "text", "table", "image"])
        self.assertEqual(blocks[2]["rows"][1], ["A1", "B1"])
        self.assertIn("System Context", blocks[3]["caption"])

    def test_renders_markdown_table_and_image_placeholder(self) -> None:
        markdown = MODULE.render_rich_markdown(
            [
                {
                    "block_type": "heading",
                    "heading": {"section_number": "1", "section_title": "Overview", "depth": 1},
                },
                {"block_type": "table", "rows": [["A", "B"], ["1", "2"]]},
                {"block_type": "image", "caption": "Figure 1-1, System Context", "source": {"ref": "#/pictures/0"}},
            ]
        )
        self.assertIn("| A | B |", markdown)
        self.assertIn("> [Image] Figure 1-1, System Context (#/pictures/0)", markdown)

    def test_builds_merged_outline_with_table_and_image_children(self) -> None:
        merged = MODULE.build_merged_outline(
            [
                {"section_number": "1", "section_title": "Overview", "depth": 1, "parent_section_number": None},
                {"section_number": "1.1", "section_title": "Purpose", "depth": 2, "parent_section_number": "1"},
            ],
            [
                {"block_type": "heading", "heading": {"section_number": "1", "section_title": "Overview", "depth": 1}},
                {"block_type": "text", "text": "Intro paragraph."},
                {"block_type": "heading", "heading": {"section_number": "1.1", "section_title": "Purpose", "depth": 2}},
                {"block_type": "table", "rows": [["A", "B"], ["1", "2"]]},
                {"block_type": "image", "caption": "Figure 1-1, System Context", "source": {"ref": "#/pictures/0"}},
            ],
        )
        self.assertEqual(merged[0]["section_number"], "1")
        child_types = [child.get("type") for child in merged[0]["children"] if isinstance(child, dict) and child.get("type")]
        self.assertIn("paragraph", child_types)
        subsection = next(child for child in merged[0]["children"] if child.get("section_number") == "1.1")
        self.assertEqual(subsection["section_number"], "1.1")
        self.assertEqual(subsection["children"][0]["type"], "table_text")
        self.assertEqual(subsection["children"][1]["type"], "image")

    def test_drops_preface_blocks_and_attaches_descendants_to_parent_section(self) -> None:
        merged = MODULE.build_merged_outline(
            [
                {"section_number": "1", "section_title": "Overview", "depth": 1, "parent_section_number": None},
                {"section_number": "1.1", "section_title": "Purpose", "depth": 2, "parent_section_number": "1"},
            ],
            [
                {"block_type": "heading", "heading": {"section_number": "22", "section_title": "Change Log", "depth": 1}},
                {"block_type": "table", "rows": [["Old"], ["Preface Table"]]},
                {"block_type": "heading", "heading": {"section_number": "1", "section_title": "Overview", "depth": 1}},
                {"block_type": "text", "text": "Overview intro."},
                {"block_type": "heading", "heading": {"section_number": "1.1.1.", "section_title": "Derived Child", "depth": 3}},
                {"block_type": "table", "rows": [["A", "B"], ["1", "2"]]},
                {"block_type": "image", "caption": "Figure 1-1", "source": {"ref": "#/pictures/0"}},
            ],
        )
        overview = merged[0]
        paragraph = next(child for child in overview["children"] if child.get("type") == "paragraph")
        self.assertEqual(paragraph["text_exact"], "Overview intro.")
        types = [child.get("type") for child in overview["children"] if child.get("type")]
        self.assertNotIn("table_text", types)
        subsection = next(child for child in overview["children"] if child.get("section_number") == "1.1")
        self.assertEqual(subsection["children"][0]["type"], "table_text")
        self.assertEqual(subsection["children"][1]["type"], "image")

    def test_alignment_direct_explicit_heading_context(self) -> None:
        outline = [
            {"section_number": "1", "section_title": "Overview", "depth": 1, "children": []},
            {"section_number": "2", "section_title": "Operations", "depth": 1, "children": []},
        ]
        blocks = [
            {
                "block_type": "heading",
                "order": 1,
                "heading": {"section_number": "2", "section_title": "Operations", "depth": 1},
                "source": {"page_start": 2, "page_end": 2},
            },
            {
                "block_type": "image",
                "order": 2,
                "caption": "Operations dashboard",
                "source": {"ref": "#/pictures/0", "page_start": 2, "page_end": 2},
            },
        ]
        anchors = MODULE.build_heading_anchors(outline, blocks)
        objects = MODULE.build_object_list(blocks, anchors)
        decisions, unplaced = MODULE.align_objects_to_sections(anchors, objects)
        self.assertEqual(decisions[0]["attached_section_id"], "section-2")
        self.assertEqual(decisions[0]["attachment_method"], "explicit_heading_context")
        self.assertEqual(unplaced, [])

    def test_alignment_nearest_heading_fallback(self) -> None:
        outline = [
            {"section_number": "1", "section_title": "Overview", "depth": 1, "children": []},
            {"section_number": "2", "section_title": "Operations", "depth": 1, "children": []},
        ]
        blocks = [
            {
                "block_type": "heading",
                "order": 3,
                "heading": {"section_number": "2", "section_title": "Operations", "depth": 1},
                "source": {"page_start": 2, "page_end": 2},
            },
            {
                "block_type": "text",
                "order": 4,
                "text": "Some paragraph between heading and table.",
                "source": {"page_start": 2, "page_end": 2},
            },
            {
                "block_type": "table",
                "order": 7,
                "rows": [["A"], ["B"]],
                "source": {"ref": "#/tables/0", "page_start": 3, "page_end": 3},
            },
        ]
        anchors = MODULE.build_heading_anchors(outline, blocks)
        objects = MODULE.build_object_list(blocks, anchors)
        objects[0]["explicit_anchor_id"] = None
        decisions, _ = MODULE.align_objects_to_sections(anchors, objects)
        self.assertEqual(decisions[0]["attached_section_id"], "section-2")
        self.assertEqual(decisions[0]["attachment_method"], "nearest_preceding_heading")

    def test_alignment_page_window_fallback(self) -> None:
        outline = [
            {"section_number": "1", "section_title": "Overview", "depth": 1, "children": []},
            {"section_number": "2", "section_title": "Operations", "depth": 1, "children": []},
        ]
        blocks = [
            {
                "block_type": "heading",
                "order": 1,
                "heading": {"section_number": "1", "section_title": "Overview", "depth": 1},
                "source": {"page_start": 1, "page_end": 1},
            },
            {
                "block_type": "heading",
                "order": 10,
                "heading": {"section_number": "2", "section_title": "Operations", "depth": 1},
                "source": {"page_start": 4, "page_end": 4},
            },
            {
                "block_type": "table",
                "order": 8,
                "rows": [["Col"], ["Val"]],
                "source": {"ref": "#/tables/1", "page_start": 3, "page_end": 3},
            },
        ]
        anchors = MODULE.build_heading_anchors(outline, blocks)
        objects = MODULE.build_object_list(blocks, anchors)
        objects[0]["explicit_anchor_id"] = None
        objects[0]["preceding_anchor_id"] = None
        decisions, _ = MODULE.align_objects_to_sections(anchors, objects)
        self.assertEqual(decisions[0]["attached_section_id"], "section-1")
        self.assertEqual(decisions[0]["attachment_method"], "page_order_window")

    def test_alignment_low_confidence_unplaced(self) -> None:
        outline = [{"section_number": "1", "section_title": "Overview", "depth": 1, "children": []}]
        blocks = [
            {
                "block_type": "image",
                "order": 50,
                "caption": "Random artifact",
                "source": {"ref": "#/pictures/9", "page_start": 20, "page_end": 20},
            }
        ]
        anchors = MODULE.build_heading_anchors(outline, blocks)
        objects = MODULE.build_object_list(blocks, anchors)
        decisions, unplaced = MODULE.align_objects_to_sections(anchors, objects)
        self.assertIsNone(decisions[0]["attached_section_id"])
        self.assertEqual(decisions[0]["attachment_method"], "unplaced")
        self.assertEqual(unplaced[0]["object_id"], "obj-image-50")


if __name__ == "__main__":
    unittest.main()

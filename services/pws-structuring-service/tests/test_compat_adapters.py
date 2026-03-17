import importlib.util
import pathlib
import unittest


MODULE_PATH = pathlib.Path(__file__).resolve().parents[1] / "compat_adapters.py"
SPEC = importlib.util.spec_from_file_location("compat_adapters", MODULE_PATH)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(MODULE)


class CompatibilityAdapterTests(unittest.TestCase):
    def test_merged_payload_is_derived_from_structured_artifact(self) -> None:
        artifact = {
            "document_id": "doc-123",
            "source": {"filename": "ih2.docx"},
            "metadata": {"document_type": "document"},
            "cleaned_text": {"full_text": "Overview"},
            "hierarchy": {
                "root_sections": [{"section_number": "1", "section_title": "Overview", "children": []}],
                "sections": [{"section_id": "section-1", "section_number": "1", "section_title": "Overview", "depth": 1}],
            },
            "objects": {
                "tables": [
                    {
                        "object_id": "obj-table-2",
                        "type": "table",
                        "document_order": 2,
                        "attached_section_id": "section-1",
                    }
                ],
                "images": [
                    {
                        "object_id": "obj-image-3",
                        "type": "image",
                        "document_order": 3,
                        "attached_section_id": None,
                    }
                ],
            },
            "blocks": [{"block_type": "text", "document_order": 1}],
            "enrichments": {
                "pws": {
                    "heading_anchors": [{"section_id": "section-1"}],
                    "section_alignment_debug": [{"object_id": "obj-image-3", "attached_section_id": None}],
                }
            },
        }
        payload = MODULE.structured_artifact_to_merged_import_payload(artifact)
        self.assertEqual(payload["document_id"], "doc-123")
        self.assertEqual(payload["root_sections"][0]["section_number"], "1")
        self.assertEqual(len(payload["rich_objects"]), 2)
        self.assertEqual(payload["unplaced_artifacts"][0]["object_id"], "obj-image-3")
        self.assertEqual(payload["structured_artifact"]["source"]["filename"], "ih2.docx")

    def test_pws_payload_rebuilds_outline_from_cleaned_markdown(self) -> None:
        artifact = {
            "document_id": "doc-456",
            "source": {"filename": "ih2.docx"},
            "metadata": {"document_type": "pws_sow"},
            "cleaned_text": {
                "full_text": "\n".join(
                    [
                        "(U) Table of Contents",
                        "1 Overview",
                        "Intro paragraph.",
                        "3 Requirements",
                        "3.6 Parent Heading",
                        "3.6.2 Child Heading",
                        "3.6.2.3 Third Child Heading",
                        "Third child body.",
                    ]
                )
            },
            "hierarchy": {"root_sections": [], "sections": []},
            "objects": {"tables": [], "images": []},
            "blocks": [],
            "enrichments": {"pws": {}},
        }

        payload = MODULE.structured_artifact_to_merged_import_payload(artifact)

        self.assertEqual(payload["root_sections"][0]["section_number"], "1")
        rebuilt_numbers = [section["section_number"] for section in payload["sections"]]
        self.assertIn("3.6.2.3", rebuilt_numbers)


if __name__ == "__main__":
    unittest.main()

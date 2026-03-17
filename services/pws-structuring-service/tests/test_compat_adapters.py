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


if __name__ == "__main__":
    unittest.main()

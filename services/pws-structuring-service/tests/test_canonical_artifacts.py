import importlib.util
import pathlib
import unittest


MODULE_PATH = pathlib.Path(__file__).resolve().parents[1] / "canonical_artifacts.py"
SPEC = importlib.util.spec_from_file_location("canonical_artifacts", MODULE_PATH)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(MODULE)


class CanonicalArtifactTests(unittest.TestCase):
    def test_builds_valid_structured_document_artifact(self) -> None:
        artifact = MODULE.build_structured_document_artifact(
            filename="ih2.docx",
            normalized_markdown="# 1 Overview\n\nBody.\n",
            root_sections=[
                {
                    "section_number": "1",
                    "section_title": "Overview",
                    "depth": 1,
                    "children": [
                        {
                            "type": "paragraph",
                            "id": "1.p1",
                            "text_exact": "Body.",
                            "children": [],
                        }
                    ],
                }
            ],
            blocks=[
                {
                    "block_type": "heading",
                    "order": 1,
                    "text": "1 Overview",
                    "heading": {"section_number": "1", "section_title": "Overview", "depth": 1},
                    "source": {"ref": "#/texts/0", "page_start": 1, "page_end": 1},
                }
            ],
            heading_anchors=[
                {
                    "section_id": "section-1",
                    "section_number": "1",
                    "title": "Overview",
                    "level": 1,
                    "document_order_start": 1,
                    "document_order_end": None,
                }
            ],
            alignment_decisions=[],
            unplaced_objects=[],
        )
        validated = MODULE.validate_structured_document_artifact(artifact)
        self.assertEqual(validated["artifact_type"], "structured_document_v1")
        self.assertEqual(validated["hierarchy"]["quality"], "partial")
        self.assertEqual(validated["hierarchy"]["sections"][0]["section_id"], "section-1")

    def test_validation_rejects_missing_required_fields(self) -> None:
        with self.assertRaises(Exception):
            MODULE.validate_structured_document_artifact({"artifact_type": "structured_document_v1"})


if __name__ == "__main__":
    unittest.main()

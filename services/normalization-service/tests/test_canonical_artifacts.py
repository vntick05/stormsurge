import importlib.util
import pathlib
import unittest


MODULE_PATH = pathlib.Path(__file__).resolve().parents[1] / "canonical_artifacts.py"
SPEC = importlib.util.spec_from_file_location("canonical_artifacts", MODULE_PATH)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(MODULE)


class CanonicalArtifactTests(unittest.TestCase):
    def test_builds_pws_structured_document_artifact(self) -> None:
        artifact = MODULE.build_structured_document_artifact(
            document_id="doc-1",
            filename="sample_pws.docx",
            content_sha256="abc123",
            provider="docling_pws",
            normalized_markdown="# 1 Overview\n\nBody.\n",
            sections=[
                {
                    "section_number": "1",
                    "section_title": "Overview",
                    "section_heading": "Overview",
                }
            ],
            tables=[
                {
                    "section_number": "1",
                    "section_heading": "Overview",
                    "page_start": 2,
                    "confidence": 0.8,
                }
            ],
            blocks=[
                {
                    "block_type": "heading",
                    "document_order": 0,
                    "normalized_text": "1 Overview",
                    "numbering_token": "1",
                    "heading_title": "Overview",
                    "page_start": 1,
                }
            ],
            pws_artifacts={"requirements": [{"id": "r1"}]},
        )
        self.assertEqual(artifact["artifact_type"], "structured_document_v1")
        self.assertEqual(artifact["metadata"]["document_type"], "pws_sow")
        self.assertEqual(artifact["hierarchy"]["quality"], "strong")
        self.assertEqual(artifact["enrichments"]["pws"]["applied"], True)

    def test_builds_generic_structured_document_artifact(self) -> None:
        artifact = MODULE.build_structured_document_artifact(
            document_id="doc-2",
            filename="notes.docx",
            content_sha256="def456",
            provider="docling",
            normalized_markdown="General notes",
            sections=[],
            tables=[],
            blocks=[],
            pws_artifacts=None,
        )
        self.assertEqual(artifact["metadata"]["document_type"], "document")
        self.assertEqual(artifact["hierarchy"]["quality"], "weak")
        self.assertEqual(artifact["enrichments"]["pws"]["applied"], False)

    def test_validation_rejects_missing_fields(self) -> None:
        with self.assertRaises(ValueError):
            MODULE.validate_structured_document_artifact({"artifact_type": "structured_document_v1"})


if __name__ == "__main__":
    unittest.main()

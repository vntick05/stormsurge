import pathlib
import sys
import unittest


SERVICE_DIR = pathlib.Path(__file__).resolve().parents[1]
if str(SERVICE_DIR) not in sys.path:
    sys.path.insert(0, str(SERVICE_DIR))

from related_requirement_search import search_related_requirements


class RelatedRequirementSearchTests(unittest.TestCase):
    def test_returns_ranked_project_matches(self) -> None:
        rows = [
            {
                "id": "req-1",
                "document_id": "doc-1",
                "filename": "TO1 PWS.docx",
                "section_number": "3.1",
                "section_heading": "Operation and Sustainment",
                "heading_path": "3 > 3.1",
                "requirement_text": "The Contractor shall provide technical support for the map stack capability.",
                "normalized_requirement_text": "The Contractor shall provide technical support for the map stack capability.",
                "modality": "shall",
                "actor": "contractor",
                "action": "provide",
                "object_text": "technical support map stack capability",
            },
            {
                "id": "req-2",
                "document_id": "doc-2",
                "filename": "Base IDIQ PWS.docx",
                "section_number": "4.10",
                "section_heading": "Technical Support",
                "heading_path": "4 > 4.10",
                "requirement_text": "The Contractor shall provide technical support for each capability environment.",
                "normalized_requirement_text": "The Contractor shall provide technical support for each capability environment.",
                "modality": "shall",
                "actor": "contractor",
                "action": "provide",
                "object_text": "technical support capability environment",
            },
            {
                "id": "req-3",
                "document_id": "doc-3",
                "filename": "Appendix C.docx",
                "section_number": "2.0",
                "section_heading": "Portal Use",
                "heading_path": "2.0",
                "requirement_text": "Users shall access the portal through the approved entry point.",
                "normalized_requirement_text": "Users shall access the portal through the approved entry point.",
                "modality": "shall",
                "actor": "government",
                "action": "access",
                "object_text": "portal approved entry point",
            },
        ]

        result = search_related_requirements(rows, source_requirement_id="req-1", limit=5)

        self.assertEqual(result["source_requirement"]["requirement_id"], "req-1")
        self.assertGreaterEqual(len(result["results"]), 1)
        self.assertEqual(result["results"][0]["requirement_id"], "req-2")
        self.assertIn("technical support", result["results"][0]["requirement_text"].lower())

    def test_supports_ad_hoc_source_text(self) -> None:
        rows = [
            {
                "id": "req-9",
                "document_id": "doc-9",
                "filename": "Some Doc.docx",
                "section_number": "1.0",
                "section_heading": "Intro",
                "heading_path": "1.0",
                "requirement_text": "The Contractor shall submit a monthly status report.",
                "normalized_requirement_text": "The Contractor shall submit a monthly status report.",
                "modality": "shall",
                "actor": "contractor",
                "action": "submit",
                "object_text": "monthly status report",
            }
        ]

        result = search_related_requirements(
            rows,
            source_text="The Contractor shall submit monthly reports.",
            query_text="monthly status report",
        )

        self.assertEqual(result["source_requirement"]["requirement_id"], "ad-hoc-source")
        self.assertEqual(result["results"][0]["requirement_id"], "req-9")

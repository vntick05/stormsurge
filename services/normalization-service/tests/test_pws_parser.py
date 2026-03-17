import json
import io
import pathlib
import sys
import unittest
import zipfile


SERVICE_DIR = pathlib.Path(__file__).resolve().parents[1]
if str(SERVICE_DIR) not in sys.path:
    sys.path.insert(0, str(SERVICE_DIR))

from pws_parser import is_likely_pws_document, parse_pws_document
from xlsx_export import build_pws_hierarchy_rows, build_workbook


def sample_structured_json() -> str:
    payload = {
        "body": {
            "children": [
                {"$ref": "#/texts/0"},
                {"$ref": "#/texts/1"},
                {"$ref": "#/texts/2"},
                {"$ref": "#/texts/3"},
                {"$ref": "#/tables/0"},
                {"$ref": "#/texts/4"},
                {"$ref": "#/texts/5"},
            ]
        },
        "texts": [
            {"text": "1.0 INTRODUCTION", "label": "section_header", "formatting": {"bold": True}, "prov": [{"page_no": 1}]},
            {"text": "1.1 Scope", "label": "section_header", "formatting": {"bold": True}, "prov": [{"page_no": 1}]},
            {
                "text": "The Contractor shall provide program management support and maintain records.",
                "label": "text",
                "formatting": {},
                "prov": [{"page_no": 1}],
            },
            {"text": "(a) The Contractor shall submit a monthly status report.", "label": "list_item", "formatting": {}, "prov": [{"page_no": 1}]},
            {"text": "Appendix A Acronyms", "label": "section_header", "formatting": {"bold": True}, "prov": [{"page_no": 2}]},
            {"text": "COR means Contracting Officer's Representative.", "label": "text", "formatting": {}, "prov": [{"page_no": 2}]},
        ],
        "tables": [
            {
                "data": {
                    "grid": [
                        [{"text": "Deliverable"}, {"text": "Requirement"}],
                        [{"text": "Monthly Status Report"}, {"text": "Contractor shall deliver by the 5th business day."}],
                    ]
                },
                "prov": [{"page_no": 1}],
            }
        ],
    }
    return json.dumps(payload)


def sample_llm(unit: dict[str, object]) -> dict[str, object]:
    text = str(unit["text_exact"])
    requirements = []
    deliverables = []
    review_items = []
    if "shall provide program management support" in text:
        requirements.append(
            {
                "source_text": "The Contractor shall provide program management support",
                "normalized_text": "Provide program management support",
                "modality": "shall",
                "actor": "contractor",
                "action": "provide",
                "object": "program management support",
                "deliverable_flag": False,
                "review_flag": False,
                "confidence": 0.94,
                "llm_model": "mock-llm",
                "llm_prompt_version": "test-v1",
            }
        )
        requirements.append(
            {
                "source_text": "shall maintain records",
                "normalized_text": "Maintain records",
                "modality": "shall",
                "actor": "contractor",
                "action": "maintain",
                "object": "records",
                "deliverable_flag": False,
                "review_flag": False,
                "confidence": 0.9,
                "llm_model": "mock-llm",
                "llm_prompt_version": "test-v1",
            }
        )
    elif "monthly status report" in text.lower():
        requirements.append(
            {
                "source_text": text,
                "normalized_text": "Submit monthly status report",
                "modality": "shall",
                "actor": "contractor",
                "action": "submit",
                "object": "monthly status report",
                "deliverable_flag": True,
                "review_flag": False,
                "confidence": 0.92,
                "llm_model": "mock-llm",
                "llm_prompt_version": "test-v1",
            }
        )
        deliverables.append(
            {
                "source_text": "monthly status report",
                "normalized_text": "Monthly status report",
                "due_timing": "monthly",
                "format": None,
                "review_flag": False,
                "confidence": 0.88,
            }
        )
    else:
        review_items.append({"reason": "ambiguous", "raw_text": text, "confidence": 0.51})
    return {"requirements": requirements, "deliverables": deliverables, "review_items": review_items}


class PwsParserTests(unittest.TestCase):
    def test_detects_likely_pws_documents(self) -> None:
        self.assertTrue(is_likely_pws_document("STRATA_TO1_PWS.docx"))
        self.assertTrue(is_likely_pws_document("IH2_SOW_v3.docx"))
        self.assertTrue(is_likely_pws_document("solicitation.docx", "Performance Work Statement\n1.0 INTRODUCTION"))
        self.assertTrue(is_likely_pws_document("solicitation.docx", "STATEMENT OF WORK (SOW)\n1.0 INTRODUCTION"))
        self.assertFalse(is_likely_pws_document("pricing-template.xlsx", "pricing workbook"))

    def test_docling_structural_mode_with_llm_extraction(self) -> None:
        result = parse_pws_document(
            document_id="doc-1",
            project_id="proj-1",
            filename="sample_pws.docx",
            content_sha256="abc123",
            structured_json=sample_structured_json(),
            markdown="# 1.0 INTRODUCTION\n\n# 1.1 Scope\n\nThe Contractor shall provide program management support and maintain records.",
            llm_extractor=sample_llm,
            llm_model="mock-llm",
            llm_prompt_version="test-v1",
        )

        self.assertIn(result["parse_mode_selected"], {"docling_structural", "hybrid_markdown_fill"})
        self.assertEqual(result["sections"][1]["section_number"], "1.1")
        self.assertEqual(result["sections"][1]["heading_path"], "1.0 > 1.1")
        self.assertTrue(any(row["action"] == "provide" for row in result["requirements"]))
        self.assertTrue(any(row["deliverable_flag"] for row in result["requirements"]))
        self.assertEqual(result["audit"]["llm_units_processed"] > 0, True)

    def test_toc_heavy_doc_uses_markdown_fill(self) -> None:
        payload = {
            "body": {"children": [{"$ref": "#/texts/0"}, {"$ref": "#/texts/1"}, {"$ref": "#/texts/2"}]},
            "texts": [
                {"text": "Table of Contents", "label": "text", "formatting": {"bold": True}},
                {"text": "3.1 Program Management ........ 5", "label": "text", "formatting": {"bold": False}},
                {"text": "3.1 Program Management", "label": "section_header", "formatting": {"bold": False}},
            ],
        }
        markdown = "3.1 Program Management\n\nThe Contractor shall manage the program office and shall report weekly."
        result = parse_pws_document(
            document_id="doc-2",
            project_id="proj-2",
            filename="toc_heavy_pws.docx",
            content_sha256="def456",
            structured_json=json.dumps(payload),
            markdown=markdown,
            llm_extractor=sample_llm,
            llm_model="mock-llm",
            llm_prompt_version="test-v1",
        )

        self.assertEqual(result["parse_mode_selected"], "hybrid_markdown_fill")
        self.assertIn("manage the program office", result["sections"][0]["body"].lower())
        self.assertEqual(result["audit"]["fallback_reason"], "docling_body_signal_low")
        self.assertGreaterEqual(len(result["requirements"]), 1)

    def test_heading_only_docling_uses_tika_fallback(self) -> None:
        payload = {
            "body": {"children": [{"$ref": "#/texts/0"}]},
            "texts": [{"text": "4.2.1 Portal Support", "label": "section_header", "formatting": {"bold": True}}],
        }
        tika_text = "4.2.1 Portal Support\n\nThe Contractor shall maintain the portal and submit monthly usage reports."
        result = parse_pws_document(
            document_id="doc-3",
            project_id="proj-3",
            filename="portal_pws.docx",
            content_sha256="ghi789",
            structured_json=json.dumps(payload),
            markdown="",
            tika_text=tika_text,
            llm_extractor=sample_llm,
            llm_model="mock-llm",
            llm_prompt_version="test-v1",
        )
        self.assertEqual(result["parse_mode_selected"], "tika_fallback")
        self.assertIn("portal", result["sections"][0]["body"].lower())
        self.assertGreaterEqual(len(result["requirements"]), 1)

    def test_appendices_and_tables_are_preserved(self) -> None:
        result = parse_pws_document(
            document_id="doc-4",
            project_id="proj-4",
            filename="sample_pws.docx",
            content_sha256="xyz123",
            structured_json=sample_structured_json(),
            llm_extractor=sample_llm,
            llm_model="mock-llm",
            llm_prompt_version="test-v1",
        )
        self.assertEqual(result["appendix_sections"][0]["tree_kind"], "APPENDIX")
        self.assertIn(result["tables"][0]["section_number"], {"1.0", "1.1"})
        self.assertTrue(any(cell["row_index"] == 1 for cell in result["table_cells"]))

    def test_manual_review_required_when_no_reliable_structure(self) -> None:
        payload = {"body": {"children": [{"$ref": "#/texts/0"}]}, "texts": [{"text": "Random cover page text", "label": "text", "formatting": {}}]}
        result = parse_pws_document(
            document_id="doc-5",
            project_id="proj-5",
            filename="weak_pws.docx",
            content_sha256="lmn000",
            structured_json=json.dumps(payload),
            markdown="Cover page only",
            tika_text="Cover page only",
        )
        self.assertEqual(result["parse_mode_selected"], "manual_review_required")
        self.assertEqual(result["audit"]["llm_units_processed"], 0)

    def test_attached_paragraphs_always_emit_requirement_rows(self) -> None:
        payload = {
            "body": {"children": [{"$ref": "#/texts/0"}, {"$ref": "#/texts/1"}]},
            "texts": [
                {"text": "2.0 Scope", "label": "section_header", "formatting": {"bold": True}},
                {"text": "The system provides geospatial support to mission users.", "label": "text", "formatting": {}},
            ],
        }
        result = parse_pws_document(
            document_id="doc-6",
            project_id="proj-6",
            filename="scope_pws.docx",
            content_sha256="req000",
            structured_json=json.dumps(payload),
            llm_extractor=lambda unit: {"requirements": [], "deliverables": [], "review_items": []},
            llm_model="mock-llm",
            llm_prompt_version="test-v1",
        )
        self.assertEqual(result["sections"][0]["section_number"], "2.0")
        self.assertEqual(len(result["requirements"]), 1)
        self.assertEqual(result["requirements"][0]["requirement_text_exact"], "The system provides geospatial support to mission users.")

    def test_fallback_attaches_prose_to_nearest_heading(self) -> None:
        payload = {
            "body": {"children": [{"$ref": "#/texts/0"}]},
            "texts": [{"text": "3.1 Program Management", "label": "section_header", "formatting": {"bold": True}}],
        }
        markdown = "[3.1\tProgram Management\t5](.)\n\n3.1 Program Management\n\nThe Contractor shall manage the program office.\n\nThe Contractor shall submit a weekly report."
        result = parse_pws_document(
            document_id="doc-7",
            project_id="proj-7",
            filename="fallback_pws.docx",
            content_sha256="attach001",
            structured_json=json.dumps(payload),
            markdown=markdown,
            llm_extractor=lambda unit: {"requirements": [], "deliverables": [], "review_items": []},
            llm_model="mock-llm",
            llm_prompt_version="test-v1",
        )
        self.assertEqual(result["parse_mode_selected"], "hybrid_markdown_fill")
        self.assertTrue(any("weekly report" in section["body"].lower() for section in result["sections"]))
        self.assertEqual(len(result["requirements"]), 2)

    def test_builds_multi_sheet_workbook(self) -> None:
        workbook = build_workbook(
            [
                ("Sections", [{"section_number": "1.0", "heading_path": "1.0", "body_text_exact": "Intro"}]),
                ("Requirements", [{"requirement_id": "r1", "requirement_text_exact": "The Contractor shall provide support."}]),
            ]
        )
        with zipfile.ZipFile(io.BytesIO(workbook)) as archive:
            self.assertIn("xl/workbook.xml", archive.namelist())
            self.assertIn("xl/worksheets/sheet1.xml", archive.namelist())

    def test_builds_pws_hierarchy_rows(self) -> None:
        rows = build_pws_hierarchy_rows(
            {
                "pws_extract": {
                    "sections": [
                        {
                            "section_record_id": "sec-1",
                            "parent_section_record_id": None,
                            "section_number": "3",
                            "section_title": "Operations",
                            "heading_path": "3",
                            "body_text_exact": "Top paragraph",
                            "tree_kind": "MAIN",
                        },
                        {
                            "section_record_id": "sec-2",
                            "parent_section_record_id": "sec-1",
                            "section_number": "3.1",
                            "section_title": "Program Management",
                            "heading_path": "3 > 3.1",
                            "body_text_exact": "First bullet\n\nSecond bullet",
                            "tree_kind": "MAIN",
                        },
                        {
                            "section_record_id": "sec-3",
                            "parent_section_record_id": None,
                            "section_number": "Appendix A",
                            "section_title": "Acronyms",
                            "heading_path": "Appendix A",
                            "body_text_exact": "Appendix text",
                            "tree_kind": "APPENDIX",
                        },
                    ],
                    "tables": [
                        {
                            "heading_path": "3 > 3.1",
                            "normalized_text": "Col1 | Col2\nA | B",
                        }
                    ],
                }
            }
        )
        self.assertEqual(rows[0]["Level 1"], "3 Operations")
        self.assertEqual(rows[0]["Content"], "Top paragraph")
        self.assertEqual(rows[1]["Level 1"], "3 Operations")
        self.assertEqual(rows[1]["Level 2"], "3.1 Program Management")
        self.assertEqual(rows[1]["Content"], "First bullet")
        self.assertEqual(rows[2]["Content"], "Second bullet")
        self.assertEqual(rows[3]["Content"], "Col1 | Col2\nA | B")
        self.assertEqual(rows[4]["Level 1"], "Appendix A Acronyms")
        self.assertEqual(list(rows[4].keys()), ["Level 1", "Level 2", "Level 3", "Level 4", "Content", "Summary"])


if __name__ == "__main__":
    unittest.main()

import pathlib
import sys
import unittest


SERVICE_DIR = pathlib.Path(__file__).resolve().parents[1]
if str(SERVICE_DIR) not in sys.path:
    sys.path.insert(0, str(SERVICE_DIR))

from outline_view import build_outline
from related_linker import build_related_links


class RelatedLinkerTests(unittest.TestCase):
    def test_links_explicit_base_idiq_section_reference(self) -> None:
        primary_outline = build_outline(
            "## 3 Performance Objectives\n\n### 3.1 Operations\n\nThe Contractor must provide technical support IAW section 4.10 of the Strata IDIQ Base PWS.\n"
        )
        related_outline = build_outline(
            "## 1 Purpose\n\nText.\n\n## 4 Performance Objectives\n\n### 4.10 Technical Support\n\nTechnical support includes help desk and user support.\n"
        )
        links = build_related_links(
            primary_filename="TO1 PWS.docx",
            primary_outline=primary_outline,
            supporting_documents=[
                {"filename": "Strata Base IDIQ PWS.docx", "outline": related_outline}
            ],
        )
        self.assertIn("3.1.p1", links)
        self.assertEqual(links["3.1.p1"][0]["cited_section"], "4.10")
        self.assertEqual(links["3.1.p1"][0]["relationship"], "governing_section")

    def test_links_appendix_documents(self) -> None:
        primary_outline = build_outline(
            "## 3 Performance Objectives\n\n### 3.1 Operations\n\nThe Contractor must support capabilities listed in Appendices A - B.\n"
        )
        appendix_a = build_outline("## 1 Map Stack\n\nMap Stack content.\n")
        appendix_b = build_outline("## 1 IC GIS Portal\n\nPortal content.\n")
        links = build_related_links(
            primary_filename="TO1 PWS.docx",
            primary_outline=primary_outline,
            supporting_documents=[
                {"filename": "STRATA_TO1_PWS_Appendix_A_Map_Stack_v6.docx", "outline": appendix_a},
                {"filename": "STRATA_TO1_PWS_Appendix_B_IC_GIS_v6.docx", "outline": appendix_b},
            ],
        )
        self.assertIn("3.1.p1", links)
        docs = {item["source_document"] for item in links["3.1.p1"]}
        self.assertIn("STRATA_TO1_PWS_Appendix_A_Map_Stack_v6.docx", docs)
        self.assertIn("STRATA_TO1_PWS_Appendix_B_IC_GIS_v6.docx", docs)
        self.assertTrue(all(item["relationship"] == "referenced_appendix" for item in links["3.1.p1"]))


if __name__ == "__main__":
    unittest.main()

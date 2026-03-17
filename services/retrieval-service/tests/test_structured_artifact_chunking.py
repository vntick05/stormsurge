import importlib.util
import os
import pathlib
import sys
import types
import unittest


SERVICE_DIR = pathlib.Path(__file__).resolve().parents[1]
MODULE_PATH = SERVICE_DIR / "app.py"


class _DummyTextEmbedding:
    def __init__(self, *args, **kwargs):
        pass

    def embed(self, texts):
        return [[0.0, 0.0, 0.0] for _ in texts]


class _DummyPipeline:
    def add_component(self, *args, **kwargs):
        return None

    def connect(self, *args, **kwargs):
        return None


def _component(obj=None, **kwargs):
    if obj is None:
        def decorator(cls):
            return cls
        return decorator
    return obj


_component.output_types = lambda **kwargs: (lambda fn: fn)


class _DummyFastAPI:
    def __init__(self, *args, **kwargs):
        pass

    def get(self, *args, **kwargs):
        return lambda fn: fn

    def post(self, *args, **kwargs):
        return lambda fn: fn


class _DummyHTTPException(Exception):
    pass


class _DummyBaseModel:
    def __init__(self, **kwargs):
        for key, value in kwargs.items():
            setattr(self, key, value)

    def model_dump(self):
        return self.__dict__.copy()


def _dummy_field(default=None, **kwargs):
    return default


sys.modules.setdefault("fastembed", types.SimpleNamespace(TextEmbedding=_DummyTextEmbedding))
sys.modules.setdefault("fastapi", types.SimpleNamespace(FastAPI=_DummyFastAPI, HTTPException=_DummyHTTPException))
sys.modules.setdefault("haystack", types.SimpleNamespace(Pipeline=_DummyPipeline, component=_component))
sys.modules.setdefault("qdrant_client", types.SimpleNamespace(QdrantClient=object, models=types.SimpleNamespace()))
sys.modules.setdefault("httpx", __import__("httpx"))
sys.modules.setdefault("pydantic", types.SimpleNamespace(BaseModel=_DummyBaseModel, Field=_dummy_field))

psycopg_stub = types.ModuleType("psycopg")
psycopg_rows_stub = types.ModuleType("psycopg.rows")
psycopg_rows_stub.dict_row = object()
psycopg_stub.rows = psycopg_rows_stub
sys.modules.setdefault("psycopg", psycopg_stub)
sys.modules.setdefault("psycopg.rows", psycopg_rows_stub)

os.environ.setdefault("POSTGRES_DB", "stormsurge")
os.environ.setdefault("POSTGRES_USER", "stormsurge")
os.environ.setdefault("POSTGRES_PASSWORD", "stormsurge")

SPEC = importlib.util.spec_from_file_location("retrieval_app", MODULE_PATH)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(MODULE)


class StructuredArtifactChunkingTests(unittest.TestCase):
    def test_section_aware_chunking_uses_artifact_sections(self) -> None:
        record = {
            "id": "doc-1",
            "project_id": "proj-1",
            "filename": "ih2.docx",
            "content_type": "application/pdf",
            "raw_object_key": "raw",
            "parsed_object_key": "parsed",
            "normalized_markdown": "# 1 Overview",
            "extracted_text": "Overview",
            "normalization_provider": "docling_pws",
        }
        artifact = {
            "hierarchy": {
                "quality": "strong",
                "sections": [
                    {"section_id": "section-1", "section_number": "1", "section_title": "Overview"},
                    {"section_id": "section-2", "section_number": "2", "section_title": "Requirements"},
                ]
            },
            "cleaned_text": {"full_text": "# 1 Overview"},
            "objects": {"tables": [], "images": []},
            "enrichments": {"pws": {"requirements_detected": True}},
        }
        chunks = MODULE.build_chunks_from_structured_artifact(
            record=record,
            artifact=artifact,
            chunk_size_words=50,
            chunk_overlap_words=10,
        )
        self.assertTrue(any(chunk["chunk_kind"] == "section" for chunk in chunks))
        self.assertTrue(any(chunk["section_id"] == "section-1" for chunk in chunks))

    def test_fallback_chunking_uses_page_window_style_when_hierarchy_is_weak(self) -> None:
        record = {
            "id": "doc-2",
            "project_id": "proj-1",
            "filename": "notes.docx",
            "content_type": "application/pdf",
            "raw_object_key": "raw",
            "parsed_object_key": "parsed",
            "normalized_markdown": "General notes on the system and support approach.",
            "extracted_text": "General notes on the system and support approach.",
            "normalization_provider": "docling",
        }
        artifact = {
            "hierarchy": {"quality": "weak", "sections": []},
            "cleaned_text": {"full_text": "General notes on the system and support approach."},
            "objects": {"tables": [], "images": []},
            "enrichments": {"pws": {"requirements_detected": False}},
        }
        chunks = MODULE.build_chunks_from_structured_artifact(
            record=record,
            artifact=artifact,
            chunk_size_words=50,
            chunk_overlap_words=10,
        )
        self.assertEqual(chunks[0]["chunk_kind"], "page_window")


if __name__ == "__main__":
    unittest.main()

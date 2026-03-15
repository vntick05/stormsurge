export const runtime = "nodejs";

const documentServiceUrl =
  process.env.DOCUMENT_SERVICE_URL || "http://document-service:8181";
const normalizationServiceUrl =
  process.env.NORMALIZATION_SERVICE_URL || "http://normalization-service:8091";
const retrievalServiceUrl =
  process.env.RETRIEVAL_SERVICE_URL || "http://retrieval-service:8381";

export async function POST(request) {
  const formData = await request.formData();
  const projectId = String(formData.get("projectId") || "").trim();
  const files = formData.getAll("files").filter((value) => value instanceof File);

  if (!projectId) {
    return Response.json({ detail: "projectId is required" }, { status: 400 });
  }

  if (!files.length) {
    return Response.json({ detail: "At least one file is required" }, { status: 400 });
  }

  try {
    for (const file of files) {
      const uploadFormData = new FormData();
      uploadFormData.append("project_id", projectId);
      uploadFormData.append("file", file, file.name);

      const uploadResponse = await fetch(`${documentServiceUrl}/v1/documents/upload`, {
        method: "POST",
        body: uploadFormData,
      });
      const uploadPayload = await uploadResponse.json().catch(() => null);
      if (!uploadResponse.ok) {
        throw new Error(
          String(uploadPayload?.detail || "").trim() || `Document upload failed for ${file.name}`,
        );
      }
    }

    const normalizeResponse = await fetch(`${normalizationServiceUrl}/v1/normalize/project`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ project_id: projectId, skip_existing: true }),
    });
    const normalizePayload = await normalizeResponse.json().catch(() => null);
    if (!normalizeResponse.ok) {
      throw new Error(
        String(normalizePayload?.detail || "").trim() || "Project normalization failed",
      );
    }

    const indexResponse = await fetch(`${retrievalServiceUrl}/v1/index/project`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ project_id: projectId }),
    });
    const indexPayload = await indexResponse.json().catch(() => null);
    if (!indexResponse.ok) {
      throw new Error(
        String(indexPayload?.detail || "").trim() || "Project indexing failed",
      );
    }

    return Response.json({
      projectId,
      uploadedCount: files.length,
      normalizedCount: Number(normalizePayload?.normalized_count) || 0,
      skippedCount: Number(normalizePayload?.skipped_count) || 0,
      failedCount: Number(normalizePayload?.failed_count) || 0,
      indexedChunks: Number(indexPayload?.chunks_indexed) || 0,
      message: `Uploaded ${files.length} document${files.length === 1 ? "" : "s"} and refreshed project search.`,
    });
  } catch (error) {
    return Response.json(
      {
        detail: error instanceof Error ? error.message : "Project document upload failed",
      },
      { status: 502 },
    );
  }
}

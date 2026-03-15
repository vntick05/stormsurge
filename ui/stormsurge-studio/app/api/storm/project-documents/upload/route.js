export const runtime = "nodejs";

const documentServiceUrl =
  process.env.DOCUMENT_SERVICE_URL || "http://document-service:8181";

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
    const uploaded = [];
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

      uploaded.push({
        documentId: String(uploadPayload?.document_id || "").trim(),
        filename: String(uploadPayload?.filename || file.name).trim(),
        extractedTextChars: Number(uploadPayload?.extracted_text_chars) || 0,
        status: String(uploadPayload?.status || "extracted").trim(),
      });
    }

    return Response.json({
      projectId,
      uploadedCount: files.length,
      uploaded,
      processingTriggered: false,
      message: `Uploaded ${files.length} document${
        files.length === 1 ? "" : "s"
      }. Normalization and indexing were not started.`,
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

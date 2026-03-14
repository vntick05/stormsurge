export const runtime = "nodejs";

const documentServiceUrl =
  process.env.DOCUMENT_SERVICE_URL || "http://document-service:8181";
const normalizationServiceUrl =
  process.env.NORMALIZATION_SERVICE_URL || "http://normalization-service:8091";
const retrievalServiceUrl =
  process.env.RETRIEVAL_SERVICE_URL || "http://retrieval-service:8381";

function slugifyProjectId(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

async function fetchActiveProjects() {
  const response = await fetch(`${normalizationServiceUrl}/v1/projects`, {
    method: "GET",
    cache: "no-store",
  });
  const payload = await response.json().catch(() => ({ projects: [] }));
  return Array.isArray(payload?.projects) ? payload.projects : [];
}

function buildUniqueProjectId(projectName, existingProjects) {
  const base = slugifyProjectId(projectName) || `project-${Date.now()}`;
  const existingIds = new Set(
    existingProjects.map((project) => String(project?.project_id || "").trim()).filter(Boolean),
  );
  if (!existingIds.has(base)) {
    return base;
  }

  const suffix = Date.now().toString().slice(-6);
  return `${base}-${suffix}`;
}

export async function POST(request) {
  const formData = await request.formData();
  const projectName = String(formData.get("projectName") || "").trim();
  const files = formData.getAll("files").filter((value) => value instanceof File);

  if (!projectName) {
    return Response.json({ detail: "projectName is required" }, { status: 400 });
  }

  if (!files.length) {
    return Response.json({ detail: "At least one file is required" }, { status: 400 });
  }

  try {
    const activeProjects = await fetchActiveProjects();
    const projectId = buildUniqueProjectId(projectName, activeProjects);
    const uploadResults = [];

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
        return Response.json(
          {
            detail:
              String(uploadPayload?.detail || "").trim() ||
              `Document upload failed for ${file.name}`,
            project_id: projectId,
            uploaded: uploadResults,
          },
          { status: uploadResponse.status || 502 },
        );
      }

      uploadResults.push(uploadPayload);
    }

    const normalizationResponse = await fetch(
      `${normalizationServiceUrl}/v1/normalize/project`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          project_id: projectId,
          skip_existing: false,
        }),
      },
    );
    const normalizationPayload = await normalizationResponse.json().catch(() => null);
    if (!normalizationResponse.ok) {
      return Response.json(
        {
          detail:
            String(normalizationPayload?.detail || "").trim() ||
            "Project normalization failed",
          project_id: projectId,
          uploaded: uploadResults,
        },
        { status: normalizationResponse.status || 502 },
      );
    }

    const indexResponse = await fetch(`${retrievalServiceUrl}/v1/index/project`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        project_id: projectId,
      }),
    });
    const indexPayload = await indexResponse.json().catch(() => null);
    if (!indexResponse.ok) {
      return Response.json(
        {
          detail:
            String(indexPayload?.detail || "").trim() || "Project indexing failed",
          project_id: projectId,
          uploaded: uploadResults,
          normalization: normalizationPayload,
        },
        { status: indexResponse.status || 502 },
      );
    }

    return Response.json({
      project_id: projectId,
      display_name: projectName,
      uploaded_count: uploadResults.length,
      uploaded: uploadResults,
      normalization: normalizationPayload,
      index: indexPayload,
    });
  } catch (error) {
    return Response.json(
      {
        detail:
          error instanceof Error ? error.message : "Project setup failed",
      },
      { status: 502 },
    );
  }
}

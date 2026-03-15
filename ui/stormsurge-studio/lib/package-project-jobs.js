const documentServiceUrl =
  process.env.DOCUMENT_SERVICE_URL || "http://document-service:8081";
const normalizationServiceUrl =
  process.env.NORMALIZATION_SERVICE_URL || "http://normalization-service:8091";
const retrievalServiceUrl =
  process.env.RETRIEVAL_SERVICE_URL || "http://retrieval-service:8381";

function getJobStore() {
  if (!globalThis.__stormsurgePackageProjectJobs) {
    globalThis.__stormsurgePackageProjectJobs = new Map();
  }
  return globalThis.__stormsurgePackageProjectJobs;
}

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

function computeProgress(job) {
  if (job.stage === "completed") {
    return 100;
  }
  if (job.stage === "failed") {
    return Math.max(job.progress || 0, 1);
  }

  const uploadRatio = job.totalFiles ? job.uploadedFiles / job.totalFiles : 0;
  const normalizationRatio = job.totalDocuments
    ? job.normalizedDocuments / job.totalDocuments
    : job.stage === "indexing" || job.stage === "completed"
      ? 1
      : 0;
  const indexingRatio = job.stage === "completed" ? 1 : job.stage === "indexing" ? 0.35 : 0;
  const percent = uploadRatio * 45 + normalizationRatio * 45 + indexingRatio * 10;
  return Math.max(2, Math.min(99, Math.round(percent)));
}

function summarizeJob(job) {
  return {
    jobId: job.jobId,
    projectId: job.projectId,
    displayName: job.displayName,
    stage: job.stage,
    message: job.message,
    totalFiles: job.totalFiles,
    uploadedFiles: job.uploadedFiles,
    totalDocuments: job.totalDocuments,
    normalizedDocuments: job.normalizedDocuments,
    failedDocuments: job.failedDocuments,
    indexedChunks: job.indexedChunks,
    progress: computeProgress(job),
    done: job.stage === "completed" || job.stage === "failed",
    error: job.error || "",
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
  };
}

function updateJob(jobId, updater) {
  const store = getJobStore();
  const current = store.get(jobId);
  if (!current) {
    return null;
  }
  const next = {
    ...current,
    ...(typeof updater === "function" ? updater(current) : updater),
    updatedAt: new Date().toISOString(),
  };
  next.progress = computeProgress(next);
  store.set(jobId, next);
  return next;
}

async function refreshJobCounts(job) {
  if (!job?.projectId) {
    return job;
  }

  if (job.stage === "normalizing" || job.stage === "indexing" || job.stage === "completed") {
    try {
      const normalizationResponse = await fetch(
        `${normalizationServiceUrl}/v1/projects/${encodeURIComponent(job.projectId)}/status`,
        { method: "GET", cache: "no-store" },
      );
      if (normalizationResponse.ok) {
        const normalizationPayload = await normalizationResponse.json().catch(() => null);
        updateJob(job.jobId, {
          totalDocuments:
            Number(normalizationPayload?.total_documents) || job.totalDocuments || job.totalFiles,
          normalizedDocuments: Number(normalizationPayload?.normalized_documents) || 0,
          failedDocuments: Number(normalizationPayload?.failed_documents) || 0,
        });
      }
    } catch {}
  }

  if (job.stage === "indexing" || job.stage === "completed") {
    try {
      const retrievalResponse = await fetch(
        `${retrievalServiceUrl}/v1/projects/${encodeURIComponent(job.projectId)}/status`,
        { method: "GET", cache: "no-store" },
      );
      if (retrievalResponse.ok) {
        const retrievalPayload = await retrievalResponse.json().catch(() => null);
        updateJob(job.jobId, {
          indexedChunks: Number(retrievalPayload?.indexed_points) || 0,
        });
      }
    } catch {}
  }

  return getJobStore().get(job.jobId) || job;
}

async function fetchProjectDocumentStatuses(projectId) {
  const response = await fetch(
    `${normalizationServiceUrl}/v1/projects/${encodeURIComponent(projectId)}/documents/status`,
    {
      method: "GET",
      cache: "no-store",
    },
  );
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(String(payload?.detail || "").trim() || "Unable to load project documents");
  }
  return Array.isArray(payload?.documents) ? payload.documents : [];
}

async function normalizeProjectDocuments(jobId, projectId) {
  const documents = await fetchProjectDocumentStatuses(projectId);
  updateJob(jobId, {
    totalDocuments: documents.length,
    normalizedDocuments: documents.filter(
      (document) => document.normalization_status === "normalized",
    ).length,
    failedDocuments: documents.filter((document) => document.normalization_status === "failed").length,
  });

  const pendingDocuments = documents.filter(
    (document) => document.normalization_status !== "normalized",
  );

  for (const document of pendingDocuments) {
    updateJob(jobId, (current) => ({
      message: `Normalizing ${current.normalizedDocuments + current.failedDocuments + 1} of ${
        current.totalDocuments
      }: ${document.filename}`,
    }));

    try {
      const response = await fetch(`${normalizationServiceUrl}/v1/normalize/document`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          document_id: document.document_id,
          skip_existing: true,
        }),
        signal: AbortSignal.timeout(300000),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        updateJob(jobId, (current) => ({
          failedDocuments: current.failedDocuments + 1,
          message: `Skipped failed document: ${document.filename}`,
        }));
        continue;
      }

      const status = String(payload?.status || "").trim().toLowerCase();
      if (status === "normalized" || status === "skipped") {
        updateJob(jobId, (current) => ({
          normalizedDocuments: current.normalizedDocuments + 1,
          message: `Normalized ${document.filename}`,
        }));
      } else {
        updateJob(jobId, (current) => ({
          failedDocuments: current.failedDocuments + 1,
          message: `Document returned unexpected status: ${document.filename}`,
        }));
      }
    } catch {
      updateJob(jobId, (current) => ({
        failedDocuments: current.failedDocuments + 1,
        message: `Timed out on ${document.filename}; continuing`,
      }));
    }
  }
}

async function runPackageProjectJob(jobId, files) {
  const store = getJobStore();
  const job = store.get(jobId);
  if (!job) {
    return;
  }

  try {
    for (const file of files) {
      updateJob(jobId, (current) => ({
        message: `Uploading ${current.uploadedFiles + 1} of ${current.totalFiles}: ${file.name}`,
      }));

      const uploadFormData = new FormData();
      uploadFormData.append("project_id", job.projectId);
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

      updateJob(jobId, (current) => ({
        uploadedFiles: current.uploadedFiles + 1,
        totalDocuments: current.totalFiles,
      }));
    }

    updateJob(jobId, {
      stage: "normalizing",
      message: "Normalizing uploaded documents",
      normalizedDocuments: 0,
      failedDocuments: 0,
    });

    await normalizeProjectDocuments(jobId, job.projectId);
    const normalizationJob = await refreshJobCounts(getJobStore().get(jobId));

    updateJob(jobId, {
      stage: "indexing",
      message:
        normalizationJob?.failedDocuments > 0
          ? `Indexing project with ${normalizationJob.failedDocuments} failed document${
              normalizationJob.failedDocuments === 1 ? "" : "s"
            }`
          : "Indexing project for search and AI tools",
    });

    const indexResponse = await fetch(`${retrievalServiceUrl}/v1/index/project`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ project_id: job.projectId }),
    });
    const indexPayload = await indexResponse.json().catch(() => null);
    if (!indexResponse.ok) {
      throw new Error(String(indexPayload?.detail || "").trim() || "Project indexing failed");
    }

    updateJob(jobId, {
      stage: "completed",
      message:
        normalizationJob?.failedDocuments > 0
          ? `Package project ready with ${normalizationJob.failedDocuments} failed document${
              normalizationJob.failedDocuments === 1 ? "" : "s"
            }`
          : "Package project is ready",
      indexedChunks: Number(indexPayload?.chunks_indexed) || 0,
      normalizedDocuments: normalizationJob?.normalizedDocuments || job.totalFiles || files.length,
    });
  } catch (error) {
    updateJob(jobId, {
      stage: "failed",
      error: error instanceof Error ? error.message : "Project setup failed",
      message: "Package project setup failed",
    });
  }
}

export async function createPackageProjectJob({ projectName, files }) {
  const activeProjects = await fetchActiveProjects();
  const projectId = buildUniqueProjectId(projectName, activeProjects);
  const jobId = crypto.randomUUID();
  const now = new Date().toISOString();
  const job = {
    jobId,
    projectId,
    displayName: projectName,
    stage: "uploading",
    message: `Uploading 0 of ${files.length} files`,
    totalFiles: files.length,
    uploadedFiles: 0,
    totalDocuments: files.length,
    normalizedDocuments: 0,
    failedDocuments: 0,
    indexedChunks: 0,
    progress: 2,
    error: "",
    createdAt: now,
    updatedAt: now,
  };
  getJobStore().set(jobId, job);
  void runPackageProjectJob(jobId, files);
  return summarizeJob(job);
}

export async function getPackageProjectJob(jobId) {
  const job = getJobStore().get(jobId);
  if (!job) {
    return null;
  }
  const refreshed = await refreshJobCounts(job);
  return summarizeJob(refreshed);
}

async function parseResponse(response) {
  const contentType = response.headers.get('content-type') || '';

  if (contentType.includes('application/json')) {
    return response.json();
  }

  return response.text();
}

async function request(url, options = {}) {
  const response = await fetch(url, options);
  const payload = await parseResponse(response);

  if (!response.ok) {
    const detail =
      typeof payload === 'string'
        ? payload
        : payload?.detail || payload?.message || 'Request failed';
    throw new Error(String(detail));
  }

  return payload;
}

export const stormApi = {
  importDocument(file) {
    const formData = new FormData();
    formData.append('file', file, file.name);

    return request('/api/import', {
      method: 'POST',
      body: formData
    });
  },

  importRichArtifact(file) {
    const formData = new FormData();
    formData.append('file', file, file.name);

    return request('/api/rich-import', {
      method: 'POST',
      body: formData
    });
  },

  getActiveProjects() {
    return request('/api/storm/active-projects');
  },

  searchRelatedRequirements(body) {
    return request('/api/storm/requirements/search-related', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
  },

  startPackageProject(projectName, files) {
    const formData = new FormData();
    formData.append('projectName', projectName);
    files.forEach((file) => formData.append('files', file, file.name));

    return request('/api/storm/package-project/start', {
      method: 'POST',
      body: formData
    });
  },

  getPackageProjectStatus(jobId) {
    return request(`/api/storm/package-project/status?jobId=${encodeURIComponent(jobId)}`);
  },

  uploadProjectDocuments(projectId, files) {
    const formData = new FormData();
    formData.append('projectId', projectId);
    files.forEach((file) => formData.append('files', file, file.name));

    return request('/api/storm/project-documents/upload', {
      method: 'POST',
      body: formData
    });
  },

  getMtsDefinition(body) {
    return request('/api/storm/mts-definition', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
  },

  getServiceHealth() {
    return Promise.allSettled([
      request('/svc/document/healthz'),
      request('/svc/normalization/healthz'),
      request('/svc/retrieval/healthz'),
      request('/svc/analysis/healthz')
    ]);
  }
};

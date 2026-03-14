export const runtime = "nodejs";

import { createPackageProjectJob } from "@/lib/package-project-jobs";

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
    const job = await createPackageProjectJob({ projectName, files });
    return Response.json(job);
  } catch (error) {
    return Response.json(
      {
        detail: error instanceof Error ? error.message : "Project setup failed",
      },
      { status: 502 },
    );
  }
}

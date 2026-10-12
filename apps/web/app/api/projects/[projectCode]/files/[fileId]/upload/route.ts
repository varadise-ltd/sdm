import { NextResponse } from "next/server";
import { authErrorResponse, requireProjectMembership, type SdmRole } from "../../../../../../../lib/auth";
import { db } from "../../../../../../../lib/db";
import { isFilesystemStorage, writeLocalObject } from "../../../../../../../lib/storage";

export const runtime = "nodejs";
const uploadRoles: readonly SdmRole[] = ["contractor_pm", "document_controller", "subcontractor", "supplier", "design_consultant"];

export async function PUT(request: Request, context: { params: Promise<{ projectCode: string; fileId: string }> }) {
  try {
    if (!isFilesystemStorage()) return NextResponse.json({ error: { code: "NOT_FOUND", message: "Local upload endpoint is disabled" } }, { status: 404 });
    const { projectCode, fileId } = await context.params;
    const { user, membership } = await requireProjectMembership(request, projectCode, uploadRoles, "documents.create");
    if (!/^[0-9a-f-]{36}$/i.test(fileId) || !request.body) return NextResponse.json({ error: { code: "INVALID_FILE", message: "A file body is required" } }, { status: 400 });
    const result = await db.query<{ storageKey: string; byteSize: number }>(
      `SELECT storage_key AS "storageKey", byte_size AS "byteSize" FROM file_assets WHERE id = $1 AND project_id = $2 AND created_by_user_id = $3`,
      [fileId, membership.projectId, user.id],
    );
    const file = result.rows[0];
    if (!file) return NextResponse.json({ error: { code: "NOT_FOUND", message: "File upload was not found" } }, { status: 404 });
    try {
      await writeLocalObject(file.storageKey, request.body, Number(file.byteSize));
    } catch (error) {
      // A truncated or empty request must be a client-visible validation error,
      // never an unhandled 500. The local writer already verifies the exact
      // declared byte count after streaming the body.
      if (error instanceof Error && error.message.includes("size does not match")) {
        return NextResponse.json({ error: { code: "SIZE_MISMATCH", message: "Uploaded object size does not match the declared size" } }, { status: 409 });
      }
      throw error;
    }
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return authErrorResponse(error);
  }
}


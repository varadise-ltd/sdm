import { NextResponse } from "next/server";
import { authErrorResponse, getCurrentUser, hasProjectPermission, projectPermissionKeys } from "../../../lib/auth";
import { db } from "../../../lib/db";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const user = await getCurrentUser(request);
    const memberships = await db.query(
      `SELECT p.code AS "projectCode", p.name AS "projectName", o.code AS "organizationCode", o.name AS "organizationName",
              pa.code AS "partyCode", pa.name AS "partyName", pm.role_slug AS "roleSlug", pm.permissions
       FROM project_memberships pm JOIN projects p ON p.id = pm.project_id JOIN parties pa ON pa.id = pm.party_id
       JOIN organizations o ON o.id = p.organization_id
       JOIN organization_memberships om ON om.organization_id = o.id AND om.user_id = pm.user_id AND om.active
       WHERE pm.user_id = $1 AND pm.active = true AND p.status <> 'closed' AND o.status <> 'closed' ORDER BY o.code, p.code`, [user.id],
    );
    const organizations = await db.query(
      `SELECT o.id, o.code, o.name, o.timezone, o.status, om.role_slug AS "roleSlug"
         FROM organization_memberships om JOIN organizations o ON o.id = om.organization_id
        WHERE om.user_id = $1 AND om.active AND o.status <> 'closed' ORDER BY o.name`, [user.id],
    );
    return NextResponse.json({ data: { ...user, organizations: organizations.rows, memberships: memberships.rows.map((membership) => ({ ...membership, permissions: Object.fromEntries(projectPermissionKeys.map((key) => [key, hasProjectPermission(membership, key)])) })) } });
  } catch (error) { return authErrorResponse(error); }
}

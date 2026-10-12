import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";
import { db } from "./db";
import { resolveSessionUserId } from "./session";

export type SdmRole =
  | "contractor_pm"
  | "document_controller"
  | "subcontractor"
  | "supplier"
  | "design_consultant"
  | "client_re_er";

export type AuthUser = {
  id: string;
  email: string;
  displayName: string;
  externalSubject: string | null;
};

export type ProjectMembership = {
  projectId: string;
  projectCode: string;
  projectName: string;
  projectStatus: string;
  partyId: string;
  partyCode: string;
  partyName: string;
  roleSlug: SdmRole;
  permissions: Record<string, boolean>;
};

export const projectPermissionKeys = [
  "documents.read",
  "documents.create",
  "documents.edit",
  "documents.submit",
  "documents.approve",
  "documents.delete",
  "members.manage",
  "project.settings",
] as const;
export type ProjectPermission = (typeof projectPermissionKeys)[number];

const rolePermissionDefaults: Record<SdmRole, ProjectPermission[]> = {
  contractor_pm: [...projectPermissionKeys],
  document_controller: ["documents.read", "documents.create", "documents.edit", "documents.submit", "documents.approve", "members.manage"],
  subcontractor: ["documents.read", "documents.create", "documents.edit", "documents.submit"],
  supplier: ["documents.read", "documents.create", "documents.submit"],
  design_consultant: ["documents.read", "documents.create", "documents.edit", "documents.submit"],
  client_re_er: ["documents.read", "documents.approve"],
};

export function hasProjectPermission(membership: ProjectMembership, permission: ProjectPermission): boolean {
  if (membership.permissions && Object.prototype.hasOwnProperty.call(membership.permissions, permission)) {
    return membership.permissions[permission] === true;
  }
  return rolePermissionDefaults[membership.roleSlug]?.includes(permission) ?? false;
}

export class AuthError extends Error {
  readonly status: 401 | 403 | 404 | 500;

  constructor(status: 401 | 403 | 404 | 500, message: string) {
    super(message);
    this.name = "AuthError";
    this.status = status;
  }
}

type VerifiedIdentity = {
  subject: string;
  email?: string;
  displayName?: string;
};

export const authMode = process.env.SDM_AUTH_MODE ?? (process.env.NODE_ENV === "production" ? "oidc" : "development");

export function isLocalAuthEnabled(): boolean {
  return authMode === "local" || authMode === "development";
}

function bearerToken(request: Request): string | undefined {
  const value = request.headers.get("authorization");
  if (!value) return undefined;
  const match = value.match(/^Bearer\s+(.+)$/i);
  if (!match) throw new AuthError(401, "Authorization must use a Bearer token");
  return match[1];
}

function claimString(payload: JWTPayload, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = payload[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}

export async function verifyOidcToken(token: string, expectedNonce?: string): Promise<VerifiedIdentity> {
  // Keycloak speaks standard OIDC. Keep the generic OIDC names as the primary
  // contract while accepting Keycloak names so COSMOS can be connected later
  // without changing the application code or user records.
  const oidcIssuer = process.env.OIDC_ISSUER_URL;
  const issuer = (oidcIssuer ?? process.env.KEYCLOAK_ISSUER_URL)?.replace(/\/$/, "");
  const audience = process.env.OIDC_AUDIENCE ?? process.env.KEYCLOAK_CLIENT_ID;
  const defaultJwksUrl = issuer ? `${issuer}${oidcIssuer ? "/.well-known/jwks.json" : "/protocol/openid-connect/certs"}` : undefined;
  const jwksUrl = process.env.OIDC_JWKS_URL ?? process.env.KEYCLOAK_JWKS_URL ?? defaultJwksUrl;
  if (!issuer || !audience || !jwksUrl) {
    throw new AuthError(500, "OIDC is not configured: set OIDC_ISSUER_URL/OIDC_AUDIENCE/OIDC_JWKS_URL or the equivalent KEYCLOAK_* settings");
  }

  try {
    const jwks = createRemoteJWKSet(new URL(jwksUrl));
    const { payload } = await jwtVerify(token, jwks, { issuer, audience });
    if (expectedNonce && claimString(payload, "nonce") !== expectedNonce) throw new AuthError(401, "OIDC nonce validation failed");
    const subject = claimString(payload, "sub");
    if (!subject) throw new AuthError(401, "OIDC token has no subject");
    return {
      subject,
      email: claimString(payload, "email", "preferred_username"),
      displayName: claimString(payload, "name", "preferred_username", "email"),
    };
  } catch (error) {
    if (error instanceof AuthError) throw error;
    throw new AuthError(401, "OIDC token validation failed");
  }
}

/**
 * Resolve the caller to an active SDM user. Production always requires a
 * validated OIDC JWT. The development fallback is deliberately disabled in
 * production and exists only to make local seeded workflows usable.
 */
export async function getCurrentUser(request: Request): Promise<AuthUser> {
  const token = bearerToken(request);
  let identity: VerifiedIdentity;
  let sessionUserId: string | undefined;

  if (token) {
    identity = await verifyOidcToken(token);
  } else if (isLocalAuthEnabled()) {
    sessionUserId = await resolveSessionUserId(request);
    if (sessionUserId) {
      identity = { subject: `session:${sessionUserId}` };
    } else if (authMode === "development") {
      // Development mode intentionally retains the header fallback for local
      // seeded workflow testing. Set SDM_AUTH_MODE=local to require login.
      const email = request.headers.get("x-sdm-user-email") ?? process.env.SDM_DEV_USER_EMAIL ?? "pm.project001@sdm.local";
      identity = {
        subject: `dev:${email.toLowerCase()}`,
        email,
        displayName: "Local SDM Developer",
      };
    } else {
      throw new AuthError(401, "Authentication is required");
    }
  } else {
    throw new AuthError(401, "Authentication is required");
  }

  const result = sessionUserId
    ? await db.query<{
        id: string;
        email: string;
        displayName: string;
        externalSubject: string | null;
      }>(
        `
          SELECT id, email::text AS email, display_name AS "displayName",
                 external_subject AS "externalSubject"
          FROM users
          WHERE active = true AND id = $1
          LIMIT 1
        `,
        [sessionUserId],
      )
    : token
      ? await db.query<{
          id: string;
          email: string;
          displayName: string;
          externalSubject: string | null;
        }>(
          `
            SELECT id, email::text AS email, display_name AS "displayName",
                   external_subject AS "externalSubject"
            FROM users
            WHERE active = true AND external_subject = $1
            LIMIT 1
          `,
          [identity.subject],
        )
      : await db.query<{
        id: string;
        email: string;
        displayName: string;
        externalSubject: string | null;
      }>(
        `
          SELECT id, email::text AS email, display_name AS "displayName",
                 external_subject AS "externalSubject"
          FROM users
          WHERE active = true
            AND (external_subject = $1 OR ($2::citext IS NOT NULL AND email = $2::citext))
          ORDER BY CASE WHEN external_subject = $1 THEN 0 ELSE 1 END
          LIMIT 1
        `,
        [identity.subject, identity.email ?? null],
      );

  const user = result.rows[0];
  if (!user) throw new AuthError(403, "Authenticated identity is not provisioned in SDM");
  return user;
}

export async function requireProjectMembership(
  request: Request,
  projectCode: string,
  allowedRoles?: readonly SdmRole[],
  requiredPermission?: ProjectPermission,
): Promise<{ user: AuthUser; membership: ProjectMembership }> {
  const user = await getCurrentUser(request);
  const normalizedCode = projectCode.trim().toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9_-]{1,31}$/.test(normalizedCode)) {
    throw new AuthError(404, "Project not found");
  }

  // Organization owners/admins can administer every project in their
  // organization. They do not need a project membership just to grant access,
  // maintain parties, or configure a project. Keep this elevation deliberately
  // limited to the project-administration role pair; it must not grant content
  // access to ordinary document routes.
  const organizationAdminFallback = Boolean(
    allowedRoles &&
    allowedRoles.length === 2 &&
    allowedRoles.includes("contractor_pm") &&
    allowedRoles.includes("document_controller"),
  );
  const result = await db.query<ProjectMembership & { organizationRole?: string | null }>(
    `
      SELECT p.id AS "projectId", p.code AS "projectCode", p.name AS "projectName",
             p.status AS "projectStatus", pa.id AS "partyId", pa.code AS "partyCode",
             pa.name AS "partyName", pm.role_slug AS "roleSlug", pm.permissions,
             om.role_slug AS "organizationRole"
      FROM projects p
      LEFT JOIN project_memberships pm ON pm.project_id = p.id AND pm.user_id = $2 AND pm.active = true
      LEFT JOIN parties pa ON pa.id = pm.party_id
      JOIN organization_memberships om ON om.organization_id = p.organization_id AND om.user_id = $2 AND om.active = true
      WHERE p.code = $1 AND p.status <> 'closed'
        AND ((pm.user_id = $2 AND pa.active = true) OR ($3 = true AND om.role_slug IN ('org_owner', 'org_admin')))
      ORDER BY (pm.created_at IS NULL), pm.created_at ASC
    `,
    [normalizedCode, user.id, organizationAdminFallback],
  );

  const membership = result.rows.find((item) =>
    !allowedRoles ||
    allowedRoles.includes(item.roleSlug) ||
    (organizationAdminFallback && (item.organizationRole === "org_owner" || item.organizationRole === "org_admin")),
  );
  if (!membership) {
    if (result.rows.length === 0) throw new AuthError(404, "Project not found or access is not granted");
    throw new AuthError(403, "Your project role does not permit this action");
  }
  const normalizedMembership = { ...membership, permissions: (membership.permissions ?? {}) as Record<string, boolean> };
  if (requiredPermission && !organizationAdminFallback && !hasProjectPermission(normalizedMembership, requiredPermission)) {
    throw new AuthError(403, `Your project access does not include ${requiredPermission}`);
  }
  return { user, membership: normalizedMembership };
}

export function authErrorResponse(error: unknown): Response {
  if (error instanceof AuthError) {
    return Response.json({ error: { code: error.status === 401 ? "UNAUTHENTICATED" : "FORBIDDEN", message: error.message } }, { status: error.status });
  }
  console.error("Unhandled API error", error);
  return Response.json({ error: { code: "INTERNAL_ERROR", message: "Unexpected server error" } }, { status: 500 });
}


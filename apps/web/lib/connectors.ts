import { jsonError } from "./http";

export const connectorAdminRoles = ["contractor_pm", "document_controller"] as const;

export const connectorProviders = [
  "cosmos_drive",
  "google_drive",
  "sharepoint",
  "onedrive",
  "dropbox",
  "box",
  "s3",
  "webdav",
] as const;

export type ConnectorProvider = (typeof connectorProviders)[number];
export type ConnectorStatus = "disabled" | "pending_auth" | "ready" | "error";

type ConnectorPayload = {
  name: string;
  provider: ConnectorProvider;
  status?: ConnectorStatus;
  endpointUrl: string | null;
  externalDriveId: string | null;
  accountLabel: string | null;
  config: Record<string, unknown>;
  credentialRef: string | null;
};

const sensitiveKeyPattern = /(^|_)(access[_-]?token|refresh[_-]?token|client[_-]?secret|secret|password|private[_-]?key|credential)($|_)/i;

function containsSensitiveKey(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  if (Array.isArray(value)) return value.some(containsSensitiveKey);
  return Object.entries(value as Record<string, unknown>).some(([key, child]) => sensitiveKeyPattern.test(key) || containsSensitiveKey(child));
}

function parseEndpoint(value: unknown): string | null | Error {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || value.length > 2048) return new Error("endpointUrl must be a valid HTTP(S) URL");
  try {
    const parsed = new URL(value);
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password || !parsed.hostname) {
      return new Error("endpointUrl must be an HTTP(S) URL without embedded credentials");
    }
    if (parsed.protocol === "http:" && !["localhost", "127.0.0.1", "::1"].includes(parsed.hostname)) {
      return new Error("endpointUrl must use HTTPS outside local development");
    }
  } catch {
    return new Error("endpointUrl must be a valid HTTP(S) URL");
  }
  return value;
}

/**
 * Validate a connector body without ever accepting raw secrets. A connector
 * references a secret in the deployment's secret manager through credentialRef.
 */
export function parseConnectorPayload(body: Record<string, unknown>, current?: Partial<ConnectorPayload>): ConnectorPayload | Response {
  const name = body.name === undefined ? current?.name ?? "" : typeof body.name === "string" ? body.name.trim() : "";
  const providerValue = body.provider === undefined ? current?.provider : body.provider;
  const provider = typeof providerValue === "string" && connectorProviders.includes(providerValue as ConnectorProvider)
    ? providerValue as ConnectorProvider
    : null;
  const statusValue = body.status === undefined ? current?.status ?? "disabled" : body.status;
  const statuses = ["disabled", "pending_auth", "ready", "error"] as const;
  const status = typeof statusValue === "string" && statuses.includes(statusValue as ConnectorStatus)
    ? statusValue as ConnectorStatus
    : null;
  const endpointValue = body.endpointUrl === undefined ? current?.endpointUrl : body.endpointUrl;
  const endpointUrl = parseEndpoint(endpointValue);
  const externalDriveValue = body.externalDriveId === undefined ? current?.externalDriveId : body.externalDriveId;
  const accountLabelValue = body.accountLabel === undefined ? current?.accountLabel : body.accountLabel;
  const credentialValue = body.credentialRef === undefined ? current?.credentialRef : body.credentialRef;
  const configValue = body.config === undefined ? current?.config ?? {} : body.config;

  if (name.length < 2 || name.length > 120) return jsonError("name must be 2-120 characters");
  if (!provider) return jsonError(`provider must be one of: ${connectorProviders.join(", ")}`);
  if (!status) return jsonError("status must be disabled, pending_auth, ready, or error");
  if (endpointUrl instanceof Error) return jsonError(endpointUrl.message);
  if (externalDriveValue !== null && externalDriveValue !== undefined && (typeof externalDriveValue !== "string" || externalDriveValue.trim().length > 255)) {
    return jsonError("externalDriveId must be at most 255 characters");
  }
  if (accountLabelValue !== null && accountLabelValue !== undefined && (typeof accountLabelValue !== "string" || accountLabelValue.trim().length > 255)) {
    return jsonError("accountLabel must be at most 255 characters");
  }
  if (!configValue || typeof configValue !== "object" || Array.isArray(configValue)) return jsonError("config must be a JSON object");
  if (JSON.stringify(configValue).length > 16_384) return jsonError("config must be at most 16KB");
  if (containsSensitiveKey(configValue)) return jsonError("config cannot contain secrets; use credentialRef");
  if (body.password !== undefined || body.clientSecret !== undefined || body.accessToken !== undefined || body.refreshToken !== undefined || body.credentials !== undefined) {
    return jsonError("Raw credentials are not accepted; configure a deployment secret and provide credentialRef");
  }
  let credentialRef: string | null = null;
  if (credentialValue !== null && credentialValue !== undefined && credentialValue !== "") {
    if (typeof credentialValue !== "string" || credentialValue.length < 3 || credentialValue.length > 255 || /\s/.test(credentialValue)) {
      return jsonError("credentialRef must be 3-255 non-whitespace characters");
    }
    credentialRef = credentialValue;
  }
  if (status === "ready" && !credentialRef) return jsonError("credentialRef is required when status is ready");
  return {
    name,
    provider,
    status,
    endpointUrl: endpointUrl,
    externalDriveId: typeof externalDriveValue === "string" && externalDriveValue.trim() ? externalDriveValue.trim() : null,
    accountLabel: typeof accountLabelValue === "string" && accountLabelValue.trim() ? accountLabelValue.trim() : null,
    config: configValue as Record<string, unknown>,
    credentialRef,
  };
}

export function connectorPublicSelect(): string {
  return `id, project_id AS "projectId", name, provider, status, endpoint_url AS "endpointUrl",
          external_drive_id AS "externalDriveId", account_label AS "accountLabel", config,
          (credential_ref IS NOT NULL) AS "credentialConfigured",
          last_tested_at AS "lastTestedAt", last_error AS "lastError",
          created_by_user_id AS "createdByUserId", updated_by_user_id AS "updatedByUserId",
          created_at AS "createdAt", updated_at AS "updatedAt"`;
}

import type { PoolClient } from "pg";

export const numberingLevels = [
  "project",
  "originator",
  "documentType",
  "discipline",
  "volume",
  "level",
  "role",
  "drawing",
  "category",
  "party",
] as const;

/** Common ISO/document type codes shown as suggestions in the admin editor. Projects can use any valid code. */
export const numberingDocumentTypes = ["DC", "DR", "FM", "PK", "BIM"] as const;

export type NumberingLevel = (typeof numberingLevels)[number] | `custom:${string}`;
/** Attributes that can be selected from the ISO/document detail when building
 * a custom number segment. The list intentionally contains only stable,
 * controlled fields that are available when a draft is submitted. */
export const documentNumberingAttributes = [
  "project", "originator", "documentType", "discipline", "volume", "level", "role", "drawing",
  "category", "party", "title", "revision", "suitability", "clientResponse", "cdeState",
  "lifecycleStatus", "internalCategory",
] as const;

export type DocumentNumberingAttribute = (typeof documentNumberingAttributes)[number];
// `attribute` stays string at the boundary so the form can represent an empty
// selection while editing. parseDocumentNumbering validates it against the
// controlled attribute list before persistence.
export type NumberingField = { key: string; value: string; attribute?: string };

export type DocumentNumberingBase = {
  enabled: boolean;
  prefix: string;
  suffix: string;
  separator: string;
  sequenceWidth: number;
  sequenceStart: number;
  /** Next sequence value used for newly created scopes and for explicit resets. */
  sequenceNext: number;
  /** One document attribute that defines an independent sequence counter. */
  sequenceScope: NumberingLevel;
  /** Attributes rendered in the generated document number before the sequence. */
  sequenceLevels: NumberingLevel[];
  customFields: NumberingField[];
};

export type DocumentNumberingConfig = DocumentNumberingBase & {
  /** Optional document type specific systems. Types absent here use the default system. */
  documentTypeOverrides: Record<string, DocumentNumberingBase>;
};

export const defaultDocumentNumbering: DocumentNumberingConfig = {
  enabled: false,
  prefix: "",
  suffix: "",
  separator: "-",
  sequenceWidth: 4,
  sequenceStart: 1,
  sequenceNext: 1,
  sequenceScope: "project",
  sequenceLevels: ["project"],
  customFields: [],
  documentTypeOverrides: {},
};

function cleanToken(value: unknown, max: number): string {
  return typeof value === "string"
    ? value.trim().replace(/[^A-Za-z0-9_./ -]+/g, "").slice(0, max)
    : "";
}

function normalizeLevel(value: string): string {
  const trimmed = value.trim();
  return /^custom:/i.test(trimmed) ? `custom:${trimmed.slice(7).toLowerCase()}` : trimmed;
}

function parseBase(value: unknown, fallback: DocumentNumberingBase): DocumentNumberingBase {
  const body = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const rawLevels = Array.isArray(body.sequenceLevels) ? body.sequenceLevels : fallback.sequenceLevels;
  const levels = rawLevels
    .filter((item): item is string => typeof item === "string")
    .map(normalizeLevel)
    .filter((item) => numberingLevels.includes(item as (typeof numberingLevels)[number]) || /^custom:[a-z][a-z0-9_]{1,31}$/i.test(item));
  const fallbackScope = fallback.sequenceScope ?? fallback.sequenceLevels[0] ?? "project";
  const rawScope = typeof body.sequenceScope === "string" ? normalizeLevel(body.sequenceScope) : "";
  const validScope = numberingLevels.includes(rawScope as (typeof numberingLevels)[number]) || /^custom:[a-z][a-z0-9_]{1,31}$/i.test(rawScope);
  // Older configurations used the first sequence level as both the rendered
  // field and the counter scope. Preserve that behavior when sequenceScope
  // is absent, while allowing the two concepts to be configured separately.
  const sequenceScope = (validScope ? rawScope : (levels[0] ?? fallbackScope)) as NumberingLevel;
  const rawFields = Array.isArray(body.customFields) ? body.customFields : fallback.customFields;
  const fields = rawFields
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item))
    .map((item) => {
      const attribute = typeof item.attribute === "string" && documentNumberingAttributes.includes(item.attribute as DocumentNumberingAttribute)
        ? item.attribute as DocumentNumberingAttribute : undefined;
      const key = cleanToken(item.key || attribute || "", 32).toLowerCase();
      return { key, value: cleanToken(item.value, 64), ...(attribute ? { attribute } : {}) };
    })
    .filter((item) => /^[a-z][a-z0-9_]{1,31}$/.test(item.key) && (item.attribute !== undefined || item.value.length > 0))
    .filter((item, index, all) => all.findIndex((candidate) => candidate.key === item.key) === index)
    .slice(0, 32);
  const width = Number(body.sequenceWidth ?? fallback.sequenceWidth);
  const start = Number(body.sequenceStart ?? fallback.sequenceStart);
  const next = Number(body.sequenceNext ?? fallback.sequenceNext ?? start);
  const separator = typeof body.separator === "string" ? body.separator.trim().slice(0, 8) : fallback.separator;
  return {
    enabled: body.enabled === undefined ? fallback.enabled : body.enabled === true,
    prefix: cleanToken(body.prefix ?? fallback.prefix, 64),
    suffix: cleanToken(body.suffix ?? fallback.suffix, 64),
    separator,
    sequenceWidth: Number.isInteger(width) ? Math.min(Math.max(width, 1), 12) : fallback.sequenceWidth,
    sequenceStart: Number.isInteger(start) ? Math.min(Math.max(start, 1), 2_000_000_000) : fallback.sequenceStart,
    sequenceNext: Number.isInteger(next) ? Math.min(Math.max(next, 1), 2_000_000_000) : (fallback.sequenceNext ?? fallback.sequenceStart),
    sequenceScope,
    sequenceLevels: levels.length > 0 ? levels as NumberingLevel[] : fallback.sequenceLevels,
    customFields: fields,
  };
}

export function parseDocumentNumbering(value: unknown, fallback: DocumentNumberingConfig = defaultDocumentNumbering): DocumentNumberingConfig {
  const base = parseBase(value, fallback);
  const body = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const rawOverrides = body.documentTypeOverrides && typeof body.documentTypeOverrides === "object" && !Array.isArray(body.documentTypeOverrides)
    ? body.documentTypeOverrides as Record<string, unknown> : {};
  const documentTypeOverrides: Record<string, DocumentNumberingBase> = {};
  for (const [rawType, rawConfig] of Object.entries(rawOverrides)) {
    const type = rawType.trim().toUpperCase();
    if (!/^[A-Z0-9][A-Z0-9_-]{0,31}$/.test(type)) continue;
    documentTypeOverrides[type] = parseBase(rawConfig, base);
  }
  return { ...base, documentTypeOverrides };
}

export function numberingForDocumentType(config: DocumentNumberingConfig, documentType: string): { config: DocumentNumberingBase; hasOverride: boolean } {
  const normalized = documentType.trim().toUpperCase();
  const override = config.documentTypeOverrides?.[normalized];
  return { config: override ?? config, hasOverride: Boolean(override) };
}

function normalizedCustomKey(key: string): string {
  return key.toLowerCase();
}

export function numberValues(config: DocumentNumberingBase, values: Record<string, string | number | boolean | null | undefined>) {
  const custom = Object.fromEntries(config.customFields.map((field) => {
    const selected = field.attribute ? values[field.attribute] : undefined;
    const value = selected === undefined || selected === null || String(selected).trim() === "" ? field.value : selected;
    return [field.key, value === undefined || value === null ? "" : cleanToken(String(value), 64)];
  }));
  const resolve = (key: string) => {
    const customValue = custom[normalizedCustomKey(key)];
    const value = customValue ?? values[key];
    return value === undefined || value === null ? "" : String(value).trim();
  };
  const counterLevel = config.sequenceScope ?? config.sequenceLevels[0] ?? "project";
  const counterKey = counterLevel.startsWith("custom:") ? counterLevel.slice(7) : counterLevel;
  const scope = resolve(counterKey).toUpperCase() || "_";
  return { scope, custom };
}

export async function allocateDocumentNumber(
  client: PoolClient,
  projectId: string,
  config: DocumentNumberingBase,
  values: Record<string, string | number | boolean | null | undefined>,
  options: { sequenceNamespace?: string } = {},
) {
  const { scope, custom } = numberValues(config, values);
  const sequenceNamespace = options.sequenceNamespace ?? "document";
  const sequenceKey = `${sequenceNamespace}:${scope}`;
  // Recount/reset takes a namespace-wide advisory lock. Taking the same lock
  // here makes resetting counters atomic with allocations, so an in-flight
  // submission can never recreate a cursor after the reset transaction has
  // deleted it.
  await client.query(
    "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
    [`${projectId}:${sequenceNamespace}`],
  );
  const sequence = await client.query<{ value: string }>(
    "SELECT sdm_next_document_number_sequence($1, $2, $3)::text AS value",
    [projectId, sequenceKey, config.sequenceNext ?? config.sequenceStart],
  );
  const number = String(sequence.rows[0].value).padStart(config.sequenceWidth, "0");
  const scopedValues = config.sequenceLevels
    .map((level) => level.startsWith("custom:") ? custom[normalizedCustomKey(level.slice(7))] : values[level])
    .map((value) => value === undefined || value === null ? "" : cleanToken(String(value), 64))
    .filter(Boolean);
  const scopedCustomKeys = new Set(config.sequenceLevels.filter((level) => level.startsWith("custom:")).map((level) => normalizedCustomKey(level.slice(7))));
  const additionalCustomValues = Object.entries(custom)
    .filter(([key]) => !scopedCustomKeys.has(key))
    .map(([, value]) => value)
    .filter(Boolean);
  const parts = [config.prefix, ...scopedValues, ...additionalCustomValues, number, config.suffix].filter(Boolean);
  return parts.join(config.separator);
}

export function publicDocumentNumbering(row?: Record<string, unknown> | null): DocumentNumberingConfig {
  return parseDocumentNumbering({
    enabled: row?.enabled,
    prefix: row?.prefix,
    suffix: row?.suffix,
    separator: row?.separator,
    sequenceWidth: row?.sequenceWidth,
    sequenceStart: row?.sequenceStart,
    sequenceNext: row?.sequenceNext,
    sequenceLevels: row?.sequenceLevels,
    sequenceScope: row?.sequenceScope,
    customFields: row?.customFields,
    documentTypeOverrides: row?.documentTypeOverrides,
  });
}

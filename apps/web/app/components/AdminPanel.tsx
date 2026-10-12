"use client";

import { useEffect, useMemo, useState } from "react";
import { BriefcaseBusiness, Check, Plus, RefreshCw, Save, UserMinus, Users, X } from "lucide-react";
import { defaultDocumentNumbering, numberingLevels, type DocumentNumberingConfig } from "../../lib/document-numbering";

/**
 * The numbering editor deliberately uses a constrained set of document-detail
 * attributes.  These are the same values available when a document is
 * submitted, so a number can be generated from the actual document metadata
 * instead of a value hidden in the numbering configuration.
 */
const documentDetailAttributes = [
  { key: "project", label: "Project code", sample: "P001" },
  { key: "originator", label: "Originator", sample: "ORG" },
  { key: "documentType", label: "Document type", sample: "DOC" },
  { key: "discipline", label: "Discipline", sample: "STR" },
  { key: "volume", label: "Volume", sample: "ZZ" },
  { key: "level", label: "Level", sample: "01" },
  { key: "role", label: "Role", sample: "A" },
  { key: "drawing", label: "Drawing flag", sample: "TRUE" },
  { key: "category", label: "Category", sample: "DOC" },
  { key: "party", label: "Party", sample: "PTY" },
  { key: "title", label: "Title", sample: "SITE-PLAN" },
  { key: "revision", label: "Revision", sample: "P01" },
  { key: "suitability", label: "Suitability", sample: "S3" },
  { key: "clientResponse", label: "Client response", sample: "A" },
  { key: "cdeState", label: "CDE state", sample: "WIP" },
  { key: "lifecycleStatus", label: "Lifecycle status", sample: "ACTIVE" },
  { key: "internalCategory", label: "Internal category", sample: "GENERAL" },
] as const;

type NumberingFieldEditor = { key: string; value: string; attribute?: string };
type NumberingEditorConfig = DocumentNumberingConfig;

const documentTypeOptions = [
  { value: "default", label: "All document types", description: "Shared default numbering" },
  { value: "DR", label: "Drawings (DR)", description: "Drawing documents" },
  { value: "DC", label: "Documents (DC)", description: "Documents and correspondence" },
  { value: "MS", label: "Method statements (MS)", description: "Method statements" },
  { value: "FM", label: "Forms (FM)", description: "Form records" },
  { value: "PK", label: "Packages (PK)", description: "Packages" },
  { value: "TX", label: "Transmittals (TX)", description: "Transmittals" },
  { value: "BIM", label: "BIM models (BIM)", description: "Model documents" },
] as const;

type OrganizationProject = { id: string; code: string; name: string; status: string };
type Organization = { id: string; code: string; name: string; timezone: string; status: string; roleSlug: string; projectCount?: number; projects?: OrganizationProject[] };
type Project = { id: string; code: string; name: string; timezone: string; status: string; organizationId?: string; organizationCode?: string; organizationName?: string; numbering?: DocumentNumberingConfig };
type Party = { id: string; code: string; name: string; partyType: string; active: boolean; memberCount?: number };
type User = { id: string; email: string; displayName: string; externalSubject?: string | null; active: boolean };
type Role = { slug: string; displayName: string; description?: string | null };
type Member = { id: string; userId: string; email: string; displayName: string; userActive: boolean; partyId: string; partyCode: string; partyName: string; roleSlug: string; permissions?: Record<string, boolean>; active: boolean };
type ProjectAccess = Project & { members: Member[]; parties: Party[]; roles: Role[]; users: User[]; accessible: boolean };
type AccessGrant = { projectCode: string; partyId: string; roleSlug: string; permissions: Record<string, boolean> };
const projectPermissionOptions = [
  { key: "documents.read", label: "Read documents" },
  { key: "documents.create", label: "Create" },
  { key: "documents.edit", label: "Edit" },
  { key: "documents.submit", label: "Submit" },
  { key: "documents.approve", label: "Approve" },
  { key: "documents.delete", label: "Delete" },
  { key: "members.manage", label: "Manage members" },
  { key: "project.settings", label: "Project settings" },
] as const;
type Props = { projectCode: string; mode: "people" | "settings"; onNotify?: (message: string) => void; onChanged?: () => void; onClose?: () => void };
type PermissionValue = "default" | "allow" | "deny";

const rolePartyTypes: Record<string, string[]> = {
  contractor_pm: ["contractor"],
  document_controller: ["contractor"],
  client_re_er: ["client"],
  design_consultant: ["design_consultant"],
  subcontractor: ["subcontractor"],
  supplier: ["supplier"],
};

function compatibleRolesForParty(roleList: Role[], partyType?: string): Role[] {
  if (!partyType) return roleList;
  return roleList.filter((role) => !rolePartyTypes[role.slug] || rolePartyTypes[role.slug].includes(partyType));
}

function permissionModes(permissions?: Record<string, boolean>): Record<string, PermissionValue> {
  return Object.fromEntries(projectPermissionOptions.map(({ key }) => [key, permissions && Object.prototype.hasOwnProperty.call(permissions, key) ? (permissions[key] ? "allow" : "deny") : "default"]));
}

function permissionValues(modes: Record<string, PermissionValue>): Record<string, boolean> {
  return Object.fromEntries(Object.entries(modes).filter(([, value]) => value !== "default").map(([key, value]) => [key, value === "allow"]));
}

function PermissionEditor({ value, onChange }: { value?: Record<string, boolean>; onChange: (value: Record<string, boolean>) => void }) {
  const modes = permissionModes(value);
  return <div className="permission-editor" aria-label="Permission overrides">
    <span className="field-hint">Permission overrides</span>
    {projectPermissionOptions.map((permission) => <label key={permission.key}><span>{permission.label}</span><select value={modes[permission.key]} onChange={(event) => onChange(permissionValues({ ...modes, [permission.key]: event.target.value as PermissionValue }))}><option value="default">Role default</option><option value="allow">Allow</option><option value="deny">Deny</option></select></label>)}
  </div>;
}

async function api<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, { credentials: "include", cache: "no-store", ...options });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.error?.message ?? payload?.error ?? `Request failed (${response.status})`);
  return payload as T;
}

export default function AdminPanel({ projectCode, mode, onNotify, onChanged, onClose }: Props) {
  const [section, setSection] = useState<"organizations" | "project" | "numbering" | "members" | "parties" | "users" | "access">(mode === "settings" ? "organizations" : "members");
  const [project, setProject] = useState<Project | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [parties, setParties] = useState<Party[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [recounting, setRecounting] = useState(false);
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [timezone, setTimezone] = useState("Asia/Hong_Kong");
  const [status, setStatus] = useState("active");
  const [numbering, setNumbering] = useState<NumberingEditorConfig>(defaultDocumentNumbering as NumberingEditorConfig);
  const [numberingType, setNumberingType] = useState<(typeof documentTypeOptions)[number]["value"]>("default");
  const [partyForm, setPartyForm] = useState({ code: "", name: "", partyType: "contractor" });
  const [userForm, setUserForm] = useState({ email: "", displayName: "", externalSubject: "", password: "", passwordConfirm: "" });
  const [resetForm, setResetForm] = useState({ userId: "", password: "", passwordConfirm: "" });
  const [memberForm, setMemberForm] = useState({ userId: "", partyId: "", roleSlug: "" });
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [organizationForm, setOrganizationForm] = useState({ code: "", name: "", timezone: "Asia/Hong_Kong" });
  const [projectForm, setProjectForm] = useState({ organizationId: "", code: "", name: "", timezone: "Asia/Hong_Kong", partyId: "", roleSlug: "" });
  const [projectAccess, setProjectAccess] = useState<ProjectAccess[]>([]);
  const [accessUserId, setAccessUserId] = useState("");
  const [accessProjectCode, setAccessProjectCode] = useState(projectCode);
  const [accessPartyId, setAccessPartyId] = useState("");
  const [accessRoleSlug, setAccessRoleSlug] = useState("");
  const [accessPermissions, setAccessPermissions] = useState<Record<string, boolean>>({});
  const [editingAssignment, setEditingAssignment] = useState<{ projectCode: string; membershipId: string } | null>(null);
  const [accessSearch, setAccessSearch] = useState("");
  const [initialGrants, setInitialGrants] = useState<AccessGrant[]>([{ projectCode, partyId: "", roleSlug: "", permissions: {} }]);

  const load = async () => {
    setLoading(true); setError("");
    try {
      const settings = await api<{ data: Project }>(`/api/projects/${encodeURIComponent(projectCode)}/settings`);
      setProject(settings.data); setName(settings.data.name); setTimezone(settings.data.timezone); setStatus(settings.data.status); setNumbering((settings.data.numbering ?? defaultDocumentNumbering) as NumberingEditorConfig);
      const bundle = await api<{ data: Member[]; roles: Role[]; parties: Party[]; users: User[] }>(`/api/projects/${encodeURIComponent(projectCode)}/members`);
      setMembers(bundle.data); setRoles(bundle.roles); setParties(bundle.parties); setUsers(bundle.users);
      const defaultParty = bundle.parties.find((item) => item.active && item.partyType === "contractor") ?? bundle.parties.find((item) => item.active);
      const defaultRole = bundle.roles.find((item) => item.slug === "contractor_pm") ?? bundle.roles[0];
      setMemberForm((current) => ({ userId: current.userId || bundle.users.find((item) => item.active)?.id || "", partyId: current.partyId || defaultParty?.id || "", roleSlug: current.roleSlug || defaultRole?.slug || "" }));
      if (mode === "settings") {
        const organizationResult = await api<{ data: Organization[] }>("/api/organizations");
        setOrganizations(organizationResult.data);
        setProjectForm((current) => ({ ...current, organizationId: current.organizationId || organizationResult.data[0]?.id || "", partyId: current.partyId || defaultParty?.id || "", roleSlug: current.roleSlug || defaultRole?.slug || "" }));
      }
      setInitialGrants((current) => current.length === 1 && current[0].projectCode === projectCode && !current[0].partyId
        ? [{ projectCode, partyId: defaultParty?.id ?? "", roleSlug: defaultRole?.slug ?? "contractor_pm", permissions: {} }]
        : current);
      if (mode === "people") {
        const available = await api<{ data: Project[] }>("/api/projects");
        const accessBundles = await Promise.all(available.data.map(async (candidate) => {
          try {
            const result = await api<{ data: Member[]; roles: Role[]; parties: Party[]; users: User[] }>(`/api/projects/${encodeURIComponent(candidate.code)}/members`);
            return { ...candidate, members: result.data, roles: result.roles, parties: result.parties, users: result.users, accessible: true } as ProjectAccess;
          } catch {
            return { ...candidate, members: [], roles: [], parties: [], users: [], accessible: false } as ProjectAccess;
          }
        }));
        setProjectAccess(accessBundles);
        const allUsers = [...bundle.users, ...accessBundles.flatMap((item) => item.users)].filter((user, index, list) => list.findIndex((candidate) => candidate.id === user.id) === index);
        setUsers(allUsers);
        setAccessUserId((current) => current || allUsers.find((item) => item.active)?.id || "");
        setAccessProjectCode((current) => accessBundles.some((item) => item.code === current) ? current : projectCode);
      }
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Administration data could not be loaded"); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, [projectCode]);

  const saveProject = async () => {
    setSaving(true); setError("");
    try { const result = await api<{ data: Project }>(`/api/projects/${encodeURIComponent(projectCode)}/settings`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, timezone, status }) }); setProject(result.data); onNotify?.("Project settings saved"); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Project settings could not be saved"); }
    finally { setSaving(false); }
  };
  const saveNumbering = async () => {
    setSaving(true); setError("");
    try {
      const result = await api<{ data: Project }>(`/api/projects/${encodeURIComponent(projectCode)}/settings`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ numbering }) });
      setNumbering(result.data.numbering ?? numbering); onNotify?.("Document numbering saved");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Document numbering could not be saved"); }
    finally { setSaving(false); }
  };
  const resetNumbering = async () => {
    if (!activeNumbering.sequenceScope) {
      setError("Select a counter level before resetting counters");
      return;
    }
    const typeLabel = numberingType === "default" ? "all document types" : numberingType;
    const scopeLabel = activeNumbering.sequenceScope.startsWith("custom:") ? activeNumbering.sequenceScope.slice(7) : activeNumbering.sequenceScope;
    const confirmed = window.confirm(
      `Reset existing counters for ${typeLabel} by ${scopeLabel}? Existing document numbers will remain unchanged; future numbers will start at ${activeNumbering.sequenceNext ?? activeNumbering.sequenceStart}.`,
    );
    if (!confirmed) return;
    setRecounting(true); setError("");
    try {
      const result = await api<{ data?: { sequenceLevels?: string[]; sequenceNext?: number; resetSequenceRows?: number } }>(`/api/projects/${encodeURIComponent(projectCode)}/settings/numbering/recount`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          documentType: numberingType === "default" ? null : numberingType,
          sequenceScope: activeNumbering.sequenceScope,
          sequenceLevels: activeNumbering.sequenceLevels,
          sequenceNext: activeNumbering.sequenceNext ?? activeNumbering.sequenceStart,
        }),
      });
      const resetCount = result.data?.resetSequenceRows;
      onNotify?.(`Existing counters reset for ${typeLabel}${typeof resetCount === "number" ? ` (${resetCount} counter${resetCount === 1 ? "" : "s"} reset)` : ""}`);
      if (result.data?.sequenceLevels || result.data?.sequenceNext) await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Existing document counters could not be reset"); }
    finally { setRecounting(false); }
  };
  const addParty = async () => {
    setSaving(true); setError("");
    try { await api(`/api/projects/${encodeURIComponent(projectCode)}/parties`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(partyForm) }); setPartyForm({ code: "", name: "", partyType: "contractor" }); onNotify?.("Party created"); onChanged?.(); await load(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Party could not be created"); }
    finally { setSaving(false); }
  };
  const createOrganization = async () => {
    setSaving(true); setError("");
    try { await api("/api/organizations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(organizationForm) }); setOrganizationForm({ code: "", name: "", timezone: "Asia/Hong_Kong" }); onNotify?.("Organization created"); onChanged?.(); await load(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Organization could not be created"); }
    finally { setSaving(false); }
  };
  const createProject = async () => {
    const selectedParty = activeParties.find((party) => party.id === projectForm.partyId);
    if (!selectedParty || !compatibleRolesForParty(roles, selectedParty.partyType).some((role) => role.slug === projectForm.roleSlug)) { setError("The selected role is not compatible with the party type"); return; }
    setSaving(true); setError("");
    try { await api("/api/projects", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(projectForm) }); setProjectForm((current) => ({ ...current, code: "", name: "" })); onNotify?.("Project created"); onChanged?.(); await load(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Project could not be created"); }
    finally { setSaving(false); }
  };
  const addUser = async () => {
    setError("");
    if (userForm.password !== userForm.passwordConfirm) { setError("Passwords do not match"); return; }
    setSaving(true);
    try {
      if (!initialGrants.length || !initialGrants.every((grant) => grant.projectCode && grant.partyId && grant.roleSlug)) { setError("Complete every project access row before provisioning"); setSaving(false); return; }
      const assignments = initialGrants.map((grant) => ({ ...grant, permissions: grant.permissions ?? {} }));
      if (new Set(assignments.map((grant) => grant.projectCode)).size !== assignments.length) { setError("Each project may appear only once in project access"); setSaving(false); return; }
      await api(`/api/projects/${encodeURIComponent(projectCode)}/users`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: userForm.email, displayName: userForm.displayName, externalSubject: userForm.externalSubject.trim() || undefined, password: userForm.password || undefined, assignments }) });
      setUserForm({ email: "", displayName: "", externalSubject: "", password: "", passwordConfirm: "" });
      const defaultParty = parties.find((party) => party.active && party.partyType === "contractor") ?? parties.find((party) => party.active);
      const defaultRole = roles.find((role) => role.slug === "contractor_pm") ?? roles[0];
      setInitialGrants([{ projectCode, partyId: defaultParty?.id ?? "", roleSlug: defaultRole?.slug ?? "contractor_pm", permissions: {} }]);
      onNotify?.(assignments.length ? `User provisioned with access to ${assignments.length} project${assignments.length === 1 ? "" : "s"}` : "User provisioned; assign project access before they sign in"); onChanged?.(); await load();
    }
    catch (cause) { setError(cause instanceof Error ? cause.message : "User could not be provisioned"); }
    finally { setSaving(false); }
  };
  const resetUserPassword = async () => {
    setError("");
    if (!resetForm.userId) { setError("Select a user to reset"); return; }
    if (resetForm.password !== resetForm.passwordConfirm) { setError("Passwords do not match"); return; }
    setSaving(true);
    try {
      await api(`/api/projects/${encodeURIComponent(projectCode)}/users/${resetForm.userId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: resetForm.password }) });
      setResetForm({ userId: "", password: "", passwordConfirm: "" });
      onNotify?.("User password reset");
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Password could not be reset"); }
    finally { setSaving(false); }
  };
  const addMember = async () => {
    const selectedParty = activeParties.find((party) => party.id === memberForm.partyId);
    if (!selectedParty || !compatibleRolesForParty(roles, selectedParty.partyType).some((role) => role.slug === memberForm.roleSlug)) { setError("The selected role is not compatible with the party type"); return; }
    setSaving(true); setError("");
    try { await api(`/api/projects/${encodeURIComponent(projectCode)}/members`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(memberForm) }); onNotify?.("Member added to project"); onChanged?.(); await load(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Membership could not be added"); }
    finally { setSaving(false); }
  };
  const setMemberActive = async (member: Member, active: boolean, memberProjectCode = projectCode) => {
    setSaving(true); setError("");
    try { await api(`/api/projects/${encodeURIComponent(memberProjectCode)}/members/${member.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ active }) }); onNotify?.(active ? "Membership reactivated" : "Membership deactivated"); onChanged?.(); await load(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Membership could not be updated"); }
    finally { setSaving(false); }
  };
  const updateMember = async (member: Member, patch: Record<string, unknown>) => {
    setSaving(true); setError("");
    try { await api(`/api/projects/${encodeURIComponent(projectCode)}/members/${member.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) }); onNotify?.("Membership updated"); onChanged?.(); await load(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Membership could not be updated"); }
    finally { setSaving(false); }
  };
  const grantProjectAccess = async () => {
    setError("");
    const targetProject = projectAccess.find((item) => item.code === accessProjectCode);
    if (!accessUserId || !targetProject || !accessPartyId || !accessRoleSlug) { setError("Select a user, project, party, and role"); return; }
    const selectedParty = targetProject.parties.find((party) => party.id === accessPartyId);
    if (!selectedParty || !compatibleRolesForParty(targetProject.roles, selectedParty.partyType).some((role) => role.slug === accessRoleSlug)) { setError("The selected role is not compatible with the party type"); return; }
    setSaving(true);
    try {
      const url = editingAssignment
        ? `/api/projects/${encodeURIComponent(editingAssignment.projectCode)}/members/${encodeURIComponent(editingAssignment.membershipId)}`
        : `/api/projects/${encodeURIComponent(targetProject.code)}/members`;
      const body = editingAssignment
        ? { partyId: accessPartyId, roleSlug: accessRoleSlug, permissions: accessPermissions }
        : { userId: accessUserId, partyId: accessPartyId, roleSlug: accessRoleSlug, permissions: accessPermissions };
      await api(url, { method: editingAssignment ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      onNotify?.(`${editingAssignment ? "Project access updated for" : "Project access granted for"} ${targetProject.code}`); onChanged?.();
      setEditingAssignment(null); setAccessPermissions({});
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Project access could not be granted"); }
    finally { setSaving(false); }
  };
  const beginEditAssignment = (targetProject: ProjectAccess, member: Member) => {
    setAccessUserId(member.userId); setAccessProjectCode(targetProject.code); setAccessPartyId(member.partyId); setAccessRoleSlug(member.roleSlug); setAccessPermissions(member.permissions ?? {}); setEditingAssignment({ projectCode: targetProject.code, membershipId: member.id }); setError("");
  };
  const cancelEditAssignment = () => { setEditingAssignment(null); setAccessPermissions({}); setError(""); };
  const setPartyActive = async (party: Party, active: boolean) => {
    setSaving(true); setError("");
    try { await api(`/api/projects/${encodeURIComponent(projectCode)}/parties/${party.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ active }) }); onNotify?.(active ? "Party reactivated" : "Party deactivated"); await load(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Party could not be updated"); }
    finally { setSaving(false); }
  };
  const setUserActive = async (user: User, active: boolean) => {
    setSaving(true); setError("");
    try { await api(`/api/projects/${encodeURIComponent(projectCode)}/users/${user.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ active }) }); onNotify?.(active ? "User reactivated" : "User deactivated"); await load(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "User could not be updated"); }
    finally { setSaving(false); }
  };

  const activeUsers = useMemo(() => users.filter((user) => user.active), [users]);
  const activeParties = useMemo(() => parties.filter((party) => party.active), [parties]);
  const canProvisionUser = useMemo(() => initialGrants.length > 0 && initialGrants.every((grant) => Boolean(grant.projectCode && grant.partyId && grant.roleSlug)) && new Set(initialGrants.map((grant) => grant.projectCode)).size === initialGrants.length, [initialGrants]);
  const activeOverride = numberingType === "default" ? undefined : numbering.documentTypeOverrides?.[numberingType];
  const activeNumbering = useMemo<NumberingEditorConfig>(() => {
    if (!activeOverride) return numbering;
    return { ...numbering, ...activeOverride, customFields: (activeOverride.customFields ?? numbering.customFields ?? []) as NumberingFieldEditor[] };
  }, [activeOverride, numbering]);
  const setActiveNumbering = (patch: Partial<NumberingEditorConfig>) => {
    setNumbering((current) => {
      if (numberingType === "default") return { ...current, ...patch };
      const existing = current.documentTypeOverrides?.[numberingType] ?? {};
      return {
        ...current,
        documentTypeOverrides: {
          ...(current.documentTypeOverrides ?? {}),
          [numberingType]: { ...existing, ...patch },
        },
      };
    });
  };
  const enableTypeOverride = () => {
    if (numberingType === "default") return;
    setNumbering((current) => ({
      ...current,
      documentTypeOverrides: {
        ...(current.documentTypeOverrides ?? {}),
        [numberingType]: { ...current, documentTypeOverrides: undefined },
      },
    }));
  };
  const removeTypeOverride = () => {
    if (numberingType === "default") return;
    setNumbering((current) => {
      const overrides = { ...(current.documentTypeOverrides ?? {}) };
      delete overrides[numberingType];
      return { ...current, documentTypeOverrides: overrides };
    });
  };
  const scopeLevels = useMemo(() => [
    ...numberingLevels.map((level) => ({ value: level as DocumentNumberingConfig["sequenceLevels"][number], label: level === "documentType" ? "Document type" : level.charAt(0).toUpperCase() + level.slice(1) })),
    ...activeNumbering.customFields.filter((field) => {
      const key = field.attribute || field.key;
      return documentDetailAttributes.some((attribute) => attribute.key === key);
    }).map((field) => {
      const key = field.attribute || field.key;
      const attribute = documentDetailAttributes.find((item) => item.key === key);
      return { value: `custom:${key}` as DocumentNumberingConfig["sequenceLevels"][number], label: `attribute: ${attribute?.label ?? key}` };
    }),
  ], [activeNumbering.customFields]);
  const counterScopeOptions = useMemo(() => {
    const currentScope = activeNumbering.sequenceScope;
    if (!currentScope || scopeLevels.some((item) => item.value === currentScope)) return scopeLevels;
    const label = currentScope.startsWith("custom:") ? `Attribute: ${currentScope.slice(7)}` : currentScope;
    return [{ value: currentScope, label }, ...scopeLevels];
  }, [activeNumbering.sequenceScope, scopeLevels]);
  const exampleNumber = useMemo(() => {
    const sampleValues: Record<string, string> = Object.fromEntries(documentDetailAttributes.map((attribute) => [attribute.key, attribute.key === "project" ? (project?.code ?? projectCode) : attribute.sample]));
    const resolveFieldKey = (field: NumberingFieldEditor) => field.attribute || field.key;
    const scoped = activeNumbering.sequenceLevels.map((level) => level.startsWith("custom:")
      ? sampleValues[level.slice(7)] || activeNumbering.customFields.find((field) => resolveFieldKey(field) === level.slice(7))?.value || "VALUE"
      : sampleValues[level] || level.toUpperCase());
    const scopedCustom = new Set(activeNumbering.sequenceLevels.filter((level) => level.startsWith("custom:")).map((level) => level.slice(7)));
    const additional = activeNumbering.customFields.filter((field) => !scopedCustom.has(resolveFieldKey(field))).map((field) => field.value || sampleValues[resolveFieldKey(field)] || "VALUE");
    const nextSequence = activeNumbering.sequenceNext ?? activeNumbering.sequenceStart;
    return [activeNumbering.prefix, ...scoped, ...additional, String(nextSequence).padStart(activeNumbering.sequenceWidth, "0"), activeNumbering.suffix].filter(Boolean).join(activeNumbering.separator || "-");
  }, [activeNumbering, project?.code, projectCode]);
  return <div className="admin-panel">
    <div className="admin-panel-head"><div><span className="eyebrow">ADMINISTRATION</span><h3>{mode === "settings" ? "Project setup" : "People & access"}</h3><p>{project?.code ?? projectCode} · changes are audited</p></div><div className="admin-panel-actions"><button className="icon-button" title="Refresh" onClick={() => void load()} disabled={loading}><RefreshCw size={15} /></button>{onClose && <button className="icon-button" title="Close" onClick={onClose}><X size={15} /></button>}</div></div>
    <div className="admin-tabs">{(mode === "settings" ? [["organizations", "Organizations & projects"], ["project", "Project"], ["numbering", "Document numbering"]] : [["members", "Members"], ["access", "Project access"], ["parties", "Parties"], ["users", "Users"]]).map(([id, label]) => <button key={id} className={section === id ? "selected" : ""} onClick={() => setSection(id as typeof section)}>{label}</button>)}</div>
    {error && <div className="data-state error" role="alert">{error}</div>}
    {loading ? <div className="data-state">Loading administration data…</div> : <>
      {section === "organizations" && <div className="admin-section organization-setup"><div className="access-intro"><div><strong>Organizations and projects</strong><span className="field-hint">Organizations own projects. A user can belong to several organizations and receive a separate role and permission set in each project.</span></div><span className="admin-code">{organizations.length} organization{organizations.length === 1 ? "" : "s"}</span></div><div className="admin-form compact"><label className="field-label">Organization code<input value={organizationForm.code} onChange={(event) => setOrganizationForm({ ...organizationForm, code: event.target.value.toUpperCase() })} placeholder="ORG-001" /></label><label className="field-label">Organization name<input value={organizationForm.name} onChange={(event) => setOrganizationForm({ ...organizationForm, name: event.target.value })} placeholder="Example Delivery Group" /></label><label className="field-label">Timezone<input value={organizationForm.timezone} onChange={(event) => setOrganizationForm({ ...organizationForm, timezone: event.target.value })} placeholder="Asia/Hong_Kong" /></label><button className="button primary" disabled={saving || !organizationForm.code || !organizationForm.name} onClick={() => void createOrganization()}><Plus size={15} /> Create organization</button></div><div className="admin-form compact"><label className="field-label">Organization<select value={projectForm.organizationId} onChange={(event) => setProjectForm({ ...projectForm, organizationId: event.target.value })}><option value="">Select organization</option>{organizations.filter((item) => item.status !== "closed").map((item) => <option key={item.id} value={item.id}>{item.code} — {item.name}</option>)}</select></label><label className="field-label">Project code<input value={projectForm.code} onChange={(event) => setProjectForm({ ...projectForm, code: event.target.value.toUpperCase() })} placeholder="P002" /></label><label className="field-label">Project name<input value={projectForm.name} onChange={(event) => setProjectForm({ ...projectForm, name: event.target.value })} placeholder="New project" /></label><label className="field-label">Timezone<input value={projectForm.timezone} onChange={(event) => setProjectForm({ ...projectForm, timezone: event.target.value })} placeholder="Asia/Hong_Kong" /></label><label className="field-label">Initial party<select value={projectForm.partyId} onChange={(event) => { const nextPartyId = event.target.value; const nextParty = activeParties.find((party) => party.id === nextPartyId); setProjectForm({ ...projectForm, partyId: nextPartyId, roleSlug: compatibleRolesForParty(roles, nextParty?.partyType).find((role) => role.slug === projectForm.roleSlug)?.slug ?? compatibleRolesForParty(roles, nextParty?.partyType)[0]?.slug ?? "" }); }}><option value="">Select party</option>{activeParties.map((party) => <option key={party.id} value={party.id}>{party.name} ({party.code})</option>)}</select></label><label className="field-label">Your project role<select value={projectForm.roleSlug} onChange={(event) => setProjectForm({ ...projectForm, roleSlug: event.target.value })}><option value="">Select role</option>{compatibleRolesForParty(roles, activeParties.find((party) => party.id === projectForm.partyId)?.partyType).map((role) => <option key={role.slug} value={role.slug}>{role.displayName}</option>)}</select></label><button className="button primary" disabled={saving || !projectForm.organizationId || !projectForm.code || !projectForm.name || !projectForm.partyId || !projectForm.roleSlug} onClick={() => void createProject()}><Plus size={15} /> Create project</button></div><div className="admin-list">{organizations.flatMap((organization) => (organization.projects ?? []).map((item) => <div className="admin-row" key={item.id}><BriefcaseBusiness size={15} /><div><strong>{organization.code} / {item.code} — {item.name}</strong><span>{organization.name} · {item.status}</span></div></div>))}</div></div>}
      {section === "project" && <div className="admin-form"><label className="field-label">Project name<input value={name} onChange={(event) => setName(event.target.value)} /></label><label className="field-label">Timezone<input value={timezone} onChange={(event) => setTimezone(event.target.value)} placeholder="Asia/Hong_Kong" /></label><label className="field-label">Status<select value={status} onChange={(event) => setStatus(event.target.value)}><option value="active">Active</option><option value="paused">Paused</option><option value="closed">Closed</option></select></label><button className="button primary" disabled={saving} onClick={() => void saveProject()}><Save size={15} /> {saving ? "Saving…" : "Save project settings"}</button></div>}
      {section === "numbering" && <div className="admin-section">
        <div className="numbering-type-picker">
          <div><strong>Numbering system</strong><span className="field-hint">Use one shared sequence by default, or create an override for a document type.</span></div>
          <label className="field-label">Document type
            <select value={numberingType} onChange={(event) => setNumberingType(event.target.value as typeof numberingType)}>
              {documentTypeOptions.map((option) => <option key={option.value} value={option.value}>{option.label} · {option.description}</option>)}
            </select>
          </label>
          {numberingType !== "default" && <div className="numbering-override-actions">
            {activeOverride ? <><span className="badge badge-info">Type-specific override</span><button className="button small secondary" type="button" onClick={removeTypeOverride}>Use shared default</button></> : <><span className="field-hint">This type currently uses the shared default.</span><button className="button small secondary" type="button" onClick={enableTypeOverride}>Customize this type</button></>}
          </div>}
        </div>
        <div className={`admin-form compact ${numberingType !== "default" && !activeOverride ? "numbering-inherited" : ""}`}>
          <label className="field-label"><span><input type="checkbox" checked={activeNumbering.enabled} disabled={numberingType !== "default" && !activeOverride} onChange={(event) => setActiveNumbering({ enabled: event.target.checked })} /> Enable custom document numbers</span><span className="field-hint">Numbers are allocated only when a draft is submitted.</span></label>
          <div className="form-grid">
            <label className="field-label">Prefix<input value={activeNumbering.prefix} disabled={numberingType !== "default" && !activeOverride} onChange={(event) => setActiveNumbering({ prefix: event.target.value })} placeholder="DOC" /></label>
            <label className="field-label">Suffix<input value={activeNumbering.suffix} disabled={numberingType !== "default" && !activeOverride} onChange={(event) => setActiveNumbering({ suffix: event.target.value })} placeholder="REV" /></label>
            <label className="field-label">Separator<input value={activeNumbering.separator} maxLength={8} disabled={numberingType !== "default" && !activeOverride} onChange={(event) => setActiveNumbering({ separator: event.target.value })} placeholder="-" /></label>
            <label className="field-label">Sequence digits<input type="number" min={1} max={12} value={activeNumbering.sequenceWidth} disabled={numberingType !== "default" && !activeOverride} onChange={(event) => setActiveNumbering({ sequenceWidth: Number(event.target.value) || 1 })} /></label>
            <label className="field-label">Next sequence number<input type="number" min={1} value={activeNumbering.sequenceNext ?? activeNumbering.sequenceStart} disabled={numberingType !== "default" && !activeOverride} onChange={(event) => setActiveNumbering({ sequenceNext: Number(event.target.value) || 1, sequenceStart: Number(event.target.value) || 1 })} /><span className="field-hint">Sets the starting value for new counter scopes. Use “Reset existing counters” below only when future counters should be restarted; issued document numbers are unchanged.</span></label>
          </div>
          <label className="field-label"><strong>Count sequence by</strong><span className="field-hint">Choose one document attribute for independent counters. For example, Discipline gives STR-0001, STR-0002 and ARC-0001, ARC-0002; Document type shares one count across those disciplines.</span><select value={activeNumbering.sequenceScope ?? activeNumbering.sequenceLevels[0] ?? "project"} disabled={numberingType !== "default" && !activeOverride} onChange={(event) => setActiveNumbering({ sequenceScope: event.target.value as DocumentNumberingConfig["sequenceScope"] })}>{counterScopeOptions.map((level) => <option key={level.value} value={level.value}>{level.label}</option>)}</select><span className="field-hint">Current counter level: {activeNumbering.sequenceScope?.startsWith("custom:") ? activeNumbering.sequenceScope.slice(7) : activeNumbering.sequenceScope ?? "Project"}</span></label>
          <div className="field-label"><strong>Number attributes included in document number</strong><span className="field-hint">Select the attributes rendered before the sequence number. Their order is preserved; this list is independent from the counter level above.</span><div className="admin-inline-controls">{scopeLevels.map((level) => <label key={level.value}><input type="checkbox" disabled={numberingType !== "default" && !activeOverride} checked={activeNumbering.sequenceLevels.includes(level.value)} onChange={(event) => setActiveNumbering({ sequenceLevels: event.target.checked ? [...activeNumbering.sequenceLevels, level.value] : activeNumbering.sequenceLevels.filter((item) => item !== level.value) })} /> {level.label}</label>)}</div><span className="field-hint">Number fields: {activeNumbering.sequenceLevels.length ? activeNumbering.sequenceLevels.map((level) => level.startsWith("custom:") ? level.slice(7) : level).join(" → ") : "none"}</span></div>
          <div className="field-label"><strong>Document-detail attributes</strong><span className="field-hint">Select attributes from the document detail. Their value is read from each document; the optional fallback is used when a value is blank.</span>
            {activeNumbering.customFields.map((field, index) => {
              const attributeKey = field.attribute || field.key;
              return <div className="admin-inline-controls numbering-field-row" key={`${attributeKey}-${index}`}>
                <select aria-label={`Document detail attribute ${index + 1}`} value={attributeKey} disabled={numberingType !== "default" && !activeOverride} onChange={(event) => { const fields = [...activeNumbering.customFields]; fields[index] = { ...fields[index], key: event.target.value, attribute: event.target.value }; setActiveNumbering({ customFields: fields }); }}>
                  <option value="">Select attribute</option>
                  {documentDetailAttributes.map((attribute) => <option key={attribute.key} value={attribute.key}>{attribute.label}</option>)}
                </select>
                <input aria-label={`Fallback value for attribute ${index + 1}`} value={field.value} disabled={numberingType !== "default" && !activeOverride} placeholder="Fallback (optional)" onChange={(event) => { const fields = [...activeNumbering.customFields]; fields[index] = { ...fields[index], value: event.target.value }; setActiveNumbering({ customFields: fields }); }} />
                <button className="button small secondary" type="button" disabled={numberingType !== "default" && !activeOverride} onClick={() => setActiveNumbering({ customFields: activeNumbering.customFields.filter((_, itemIndex) => itemIndex !== index) })}><X size={13} /> Remove</button>
              </div>;
            })}
            <button className="button small secondary" type="button" disabled={numberingType !== "default" && !activeOverride} onClick={() => setActiveNumbering({ customFields: [...activeNumbering.customFields, { key: "", value: "", attribute: "" }] })}><Plus size={13} /> Add document attribute</button>
          </div>
          <div className="numbering-actions"><button className="button primary" disabled={saving || recounting || (numberingType !== "default" && !activeOverride)} onClick={() => void saveNumbering()}><Save size={15} /> {saving ? "Saving…" : "Save document numbering"}</button><button className="button secondary" type="button" disabled={saving || recounting || (numberingType !== "default" && !activeOverride) || !activeNumbering.sequenceScope} onClick={() => void resetNumbering()}><RefreshCw size={15} /> {recounting ? "Resetting…" : "Reset existing counters"}</button></div><span className="field-hint numbering-warning">Resetting affects future counter allocations only. Existing document numbers are not changed.</span>
        </div>
        <div className="data-state"><strong>Example:</strong> {exampleNumber}</div>
      </div>}
      {section === "access" && <div className="admin-section access-section">
        <div className="access-intro"><div><strong>Access across organizations and projects</strong><span className="field-hint">A user is created once, then receives an independent party, role, and permission set in each project.</span></div><span className="admin-code">{projectAccess.filter((item) => item.accessible).length} projects available</span></div>
        <div className="admin-form compact access-toolbar"><label className="field-label">Find user<input value={accessSearch} onChange={(event) => setAccessSearch(event.target.value)} placeholder="Name or email" /></label><label className="field-label">User<select value={accessUserId} onChange={(event) => setAccessUserId(event.target.value)}><option value="">Select user</option>{activeUsers.filter((user) => !accessSearch || `${user.displayName} ${user.email}`.toLowerCase().includes(accessSearch.toLowerCase())).map((user) => <option key={user.id} value={user.id}>{user.displayName} · {user.email}</option>)}</select></label></div>
        <div className="admin-form compact access-grant-form"><label className="field-label">Project<select value={accessProjectCode} onChange={(event) => { const next = event.target.value; const target = projectAccess.find((item) => item.code === next); setAccessProjectCode(next); setAccessPartyId(target?.parties.find((party) => party.active)?.id ?? ""); const defaultParty = target?.parties.find((party) => party.active); setAccessRoleSlug(compatibleRolesForParty(target?.roles ?? [], defaultParty?.partyType)[0]?.slug ?? ""); }}><option value="">Select project</option>{projectAccess.filter((item) => item.accessible && item.status !== "closed").map((item) => <option key={item.code} value={item.code}>{item.organizationCode ? item.organizationCode + " · " : ""}{item.code} — {item.name}</option>)}</select></label><label className="field-label">Party<select value={accessPartyId} onChange={(event) => { const nextPartyId = event.target.value; const target = projectAccess.find((item) => item.code === accessProjectCode); const nextParty = target?.parties.find((party) => party.id === nextPartyId); setAccessPartyId(nextPartyId); setAccessRoleSlug(compatibleRolesForParty(target?.roles ?? roles, nextParty?.partyType)[0]?.slug ?? ""); }}><option value="">Select party</option>{(projectAccess.find((item) => item.code === accessProjectCode)?.parties ?? []).filter((party) => party.active).map((party) => <option key={party.id} value={party.id}>{party.name} ({party.code})</option>)}</select></label><label className="field-label">Role<select value={accessRoleSlug} onChange={(event) => setAccessRoleSlug(event.target.value)}><option value="">Select role</option>{compatibleRolesForParty(projectAccess.find((item) => item.code === accessProjectCode)?.roles ?? roles, projectAccess.find((item) => item.code === accessProjectCode)?.parties.find((party) => party.id === accessPartyId)?.partyType).map((role) => <option key={role.slug} value={role.slug}>{role.displayName}</option>)}</select></label><PermissionEditor value={accessPermissions} onChange={setAccessPermissions} /><button className="button primary" disabled={saving || !accessUserId || !accessProjectCode || !accessPartyId || !accessRoleSlug} onClick={() => void grantProjectAccess()}>{editingAssignment ? <><Save size={15} /> Save access</> : <><Plus size={15} /> Grant access</>}</button>{editingAssignment && <button className="button secondary" type="button" disabled={saving} onClick={cancelEditAssignment}><X size={15} /> Cancel edit</button>}</div>
        {accessUserId && <div className="access-project-list">{projectAccess.filter((item) => item.accessible && item.status !== "closed").map((item) => { const assignments = item.members.filter((member) => member.userId === accessUserId); return <div className="access-project-card" key={item.code}><div><strong>{item.code} — {item.name}</strong><span>{item.organizationName ?? item.organizationCode ?? "Organization"} · {assignments.length ? `${assignments.length} project role${assignments.length === 1 ? "" : "s"}` : "No project access"}</span></div>{assignments.length ? assignments.map((member) => <div className="access-assignment" key={member.id}><span>{member.partyName} · {item.roles.find((role) => role.slug === member.roleSlug)?.displayName ?? member.roleSlug}{Object.values(member.permissions ?? {}).filter(Boolean).length ? ` · ${Object.values(member.permissions ?? {}).filter(Boolean).length} custom permission${Object.values(member.permissions ?? {}).filter(Boolean).length === 1 ? "" : "s"}` : ""}</span><span className="access-assignment-actions"><button className="button small secondary" disabled={saving} onClick={() => beginEditAssignment(item, member)}>Edit</button><button className="button small secondary" disabled={saving} onClick={() => void setMemberActive(member, !member.active, item.code)}>{member.active ? "Revoke" : "Restore"}</button></span></div>) : <span className="field-hint">Grant access above to make this project available.</span>}</div>; })}</div>}
      </div>}
      {section === "members" && <div className="admin-section"><div className="admin-form compact"><label className="field-label">User<select value={memberForm.userId} onChange={(event) => setMemberForm({ ...memberForm, userId: event.target.value })}><option value="">Select user</option>{activeUsers.map((user) => <option key={user.id} value={user.id}>{user.displayName} · {user.email}</option>)}</select></label><label className="field-label">Party<select value={memberForm.partyId} onChange={(event) => { const nextPartyId = event.target.value; const nextParty = activeParties.find((party) => party.id === nextPartyId); const compatible = compatibleRolesForParty(roles, nextParty?.partyType); setMemberForm({ ...memberForm, partyId: nextPartyId, roleSlug: compatible.find((role) => role.slug === memberForm.roleSlug)?.slug ?? compatible[0]?.slug ?? "" }); }}><option value="">Select party</option>{activeParties.map((party) => <option key={party.id} value={party.id}>{party.name} ({party.code})</option>)}</select></label><label className="field-label">Role<select value={memberForm.roleSlug} onChange={(event) => setMemberForm({ ...memberForm, roleSlug: event.target.value })}><option value="">Select role</option>{compatibleRolesForParty(roles, activeParties.find((party) => party.id === memberForm.partyId)?.partyType).map((role) => <option key={role.slug} value={role.slug}>{role.displayName}</option>)}</select></label><button className="button primary" disabled={saving || !memberForm.userId || !memberForm.partyId || !memberForm.roleSlug} onClick={() => void addMember()}><Plus size={15} /> Add member</button></div><div className="admin-list">{members.map((member) => <div className={`admin-row ${member.active ? "" : "muted"}`} key={member.id}><Users size={15} /><div><strong>{member.displayName}</strong><span>{member.email}</span><div className="admin-inline-controls"><select value={member.partyId} disabled={saving} onChange={(event) => void updateMember(member, { partyId: event.target.value })}>{activeParties.map((party) => <option key={party.id} value={party.id}>{party.code}</option>)}</select><select value={member.roleSlug} disabled={saving} onChange={(event) => void updateMember(member, { roleSlug: event.target.value })}>{roles.map((role) => <option key={role.slug} value={role.slug}>{role.displayName}</option>)}</select></div></div><button className="button small secondary" disabled={saving} onClick={() => void setMemberActive(member, !member.active)}>{member.active ? <><UserMinus size={13} /> Deactivate</> : <><Check size={13} /> Reactivate</>}</button></div>)}</div></div>}
      {section === "parties" && <div className="admin-section"><div className="admin-form compact"><label className="field-label">Code<input value={partyForm.code} onChange={(event) => setPartyForm({ ...partyForm, code: event.target.value.toUpperCase() })} placeholder="SUB2" /></label><label className="field-label">Name<input value={partyForm.name} onChange={(event) => setPartyForm({ ...partyForm, name: event.target.value })} placeholder="New delivery partner" /></label><label className="field-label">Type<select value={partyForm.partyType} onChange={(event) => setPartyForm({ ...partyForm, partyType: event.target.value })}><option value="contractor">Contractor</option><option value="client">Client</option><option value="subcontractor">Subcontractor</option><option value="supplier">Supplier</option><option value="design_consultant">Design consultant</option><option value="other">Other</option></select></label><button className="button primary" disabled={saving || !partyForm.code || !partyForm.name} onClick={() => void addParty()}><Plus size={15} /> Add party</button></div><div className="admin-list">{parties.map((party) => <div className={`admin-row ${party.active ? "" : "muted"}`} key={party.id}><Users size={15} /><div><strong>{party.name} <BadgeInline>{party.code}</BadgeInline></strong><span>{party.partyType.replaceAll("_", " ")} · {party.memberCount ?? 0} member{party.memberCount === 1 ? "" : "s"}</span></div><button className="button small secondary" disabled={saving} onClick={() => void setPartyActive(party, !party.active)}>{party.active ? <><UserMinus size={13} /> Deactivate</> : <><Check size={13} /> Reactivate</>}</button></div>)}</div></div>}
      {section === "users" && <div className="admin-section">
        <div className="admin-form compact"><label className="field-label">Display name<input value={userForm.displayName} onChange={(event) => setUserForm({ ...userForm, displayName: event.target.value })} placeholder="Jane Smith" /></label><label className="field-label">Email<input type="email" value={userForm.email} onChange={(event) => setUserForm({ ...userForm, email: event.target.value })} placeholder="jane@example.com" /></label><label className="field-label">Password <span className="field-hint">8+ chars with uppercase, lowercase, and special character</span><input type="password" autoComplete="new-password" value={userForm.password} onChange={(event) => setUserForm({ ...userForm, password: event.target.value })} placeholder="Required for local authentication" /></label><label className="field-label">Confirm password<input type="password" autoComplete="new-password" value={userForm.passwordConfirm} onChange={(event) => setUserForm({ ...userForm, passwordConfirm: event.target.value })} placeholder="Repeat password" /></label><label className="field-label">External subject <span className="field-hint">Leave blank for local authentication; use the stable subject from OIDC / Keycloak when enabled</span><input value={userForm.externalSubject} onChange={(event) => setUserForm({ ...userForm, externalSubject: event.target.value })} placeholder="e.g. 4f8c… from your identity provider" /></label></div>
        <div className="access-grant-editor"><div className="section-heading"><strong>Project access to grant</strong><span className="field-hint">Choose the organization project, party, role, and optional permissions before provisioning.</span></div>{initialGrants.map((grant, index) => { const grantProject = projectAccess.find((item) => item.code === grant.projectCode) ?? (grant.projectCode === projectCode ? { code: projectCode, parties, roles, accessible: true } as ProjectAccess : undefined); return <div className="access-grant-row" key={grant.projectCode + "-" + index}><select aria-label={`Grant project ${index + 1}`} value={grant.projectCode} onChange={(event) => { const nextProject = event.target.value; const next = projectAccess.find((item) => item.code === nextProject); const grants = [...initialGrants]; grants[index] = { projectCode: nextProject, partyId: next?.parties.find((party) => party.active)?.id ?? "", roleSlug: compatibleRolesForParty(next?.roles ?? roles, next?.parties.find((party) => party.active)?.partyType).find((role) => role.slug === "contractor_pm")?.slug ?? compatibleRolesForParty(next?.roles ?? roles, next?.parties.find((party) => party.active)?.partyType)[0]?.slug ?? "", permissions: {} }; setInitialGrants(grants); }}><option value="">Select project</option>{projectAccess.filter((item) => item.accessible && item.status !== "closed").map((item) => <option key={item.code} value={item.code}>{item.organizationCode ? item.organizationCode + " · " : ""}{item.code} — {item.name}</option>)}</select><select aria-label={`Grant party ${index + 1}`} value={grant.partyId} onChange={(event) => { const nextPartyId = event.target.value; const selectedParty = grantProject?.parties.find((party) => party.id === nextPartyId); const grants = [...initialGrants]; const rolesForParty = compatibleRolesForParty(grantProject?.roles ?? roles, selectedParty?.partyType); grants[index] = { ...grants[index], partyId: nextPartyId, roleSlug: rolesForParty.find((role) => role.slug === grant.roleSlug)?.slug ?? rolesForParty.find((role) => role.slug === "contractor_pm")?.slug ?? rolesForParty[0]?.slug ?? "" }; setInitialGrants(grants); }} ><option value="">Select party</option>{(grantProject?.parties ?? []).filter((party) => party.active).map((party) => <option key={party.id} value={party.id}>{party.name} ({party.code})</option>)}</select><select aria-label={`Grant role ${index + 1}`} value={grant.roleSlug} onChange={(event) => { const grants = [...initialGrants]; grants[index] = { ...grants[index], roleSlug: event.target.value }; setInitialGrants(grants); }}><option value="">Select role</option>{compatibleRolesForParty(grantProject?.roles ?? roles, grantProject?.parties.find((party) => party.id === grant.partyId)?.partyType).map((role) => <option key={role.slug} value={role.slug}>{role.displayName}</option>)}</select><PermissionEditor value={grant.permissions} onChange={(permissions) => { const grants = [...initialGrants]; grants[index] = { ...grants[index], permissions }; setInitialGrants(grants); }} />{initialGrants.length > 1 && <button className="button small secondary" type="button" onClick={() => setInitialGrants(initialGrants.filter((_, itemIndex) => itemIndex !== index))}><X size={13} /> Remove</button>}</div>; })}<button className="button small secondary" type="button" onClick={() => setInitialGrants([...initialGrants, { projectCode: "", partyId: "", roleSlug: "", permissions: {} }])}><Plus size={13} /> Add another project</button></div>
        <button className="button primary" disabled={saving || !userForm.email || !userForm.displayName || !canProvisionUser || (!userForm.password && !userForm.externalSubject) || (!!userForm.password && userForm.password !== userForm.passwordConfirm)} onClick={() => void addUser()}><Plus size={15} /> Provision user and grant access</button>
        <div className="admin-form compact admin-password-reset"><strong>Reset an existing local password</strong><label className="field-label">User<select value={resetForm.userId} onChange={(event) => setResetForm({ ...resetForm, userId: event.target.value })}><option value="">Select user</option>{users.filter((user) => user.active).map((user) => <option key={user.id} value={user.id}>{user.displayName} · {user.email}</option>)}</select></label><label className="field-label">New password<input type="password" autoComplete="new-password" value={resetForm.password} onChange={(event) => setResetForm({ ...resetForm, password: event.target.value })} placeholder="8+ chars with uppercase, lowercase, and special character" /></label><label className="field-label">Confirm password<input type="password" autoComplete="new-password" value={resetForm.passwordConfirm} onChange={(event) => setResetForm({ ...resetForm, passwordConfirm: event.target.value })} /></label><button className="button secondary" disabled={saving || !resetForm.userId || !resetForm.password || resetForm.password !== resetForm.passwordConfirm} onClick={() => void resetUserPassword()}><Save size={15} /> Reset password</button></div><div className="admin-list">{users.map((user) => <div className={`admin-row ${user.active ? "" : "muted"}`} key={user.id}><Users size={15} /><div><strong>{user.displayName}</strong><span>{user.email}{user.externalSubject ? " · " + user.externalSubject : ""}</span></div><button className="button small secondary" disabled={saving} onClick={() => void setUserActive(user, !user.active)}>{user.active ? <><UserMinus size={13} /> Deactivate</> : <><Check size={13} /> Reactivate</>}</button></div>)}</div>
      </div>}
    </>}
  </div>;
}

function BadgeInline({ children }: { children: React.ReactNode }) { return <span className="admin-code">{children}</span>; }

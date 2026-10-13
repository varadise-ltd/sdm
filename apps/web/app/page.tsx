"use client";

import {
  Archive,
  ArrowLeft,
  ArrowRight,
  Bell,
  Box,
  BriefcaseBusiness,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  ClipboardCheck,
  ClipboardList,
  Clock3,
  Columns3,
  Cloud,
  FileArchive,
  FileCheck2,
  FileText,
  Folder,
  FolderOpen,
  Grid2X2,
  History,
  Info,
  Link2,
  ListFilter,
  Menu,
  Maximize2,
  MoreHorizontal,
  Minimize2,
  Paperclip,
  PenLine,
  Plug,
  Plus,
  RefreshCw,
  Search,
  Send,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  UploadCloud,
  UserCheck,
  Users,
  X,
  Zap,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import AdminPanel from "./components/AdminPanel";
import BimViewerSurface from "./components/BimViewerSurface";
import PasswordChangeForm from "./components/PasswordChangeForm";
import WorkflowSetupPanel from "./components/WorkflowSetupPanel";
import { defaultLibraryFolder, libraryFolderLabel, libraryFolderOptions } from "../lib/library-folders";

type CdeState = "WIP" | "Shared" | "Published" | "Archive";
type ClientResponse = "Pending" | "A" | "C" | "D" | "Not required";
type Tab = "Overview" | "Workflow" | "Revisions" | "Links" | "Activity";
type LibraryFolder = "All documents" | "Documents" | "Project Information" | "Design" | "Construction" | "Commercial" | "Handover" | "Drawings" | "Architectural" | "Structural" | "MEP" | "Civil" | "Forms" | "Internal Shared" | "Packages" | "Incoming" | "Outgoing" | "Transmittals" | "Archived";
type ConnectorProvider = "cosmos_drive" | "google_drive" | "sharepoint" | "onedrive" | "dropbox" | "box" | "s3" | "webdav";

type ConnectorConfig = {
  id: string;
  provider: ConnectorProvider;
  name: string;
  endpointUrl: string | null;
  externalDriveId: string | null;
  accountLabel: string | null;
  config: Record<string, unknown>;
  credentialConfigured: boolean;
  status: "disabled" | "pending_auth" | "ready" | "error";
  lastTestedAt: string | null;
  lastError: string | null;
};

type LinkedRecordKind = "all" | "form" | "photo";
type LinkedRecord = {
  id: string;
  kind: "form" | "photo" | "document";
  source: "external" | "document";
  title: string;
  reference: string | null;
  revisionCode: string | null;
  sourceName: string;
  url: string | null;
  targetDocumentId: string | null;
};

type Container = {
  id: string;
  dbId?: string;
  title: string;
  type: "Drawing" | "Document" | "Form" | "Package" | "Transmittal";
  rev: string;
  suitability: string;
  response: ClientResponse;
  state: CdeState;
  originator: string;
  updated: string;
  assignee: string;
  endorsement?: boolean;
  revisionId?: string;
  containerNumber?: string | null;
  internalNumber?: string | null;
  workflowStatus?: string;
  isInternal?: boolean;
  draftId?: string;
  transmittalItemId?: string;
  libraryFolder?: string | null;
};

type ApiContainer = {
  id: string;
  containerNumber: string | null;
  internalNumber: string | null;
  title: string;
  documentType: string;
  lifecycleStatus: string;
  revisionId?: string | null;
  revisionCode: string | null;
  suitabilityCode: string | null;
  clientResponseCode: ClientResponse | null;
  cdeState: CdeState | null;
  workflowStatus: string | null;
  isDrawing?: boolean;
  isInternal?: boolean;
  originatorCode?: string | null;
  transmittalItemId?: string | null;
  updatedAt: string;
  libraryFolder?: string | null;
};

type ApiDraft = {
  id: string;
  title: string;
  documentTypeCode: string;
  isDrawing: boolean;
  isInternal: boolean;
  status: string;
  updatedAt: string;
  libraryFolder?: string | null;
};

type ProjectTag = { id: string; name: string; slug: string; tagKind?: string; active?: boolean };
type ContainerFile = { id: string; filename: string; mimeType: string; byteSize: number | string; virusScanStatus: string; textIndexStatus: string; revisionCode: string; isPrimary: boolean };
type SessionProfile = { displayName: string; email: string; organizations?: Array<{ id: string; code: string; name: string; roleSlug: string }>; memberships: Array<{ projectCode: string; projectName: string; organizationCode?: string; organizationName?: string; roleSlug: string; partyName: string; permissions?: Record<string, boolean> }> };
type Project = { id: string; code: string; name: string; timezone: string; status: string; organizationId?: string; organizationCode?: string; organizationName?: string; organizationRole?: string; roleSlug?: string; permissions?: Record<string, boolean> };
type AlertItem = { id: string; alertType: string; targetType: string; targetId: string; message: string; readAt: string | null; createdAt: string };
type TaskItem = { id: string; taskType: string; targetType: string; targetId: string; status: string; dueAt: string | null; completedAt: string | null; createdAt: string; targetTitle?: string | null; containerNumber?: string | null };
type Endorsement = { id: string; endorsementType: "IDC" | "ICE" | "Client"; status: string; endorsedAt: string | null; endorsedBy: string | null; notes: string | null; canWithdraw?: boolean };
const endorsementLabels: Record<Endorsement["endorsementType"], string> = {
  IDC: "IDC — Independent Design Checker",
  ICE: "ICE — Independent Checking Engineer",
  Client: "Client endorsement",
};
type RevisionRecord = { id: string; revisionCode: string; revisionSequence: number; suitabilityCode: string; clientResponseCode: string; cdeState: string; workflowStatus: string; submittedAt: string | null; publishedAt: string | null; createdAt: string; updatedAt: string; isCurrent: boolean; supersedesRevisionCode: string | null; submittedBy: string | null; fileCount: number };
type BatchUploadStatus = "queued" | "uploading" | "complete" | "error";
type BatchUploadItem = { id: string; file: File; kind: "drawing" | "bim"; status: BatchUploadStatus; progress: number; message?: string; draftId?: string; fileId?: string };

const MAX_BATCH_FILES = 100;
const MAX_BATCH_FILE_BYTES = 5 * 1024 * 1024 * 1024;
const MAX_BATCH_TOTAL_BYTES = 50 * 1024 * 1024 * 1024;
const BATCH_HASH_LIMIT = 256 * 1024 * 1024;
const BATCH_FILE_EXTENSIONS: Record<string, BatchUploadItem["kind"]> = {
  ".ifc": "bim", ".ifczip": "bim", ".ifcxml": "bim", ".xkt": "bim", ".rvt": "bim", ".rfa": "bim", ".nwd": "bim", ".nwc": "bim", ".nwf": "bim", ".skp": "bim", ".3dm": "bim", ".obj": "bim", ".fbx": "bim", ".gltf": "bim", ".glb": "bim", ".step": "bim", ".stp": "bim", ".iges": "bim", ".igs": "bim",
  ".dwg": "drawing", ".dxf": "drawing", ".dgn": "drawing", ".plt": "drawing", ".svg": "drawing", ".pdf": "drawing", ".png": "drawing", ".jpg": "drawing", ".jpeg": "drawing", ".tif": "drawing", ".tiff": "drawing",
};

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes;
  let unit = -1;
  do { value /= 1024; unit += 1; } while (value >= 1024 && unit < units.length - 1);
  return `${value.toFixed(value >= 10 || unit === 0 ? 0 : 1)} ${units[unit]}`;
}

function batchFileKind(file: File): BatchUploadItem["kind"] | null {
  const name = file.name.toLowerCase();
  const extension = name.slice(name.lastIndexOf("."));
  return BATCH_FILE_EXTENSIONS[extension] ?? null;
}

function uploadWithProgress(url: string, headers: Record<string, string> | undefined, file: File, onProgress: (value: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("PUT", url);
    Object.entries(headers ?? {}).forEach(([name, value]) => request.setRequestHeader(name, value));
    request.upload.onprogress = (event) => { if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100)); };
    request.onload = () => request.status >= 200 && request.status < 300 ? resolve() : reject(new Error(`Upload failed (${request.status})`));
    request.onerror = () => reject(new Error("Network error during upload"));
    request.onabort = () => reject(new Error("Upload was cancelled"));
    request.send(file);
  });
}

const emptyContainer: Container = {
  id: "",
  title: "No document selected",
  type: "Document",
  rev: "—",
  suitability: "—",
  response: "Not required",
  state: "WIP",
  originator: "—",
  updated: "—",
  assignee: "—",
};

function containerType(code: string, isDrawing = false): Container["type"] {
  if (isDrawing || code === "DR") return "Drawing";
  if (code === "FM" || code === "FORM") return "Form";
  if (code === "PK" || code === "PACKAGE") return "Package";
  if (code === "TX" || code === "TRN" || code === "TRANSMITTAL") return "Transmittal";
  return "Document";
}

function formatUpdated(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("en-HK", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function mapApiContainer(row: ApiContainer): Container {
  const type = containerType(row.documentType, row.isDrawing);
  const response = row.clientResponseCode ?? (type === "Form" ? "Not required" : "Pending");
  return {
    id: row.containerNumber ?? row.internalNumber ?? row.id,
    dbId: row.id,
    title: row.title,
    type,
    rev: row.revisionCode ?? "—",
    suitability: row.suitabilityCode ?? "—",
    response,
    state: row.cdeState ?? "WIP",
    originator: row.originatorCode ?? (row.containerNumber?.split("-")[1] ?? "—"),
    updated: formatUpdated(row.updatedAt),
    assignee: "—",
    endorsement: type === "Drawing" && (row.suitabilityCode === "S3" || row.clientResponseCode === "Pending"),
    revisionId: row.revisionId ?? undefined,
    containerNumber: row.containerNumber,
    internalNumber: row.internalNumber,
    workflowStatus: row.workflowStatus ?? undefined,
    isInternal: row.isInternal ?? Boolean(row.internalNumber),
    transmittalItemId: row.transmittalItemId ?? undefined,
    libraryFolder: row.libraryFolder ?? null,
  };
}

function mapApiDraft(row: ApiDraft): Container {
  const type = containerType(row.documentTypeCode, row.isDrawing);
  return {
    id: `DRAFT-${row.id.slice(0, 8).toUpperCase()}`,
    draftId: row.id,
    title: row.title,
    type,
    rev: "Draft",
    suitability: "—",
    response: "Not required",
    state: "WIP",
    originator: "Draft",
    updated: formatUpdated(row.updatedAt),
    assignee: "—",
    workflowStatus: row.status,
    isInternal: row.isInternal,
    libraryFolder: row.libraryFolder ?? defaultLibraryFolder(row.documentTypeCode, row.isDrawing),
  };
}

const lanes: { id: CdeState; caption: string; icon: typeof Folder; tone: string }[] = [
  { id: "WIP", caption: "In preparation", icon: FolderOpen, tone: "blue" },
  { id: "Shared", caption: "For review and coordination", icon: Link2, tone: "shared" },
  { id: "Published", caption: "Client accepted (A)", icon: CheckCircle2, tone: "green" },
  { id: "Archive", caption: "Superseded / closed", icon: Archive, tone: "gray" },
];

function badgeTone(value: string) {
  if (["Published", "A", "Reviewed"].includes(value)) return "success";
  if (["Pending", "C"].includes(value)) return "warn";
  if (["D", "Danger"].includes(value)) return "danger";
  if (["Shared", "S3"].includes(value)) return "info";
  return "neutral";
}

function IconForType({ type }: { type: Container["type"] }) {
  const Icon = type === "Drawing" ? FileCheck2 : type === "Form" ? ClipboardList : type === "Package" ? Box : type === "Transmittal" ? Send : FileText;
  return <Icon size={16} strokeWidth={1.8} />;
}

function Badge({ children, tone = "neutral" }: { children: React.ReactNode; tone?: string }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

function matchesLibraryFolder(item: Container, folder: LibraryFolder) {
  if (folder === "All documents") return true;
  const persisted = item.libraryFolder ?? defaultLibraryFolder(item.type === "Drawing" ? "DR" : item.type, item.type === "Drawing");
  const folderPath = folder === "Project Information" || folder === "Design" || folder === "Construction" || folder === "Commercial" || folder === "Handover" ? `Documents/${folder}` : folder === "Architectural" || folder === "Structural" || folder === "MEP" || folder === "Civil" ? `Drawings/${folder}` : folder;
  if (folder === "Documents" || folder === "Drawings" || folder === "Packages") return persisted === folder || persisted.startsWith(`${folder}/`);
  if (folder === "Forms") return persisted === "Forms";
  if (folder === "Internal Shared") return item.isInternal === true || item.state === "Shared";
  if (folder === "Archived") return item.state === "Archive";
  if (folder === "Transmittals") return persisted === "Transmittals";
  return persisted === folderPath;
}

function RailItem({ label, icon: Icon, active, onClick }: { label: string; icon: typeof Folder; active?: boolean; onClick?: () => void }) {
  return <button className={`rail-item ${active ? "active" : ""}`} title={label} onClick={onClick}><Icon size={18} /><span>{label}</span></button>;
}

export default function Page() {
  const [items, setItems] = useState<Container[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [searchItems, setSearchItems] = useState<Container[] | null>(null);
  const [selectedCde, setSelectedCde] = useState<"All" | CdeState>("All");
  const [view, setView] = useState<"board" | "register">("board");
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<Tab>("Overview");
  const [modal, setModal] = useState<"new" | "batchUpload" | "move" | "bim" | "bimSettings" | "decision" | "edit" | "endorsements" | "links" | "profile" | "people" | "settings" | "help" | "requestChanges" | "workflowSetup" | "connectors" | null>(null);
  const [linkedRecordKind, setLinkedRecordKind] = useState<LinkedRecordKind>("all");
  const [audit, setAudit] = useState(["Opened package P001-ABC-ZZ-01-DR-A-0001", "Shared filter selected", "Workspace ready"]);
  const [draftTitle, setDraftTitle] = useState("");
  const [activeRail, setActiveRail] = useState("Repository");
  const [typeFilter, setTypeFilter] = useState<"All" | Container["type"]>("All");
  const [libraryFolder, setLibraryFolder] = useState<LibraryFolder>("All documents");
  const [filterOpen, setFilterOpen] = useState(false);
  const [libraryCollapsed, setLibraryCollapsed] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(true);
  const [drawerExpanded, setDrawerExpanded] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [projectOpen, setProjectOpen] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectCode, setProjectCode] = useState("P001");
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [endorsements, setEndorsements] = useState<Endorsement[]>([]);
  const [endorsementLoading, setEndorsementLoading] = useState(false);
  const [requestComment, setRequestComment] = useState("");
  const [bimReload, setBimReload] = useState(0);
  const [bimCameraMode, setBimCameraMode] = useState<"orbit" | "firstPerson">("orbit");
  const [bimShowEdges, setBimShowEdges] = useState(true);
  const [tasksOpen, setTasksOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [taskCount, setTaskCount] = useState(0);
  const [alertCount, setAlertCount] = useState(0);
  const [sessionProfile, setSessionProfile] = useState<SessionProfile | null>(null);
  const [notice, setNotice] = useState("");
  const [selectedFileName, setSelectedFileName] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [draftType, setDraftType] = useState<"Document" | "Drawing" | "Form">("Document");
  const [draftDiscipline, setDraftDiscipline] = useState("");
  const [draftCdeState, setDraftCdeState] = useState<"WIP" | "Internal">("WIP");
  const [draftInternalCategory, setDraftInternalCategory] = useState("");
  const [draftLibraryFolder, setDraftLibraryFolder] = useState("Documents");
  const [batchLibraryFolder, setBatchLibraryFolder] = useState("Drawings");
  const [moveLibraryFolder, setMoveLibraryFolder] = useState("Documents");
  const [moveError, setMoveError] = useState("");
  const [moving, setMoving] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [assignedTags, setAssignedTags] = useState<ProjectTag[]>([]);
  const [availableTags, setAvailableTags] = useState<ProjectTag[]>([]);
  const [tagMenuOpen, setTagMenuOpen] = useState(false);
  const [tagLoading, setTagLoading] = useState(false);
  const [newTagName, setNewTagName] = useState("");
  const [selectedFiles, setSelectedFiles] = useState<ContainerFile[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const batchInputRef = useRef<HTMLInputElement>(null);
  const [batchFiles, setBatchFiles] = useState<BatchUploadItem[]>([]);
  const [batchUploading, setBatchUploading] = useState(false);
  const [batchDropActive, setBatchDropActive] = useState(false);
  const [batchCdeState, setBatchCdeState] = useState<"WIP" | "Internal">("WIP");
  const [batchDiscipline, setBatchDiscipline] = useState("");
  const [batchInternalCategory, setBatchInternalCategory] = useState("");
  const activeProject = projects.find((project) => project.code === projectCode);

  const selected = selectedId ? items.find((item) => item.id === selectedId) ?? emptyContainer : emptyContainer;

  function redirectToLoginIfUnauthenticated(response: Response): boolean {
    if (response.status === 401) {
      window.location.assign("/login");
      return true;
    }
    return false;
  }

  function openProfileMenu() {
    setProfileOpen((open) => !open);
    setNotificationsOpen(false);
    setTasksOpen(false);
    setProjectOpen(false);
  }

  async function loadContainers(): Promise<Container[]> {
    setLoading(true);
    setLoadError("");
    try {
      const [containerResponse, draftResponse] = await Promise.all([
        fetch(`/api/containers?project=${encodeURIComponent(projectCode)}`, { credentials: "include", cache: "no-store" }),
        fetch(`/api/projects/${encodeURIComponent(projectCode)}/drafts`, { credentials: "include", cache: "no-store" }),
      ]);
      if (redirectToLoginIfUnauthenticated(containerResponse) || redirectToLoginIfUnauthenticated(draftResponse)) return [];
      const payload = (await containerResponse.json()) as { data?: ApiContainer[]; error?: { message?: string } };
      const draftPayload = (await draftResponse.json()) as { data?: ApiDraft[]; error?: { message?: string } };
      if (!containerResponse.ok) throw new Error(payload.error?.message ?? "Unable to load the document register");
      if (!draftResponse.ok && draftResponse.status !== 403) throw new Error(draftPayload.error?.message ?? "Unable to load drafts");
      const nextItems = [...(draftResponse.ok ? (draftPayload.data ?? []) : []).filter((draft) => draft.status === "open").map(mapApiDraft), ...(payload.data ?? []).map(mapApiContainer)];
      setItems(nextItems);
      setSelectedId((current) => current && nextItems.some((item) => item.id === current) ? current : nextItems[0]?.id ?? "");
      return nextItems;
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Unable to load the document register");
    } finally {
      setLoading(false);
    }
    return [];
  }

  useEffect(() => {
    void loadContainers();
  }, [projectCode]);
  useEffect(() => {
    if (!drawerExpanded) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setDrawerExpanded(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [drawerExpanded]);
  useEffect(() => {
    void refreshProjects();
  }, [projectCode]);

  async function refreshProjects() {
    try {
      const response = await fetch("/api/projects", { credentials: "include", cache: "no-store" });
      if (!response.ok) return;
      const available = (await response.json() as { data?: Project[] }).data ?? [];
      setProjects(available);
      if (available.length > 0 && !available.some((project) => project.code === projectCode)) setProjectCode(available[0].code);
    } catch { /* Keep the current project visible while a transient refresh fails. */ }
  }
  useEffect(() => {
    void fetch("/api/me", { credentials: "include", cache: "no-store" })
      .then(async (response) => response.ok ? (await response.json() as { data?: SessionProfile }).data ?? null : null)
      .then(setSessionProfile)
      .catch(() => undefined);
  }, []);
  useEffect(() => {
    void Promise.all([
      fetch(`/api/projects/${encodeURIComponent(projectCode)}/tasks`, { credentials: "include", cache: "no-store" }).then(async (response) => response.ok ? (await response.json() as { data?: TaskItem[] }).data ?? [] : []),
      fetch(`/api/projects/${encodeURIComponent(projectCode)}/alerts`, { credentials: "include", cache: "no-store" }).then(async (response) => response.ok ? (await response.json() as { data?: AlertItem[] }).data ?? [] : []),
    ]).then(([tasks, alerts]) => {
      setTasks(tasks);
      setAlerts(alerts);
      setTaskCount(tasks.filter((task) => task.status === "open" || task.status === "in_progress").length);
      setAlertCount(alerts.filter((alert) => !alert.readAt).length);
    }).catch(() => undefined);
  }, [projectCode]);
  useEffect(() => {
    if (!selected.dbId) {
      setAssignedTags([]);
      setAvailableTags([]);
      setTagMenuOpen(false);
      return;
    }
    setTagMenuOpen(false);
    let cancelled = false;
    void Promise.all([
      fetch(`/api/containers/${selected.dbId}/tags`, { credentials: "include", cache: "no-store" }),
      fetch(`/api/projects/${encodeURIComponent(projectCode)}/tags`, { credentials: "include", cache: "no-store" }),
    ]).then(async ([assignedResponse, availableResponse]) => {
      const assigned = assignedResponse.ok ? ((await assignedResponse.json()) as { data?: ProjectTag[] }).data ?? [] : [];
      const available = availableResponse.ok ? ((await availableResponse.json()) as { data?: ProjectTag[] }).data ?? [] : [];
      if (!cancelled) {
        setAssignedTags(assigned);
        setAvailableTags(available.filter((tag) => tag.active !== false));
      }
    }).catch(() => {
      if (!cancelled) {
        setAssignedTags([]);
        setAvailableTags([]);
      }
    });
    return () => { cancelled = true; };
  }, [selected.dbId, projectCode]);

  useEffect(() => {
    if (!selected.dbId) { setSelectedFiles([]); return; }
    let cancelled = false;
    void fetch(`/api/containers/${selected.dbId}/files`, { credentials: "include", cache: "no-store" })
      .then(async (response) => response.ok ? (await response.json() as { data?: ContainerFile[] }).data ?? [] : [])
      .then((files) => { if (!cancelled) setSelectedFiles(files); })
      .catch(() => { if (!cancelled) setSelectedFiles([]); });
    return () => { cancelled = true; };
  }, [selected.dbId]);

  async function downloadFile(file: ContainerFile) {
    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(projectCode)}/files/${file.id}/download?disposition=inline`, { credentials: "include" });
      const payload = (await response.json()) as { data?: { downloadUrl: string }; error?: { message?: string } };
      if (!response.ok || !payload.data) throw new Error(payload.error?.message ?? "File download is unavailable");
      window.open(payload.data.downloadUrl, "_blank", "noopener,noreferrer");
    } catch (error) { notify(error instanceof Error ? error.message : "File download is unavailable"); }
  }
  useEffect(() => {
    const value = query.trim();
    if (!value) { setSearchItems(null); return; }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void fetch(`/api/search?project=${encodeURIComponent(projectCode)}&q=${encodeURIComponent(value)}`, { credentials: "include", cache: "no-store", signal: controller.signal })
        .then(async (response) => {
          if (!response.ok) throw new Error("Full-text search is unavailable");
          const payload = (await response.json()) as { data?: ApiContainer[] };
          setSearchItems((payload.data ?? []).map(mapApiContainer));
        })
        .catch((error) => { if (error instanceof DOMException && error.name === "AbortError") return; setSearchItems([]); });
    }, 180);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [query, projectCode]);

  const filtered = useMemo(() => {
    const source = searchItems ?? items;
    const baseMatches = (item: Container) => {
    const matchesCde = selectedCde === "All" || item.state === selectedCde;
    const matchesType = typeFilter === "All" || item.type === typeFilter;
    const haystack = `${item.id} ${item.title} ${item.type} ${item.originator} ${item.suitability}`.toLowerCase();
    return matchesCde && matchesType && haystack.includes(query.toLowerCase());
    };
    return source.filter((item) => baseMatches(item) && matchesLibraryFolder(item, libraryFolder));
  }, [items, searchItems, query, selectedCde, typeFilter, libraryFolder]);
  useEffect(() => {
    if (selectedId && filtered.some((item) => item.id === selectedId)) return;
    setSelectedId(filtered[0]?.id ?? "");
  }, [filtered, selectedId]);
  const recentItems = useMemo(() => [...items].sort((a, b) => {
    const aTime = Date.parse(a.updated); const bTime = Date.parse(b.updated);
    return (Number.isFinite(bTime) ? bTime : 0) - (Number.isFinite(aTime) ? aTime : 0);
  }).slice(0, 3), [items]);
  const libraryCounts = useMemo(() => {
    const folders: LibraryFolder[] = [
      "All documents", "Documents", "Project Information", "Design", "Construction", "Commercial", "Handover",
      "Drawings", "Architectural", "Structural", "MEP", "Civil", "Forms", "Internal Shared", "Packages",
      "Incoming", "Outgoing", "Transmittals", "Archived",
    ];
    return folders.reduce((counts, folder) => {
      counts[folder] = items.filter((item) => matchesLibraryFolder(item, folder)).length;
      return counts;
    }, {} as Record<LibraryFolder, number>);
  }, [items]);

  function addAudit(message: string) {
    setAudit((current) => [message, ...current].slice(0, 6));
  }

  function notify(message: string) {
    setNotice(message);
    addAudit(message);
  }

  function selectContainer(id: string) {
    const target = items.find((item) => item.id === id || item.dbId === id || item.revisionId === id);
    setSelectedId(target?.id ?? id);
    setTab("Overview");
    setDrawerOpen(true);
    addAudit(`Opened ${target?.id ?? id}`);
  }

  function folderPathForLabel(value: LibraryFolder): string {
    if (value === "Project Information" || value === "Design" || value === "Construction" || value === "Commercial" || value === "Handover") return `Documents/${value}`;
    if (value === "Architectural" || value === "Structural" || value === "MEP" || value === "Civil") return `Drawings/${value}`;
    return value;
  }

  function openNewSubmission() {
    const current = folderPathForLabel(libraryFolder);
    const option = libraryFolderOptions.find((item) => item.value === current);
    const type = option?.type === "Drawing" ? "Drawing" : option?.type === "Form" ? "Form" : "Document";
    setDraftType(type);
    setDraftLibraryFolder(option?.type === type ? option.value : defaultLibraryFolder(type));
    setDraftTitle("");
    setDraftDiscipline("");
    setModal("new");
  }

  async function moveSelectedDocument() {
    if (!selected.dbId && !selected.draftId) return;
    setMoving(true);
    setMoveError("");
    try {
      const endpoint = selected.draftId
        ? `/api/projects/${encodeURIComponent(projectCode)}/drafts/${encodeURIComponent(selected.draftId)}`
        : `/api/containers/${encodeURIComponent(selected.dbId ?? "")}`;
      const response = await fetch(endpoint, { method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ libraryFolder: moveLibraryFolder }) });
      const payload = (await response.json()) as { error?: { message?: string } };
      if (!response.ok) throw new Error(payload.error?.message ?? "Document could not be moved");
      const nextItems = await loadContainers();
      const moved = nextItems.find((item) => item.dbId === selected.dbId || item.draftId === selected.draftId);
      if (moved) setSelectedId(moved.id);
      const selectedLabel = libraryFolderOptions.find((item) => item.value === moveLibraryFolder)?.label ?? moveLibraryFolder;
      setLibraryFolder(selectedLabel as LibraryFolder);
      setModal(null);
      addAudit(`Moved ${selected.id} to ${selectedLabel}`);
    } catch (error) {
      setMoveError(error instanceof Error ? error.message : "Document could not be moved");
    } finally { setMoving(false); }
  }

  function openLinkedRecords(kind: LinkedRecordKind) {
    setLinkedRecordKind(kind);
    setModal("links");
    addAudit(`Opened ${kind === "all" ? "linked records" : `${kind} records`} for ${selected.id}`);
  }

  async function toggleTag(tag: ProjectTag) {
    if (!selected.dbId) return;
    setTagLoading(true);
    try {
      const assigned = assignedTags.some((current) => current.id === tag.id);
      const response = await fetch(`/api/containers/${selected.dbId}/tags`, {
        method: assigned ? "DELETE" : "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tagId: tag.id }),
      });
      const payload = (await response.json()) as { error?: { message?: string } };
      if (!response.ok) throw new Error(payload.error?.message ?? "Tag update failed");
      setAssignedTags((current) => assigned ? current.filter((item) => item.id !== tag.id) : [...current, tag].sort((a, b) => a.name.localeCompare(b.name)));
      notify(`${assigned ? "Removed" : "Added"} tag ${tag.name}`);
    } catch (error) {
      notify(error instanceof Error ? error.message : "Tag update failed");
    } finally {
      setTagLoading(false);
    }
  }

  async function createTag() {
    const name = newTagName.trim();
    if (!name) return;
    setTagLoading(true);
    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(projectCode)}/tags`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, tagKind: "custom" }) });
      const payload = (await response.json()) as { data?: ProjectTag; error?: { message?: string } };
      if (!response.ok || !payload.data) throw new Error(payload.error?.message ?? "Tag could not be created");
      setAvailableTags((current) => [...current, payload.data!].sort((a, b) => a.name.localeCompare(b.name)));
      setNewTagName("");
      notify(`Created custom tag ${name}`);
    } catch (error) { notify(error instanceof Error ? error.message : "Tag could not be created"); }
    finally { setTagLoading(false); }
  }

  function exportRegister(format: "xlsx" | "pdf" = "xlsx") {
    const params = new URLSearchParams();
    if (query.trim()) params.set("q", query.trim());
    if (selectedCde !== "All") params.set("cdeState", selectedCde);
    if (typeFilter !== "All") params.set("type", typeFilter);
    const href = `/api/projects/${encodeURIComponent(projectCode)}/exports/${format}?${params.toString()}`;
    const anchor = document.createElement("a");
    anchor.href = href;
    anchor.download = `sdm-document-register-${projectCode}.${format}`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    notify(`Downloading ${format.toUpperCase()} register export`);
  }

  async function createDraft() {
    const title = draftTitle.trim() || "New SDM document draft";
    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(projectCode)}/drafts`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          documentTypeCode: draftType === "Drawing" ? "DR" : draftType === "Form" ? "FM" : "DC",
          isDrawing: draftType === "Drawing",
          libraryFolder: draftLibraryFolder,
          isInternal: draftCdeState === "Internal",
          internalCategory: draftCdeState === "Internal" ? draftInternalCategory || "General" : undefined,
          metadata: { source: "sdm_repository", typeCode: draftType === "Drawing" ? "DR" : draftType === "Form" ? "FM" : "DC", disciplineCode: draftDiscipline.trim() || undefined },
        }),
      });
      const payload = (await response.json()) as { data?: { id: string; dueAt?: string }; error?: { message?: string } };
      if (!response.ok) throw new Error(payload.error?.message ?? "Draft could not be saved");
      const draftId = payload.data?.id;
      if (!draftId) throw new Error("Draft was saved without an identifier");

      if (selectedFile) {
        const presignResponse = await fetch(`/api/projects/${encodeURIComponent(projectCode)}/files/presign`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ filename: selectedFile.name, mimeType: selectedFile.type || "application/octet-stream", byteSize: selectedFile.size }),
        });
        const presign = (await presignResponse.json()) as { data?: { fileId: string; uploadUrl: string; headers?: Record<string, string> }; error?: { message?: string } };
        if (!presignResponse.ok || !presign.data) throw new Error(presign.error?.message ?? "File upload could not be prepared");
        const uploadResponse = await fetch(presign.data.uploadUrl, { method: "PUT", headers: presign.data.headers, body: selectedFile });
        if (!uploadResponse.ok) throw new Error("File upload failed");
        const digest = await crypto.subtle.digest("SHA-256", await selectedFile.arrayBuffer());
        const sha256Hex = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
        const completeResponse = await fetch(`/api/projects/${encodeURIComponent(projectCode)}/files/complete`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fileId: presign.data.fileId, sha256Hex }),
        });
        const completed = (await completeResponse.json()) as { error?: { message?: string } };
        if (!completeResponse.ok) throw new Error(completed.error?.message ?? "File upload could not be verified");
        const attachResponse = await fetch(`/api/projects/${encodeURIComponent(projectCode)}/drafts/${draftId}/files`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fileId: presign.data.fileId }),
        });
        const attached = (await attachResponse.json()) as { error?: { message?: string } };
        if (!attachResponse.ok) throw new Error(attached.error?.message ?? "File could not be attached to the draft");
      }
      setDraftTitle("");
      setSelectedFileName("");
      setSelectedFile(null);
      setDraftType("Document");
      setDraftCdeState("WIP");
      setDraftInternalCategory("");
      setModal(null);
      notify(`Draft ${draftId} saved${selectedFile ? " with an attached file" : ""} — no ISO document number allocated`);
    } catch (error) {
      notify(error instanceof Error ? error.message : "Draft could not be saved");
    }
  }

  function updateBatchFile(id: string, patch: Partial<BatchUploadItem>) {
    setBatchFiles((current) => current.map((item) => item.id === id ? { ...item, ...patch } : item));
  }

  function addBatchFiles(fileList: FileList | File[]) {
    const incoming = Array.from(fileList);
    const existing = new Set(batchFiles.map((item) => `${item.file.name}:${item.file.size}:${item.file.lastModified}`));
    const next = [...batchFiles];
    const rejected: string[] = [];
    for (const file of incoming) {
      const kind = batchFileKind(file);
      const key = `${file.name}:${file.size}:${file.lastModified}`;
      if (next.length >= MAX_BATCH_FILES) { rejected.push(`${file.name} (batch limit is ${MAX_BATCH_FILES})`); continue; }
      if (existing.has(key)) { rejected.push(`${file.name} (already selected)`); continue; }
      if (!kind) { rejected.push(`${file.name} (unsupported drawing/model format)`); continue; }
      if (file.size > MAX_BATCH_FILE_BYTES) { rejected.push(`${file.name} (larger than 5 GB)`); continue; }
      if (file.size === 0) { rejected.push(`${file.name} (empty file)`); continue; }
      const selectedBytes = next.reduce((total, item) => total + item.file.size, 0);
      if (selectedBytes + file.size > MAX_BATCH_TOTAL_BYTES) { rejected.push(`${file.name} (combined batch is larger than 50 GB)`); continue; }
      existing.add(key);
      next.push({ id: `${key}:${Math.random().toString(36).slice(2)}`, file, kind, status: "queued", progress: 0 });
    }
    setBatchFiles(next);
    if (rejected.length > 0) notify(`Skipped ${rejected.length} file${rejected.length === 1 ? "" : "s"}: ${rejected.slice(0, 2).join(", ")}${rejected.length > 2 ? ` and ${rejected.length - 2} more` : ""}`);
  }

  async function uploadBatchItem(item: BatchUploadItem): Promise<boolean> {
    updateBatchFile(item.id, { status: "uploading", progress: 2, message: "Preparing secure upload…" });
    try {
      const title = item.file.name.replace(/\.[^.]+$/, "").trim().slice(0, 500) || item.file.name;
      let draftId = item.draftId;
      if (!draftId) {
        const draftResponse = await fetch(`/api/projects/${encodeURIComponent(projectCode)}/drafts`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title, documentTypeCode: item.kind === "bim" ? "BIM" : "DR", isDrawing: true, libraryFolder: batchLibraryFolder, isInternal: batchCdeState === "Internal", internalCategory: batchCdeState === "Internal" ? batchInternalCategory.trim() || "General" : undefined, metadata: { source: "sdm_batch_upload", originalFilename: item.file.name, fileKind: item.kind, disciplineCode: batchDiscipline.trim() || undefined } }),
        });
        const draftPayload = (await draftResponse.json()) as { data?: { id: string }; error?: { message?: string } };
        if (!draftResponse.ok || !draftPayload.data?.id) throw new Error(draftPayload.error?.message ?? "Draft could not be created");
        draftId = draftPayload.data.id;
        updateBatchFile(item.id, { draftId, progress: 8, message: "Preparing file storage…" });
      }

      const presignResponse = await fetch(`/api/projects/${encodeURIComponent(projectCode)}/files/presign`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename: item.file.name, mimeType: item.file.type || "application/octet-stream", byteSize: item.file.size }),
      });
      const presign = (await presignResponse.json()) as { data?: { fileId: string; uploadUrl: string; headers?: Record<string, string> }; error?: { message?: string } };
      if (!presignResponse.ok || !presign.data) throw new Error(presign.error?.message ?? "File upload could not be prepared");
      const fileId = presign.data.fileId;
      updateBatchFile(item.id, { fileId, progress: 10, message: item.draftId ? "Retrying secure upload…" : "Uploading securely…" });
      const uploadUrl = presign.data.uploadUrl;
      const uploadHeaders = presign.data.headers;
      await uploadWithProgress(uploadUrl, uploadHeaders, item.file, (value) => updateBatchFile(item.id, { progress: 10 + Math.round(value * 0.78), message: `Uploading securely… ${value}%` }));

      const completeBody: { fileId: string; sha256Hex?: string } = { fileId };
      if (item.file.size <= BATCH_HASH_LIMIT) {
        const digest = await crypto.subtle.digest("SHA-256", await item.file.arrayBuffer());
        completeBody.sha256Hex = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
      }
      const completeResponse = await fetch(`/api/projects/${encodeURIComponent(projectCode)}/files/complete`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(completeBody) });
      const completePayload = (await completeResponse.json()) as { error?: { message?: string } };
      if (!completeResponse.ok) throw new Error(completePayload.error?.message ?? "File upload could not be verified");
      updateBatchFile(item.id, { progress: 92, message: "Attaching to draft…" });
      const attachResponse = await fetch(`/api/projects/${encodeURIComponent(projectCode)}/drafts/${draftId}/files`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fileId }) });
      const attachPayload = (await attachResponse.json()) as { error?: { message?: string } };
      if (!attachResponse.ok) throw new Error(attachPayload.error?.message ?? "File could not be attached to the draft");
      updateBatchFile(item.id, { status: "complete", progress: 100, message: "Uploaded and attached" });
      return true;
    } catch (error) {
      updateBatchFile(item.id, { status: "error", message: error instanceof Error ? error.message : "Upload failed" });
      return false;
    }
  }

  async function startBatchUpload() {
    if (batchUploading) return;
    if (batchCdeState === "Internal" && !batchInternalCategory.trim()) { notify("Enter an internal category before uploading"); return; }
    const pending = batchFiles.filter((item) => item.status !== "complete");
    if (pending.length === 0) { notify("Select at least one drawing or BIM model"); return; }
    setBatchUploading(true);
    let cursor = 0;
    const worker = async () => {
      let completed = 0;
      while (cursor < pending.length) {
        const item = pending[cursor++];
        if (await uploadBatchItem(item)) completed += 1;
      }
      return completed;
    };
    const completed = (await Promise.all(Array.from({ length: Math.min(3, pending.length) }, () => worker()))).reduce((total, count) => total + count, 0);
    setBatchUploading(false);
    await loadContainers();
    notify(`Batch upload finished — ${completed} completed, ${pending.length - completed} needing attention`);
  }

  async function submitSelected() {
    try {
      if (selected.draftId) {
        const response = await fetch(`/api/projects/${encodeURIComponent(projectCode)}/drafts/${selected.draftId}/submit`, { method: "POST", credentials: "include" });
        const payload = (await response.json()) as { data?: { containerId: string; revisionId: string; revisionCode: string }; error?: { message?: string } };
        if (!response.ok || !payload.data) throw new Error(payload.error?.message ?? "Draft could not be submitted");
        const nextItems = await loadContainers();
        setSelectedId(nextItems.find((item) => item.dbId === payload.data?.containerId)?.id ?? nextItems[0]?.id ?? "");
        addAudit(`Submitted ${payload.data.containerId} with ${payload.data.revisionCode}; workflow signature required`);
        return;
      }
      if (!selected.revisionId) throw new Error("This item has no current revision");
      const createResponse = await fetch(`/api/projects/${encodeURIComponent(projectCode)}/transmittals`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject: selected.title, recipientPartyCode: "CLI", revisionIds: [selected.revisionId] }),
      });
      const created = (await createResponse.json()) as { data?: { id: string; transmittalNumber: string }; error?: { message?: string } };
      if (!createResponse.ok || !created.data) throw new Error(created.error?.message ?? "Transmittal could not be created");
      const sendResponse = await fetch(`/api/projects/${encodeURIComponent(projectCode)}/transmittals/${created.data.id}/send`, { method: "POST", credentials: "include" });
      const sent = (await sendResponse.json()) as { error?: { message?: string } };
      if (!sendResponse.ok) throw new Error(sent.error?.message ?? "Transmittal could not be sent");
      await loadContainers();
      addAudit(`Transmittal ${created.data.transmittalNumber} sent for ${selected.id}`);
    } catch (error) {
      notify(error instanceof Error ? error.message : "Submission failed");
    }
  }

  async function applyDecision(decision: "A" | "C" | "D") {
    try {
      if (!selected.revisionId || !selected.transmittalItemId) throw new Error("A sent transmittal item is required before recording a client response");
      const response = await fetch(`/api/projects/${encodeURIComponent(projectCode)}/client-decisions`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transmittalItemId: selected.transmittalItemId, responseCode: decision }),
      });
      const payload = (await response.json()) as { data?: { responseCode: string }; error?: { message?: string } };
      if (!response.ok || !payload.data) throw new Error(payload.error?.message ?? "Client response could not be recorded");
      await loadContainers();
      addAudit(`Client response ${decision} recorded on ${selected.id}${decision === "A" ? " — Published" : " — RTC path available"}`);
      setModal(null);
    } catch (error) {
      notify(error instanceof Error ? error.message : "Client response failed");
    }
  }

  async function saveMetadata() {
    if (!selected.dbId || !editTitle.trim()) return;
    try {
      const response = await fetch(`/api/containers/${selected.dbId}`, { method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: editTitle.trim() }) });
      const payload = (await response.json()) as { error?: { message?: string } };
      if (!response.ok) throw new Error(payload.error?.message ?? "Metadata could not be saved");
      await loadContainers();
      setModal(null);
      notify(`Metadata saved for ${selected.id}`);
    } catch (error) { notify(error instanceof Error ? error.message : "Metadata could not be saved"); }
  }

  function openRail(label: string) {
    setActiveRail(label);
    // Navigating between rail destinations must close any surface opened by the
    // previous destination. Without this, a modal (for example Workflow setup)
    // can remain above the new view and make the navigation button appear to do
    // nothing.
    setModal(null);
    setProjectOpen(false);
    setNotificationsOpen(false);
    setTasksOpen(false);
    setProfileOpen(false);
    if (label === "Repository") {
      setView("board"); setTab("Overview"); setSelectedCde("All");
    } else if (label === "Home") {
      setView("board"); setTab("Overview"); setSelectedCde("All"); setTypeFilter("All"); setQuery("");
      addAudit("Home workspace opened");
    } else if (label === "Register") {
      setView("register"); setTab("Overview"); setSelectedCde("All"); setQuery("");
      addAudit("Document register opened");
    } else if (label === "Workflows") {
      setView("register"); setSelectedCde("Shared"); setTab("Workflow"); setModal("workflowSetup");
      addAudit("Workflow setup opened");
    } else if (label === "Reviews") {
      setView("register"); setSelectedCde("Shared"); setTab("Workflow");
      addAudit(`${label} queue opened`);
    } else if (label === "People") {
      setModal("people");
    } else if (label === "Settings") {
      setModal("settings");
    } else if (label === "Connections") {
      setModal("connectors");
      addAudit("External drive connections opened");
    } else if (label === "Help") {
      setModal("help");
    }
  }

  async function openEndorsements() {
    if (!selected.revisionId) { notify("This item has no submitted drawing revision"); return; }
    setEndorsementLoading(true);
    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(projectCode)}/revisions/${selected.revisionId}/endorsements`, { credentials: "include", cache: "no-store" });
      const payload = (await response.json()) as { data?: Endorsement[]; error?: { message?: string } };
      if (!response.ok) throw new Error(payload.error?.message ?? "Endorsements could not be loaded");
      setEndorsements(payload.data ?? []);
      setModal("endorsements");
    } catch (error) { notify(error instanceof Error ? error.message : "Endorsements could not be loaded"); }
    finally { setEndorsementLoading(false); }
  }

  async function recordEndorsement(endorsementType: Endorsement["endorsementType"]) {
    if (!selected.revisionId) return;
    setEndorsementLoading(true);
    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(projectCode)}/revisions/${selected.revisionId}/endorsements`, {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endorsementType }),
      });
      const payload = (await response.json()) as { data?: Endorsement; error?: { message?: string } };
      if (!response.ok || !payload.data) throw new Error(payload.error?.message ?? "Endorsement could not be recorded");
      setEndorsements((current) => [...current.filter((item) => item.endorsementType !== endorsementType), payload.data!]);
      addAudit(`${endorsementType} endorsement recorded on ${selected.id}`);
    } catch (error) { notify(error instanceof Error ? error.message : "Endorsement could not be recorded"); }
    finally { setEndorsementLoading(false); }
  }

  async function withdrawEndorsement(endorsementType: Endorsement["endorsementType"]) {
    if (!selected.revisionId) return;
    const label = endorsementLabels[endorsementType];
    if (!window.confirm(`Withdraw ${label} for ${selected.id}? The withdrawal will remain in the audit trail.`)) return;
    setEndorsementLoading(true);
    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(projectCode)}/revisions/${selected.revisionId}/endorsements`, {
        method: "DELETE", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endorsementType }),
      });
      const payload = (await response.json()) as { data?: Endorsement; error?: { message?: string } };
      if (!response.ok || !payload.data) throw new Error(payload.error?.message ?? "Endorsement could not be withdrawn");
      setEndorsements((current) => [...current.filter((item) => item.endorsementType !== endorsementType), payload.data!]);
      addAudit(`${endorsementType} endorsement withdrawn on ${selected.id}`);
    } catch (error) { notify(error instanceof Error ? error.message : "Endorsement could not be withdrawn"); }
    finally { setEndorsementLoading(false); }
  }

  async function markAlertRead(alert: AlertItem) {
    if (alert.readAt) return;
    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(projectCode)}/alerts/${alert.id}`, { method: "PATCH", credentials: "include" });
      if (!response.ok) throw new Error("Alert could not be marked read");
      setAlerts((current) => current.map((item) => item.id === alert.id ? { ...item, readAt: new Date().toISOString() } : item));
      setAlertCount((count) => Math.max(0, count - 1));
    } catch (error) { notify(error instanceof Error ? error.message : "Alert could not be marked read"); }
  }

  async function updateTask(task: TaskItem, status: "in_progress" | "completed") {
    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(projectCode)}/tasks/${task.id}`, { method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
      const payload = (await response.json()) as { data?: { status: string; completedAt: string | null }; error?: { message?: string } };
      if (!response.ok || !payload.data) throw new Error(payload.error?.message ?? "Task could not be updated");
      setTasks((current) => current.map((item) => item.id === task.id ? { ...item, status: payload.data!.status, completedAt: payload.data!.completedAt } : item));
      setTaskCount((count) => status === "completed" && task.status !== "completed" ? Math.max(0, count - 1) : count);
      notify(status === "completed" ? "Task completed" : "Task started");
    } catch (error) { notify(error instanceof Error ? error.message : "Task could not be updated"); }
  }

  function selectProject(code: string) {
    setProjectCode(code);
    setProjectOpen(false);
    setView("board"); setSelectedCde("All"); setQuery(""); setSelectedId("");
    addAudit(`Project ${code} selected`);
  }

  async function submitRequestChanges() {
    const comment = requestComment.trim();
    if (!selected.dbId || !comment) { notify("Add a change request comment before sending"); return; }
    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(projectCode)}/tasks`, {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskType: "request_changes", targetType: "container", targetId: selected.dbId, message: comment }),
      });
      const payload = (await response.json()) as { data?: TaskItem; error?: { message?: string } };
      if (!response.ok || !payload.data) throw new Error(payload.error?.message ?? "Change request could not be sent");
      setTasks((current) => [payload.data!, ...current]);
      setTaskCount((count) => count + 1);
      setModal(null);
      addAudit(`Requested changes on ${selected.id}`);
      notify("Change request sent to the assigned workflow party");
    } catch (error) { notify(error instanceof Error ? error.message : "Change request could not be sent"); }
  }

  return (
    <main className="app-shell">
      <aside className="rail">
        <div className="brand-tile"><img src="/logo-mark-arc.png" alt="COSMOS" /></div>
        <nav className="rail-top">
          <RailItem label="Home" icon={Grid2X2} active={activeRail === "Home"} onClick={() => openRail("Home")} />
          <RailItem label="Repository" icon={Folder} active={activeRail === "Repository"} onClick={() => openRail("Repository")} />
          <RailItem label="Register" icon={FileArchive} active={activeRail === "Register"} onClick={() => openRail("Register")} />
          <RailItem label="Workflows" icon={ClipboardCheck} active={activeRail === "Workflows"} onClick={() => openRail("Workflows")} />
          <RailItem label="Reviews" icon={ShieldCheck} active={activeRail === "Reviews"} onClick={() => openRail("Reviews")} />
          <RailItem label="People" icon={Users} active={activeRail === "People"} onClick={() => openRail("People")} />
        </nav>
        <div className="rail-bottom"><RailItem label="Connections" icon={Plug} active={activeRail === "Connections"} onClick={() => openRail("Connections")} /><RailItem label="Settings" icon={Settings} active={activeRail === "Settings"} onClick={() => openRail("Settings")} /><RailItem label="Help" icon={CircleHelp} onClick={() => openRail("Help")} /></div>
      </aside>

      <section className="main-column">
        <header className="topbar">
          <div className="product-mark"><Folder size={22} /><div><strong>Smart Document Management</strong><span>Project information repository</span></div></div>
          <div className="project-picker"><button className="project-select" onClick={() => { setProjectOpen((open) => !open); setNotificationsOpen(false); setTasksOpen(false); setProfileOpen(false); }} aria-label="Select project">{activeProject?.organizationCode ? `${activeProject.organizationCode} / ` : ""}{activeProject?.code ?? projectCode} — {activeProject?.name ?? "Riverside Development"} <ChevronDown size={14} /></button>{projectOpen && <div className="top-popover project-popover"><strong>Organizations and projects</strong>{projects.length === 0 ? <span>No projects available for this account.</span> : projects.map((project) => <button key={project.code} className={project.code === projectCode ? "notification-read" : ""} onClick={() => selectProject(project.code)}><span>{project.organizationCode ? `${project.organizationCode} / ` : ""}{project.code} — {project.name}</span><small>{project.organizationName ? `${project.organizationName} · ` : ""}{project.organizationRole ? `${project.organizationRole.replaceAll("_", " ")} · ` : ""}{project.status} · {project.timezone}</small></button>)}</div>}</div>
          <div className="global-search"><Search size={16} /><input aria-label="Search SDM" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search documents, packages, document numbers..." /><kbd>⌘ K</kbd></div>
          <div className="top-actions">
            <button className="icon-button" title="Notifications" aria-expanded={notificationsOpen} onClick={() => { setNotificationsOpen((open) => !open); setTasksOpen(false); setProfileOpen(false); setProjectOpen(false); }}><Bell size={17} />{alertCount > 0 && <i>{alertCount}</i>}</button>
            <button className="task-button" onClick={() => { setTasksOpen((open) => !open); setNotificationsOpen(false); setProfileOpen(false); setProjectOpen(false); setView("register"); setSelectedCde("Shared"); setQuery(""); }} aria-expanded={tasksOpen}><ClipboardCheck size={16} /> My Tasks <b>{taskCount}</b></button>
            <button className="avatar" onClick={openProfileMenu} aria-label="Open user menu" aria-expanded={profileOpen}>{(sessionProfile?.displayName ?? "SDM").split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase()}</button>
            <button className="icon-button" title="Open user menu" onClick={openProfileMenu} aria-label="Open user menu" aria-expanded={profileOpen}><ChevronDown size={14} /></button>
            {notificationsOpen && <div className="top-popover"><strong>Notifications</strong>{alerts.length === 0 ? <span>No notifications.</span> : alerts.slice(0, 5).map((alert) => <button key={alert.id} className={alert.readAt ? "notification-read" : ""} onClick={() => { void markAlertRead(alert); if (alert.targetType === "container") selectContainer(alert.targetId); }}><span>{alert.message}</span><small>{formatUpdated(alert.createdAt)}</small></button>)}<button onClick={() => { setNotificationsOpen(false); setView("register"); setSelectedCde("Shared"); }}>Review Shared items <ArrowRight size={13} /></button></div>}
            {tasksOpen && <div className="top-popover"><strong>My Tasks</strong>{tasks.length === 0 ? <span>No open tasks.</span> : tasks.filter((task) => task.status !== "completed").slice(0, 5).map((task) => <button key={task.id} onClick={() => { if (task.targetType === "container" || task.targetType === "revision") selectContainer(task.containerNumber ?? task.targetId); }}><span>{task.targetTitle ?? task.taskType}</span><small>{task.status} {task.dueAt ? `· due ${formatUpdated(task.dueAt)}` : ""}</small><em onClick={(event) => { event.stopPropagation(); void updateTask(task, "completed"); }}>Complete</em></button>)}<button onClick={() => { setTasksOpen(false); setView("register"); setSelectedCde("Shared"); }}>Show review queue <ArrowRight size={13} /></button></div>}
            {profileOpen && <div className="top-popover profile-popover"><strong>{sessionProfile?.displayName ?? "SDM user"}</strong><span>{sessionProfile?.email ?? "Signed-in account"}</span><button onClick={() => { setProfileOpen(false); setModal("profile"); }}>Profile settings</button><button onClick={() => { window.location.assign("/api/auth/oidc/logout"); }}>Sign out</button></div>}
          </div>
        </header>

        <div className="workspace-head">
          <div><div className="eyebrow"><Folder size={12} /> Repository / {projectCode}</div><h1>Smart Document Management</h1><p>Controlled information for the project delivery phase.</p></div>
          <div className="head-actions"><button className="button secondary" onClick={() => setView(view === "board" ? "register" : "board")}><Columns3 size={16} /> {view === "board" ? "Register view" : "CDE board"}</button><button className="button secondary" onClick={() => { setBatchFiles([]); setBatchCdeState("WIP"); setBatchDiscipline(""); setBatchInternalCategory(""); setBatchLibraryFolder(libraryFolderOptions.find((item) => item.value === folderPathForLabel(libraryFolder) && item.type === "Drawing")?.value ?? "Drawings"); setModal("batchUpload"); }}><UploadCloud size={16} /> Batch upload</button><button className="button primary" onClick={openNewSubmission}><Plus size={16} /> New submission <ChevronDown size={14} /></button></div>
        </div>

        <div className="cde-tabs"><div className="eyebrow">COMMON DATA ENVIRONMENT (CDE)</div><div className="tab-group">{["All", "WIP", "Shared", "Published", "Archive"].map((value) => <button key={value} className={selectedCde === value ? "selected" : ""} onClick={() => { setSelectedCde(value as "All" | CdeState); notify(`${value} CDE filter selected`); }}>{value}{value !== "All" && <span>{items.filter((item) => item.state === value).length}</span>}</button>)}</div><div className="filter-wrap"><button className="filter-button" onClick={() => setFilterOpen((open) => !open)} aria-expanded={filterOpen}><SlidersHorizontal size={16} /> Filter{typeFilter !== "All" && <span className="filter-count">1</span>}</button>{filterOpen && <div className="filter-popover"><strong>Filter register</strong><label>Document type<select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value as "All" | Container["type"])}><option>All</option><option>Drawing</option><option>Document</option><option>Form</option><option>Package</option><option>Transmittal</option></select></label><button onClick={() => { setTypeFilter("All"); setFilterOpen(false); notify("Register filters cleared"); }}>Clear filters</button></div>}</div></div>
        {loading && <div className="data-state" role="status">Loading the live document register…</div>}
        {loadError && <div className="data-state error" role="alert"><span>{loadError}</span><button className="button secondary" onClick={() => void loadContainers()}>Retry</button></div>}

        <div className={`content-grid ${drawerOpen ? (drawerExpanded ? "drawer-expanded" : "") : "drawer-closed"}`}>
          <aside className={`library ${libraryCollapsed ? "library-collapsed" : ""}`}>
            {libraryCollapsed ? <button className="library-expand" onClick={() => setLibraryCollapsed(false)} title="Expand library"><ChevronRight size={18} /><span>Library</span></button> : <><div className="library-title"><strong>Library</strong><button className="icon-button" onClick={() => setLibraryCollapsed(true)} title="Collapse library"><ChevronLeft size={16} /></button></div><div className="library-search"><Search size={14} /><input placeholder="Search library" value={query} onChange={(event) => setQuery(event.target.value)} /></div><button className={`tree-root ${libraryFolder === "All documents" ? "selected" : ""}`} onClick={() => { setQuery(""); setTypeFilter("All"); setSelectedCde("All"); setLibraryFolder("All documents"); addAudit("All documents selected"); }}><FolderOpen size={15} /> All documents <CountBadge value={libraryCounts["All documents"]} /></button><TreeSection label="Documents" icon={FileText} selectedFolder={libraryFolder} counts={libraryCounts} items={["Project Information", "Design", "Construction", "Commercial", "Handover"]} onSelect={(label) => { setQuery(""); setTypeFilter("All"); setSelectedCde("All"); setLibraryFolder(label as LibraryFolder); addAudit(`${label} library folder selected`); }} /><TreeSection label="Drawings" icon={FileCheck2} selectedFolder={libraryFolder} counts={libraryCounts} items={["Architectural", "Structural", "MEP", "Civil"]} onSelect={(label) => { setQuery(""); setTypeFilter("All"); setSelectedCde("All"); setLibraryFolder(label as LibraryFolder); addAudit(`${label} library folder selected`); }} /><TreeSection label="Forms" icon={ClipboardList} selectedFolder={libraryFolder} counts={libraryCounts} onSelect={(label) => { setQuery(""); setTypeFilter("All"); setSelectedCde("All"); setLibraryFolder(label as LibraryFolder); addAudit(`${label} library folder selected`); }} /><TreeSection label="Internal Shared" icon={Users} selectedFolder={libraryFolder} counts={libraryCounts} onSelect={(label) => { setQuery(""); setTypeFilter("All"); setSelectedCde("All"); setLibraryFolder(label as LibraryFolder); addAudit(`${label} library folder selected`); }} /><TreeSection label="Packages" icon={Box} selectedFolder={libraryFolder} counts={libraryCounts} items={["Incoming", "Outgoing", "Transmittals", "Archived"]} onSelect={(label) => { setQuery(""); setSelectedCde("All"); setTypeFilter("All"); setLibraryFolder(label as LibraryFolder); addAudit(`${label} library folder selected`); }} /><div className="library-footer"><div><Clock3 size={14} /> Recent</div>{recentItems.length === 0 ? <span className="tag-empty">No recent documents</span> : recentItems.map((item) => <button key={`recent-${item.dbId ?? item.id}`} onClick={() => setQuery(item.id)}>{item.id} · {item.updated}</button>)}</div></>}
          </aside>

          {view === "board" ? <div className="board-area">{filtered.length === 0 && <div className="data-state"><strong>{libraryFolder}</strong><span>No documents found in this folder.</span></div>}{lanes.map((lane) => { const LaneIcon = lane.icon; const laneItems = filtered.filter((item) => item.state === lane.id); return <section className={`lane lane-${lane.tone}`} key={lane.id}><div className="lane-head"><div className="lane-name"><LaneIcon size={17} /><div><strong>{lane.id}</strong><span>{lane.caption}</span></div></div><b>{laneItems.length}</b></div><div className="lane-list">{laneItems.map((item) => <button key={item.id} className={`container-row ${selected.id === item.id ? "selected" : ""}`} onClick={() => selectContainer(item.id)} onDoubleClick={() => { selectContainer(item.id); setDrawerExpanded(true); }}><div className="row-top"><span className="container-id">{item.id}</span><MoreHorizontal size={15} /></div><strong>{item.title}</strong><div className="row-tags"><Badge tone={badgeTone(item.rev)}>{item.rev}</Badge><Badge tone={badgeTone(item.suitability)}>{item.suitability}</Badge><Badge tone={badgeTone(item.response)}>{item.response}</Badge></div><div className="row-meta"><span><IconForType type={item.type} /> {item.type}</span><span>{item.updated}</span><i>{item.assignee}</i></div></button>)}</div><button className="lane-add" onClick={openNewSubmission}><Plus size={15} /> Add to {lane.id}</button></section>; })}</div> : <RegisterView folder={libraryFolder} items={filtered} selectedId={selected.id} onSelect={selectContainer} onOpenMaximized={() => setDrawerExpanded(true)} onExportExcel={() => exportRegister("xlsx")} onDownloadPdf={() => exportRegister("pdf")} />}

          {!drawerOpen && <button className="drawer-reopen" onClick={() => setDrawerOpen(true)}><ChevronLeft size={15} /> Open details</button>}
          {drawerOpen && <aside className={`detail-drawer ${drawerExpanded ? "drawer-expanded" : ""}`} onDoubleClick={(event) => { if (event.target instanceof Element && event.target.closest("button,a,input,select,textarea")) return; setDrawerExpanded((expanded) => !expanded); }} title={drawerExpanded ? "Double-click to restore the details panel" : "Double-click to enlarge the details panel"}>
            <div className="detail-head"><div className="detail-icon"><IconForType type={selected.type} /></div><div><div className="container-id">{selected.id}</div><strong>{selected.title}</strong><span>{selected.type} · Rev {selected.rev}</span></div><button className="icon-button" onClick={(event) => { event.stopPropagation(); setDrawerExpanded((expanded) => !expanded); }} onDoubleClick={(event) => event.stopPropagation()} title={drawerExpanded ? "Restore details panel" : "Enlarge details panel"} aria-label={drawerExpanded ? "Restore details panel" : "Enlarge details panel"} aria-pressed={drawerExpanded}>{drawerExpanded ? <Minimize2 size={16} /> : <Maximize2 size={16} />}</button><button className="icon-button" onClick={(event) => { event.stopPropagation(); setDrawerOpen(false); notify("Details drawer closed"); }} onDoubleClick={(event) => event.stopPropagation()} title="Close details" aria-label="Close details"><X size={17} /></button></div>
            <div className="detail-tabs">{(["Overview", "Workflow", "Revisions", "Links", "Activity"] as Tab[]).map((item) => <button key={item} className={tab === item ? "selected" : ""} onClick={() => setTab(item)}>{item}</button>)}</div>
            {tab === "Overview" && <Overview selected={selected} onBim={() => setModal("bim")} onDecision={() => setModal("decision")} onEdit={() => { setEditTitle(selected.title); setModal("edit"); }} onMove={() => { setMoveLibraryFolder(selected.libraryFolder ?? defaultLibraryFolder(selected.type, selected.type === "Drawing")); setMoveError(""); setModal("move"); }} onEndorsements={() => void openEndorsements()} onLinks={() => openLinkedRecords("all")} onForms={() => openLinkedRecords("form")} onPhotos={() => openLinkedRecords("photo")} files={selectedFiles} onDownloadFile={(file) => void downloadFile(file)} tags={assignedTags} availableTags={availableTags} tagMenuOpen={tagMenuOpen} tagLoading={tagLoading} newTagName={newTagName} onNewTagName={setNewTagName} onCreateTag={() => void createTag()} onToggleTag={(tag) => void toggleTag(tag)} onToggleTagMenu={() => setTagMenuOpen((open) => !open)} />}
            {tab === "Workflow" && <WorkflowPanel projectCode={projectCode} revisionId={selected.revisionId} onComplete={(message) => addAudit(`${message} · ${selected.id}`)} />}
            {tab === "Revisions" && <RevisionPanel selected={selected} projectCode={projectCode} />}
            {tab === "Links" && <LinksPanel onBim={() => setModal("bim")} onLinks={() => openLinkedRecords("all")} onForms={() => openLinkedRecords("form")} onPhotos={() => openLinkedRecords("photo")} />}
            {tab === "Activity" && <ActivityPanel audit={audit} entityId={selected.dbId} projectCode={projectCode} />}
            <div className="drawer-actions"><button className="button secondary" onClick={() => { setRequestComment(""); setModal("requestChanges"); }}><MessageIcon /> Request changes</button><button className="button primary" onClick={() => selected.draftId || selected.response === "Pending" ? void submitSelected() : setModal("decision")}><Send size={15} /> {selected.draftId ? "Submit draft" : selected.response === "Pending" ? "Submit for transmittal" : "Client decision"}<ArrowRight size={14} /></button></div>
          </aside>}
        </div>
      </section>

      {modal === "batchUpload" && <Modal wide title="Batch upload drawings and BIM models" onClose={() => { if (!batchUploading) setModal(null); }}><p className="modal-copy">Upload up to {MAX_BATCH_FILES} drawings or model files at once. Each file is stored privately, malware scanned, and attached to its own WIP draft for review before ISO numbering.</p><div className={`batch-dropzone ${batchDropActive ? "active" : ""}`} role="button" tabIndex={0} aria-label="Choose drawings or BIM models to upload" onClick={() => batchInputRef.current?.click()} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); batchInputRef.current?.click(); } }} onDragOver={(event) => { event.preventDefault(); setBatchDropActive(true); }} onDragLeave={() => setBatchDropActive(false)} onDrop={(event) => { event.preventDefault(); setBatchDropActive(false); addBatchFiles(event.dataTransfer.files); }}><UploadCloud size={24} /><strong>Drop drawings or BIM models here</strong><span>or choose files · IFC, IFCZIP, XKT, RVT, DWG, DXF, DGN, PDF and common image formats · max 5 GB each</span><input ref={batchInputRef} type="file" hidden multiple accept={Object.keys(BATCH_FILE_EXTENSIONS).join(",")} onChange={(event) => { if (event.target.files) addBatchFiles(event.target.files); event.currentTarget.value = ""; }} /></div><div className="form-grid"><label className="field-label">Library folder<select value={batchLibraryFolder} disabled={batchUploading} onChange={(event) => setBatchLibraryFolder(event.target.value)}>{libraryFolderOptions.filter((option) => option.type === "Drawing").map((option) => <option key={option.value} value={option.value}>{option.parent ? `${option.parent} / ${option.label}` : option.label}</option>)}</select></label><label className="field-label">Discipline<input value={batchDiscipline} disabled={batchUploading} onChange={(event) => setBatchDiscipline(event.target.value.toUpperCase())} placeholder="e.g. STR or ARC" /></label><label className="field-label">CDE state<select value={batchCdeState} disabled={batchUploading} onChange={(event) => setBatchCdeState(event.target.value as typeof batchCdeState)}><option>WIP</option><option>Internal</option></select></label>{batchCdeState === "Internal" && <label className="field-label">Internal category<input value={batchInternalCategory} disabled={batchUploading} onChange={(event) => setBatchInternalCategory(event.target.value)} placeholder="e.g. Design coordination" /></label>}</div>{batchFiles.length > 0 ? <div className="batch-file-list" aria-live="polite"><div className="batch-list-head"><strong>{batchFiles.length} selected</strong><button className="button small" disabled={batchUploading} onClick={() => setBatchFiles([])}>Clear</button></div>{batchFiles.map((item) => <div className={`batch-file-row batch-${item.status}`} key={item.id}><div className="batch-file-icon">{item.kind === "bim" ? <Box size={16} /> : <FileCheck2 size={16} />}</div><div className="batch-file-main"><strong title={item.file.name}>{item.file.name}</strong><span>{formatFileSize(item.file.size)} · {item.kind === "bim" ? "BIM model" : "Drawing"}{item.message ? ` · ${item.message}` : ""}</span><div className="batch-progress" role="progressbar" aria-label={`Upload progress for ${item.file.name}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={item.progress}><i style={{ width: `${item.progress}%` }} /></div></div><div className="batch-file-status">{item.status === "complete" ? <CheckCircle2 size={16} /> : item.status === "error" ? <span role="img" aria-label="Upload failed">!</span> : item.status === "uploading" ? <span>{item.progress}%</span> : <Clock3 size={15} />}</div><button className="icon-button" title={`Remove ${item.file.name}`} aria-label={`Remove ${item.file.name}`} disabled={batchUploading || item.status === "uploading"} onClick={() => setBatchFiles((current) => current.filter((entry) => entry.id !== item.id))}><X size={14} /></button></div>)}</div> : <div className="batch-empty">No files selected yet.</div>}<div className="modal-actions"><button className="button secondary" disabled={batchUploading} onClick={() => setModal(null)}>Cancel</button><button className="button primary" disabled={batchUploading || batchFiles.length === 0 || batchFiles.every((item) => item.status === "complete")} onClick={() => void startBatchUpload()}><UploadCloud size={15} /> {batchUploading ? "Uploading…" : `Upload ${batchFiles.filter((item) => item.status !== "complete").length || "files"}`}</button></div></Modal>}
      {modal === "new" && <Modal title="New SDM submission" onClose={() => setModal(null)}><p className="modal-copy">Create a private draft first. No ISO document number is allocated until you submit.</p><label className="field-label">Document title<input autoFocus value={draftTitle} onChange={(event) => setDraftTitle(event.target.value)} placeholder="e.g. Site Logistics Plan" /></label><div className="form-grid"><label className="field-label">Library folder<select value={draftLibraryFolder} onChange={(event) => setDraftLibraryFolder(event.target.value)}>{libraryFolderOptions.filter((option) => option.type === (draftType === "Drawing" ? "Drawing" : draftType === "Form" ? "Form" : "Document")).map((option) => <option key={option.value} value={option.value}>{option.parent ? `${option.parent} / ${option.label}` : option.label}</option>)}</select></label><label className="field-label">Type<select value={draftType} onChange={(event) => { const nextType = event.target.value as typeof draftType; setDraftType(nextType); setDraftLibraryFolder(defaultLibraryFolder(nextType === "Drawing" ? "DR" : nextType === "Form" ? "FM" : "DC", nextType === "Drawing")); }}><option>Document</option><option>Drawing</option><option>Form</option></select></label><label className="field-label">Discipline<input value={draftDiscipline} onChange={(event) => setDraftDiscipline(event.target.value.toUpperCase())} placeholder="e.g. STR or ARC" /></label><label className="field-label">CDE state<select value={draftCdeState} onChange={(event) => setDraftCdeState(event.target.value as typeof draftCdeState)}><option>WIP</option><option>Internal</option></select></label></div>{draftCdeState === "Internal" && <label className="field-label">Internal category<input value={draftInternalCategory} onChange={(event) => setDraftInternalCategory(event.target.value)} placeholder="e.g. Design coordination" /></label>}<button className="upload-box" type="button" onClick={() => fileInputRef.current?.click()}><UploadCloud size={18} /><strong>{selectedFileName || "Drop a file or choose from your computer"}</strong><span>PDF, Office, IFC, DWG, or image · scanned and attached after saving</span><input ref={fileInputRef} type="file" hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) { setSelectedFile(file); setSelectedFileName(file.name); notify(`Selected ${file.name}; save the draft to upload and scan it`); } }} /></button><div className="modal-actions"><button className="button secondary" onClick={() => setModal(null)}>Cancel</button><button className="button primary" onClick={createDraft}><SaveIcon /> Save draft</button></div></Modal>}
      {modal === "bim" && <Modal wide title={`BIM viewer · model revision ${selected.rev}`} onClose={() => setModal(null)}><div className="bim-modal-head"><div><Badge tone="info">BIM viewer</Badge><strong>Stage 1 IFC Package</strong><span>IFC / optimized model source · {selected.rev} · permission checked · {bimCameraMode === "orbit" ? "Orbit camera" : "First person camera"}{bimShowEdges ? " · edges on" : " · edges off"}</span></div><div className="bim-tools"><button className="icon-button" title="Reload model" onClick={() => { setBimReload((value) => value + 1); addAudit(`Reloaded BIM viewer for ${selected.id}`); }}><RefreshCw size={15} /></button><button className="icon-button" title="Viewer settings" onClick={() => setModal("bimSettings")}><SlidersHorizontal size={15} /></button></div></div><div className="bim-viewer-placeholder"><BimViewerSurface key={`${selected.dbId ?? selected.id}-${bimReload}-${bimCameraMode}-${bimShowEdges}`} fileId={selectedFiles.find((file) => file.filename.toLowerCase().endsWith(".xkt") || file.mimeType.includes("xkt"))?.id} projectCode={projectCode} cameraMode={bimCameraMode} showEdges={bimShowEdges} /><div className="bim-viewer-message"><Box size={30} /><strong>BIM renderer surface</strong><span>{selectedFiles.some((file) => file.filename.toLowerCase().endsWith(".xkt") || file.mimeType.includes("xkt")) ? "Authorized model asset found; loading the selected revision." : "Renderer initialized. Attach an authorized IFC or optimized model asset to render the 3D scene."}</span><button className="button primary" onClick={() => { setBimReload((value) => value + 1); addAudit(`Loaded model revision ${selected.id}`); }}><Box size={15} /> Load model revision</button></div></div><div className="bim-footer"><span><ShieldCheck size={14} /> Access inherited from package permissions</span><span><History size={14} /> Viewer opens the selected revision only</span><span><Link2 size={14} /> {selectedFiles.length} revision file{selectedFiles.length === 1 ? "" : "s"}</span></div></Modal>}
      {modal === "bimSettings" && <Modal title="BIM viewer settings" onClose={() => setModal("bim")}><p className="modal-copy">These settings apply to this viewer session and are kept separate from project administration policies.</p><label className="field-label">Camera mode<select value={bimCameraMode} onChange={(event) => setBimCameraMode(event.target.value as typeof bimCameraMode)}><option value="orbit">Orbit</option><option value="firstPerson">First person</option></select></label><label className="field-label"><span><input type="checkbox" checked={bimShowEdges} onChange={(event) => setBimShowEdges(event.target.checked)} /> Show model edges</span></label><div className="modal-actions"><button className="button secondary" onClick={() => setModal("bim")}>Cancel</button><button className="button primary" onClick={() => { setBimReload((value) => value + 1); addAudit(`BIM viewer settings applied for ${selected.id}`); setModal("bim"); }}>Apply</button></div></Modal>}
      {modal === "decision" && <Modal title="Record Client response" onClose={() => setModal(null)}><div className="decision-target"><IconForType type={selected.type} /><div><strong>{selected.id}</strong><span>{selected.title} · current suitability {selected.suitability}</span></div></div><p className="modal-copy">A changes suitability to Published when drawing endorsement rules pass. C or D keeps S3 and opens the RTC path.</p><div className="decision-grid"><button className="decision decision-a" onClick={() => applyDecision("A")}><span>A</span><strong>Accept</strong><small>Publish when eligible</small></button><button className="decision decision-c" onClick={() => applyDecision("C")}><span>C</span><strong>Revise & resubmit</strong><small>RTC + next P-revision</small></button><button className="decision decision-d" onClick={() => applyDecision("D")}><span>D</span><strong>Not accepted</strong><small>RTC + comments</small></button></div></Modal>}
      {modal === "move" && <Modal title={`Move ${selected.title}`} onClose={() => { if (!moving) setModal(null); }}><p className="modal-copy">Choose the controlled library folder for this {selected.type.toLowerCase()}. The move is audited and does not change its CDE state.</p><label className="field-label">Destination folder<select value={moveLibraryFolder} disabled={moving} onChange={(event) => { setMoveLibraryFolder(event.target.value); setMoveError(""); }}>{libraryFolderOptions.filter((option) => option.type === (selected.type === "Drawing" ? "Drawing" : selected.type === "Form" ? "Form" : selected.type === "Package" ? "Package" : selected.type === "Transmittal" ? "Transmittal" : "Document")).map((option) => <option key={option.value} value={option.value}>{option.parent ? `${option.parent} / ${option.label}` : option.label}</option>)}</select></label>{moveError && <div className="data-state error" role="alert">{moveError}</div>}<div className="modal-actions"><button className="button secondary" disabled={moving} onClick={() => setModal(null)}>Cancel</button><button className="button primary" disabled={moving || !moveLibraryFolder} onClick={() => void moveSelectedDocument()}><FolderOpen size={15} /> {moving ? "Moving…" : "Move document"}</button></div></Modal>}
      {modal === "edit" && <Modal title="Edit document details" onClose={() => setModal(null)}><p className="modal-copy">Document numbers, revision codes, suitability, and client responses are controlled fields and cannot be edited here.</p><label className="field-label">Title<input autoFocus value={editTitle} onChange={(event) => setEditTitle(event.target.value)} /></label><div className="modal-actions"><button className="button secondary" onClick={() => setModal(null)}>Cancel</button><button className="button primary" onClick={() => void saveMetadata()}>Save changes</button></div></Modal>}
      {modal === "endorsements" && <Modal title={`Drawing endorsements · ${selected.id}`} onClose={() => setModal(null)}><p className="modal-copy">Endorsements are recorded against the submitted revision and remain in the immutable project audit trail. A recorded endorsement can be withdrawn by the original endorser or a document controller.</p><div className="endorsement-list">{(["IDC", "ICE", "Client"] as const).map((type) => { const item = endorsements.find((endorsement) => endorsement.endorsementType === type); const recorded = item?.status === "endorsed"; const withdrawn = item?.status === "withdrawn"; const canWithdraw = item?.canWithdraw !== false; return <div className="endorsement-row" key={type}><div><strong>{endorsementLabels[type]}</strong><span>{recorded ? `Endorsed by ${item?.endorsedBy ?? "project member"} · ${item?.endorsedAt ? formatUpdated(item.endorsedAt) : ""}` : withdrawn ? "Withdrawn; a new endorsement may be recorded." : "Pending endorsement"}</span></div>{recorded ? <button className="button secondary" disabled={endorsementLoading || !canWithdraw} onClick={() => void withdrawEndorsement(type)}>{canWithdraw ? "Withdraw endorsement" : "Recorded"}</button> : <button className="button secondary" disabled={endorsementLoading} onClick={() => void recordEndorsement(type)}>Record endorsement</button>}</div>; })}</div></Modal>}
      {modal === "links" && <Modal title={`${linkedRecordKind === "all" ? "Linked records" : linkedRecordKind === "form" ? "Form records" : "Photo records"} · ${selected.id}`} onClose={() => setModal(null)}><p className="modal-copy">These references are scoped to the selected revision. Open a linked record directly from the list below.</p><LinkedRecordsPanel projectCode={projectCode} containerId={selected.dbId} revisionId={selected.revisionId} kind={linkedRecordKind} onOpenDocument={(id) => { setModal(null); selectContainer(id); }} /></Modal>}
      {modal === "profile" && <Modal title="Profile settings" onClose={() => setModal(null)}><p className="modal-copy">Your local SDM account is authenticated by the configured identity provider. Profile changes are administered centrally.</p><dl className="meta-grid"><dt>Name</dt><dd>{sessionProfile?.displayName ?? "—"}</dd><dt>Email</dt><dd>{sessionProfile?.email ?? "—"}</dd><dt>Project role</dt><dd>{sessionProfile?.memberships.find((item) => item.projectCode === projectCode)?.roleSlug.replaceAll("_", " ") ?? "—"}</dd><dt>Party</dt><dd>{sessionProfile?.memberships.find((item) => item.projectCode === projectCode)?.partyName ?? "—"}</dd></dl><PasswordChangeForm onNotify={notify} /><div className="modal-actions"><button className="button primary" onClick={() => setModal(null)}>Done</button></div></Modal>}
          {modal === "people" && <Modal wide title={`People · ${activeProject?.name ?? projectCode}`} onClose={() => setModal(null)}><AdminPanel projectCode={projectCode} mode="people" onNotify={notify} onChanged={() => void refreshProjects()} onClose={() => setModal(null)} /></Modal>}
          {modal === "connectors" && <Modal wide title="External drive connections" onClose={() => setModal(null)}><ConnectorPanel projectCode={projectCode} onNotice={notify} /></Modal>}
      {modal === "workflowSetup" && <Modal wide title={`Workflow setup · ${activeProject?.name ?? projectCode}`} onClose={() => setModal(null)}><WorkflowSetupPanel projectCode={projectCode} onNotice={notify} /></Modal>}
      {modal === "settings" && <Modal wide title={`Project setup · ${activeProject?.name ?? projectCode}`} onClose={() => setModal(null)}><AdminPanel projectCode={projectCode} mode="settings" onNotify={notify} onChanged={() => void refreshProjects()} onClose={() => setModal(null)} /></Modal>}
      {modal === "help" && <Modal title="SDM help" onClose={() => setModal(null)}><p className="modal-copy">Select a document to inspect ISO 19650 metadata, files, tags, workflow signatures, revisions, links and the immutable activity trail.</p><div className="help-list"><span><strong>Search</strong>Use the global search to find document numbers, titles and indexed file text.</span><span><strong>Workflow</strong>Open the Workflow tab to review ordered steps and record your assigned signature.</span><span><strong>Security</strong>Internal documents and private files are filtered server-side by project role and party.</span></div><div className="modal-actions"><button className="button primary" onClick={() => setModal(null)}>Close</button></div></Modal>}
      {modal === "requestChanges" && <Modal title={`Request changes · ${selected.id}`} onClose={() => setModal(null)}><p className="modal-copy">Send a traceable request to the assigned workflow party. The request will appear in My Tasks and the audit trail.</p><label className="field-label">Comment<textarea autoFocus value={requestComment} onChange={(event) => setRequestComment(event.target.value)} placeholder="Describe the change required before approval" rows={5} /></label><div className="modal-actions"><button className="button secondary" onClick={() => setModal(null)}>Cancel</button><button className="button primary" disabled={!requestComment.trim() || !selected.dbId} onClick={() => void submitRequestChanges()}><Send size={15} /> Send request</button></div></Modal>}
      {notice && <div className="toast" role="status" aria-live="polite"><span>{notice}</span><button onClick={() => setNotice("")} aria-label="Dismiss notification"><X size={13} /></button></div>}
    </main>
  );
}

function CountBadge({ value }: { value?: number }) {
  return value && value > 0 ? <span>{value}</span> : null;
}

function TreeSection({ label, icon: Icon, items = [], selectedFolder, counts, onSelect }: { label: string; icon: typeof Folder; items?: string[]; selectedFolder?: LibraryFolder; counts: Record<LibraryFolder, number>; onSelect?: (label: string) => void }) {
  return <div className="tree-section"><button className={`tree-root ${selectedFolder === label ? "selected" : ""}`} onClick={() => onSelect?.(label)}><ChevronDown size={13} /><Icon size={15} /> {label} <CountBadge value={counts[label as LibraryFolder]} /></button>{items.map((item) => <button className={`tree-child ${selectedFolder === item ? "selected" : ""}`} key={item} onClick={() => onSelect?.(item)}><Folder size={13} /> {item} <CountBadge value={counts[item as LibraryFolder]} /></button>)}</div>;
}

function RegisterView({ folder, items, selectedId, onSelect, onOpenMaximized, onExportExcel, onDownloadPdf }: { folder: LibraryFolder; items: Container[]; selectedId: string; onSelect: (id: string) => void; onOpenMaximized?: () => void; onExportExcel: () => void; onDownloadPdf: () => void }) {
  const isFilteredFolder = folder !== "All documents";
  return <div className="register-area"><div className="register-head"><div><strong>{isFilteredFolder ? `${folder} folder` : "Document Register"}</strong><span>{items.length > 0 ? `${items.length} visible documents` : `No documents found in ${folder}`}</span></div><div className="register-tools"><button className="button secondary" onClick={onExportExcel}><FileArchive size={15} /> Export Excel</button><button className="button secondary" onClick={onDownloadPdf}><FileText size={15} /> Download PDF</button></div></div>{items.length === 0 ? <div className="data-state"><strong>{folder}</strong><span>No documents found in this folder.</span></div> : <div className="register-table"><div className="register-tr register-th"><span>Document number</span><span>Title</span><span>Type</span><span>Rev</span><span>Suitability</span><span>Client response</span><span>CDE</span><span>Updated</span></div>{items.map((item) => <button className={`register-tr ${item.id === selectedId ? "selected" : ""}`} key={item.id} onClick={() => onSelect(item.id)} onDoubleClick={() => { onSelect(item.id); onOpenMaximized?.(); }}><span className="container-id">{item.id}</span><strong>{item.title}</strong><span><IconForType type={item.type} /> {item.type}</span><span>{item.rev}</span><span><Badge tone={badgeTone(item.suitability)}>{item.suitability}</Badge></span><span><Badge tone={badgeTone(item.response)}>{item.response}</Badge></span><span><Badge tone={badgeTone(item.state)}>{item.state}</Badge></span><span>{item.updated}</span></button>)}</div>}</div>;
}

function Overview({ selected, onBim, onDecision, onEdit, onMove, onEndorsements, onLinks, onForms, onPhotos, files, onDownloadFile, tags, availableTags, tagMenuOpen, tagLoading, newTagName, onNewTagName, onCreateTag, onToggleTag, onToggleTagMenu }: { selected: Container; onBim: () => void; onDecision: () => void; onEdit: () => void; onMove: () => void; onEndorsements: () => void; onLinks: () => void; onForms: () => void; onPhotos: () => void; files: ContainerFile[]; onDownloadFile: (file: ContainerFile) => void; tags: ProjectTag[]; availableTags: ProjectTag[]; tagMenuOpen: boolean; tagLoading: boolean; newTagName: string; onNewTagName: (value: string) => void; onCreateTag: () => void; onToggleTag: (tag: ProjectTag) => void; onToggleTagMenu: () => void }) {
  return <div className="drawer-content"><div className="bim-card"><div className="bim-thumb"><Box size={26} /><span>IFC / model</span></div><div className="bim-card-copy"><strong>BIM model revision {selected.rev}</strong><span>Model source · BIM viewer</span><button onClick={onBim}>Open BIM viewer <ArrowRight size={13} /></button></div></div><div className="detail-section"><div className="section-heading">Key information <span className="section-actions"><button onClick={onMove} disabled={!selected.dbId && !selected.draftId}><FolderOpen size={13} /> Move</button><button onClick={onEdit}><PenLine size={13} /> Edit</button></span></div><dl className="meta-grid"><dt>Document number</dt><dd>{selected.id}</dd><dt>Title</dt><dd>{selected.title}</dd><dt>Type</dt><dd>{selected.type}</dd><dt>Revision</dt><dd>{selected.rev}</dd><dt>Library folder</dt><dd>{selected.libraryFolder ? libraryFolderLabel(selected.libraryFolder) : "Not assigned"}</dd><dt>Suitability</dt><dd><Badge tone={badgeTone(selected.suitability)}>{selected.suitability} — For review and comment</Badge></dd><dt>Client response</dt><dd><Badge tone={badgeTone(selected.response)}>{selected.response}</Badge></dd><dt>Originator</dt><dd>{selected.originator}</dd><dt>Updated</dt><dd>{selected.updated}</dd></dl></div><div className="detail-section"><div className="section-heading">Files <span>{files.length}</span></div>{files.length === 0 ? <span className="tag-empty">No revision files attached</span> : <div className="file-list">{files.map((file) => <button key={`${file.id}-${file.revisionCode}`} onClick={() => onDownloadFile(file)} disabled={file.virusScanStatus !== "clean"}><FileText size={14} /><span><strong>{file.filename}</strong><small>{file.revisionCode} · {file.virusScanStatus === "clean" ? "Available" : "Scan pending"}</small></span><ArrowRight size={13} /></button>)}</div>}</div><div className="detail-section"><div className="section-heading">Tags <button onClick={onToggleTagMenu} disabled={!selected.dbId || tagLoading}>{tagLoading ? "Saving…" : "Manage"}</button></div><div className="tag-list">{tags.length > 0 ? tags.map((tag) => <Badge key={tag.id} tone="info">{tag.name}</Badge>) : <span className="tag-empty">No tags assigned</span>}</div>{tagMenuOpen && <div className="tag-picker"><div className="tag-create"><input value={newTagName} onChange={(event) => onNewTagName(event.target.value)} placeholder="New custom tag" onKeyDown={(event) => { if (event.key === "Enter") onCreateTag(); }} /><button onClick={onCreateTag} disabled={tagLoading || !newTagName.trim()}><Plus size={13} /> Create</button></div>{availableTags.length > 0 ? availableTags.map((tag) => <button key={tag.id} onClick={() => onToggleTag(tag)} disabled={tagLoading} className={tags.some((current) => current.id === tag.id) ? "assigned" : ""}><span>{tag.name}</span>{tags.some((current) => current.id === tag.id) ? <Check size={13} /> : <Plus size={13} />}</button>) : <span className="tag-empty">No project tags available</span>}</div>}</div>{selected.endorsement && <div className="warning"><Info size={16} /><div><strong>Drawing endorsement</strong><span>Before this drawing is issued to the Client, it requires a formal endorsement from the Independent Design Checker (IDC), Independent Checking Engineer (ICE), or Client.</span></div><button onClick={onEndorsements}>View endorsements</button></div>}<div className="detail-section"><div className="section-heading">Linked across related COSMOS functions <button onClick={onLinks}>View linked records <ArrowRight size={13} /></button></div><div className="link-grid"><button onClick={onBim}><FolderOpen size={15} /><span>BIM viewer<small>Open authorized models</small></span><ChevronRight size={14} /></button><button onClick={onForms}><ClipboardList size={15} /><span>Form records<small>Open linked records</small></span><ChevronRight size={14} /></button><button onClick={onPhotos}><Paperclip size={15} /><span>Photo records<small>Open linked records</small></span><ChevronRight size={14} /></button></div></div><button className="inline-decision" onClick={onDecision}><ShieldCheck size={15} /> {selected.response === "Pending" ? "Record Client response" : `Client response ${selected.response}`} <ArrowRight size={14} /></button></div>;
}

type WorkflowStep = {
  stepId: string;
  sequenceNo: number;
  stepKey: string;
  displayName: string;
  required: boolean;
  stepStatus: "pending" | "in_progress" | "signed" | "skipped" | "rejected";
  assignedUserId: string | null;
  assignedPartyId: string | null;
  verificationCode: string | null;
  signedAt: string | null;
  signedBy: string | null;
  assigneeName: string | null;
};

function WorkflowPanel({ revisionId, projectCode = "P001", onComplete }: { revisionId?: string; projectCode?: string; onComplete: (message: string) => void }) {
  const [steps, setSteps] = useState<WorkflowStep[]>([]);
  const [workflowStatus, setWorkflowStatus] = useState("—");
  const [loading, setLoading] = useState(Boolean(revisionId));
  const [error, setError] = useState("");
  const [signing, setSigning] = useState(false);
  const [verificationCode, setVerificationCode] = useState("");

  async function loadWorkflow() {
    if (!revisionId) return;
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(projectCode)}/revisions/${revisionId}/workflow`, { credentials: "include", cache: "no-store" });
      const payload = (await response.json()) as { data?: { status: string; steps: WorkflowStep[] }; error?: { message?: string } };
      if (!response.ok || !payload.data) throw new Error(payload.error?.message ?? "Workflow could not be loaded");
      setWorkflowStatus(payload.data.status);
      setSteps(payload.data.steps);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Workflow could not be loaded");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void loadWorkflow(); }, [revisionId]);

  async function signActiveStep() {
    const active = steps.find((step) => step.stepStatus === "in_progress");
    if (!active || !revisionId) return;
    setSigning(true);
    setError("");
    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(projectCode)}/revisions/${revisionId}/workflow`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stepId: active.stepId }),
      });
      const payload = (await response.json()) as { data?: { verificationCode: string; completed: boolean }; error?: { message?: string } };
      if (!response.ok || !payload.data) throw new Error(payload.error?.message ?? "Signature could not be recorded");
      setVerificationCode(payload.data.verificationCode);
      onComplete(payload.data.completed ? "Workflow completed with verified e-signature" : `${active.displayName} signed with verified e-signature`);
      await loadWorkflow();
    } catch (signError) {
      setError(signError instanceof Error ? signError.message : "Signature could not be recorded");
    } finally {
      setSigning(false);
    }
  }

  if (!revisionId) return <div className="drawer-content"><div className="data-state">This item has no submitted revision workflow yet.</div></div>;
  return <div className="drawer-content"><div className="workflow-status"><span className="pulse" /> {loading ? "Loading workflow" : workflowStatus === "completed" ? "Workflow complete" : "Awaiting assigned review"}</div>{error && <div className="data-state error" role="alert">{error}<button className="button secondary" onClick={() => void loadWorkflow()}>Retry</button></div>}<div className="workflow-list">{steps.map((step) => <div className={`workflow-step ${step.stepStatus === "in_progress" ? "current" : step.stepStatus === "signed" ? "done" : ""}`} key={step.stepId}><div className="step-node">{step.stepStatus === "signed" ? <Check size={14} /> : step.sequenceNo}</div><div><strong>{step.displayName}</strong><span>{step.signedBy ?? step.assigneeName ?? "Unassigned"}</span><small>{step.stepStatus === "signed" ? `Signed ${step.signedAt ? formatUpdated(step.signedAt) : ""}` : step.stepStatus === "in_progress" ? "Current step" : step.stepStatus}</small></div></div>)}</div>{verificationCode && <div className="signature-code"><ShieldCheck size={15} /><span>Verification code <strong>{verificationCode}</strong></span></div>}<button className="button primary full" disabled={signing || !steps.some((step) => step.stepStatus === "in_progress")} onClick={() => void signActiveStep()}><PenLine size={15} /> {signing ? "Recording signature…" : "Sign active step"} <ArrowRight size={14} /></button></div>;
}

function RevisionPanel({ selected, projectCode = "P001" }: { selected: Container; projectCode?: string }) {
  const [revisions, setRevisions] = useState<RevisionRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!selected.dbId) { setRevisions([]); return; }
    let cancelled = false;
    setLoading(true); setError("");
    void fetch(`/api/containers/${encodeURIComponent(selected.dbId)}/revisions`, { credentials: "include", cache: "no-store" })
      .then(async (response) => { const payload = (await response.json()) as { data?: RevisionRecord[]; error?: { message?: string } }; if (!response.ok) throw new Error(payload.error?.message ?? "Revision history could not be loaded"); return payload.data ?? []; })
      .then((data) => { if (!cancelled) setRevisions(data); })
      .catch((revisionError) => { if (!cancelled) { setRevisions([]); setError(revisionError instanceof Error ? revisionError.message : "Revision history could not be loaded"); } })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [selected.dbId, projectCode]);
  if (!selected.dbId) return <div className="drawer-content"><div className="data-state">Select a document to inspect revision history.</div></div>;
  return <div className="drawer-content"><div className="revision-summary"><History size={16} /><div><strong>{selected.rev} is the current revision</strong><span>Revision records are server-authorized and immutable.</span></div></div>{error && <div className="data-state error" role="alert">{error}</div>}{loading ? <div className="data-state">Loading revision history…</div> : revisions.length === 0 ? <div className="data-state">No submitted revisions found.</div> : <div className="revision-line">{revisions.map((revision) => <div className={`revision-item ${revision.isCurrent ? "current" : ""}`} key={revision.id}><span>{revision.revisionCode}</span><div><strong>{revision.isCurrent ? "Current revision" : revision.workflowStatus === "returned" ? "Returned for changes" : revision.workflowStatus === "published" ? "Published to CDE" : "Submitted to CDE"}</strong><small>{formatUpdated(revision.updatedAt)} · {revision.cdeState} · {revision.suitabilityCode} · {revision.fileCount} file{revision.fileCount === 1 ? "" : "s"}{revision.submittedBy ? ` · ${revision.submittedBy}` : ""}</small></div></div>)}</div>}</div>;
}

function LinksPanel({ onBim, onLinks, onForms, onPhotos }: { onBim: () => void; onLinks: () => void; onForms: () => void; onPhotos: () => void }) {
  return <div className="drawer-content"><div className="link-list"><button onClick={onBim}><Box size={16} /><span><strong>BIM viewer</strong><small>Open the authorized model for the selected revision.</small></span><ChevronRight size={15} /></button><button onClick={onPhotos}><Paperclip size={16} /><span><strong>Photo records</strong><small>Open linked photo records for this revision.</small></span><ChevronRight size={15} /></button><button onClick={onForms}><ClipboardList size={16} /><span><strong>Form records</strong><small>Open linked form records for this revision.</small></span><ChevronRight size={15} /></button><button onClick={onLinks}><Link2 size={16} /><span><strong>All linked records</strong><small>Open every linked record for this revision.</small></span><ChevronRight size={15} /></button></div></div>;
}

function LinkedRecordsPanel({ projectCode, containerId, revisionId, kind, onOpenDocument }: {
  projectCode: string;
  containerId?: string;
  revisionId?: string;
  kind: LinkedRecordKind;
  onOpenDocument: (id: string) => void;
}) {
  const [records, setRecords] = useState<LinkedRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!containerId) {
      setRecords([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError("");
    const params = new URLSearchParams({ kind });
    params.set("projectCode", projectCode);
    if (revisionId) params.set("revisionId", revisionId);
    void fetch(`/api/containers/${encodeURIComponent(containerId)}/links?${params.toString()}`, { credentials: "include", cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({})) as { data?: LinkedRecord[]; error?: { message?: string } };
        if (!response.ok) throw new Error(payload.error?.message ?? "Linked records could not be loaded");
        if (!cancelled) setRecords(payload.data ?? []);
      })
      .catch((cause) => {
        if (!cancelled) {
          setRecords([]);
          setError(cause instanceof Error ? cause.message : "Linked records could not be loaded");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [containerId, revisionId, kind, projectCode]);

  if (loading) return <div className="data-state">Loading linked records…</div>;
  if (error) return <div className="data-state error" role="alert">{error}</div>;
  if (!records.length) return <div className="data-state"><strong>No {kind === "all" ? "linked records" : `${kind} records`} found.</strong><span>Nothing is linked to this revision yet.</span></div>;

  return <div className="link-list">{records.map((record) => {
    const Icon = record.kind === "form" ? ClipboardList : record.kind === "photo" ? Paperclip : Link2;
    const label = record.reference ? `${record.title} · ${record.reference}` : record.title;
    const content = <><Icon size={16} /><span><strong>{label}</strong><small>{record.sourceName}{record.revisionCode ? ` · Rev ${record.revisionCode}` : ""}</small></span><ChevronRight size={15} /></>;
    if (record.targetDocumentId) return <button key={record.id} onClick={() => onOpenDocument(record.targetDocumentId!)}>{content}</button>;
    if (record.url) return <a key={record.id} href={record.url} target="_blank" rel="noreferrer">{content}</a>;
    return <div key={record.id} className="link-list-row">{content}</div>;
  })}</div>;
}

function ActivityPanel({ audit, entityId, projectCode = "P001" }: { audit: string[]; entityId?: string; projectCode?: string }) {
  const [events, setEvents] = useState<Array<{ id: string; eventType: string; actorName: string | null; occurredAt: string; payload: Record<string, unknown> }>>([]);
  useEffect(() => {
    if (!entityId) return;
    void fetch(`/api/projects/${encodeURIComponent(projectCode)}/audit?entityType=container&entityId=${encodeURIComponent(entityId)}`, { credentials: "include", cache: "no-store" })
      .then(async (response) => response.ok ? (await response.json() as { data?: typeof events }).data ?? [] : [])
      .then(setEvents)
      .catch(() => setEvents([]));
  }, [entityId, projectCode]);
  return <div className="drawer-content"><div className="activity-list">{events.length > 0 ? events.map((entry) => <div key={entry.id}><span className="activity-dot" /><div><strong>{entry.eventType.replace(/^container(?=[._]|$)/, "document").replace(/[._]+/g, " ")}</strong><small>{formatUpdated(entry.occurredAt)} · {entry.actorName ?? "System"}</small></div></div>) : audit.map((entry, index) => <div key={`${entry}-${index}`}><span className="activity-dot" /><div><strong>{entry}</strong><small>{index === 0 ? "Just now" : `${index * 12} minutes ago`} · Local session event</small></div></div>)}</div></div>;
}

function Modal({ title, onClose, children, wide = false }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  return <div className="modal-backdrop" role="dialog" aria-modal="true"><div className={`modal ${wide ? "modal-wide" : ""}`}><div className="modal-head"><strong>{title}</strong><button className="icon-button" onClick={onClose}><X size={17} /></button></div>{children}</div></div>;
}

const connectorProviders: Array<{ id: ConnectorProvider; label: string; description: string; authMode: "oauth2" | "accessKey" }> = [
  { id: "cosmos_drive", label: "COSMOS Drive", description: "Connect a COSMOS Drive repository as an external source.", authMode: "oauth2" },
  { id: "google_drive", label: "Google Drive", description: "Reference a selected Google Drive folder without copying its authority.", authMode: "oauth2" },
  { id: "sharepoint", label: "SharePoint", description: "Connect a SharePoint site or document library for controlled reference access.", authMode: "oauth2" },
  { id: "onedrive", label: "OneDrive", description: "Reference a controlled OneDrive folder for project information exchange.", authMode: "oauth2" },
  { id: "dropbox", label: "Dropbox", description: "Reference a Dropbox folder while SDM retains the formal register.", authMode: "oauth2" },
  { id: "box", label: "Box", description: "Connect a Box folder for controlled external reference access.", authMode: "oauth2" },
  { id: "s3", label: "S3-compatible storage", description: "Connect a private bucket for external files and model assets.", authMode: "accessKey" },
  { id: "webdav", label: "WebDAV", description: "Connect a private WebDAV endpoint using a secret-manager reference.", authMode: "accessKey" },
];

function ConnectorPanel({ projectCode, onNotice }: { projectCode: string; onNotice: (message: string) => void }) {
  const [configs, setConfigs] = useState<ConnectorConfig[]>([]);
  const [provider, setProvider] = useState<ConnectorProvider>("google_drive");
  const [name, setName] = useState("");
  const [location, setLocation] = useState("");
  const [endpointUrl, setEndpointUrl] = useState("");
  const [credentialRef, setCredentialRef] = useState("");
  const [authMode, setAuthMode] = useState<"oauth2" | "accessKey">("oauth2");
  const [status, setStatus] = useState<ConnectorConfig["status"]>("pending_auth");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function loadConfigs() {
    setLoading(true); setError("");
    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(projectCode)}/connectors`, { credentials: "include", cache: "no-store" });
      const payload = (await response.json()) as { data?: ConnectorConfig[]; error?: { message?: string } };
      if (!response.ok) throw new Error(payload.error?.message ?? "External connections could not be loaded");
      setConfigs(payload.data ?? []);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "External connections could not be loaded"); }
    finally { setLoading(false); }
  }

  useEffect(() => { void loadConfigs(); }, [projectCode]);

  function selectProvider(nextProvider: ConnectorProvider) {
    setProvider(nextProvider);
    const definition = connectorProviders.find((item) => item.id === nextProvider);
    setAuthMode(definition?.authMode ?? "oauth2");
  }

  function editConfig(config: ConnectorConfig) {
    setEditingId(config.id);
    setProvider(config.provider);
    setName(config.name);
    setLocation(config.externalDriveId ?? "");
    setEndpointUrl(config.endpointUrl ?? "");
    setCredentialRef("");
    setAuthMode(config.config?.authMode === "accessKey" ? "accessKey" : "oauth2");
    setStatus(config.status);
  }

  function resetForm() {
    setEditingId(null); setName(""); setLocation(""); setEndpointUrl(""); setCredentialRef(""); setStatus("pending_auth");
  }

  async function saveConfig() {
    const trimmedName = name.trim();
    const trimmedLocation = location.trim();
    if (!trimmedName || !trimmedLocation) { onNotice("Add a connection name and remote drive/site ID before saving"); return; }
    if (status === "ready" && !credentialRef.trim() && !editingId) { onNotice("A credential reference is required before marking a new connection ready"); return; }
    setSaving(true); setError("");
    try {
      const body = { name: trimmedName, provider, status, endpointUrl: endpointUrl.trim() || null, externalDriveId: trimmedLocation, accountLabel: null, config: { authMode }, ...(credentialRef.trim() ? { credentialRef: credentialRef.trim() } : {}) };
      const response = await fetch(`/api/projects/${encodeURIComponent(projectCode)}/connectors${editingId ? `/${encodeURIComponent(editingId)}` : ""}`, { method: editingId ? "PATCH" : "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const payload = (await response.json()) as { data?: ConnectorConfig; error?: { message?: string } };
      if (!response.ok || !payload.data) throw new Error(payload.error?.message ?? "Connection could not be saved");
      setConfigs((current) => editingId ? current.map((item) => item.id === editingId ? payload.data! : item) : [...current, payload.data!].sort((a, b) => a.name.localeCompare(b.name)));
      onNotice(`${connectorProviders.find((item) => item.id === provider)?.label ?? "Drive"} connection saved`);
      resetForm();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Connection could not be saved"); }
    finally { setSaving(false); }
  }

  async function setConfigStatus(config: ConnectorConfig, nextStatus: ConnectorConfig["status"]) {
    setSaving(true); setError("");
    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(projectCode)}/connectors/${encodeURIComponent(config.id)}`, { method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: nextStatus }) });
      const payload = (await response.json()) as { data?: ConnectorConfig; error?: { message?: string } };
      if (!response.ok || !payload.data) throw new Error(payload.error?.message ?? "Connection status could not be updated");
      setConfigs((current) => current.map((item) => item.id === config.id ? payload.data! : item));
      onNotice(`${config.name} ${nextStatus === "disabled" ? "disabled" : "enabled"}`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Connection status could not be updated"); }
    finally { setSaving(false); }
  }

  async function deleteConfig(config: ConnectorConfig) {
    if (!window.confirm(`Remove the ${config.name} external connection?`)) return;
    setSaving(true); setError("");
    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(projectCode)}/connectors/${encodeURIComponent(config.id)}`, { method: "DELETE", credentials: "include" });
      const payload = (await response.json()) as { error?: { message?: string } };
      if (!response.ok) throw new Error(payload.error?.message ?? "Connection could not be removed");
      setConfigs((current) => current.filter((item) => item.id !== config.id));
      if (editingId === config.id) resetForm();
      onNotice(`${config.name} connection removed`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Connection could not be removed"); }
    finally { setSaving(false); }
  }

  const providerDefinition = connectorProviders.find((item) => item.id === provider) ?? connectorProviders[0];
  return <div className="connector-panel"><div className="connector-intro"><div><h3>External drive connections</h3><p>SDM is the project repository. Connections let authorised users reference files held in another drive; they do not replace the controlled SDM register.</p></div><Badge tone="info">Project {projectCode}</Badge></div>{error && <div className="data-state error" role="alert">{error}<button className="button secondary" onClick={() => void loadConfigs()}>Retry</button></div>}<div className="connector-provider-grid">{connectorProviders.map((item) => <button className={`connector-provider ${item.id === provider ? "selected" : ""}`} key={item.id} onClick={() => selectProvider(item.id)}><Cloud size={17} /><span><strong>{item.label}</strong><small>{item.description}</small></span><ChevronRight size={14} /></button>)}</div><div className="connector-editor"><div className="section-heading"><span>{editingId ? "Edit connection" : `Configure ${providerDefinition.label}`}</span><span className="connector-security"><ShieldCheck size={13} /> Secrets stay outside SDM</span></div><div className="form-grid"><label className="field-label">Connection name<input value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Client shared documents" /></label><label className="field-label">Authentication<select value={authMode} onChange={(event) => setAuthMode(event.target.value as "oauth2" | "accessKey")}><option value="oauth2">OAuth 2.0</option><option value="accessKey">Access key / secret reference</option></select></label></div><label className="field-label">Remote drive/site ID<span className="field-hint">Folder ID, SharePoint site/library ID, COSMOS drive ID, or bucket prefix</span><input value={location} onChange={(event) => setLocation(event.target.value)} placeholder={provider === "s3" ? "bucket/prefix" : provider === "sharepoint" ? "site-or-library-id" : "drive-folder-id"} /></label><label className="field-label">Endpoint URL <span className="field-hint">Optional; HTTPS is required outside local development</span><input value={endpointUrl} onChange={(event) => setEndpointUrl(event.target.value)} placeholder={provider === "sharepoint" ? "https://tenant.sharepoint.com/sites/project" : provider === "s3" ? "https://s3.example.com" : "https://provider.example"} /></label><div className="form-grid"><label className="field-label">Credential reference <span className="field-hint">Secret-manager key, never the secret itself</span><input value={credentialRef} onChange={(event) => setCredentialRef(event.target.value)} placeholder="secret/sdm/project-001/google-drive" /></label><label className="field-label">Connection status<select value={status} onChange={(event) => setStatus(event.target.value as ConnectorConfig["status"])}><option value="pending_auth">Pending authorization</option><option value="ready">Ready</option><option value="disabled">Disabled</option><option value="error">Error</option></select></label></div><div className="connector-editor-actions"><button className="button secondary" onClick={resetForm} disabled={saving || (!editingId && !name && !location && !endpointUrl)}>Clear</button><button className="button primary" disabled={saving} onClick={() => void saveConfig()}><Plug size={15} /> {saving ? "Saving…" : "Save connection"}</button></div></div><div className="connector-list"><div className="section-heading"><span>Configured connections</span><span>{configs.length} saved</span></div>{loading ? <div className="data-state">Loading external connections…</div> : configs.length === 0 ? <div className="data-state">No external drives configured for this project.</div> : configs.map((config) => <div className="connector-row" key={config.id}><div className="connector-row-icon"><Cloud size={16} /></div><div><strong>{config.name}</strong><span>{connectorProviders.find((item) => item.id === config.provider)?.label ?? config.provider} · {config.externalDriveId ?? "No drive ID"}</span></div><Badge tone={config.status === "ready" ? "success" : config.status === "error" ? "danger" : "warn"}>{config.status.replace("_", " ")}</Badge><button className="button small secondary" disabled={saving} onClick={() => editConfig(config)}>Edit</button><button className="button small secondary" disabled={saving} onClick={() => void setConfigStatus(config, config.status === "disabled" ? "pending_auth" : "disabled")}>{config.status === "disabled" ? "Enable" : "Disable"}</button><button className="button small secondary" disabled={saving} onClick={() => void deleteConfig(config)}>Remove</button></div>)}</div></div>;
}

function MessageIcon() { return <span className="message-icon">•••</span>; }
function SaveIcon() { return <FileText size={15} />; }

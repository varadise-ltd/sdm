/** Canonical persisted library locations. Dynamic views such as Internal Shared
 * and Archived intentionally do not appear here because they are lifecycle
 * views, not places a document can be moved to. */
export type LibraryFolderType = "Document" | "Drawing" | "Form" | "Package" | "Transmittal";
export type LibraryFolderOption = { value: string; label: string; parent: string | null; type: LibraryFolderType };

export const libraryFolderOptions: LibraryFolderOption[] = [
  { value: "Documents", label: "Documents", parent: null, type: "Document" },
  { value: "Documents/Project Information", label: "Project Information", parent: "Documents", type: "Document" },
  { value: "Documents/Design", label: "Design", parent: "Documents", type: "Document" },
  { value: "Documents/Construction", label: "Construction", parent: "Documents", type: "Document" },
  { value: "Documents/Commercial", label: "Commercial", parent: "Documents", type: "Document" },
  { value: "Documents/Handover", label: "Handover", parent: "Documents", type: "Document" },
  { value: "Drawings", label: "Drawings", parent: null, type: "Drawing" },
  { value: "Drawings/Architectural", label: "Architectural", parent: "Drawings", type: "Drawing" },
  { value: "Drawings/Structural", label: "Structural", parent: "Drawings", type: "Drawing" },
  { value: "Drawings/MEP", label: "MEP", parent: "Drawings", type: "Drawing" },
  { value: "Drawings/Civil", label: "Civil", parent: "Drawings", type: "Drawing" },
  { value: "Forms", label: "Forms", parent: null, type: "Form" },
  { value: "Packages", label: "Packages", parent: null, type: "Package" },
  { value: "Packages/Incoming", label: "Incoming", parent: "Packages", type: "Package" },
  { value: "Packages/Outgoing", label: "Outgoing", parent: "Packages", type: "Package" },
  { value: "Transmittals", label: "Transmittals", parent: null, type: "Transmittal" },
];

const folderSet = new Set(libraryFolderOptions.map((item) => item.value));

export function defaultLibraryFolder(documentTypeCode: string, isDrawing = false): string {
  if (isDrawing) return "Drawings";
  const code = documentTypeCode.trim().toUpperCase();
  if (["FM", "FRM", "FORM", "FORMS"].includes(code)) return "Forms";
  if (["TR", "TX", "TRANSMITTAL", "TRANSMITTALS"].includes(code)) return "Transmittals";
  if (["PK", "PKG", "PACKAGE", "PACKAGES"].includes(code)) return "Packages";
  return "Documents";
}

export function isLibraryFolder(value: unknown): value is string {
  return typeof value === "string" && folderSet.has(value);
}

/** Returns a user-facing validation error, or null when the location is valid. */
export function libraryFolderCompatibilityError(folder: string, documentTypeCode: string, isDrawing = false): string | null {
  if (!isLibraryFolder(folder)) return "libraryFolder must be one of the configured library folders";
  const code = documentTypeCode.trim().toUpperCase();
  const expected = defaultLibraryFolder(code, isDrawing);
  const root = folder.split("/", 1)[0];
  if (isDrawing && root !== "Drawings") return "Drawing records can only be stored in Drawings folders";
  if (!isDrawing && root === "Drawings") return "Only drawing records can be stored in Drawings folders";
  if (["FM", "FRM", "FORM", "FORMS"].includes(code) && root !== "Forms") return "Form records must be stored in Forms";
  if (["TR", "TX", "TRANSMITTAL", "TRANSMITTALS"].includes(code) && root !== "Transmittals") return "Transmittal records must be stored in Transmittals";
  if (["PK", "PKG", "PACKAGE", "PACKAGES"].includes(code) && root !== "Packages") return "Package records must be stored in Packages";
  if (!["FM", "FRM", "FORM", "FORMS", "TR", "TX", "TRANSMITTAL", "TRANSMITTALS", "PK", "PKG", "PACKAGE", "PACKAGES"].includes(code) && ["Forms", "Packages", "Transmittals"].includes(root)) {
    return `Document type ${code || "(unknown)"} cannot be stored in ${root}`;
  }
  // expected is deliberately retained in the function contract for callers
  // that want a future type-specific rule; all ordinary documents can use any
  // Documents subfolder.
  void expected;
  return null;
}

export function libraryFolderLabel(value: string): string {
  return libraryFolderOptions.find((item) => item.value === value)?.label ?? value;
}

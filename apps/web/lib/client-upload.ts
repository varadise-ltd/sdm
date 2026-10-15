export type UploadCheckpoint = {
  fileId?: string;
  uploadUrl?: string;
  headers?: Record<string, string>;
  uploaded?: boolean;
  completed?: boolean;
};

async function postJson(url: string, body: unknown) {
  const response = await fetch(url, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error?.message ?? `Request failed (${response.status})`);
  return payload;
}

/** Keep successful stages so a failed attachment can be retried without another upload. */
export async function attachUpload(projectCode: string, draftId: string, file: File, checkpoint: UploadCheckpoint, onProgress: (percent: number) => void) {
  if (!file.size) throw new Error("Empty files cannot be uploaded");
  if (file.size > 5 * 1024 ** 3) throw new Error("Files must be no larger than 5 GB");
  const base = `/api/projects/${encodeURIComponent(projectCode)}`;
  if (!checkpoint.fileId) {
    const { data } = await postJson(`${base}/files/presign`, { filename: file.name, mimeType: file.type || "application/octet-stream", byteSize: file.size });
    Object.assign(checkpoint, data);
  }
  // Derive the target on every retry, including checkpoints from an older UI.
  checkpoint.uploadUrl = `${base}/files/${encodeURIComponent(checkpoint.fileId!)}/upload`;
  if (!checkpoint.uploaded) {
    await new Promise<void>((resolve, reject) => {
      const request = new XMLHttpRequest();
      request.open("PUT", checkpoint.uploadUrl!);
      request.withCredentials = true;
      Object.entries(checkpoint.headers ?? {}).forEach(([name, value]) => request.setRequestHeader(name, value));
      request.upload.onprogress = (event) => { if (event.lengthComputable) onProgress(Math.round(event.loaded / event.total * 88)); };
      request.onload = () => {
        if (request.status >= 200 && request.status < 300) return resolve();
        let message = `Upload failed (${request.status})`;
        try { message = JSON.parse(request.responseText).error?.message ?? message; } catch { /* Storage may return XML. */ }
        reject(new Error(message));
      };
      request.onerror = () => reject(new Error("Network error during upload. Retry to continue."));
      request.onabort = () => reject(new Error("Upload was cancelled"));
      request.send(file);
    });
    checkpoint.uploaded = true;
  }
  if (!checkpoint.completed) {
    onProgress(90);
    await postJson(`${base}/files/complete`, { fileId: checkpoint.fileId });
    checkpoint.completed = true;
  }
  onProgress(96);
  await postJson(`${base}/drafts/${draftId}/files`, { fileId: checkpoint.fileId });
  onProgress(100);
}

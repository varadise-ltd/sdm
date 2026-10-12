"use client";

import { useEffect, useRef, useState } from "react";

type BimViewerSurfaceProps = {
  assetUrl?: string;
  fileId?: string;
  projectCode?: string;
  cameraMode?: "orbit" | "firstPerson";
  showEdges?: boolean;
};

/** Read-only BIM rendering surface for authorized converted BIM assets. */
export default function BimViewerSurface({ assetUrl, fileId, projectCode = "P001", cameraMode = "orbit", showEdges = true }: BimViewerSurfaceProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewerRef = useRef<{ destroy: () => void } | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "loaded" | "unavailable">("loading");

  useEffect(() => {
    let active = true;

    async function initialize() {
      if (!canvasRef.current) return;
      try {
        let resolvedAssetUrl = assetUrl;
        if (!resolvedAssetUrl && fileId) {
          const response = await fetch(`/api/projects/${encodeURIComponent(projectCode)}/files/${fileId}/download?disposition=inline`, { credentials: "include" });
          const payload = (await response.json()) as { data?: { downloadUrl: string } };
          if (!response.ok || !payload.data) throw new Error("BIM asset is not available");
          resolvedAssetUrl = payload.data.downloadUrl;
        }
        const { Viewer, XKTLoaderPlugin } = await import("@xeokit/xeokit-sdk");
        if (!active || !canvasRef.current) return;
        const viewer = new Viewer({ canvasElement: canvasRef.current, transparent: true });
        const cameraControl = (viewer as unknown as { cameraControl?: { navMode?: string } }).cameraControl;
        if (cameraControl) cameraControl.navMode = cameraMode;
        viewerRef.current = viewer;
        const loader = new XKTLoaderPlugin(viewer);
        if (resolvedAssetUrl) {
          const model = loader.load({ id: "sdm-model-revision", src: resolvedAssetUrl });
          (model as unknown as { on?: (event: string, callback: () => void) => void }).on?.("loaded", () => {
            const scene = (viewer as unknown as { scene?: { objects?: Record<string, { edges?: boolean }> } }).scene;
            if (scene?.objects) Object.values(scene.objects).forEach((object) => { object.edges = showEdges; });
          });
          setStatus("loaded");
        } else {
          setStatus("ready");
        }
      } catch {
        if (active) setStatus("unavailable");
      }
    }

    void initialize();
    return () => {
      active = false;
      viewerRef.current?.destroy();
      viewerRef.current = null;
    };
  }, [assetUrl, fileId, projectCode]);

  return (
    <div className="bim-runtime" aria-label="BIM viewer">
      <canvas ref={canvasRef} className="bim-runtime-canvas" />
      <span className="bim-runtime-status">
        {status === "loaded" ? "Model loaded" : status === "unavailable" ? "Viewer unavailable" : "BIM renderer ready"} · {cameraMode === "orbit" ? "Orbit" : "First person"} · edges {showEdges ? "on" : "off"}
      </span>
    </div>
  );
}

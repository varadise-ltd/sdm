"use client";

import { useEffect, useRef, useState } from "react";
import type { Viewer } from "@xeokit/xeokit-sdk";

type Props = { fileId?: string; projectCode: string; format: "ifc" | "xkt"; cameraMode: "orbit" | "firstPerson"; showEdges: boolean; emptyMessage: string };

export default function BimViewerSurface({ fileId, projectCode, format, cameraMode, showEdges, emptyMessage }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewerRef = useRef<Viewer | null>(null);
  const [status, setStatus] = useState<"loading" | "loaded" | "error">("loading");
  const [message, setMessage] = useState("");
  const [reload, setReload] = useState(0);

  useEffect(() => {
    if (!fileId) return;
    let active = true;
    let viewer: Viewer | undefined;
    const controller = new AbortController();
    setStatus("loading"); setMessage("");
    async function initialize() {
      try {
        const response = await fetch(`/api/projects/${encodeURIComponent(projectCode)}/files/${fileId}/download?disposition=inline`, { credentials: "include", signal: controller.signal });
        const payload = await response.json();
        if (!response.ok || !payload.data?.downloadUrl) throw new Error(payload.error?.message ?? "Model download is unavailable");
        const sdk = await import("@xeokit/xeokit-sdk");
        if (!active || !canvasRef.current) return;
        viewer = new sdk.Viewer({ canvasElement: canvasRef.current, transparent: true });
        viewerRef.current = viewer;
        viewer.cameraControl.navMode = cameraMode;
        viewer.camera.eye = [10, 10, 10]; viewer.camera.look = [0, 0, 0];
        let model;
        if (format === "ifc") {
          const WebIFC = await import("web-ifc");
          const ifcAPI = new WebIFC.IfcAPI();
          ifcAPI.SetWasmPath("/vendor/web-ifc/", true);
          await ifcAPI.Init();
          const source = await fetch(payload.data.downloadUrl, { signal: controller.signal });
          if (!source.ok) throw new Error(`Model download failed (${source.status})`);
          const bytes = await source.arrayBuffer();
          if (!active) return;
          model = new sdk.WebIFCLoaderPlugin(viewer, { WebIFC, IfcAPI: ifcAPI }).load({ id: "sdm-model", ifc: bytes, edges: showEdges });
        } else {
          model = new sdk.XKTLoaderPlugin(viewer).load({ id: "sdm-model", src: payload.data.downloadUrl, edges: showEdges });
        }
        model.on("loaded", () => {
          if (!active || !viewer) return;
          if (!Object.keys(viewer.scene.objects).length) { setMessage("This file contains no renderable model geometry."); setStatus("error"); return; }
          Object.values(viewer.scene.objects).forEach((object) => { object.edges = showEdges; });
          viewer.cameraFlight.jumpTo({ aabb: model.aabb });
          setStatus("loaded");
        });
        model.on("error", (error: unknown) => { if (active) { setMessage(`Model could not be rendered: ${String(error)}`); setStatus("error"); } });
      } catch (error) { if (active) { setMessage(error instanceof Error ? error.message : "Model could not be rendered"); setStatus("error"); } }
    }
    void initialize();
    return () => { active = false; controller.abort(); viewer?.destroy(); viewerRef.current = null; };
  }, [fileId, projectCode, format, reload]);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    viewer.cameraControl.navMode = cameraMode;
    Object.values(viewer.scene.objects).forEach((object) => { object.edges = showEdges; });
  }, [cameraMode, showEdges]);

  return <div className="bim-runtime" aria-label="BIM viewer">
    <canvas ref={canvasRef} className="bim-runtime-canvas" aria-label="3D model" />
    {!fileId || status !== "loaded" ? <div className="bim-runtime-message" role={status === "error" && fileId ? "alert" : "status"}>
      <strong>{!fileId ? emptyMessage : status === "loading" ? "Loading model…" : message}</strong>
      {fileId && status === "error" && <button className="button secondary" onClick={() => setReload((value) => value + 1)}>Retry model</button>}
    </div> : <div className="bim-runtime-status" role="status">Model loaded · {cameraMode === "orbit" ? "Orbit" : "First person"} · edges {showEdges ? "on" : "off"}<button onClick={() => viewerRef.current?.cameraFlight.jumpTo({ aabb: viewerRef.current.scene.aabb })}>Fit model</button></div>}
  </div>;
}

"use client";

import { AlertCircle, Check, ChevronDown, ChevronUp, Plus, Save, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

type WorkflowStep = {
  id: string;
  sequenceNo: number;
  stepKey: string;
  displayName: string;
  required: boolean;
  requiredRoleSlug: string | null;
};
type WorkflowTemplate = {
  id: string;
  slug: string;
  name: string;
  active: boolean;
  createdAt?: string;
  updatedAt?: string;
  steps: WorkflowStep[];
};

const roleOptions = [
  ["contractor_pm", "Contractor PM"],
  ["document_controller", "Document Controller"],
  ["design_consultant", "Design Consultant"],
  ["subcontractor", "Subcontractor"],
  ["supplier", "Supplier"],
  ["client_re_er", "Client / RE / ER"],
] as const;

function messageOf(payload: { error?: { message?: string } | string }) {
  return typeof payload.error === "string" ? payload.error : payload.error?.message ?? "The workflow request failed";
}

export default function WorkflowSetupPanel({ projectCode, onNotice }: { projectCode: string; onNotice?: (message: string) => void }) {
  const [templates, setTemplates] = useState<WorkflowTemplate[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [newName, setNewName] = useState("");
  const [newSlug, setNewSlug] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [stepKey, setStepKey] = useState("");
  const [stepName, setStepName] = useState("");
  const [stepRole, setStepRole] = useState("contractor_pm");
  const [stepRequired, setStepRequired] = useState(true);
  const selected = useMemo(() => templates.find((template) => template.id === selectedId) ?? templates[0], [selectedId, templates]);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(projectCode)}/workflows`, { credentials: "include", cache: "no-store" });
      const payload = (await response.json()) as { data?: WorkflowTemplate[]; error?: { message?: string } | string };
      if (!response.ok || !payload.data) throw new Error(messageOf(payload));
      setTemplates(payload.data);
      setSelectedId((current) => payload.data?.some((template) => template.id === current) ? current : payload.data?.[0]?.id ?? "");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Workflow templates could not be loaded");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { void load(); }, [projectCode]);

  async function request(url: string, init: RequestInit, success: string) {
    setSaving(true);
    setError("");
    try {
      const response = await fetch(url, { ...init, credentials: "include", headers: { "Content-Type": "application/json", ...(init.headers ?? {}) } });
      const payload = (await response.json()) as { data?: unknown; error?: { message?: string } | string };
      if (!response.ok) throw new Error(messageOf(payload));
      onNotice?.(success);
      await load();
      return true;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The workflow request failed");
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function createTemplate() {
    if (!newName.trim() || !newSlug.trim()) return;
    const done = await request(`/api/projects/${encodeURIComponent(projectCode)}/workflows`, { method: "POST", body: JSON.stringify({ name: newName.trim(), slug: newSlug.trim().toLowerCase() }) }, "Workflow template created");
    if (done) { setNewName(""); setNewSlug(""); setShowCreate(false); }
  }
  async function updateTemplate(patch: Record<string, unknown>, success: string) {
    if (!selected) return;
    await request(`/api/projects/${encodeURIComponent(projectCode)}/workflows/${selected.id}`, { method: "PATCH", body: JSON.stringify(patch) }, success);
  }
  async function addStep() {
    if (!selected || !stepKey.trim() || !stepName.trim()) return;
    const done = await request(`/api/projects/${encodeURIComponent(projectCode)}/workflows/${selected.id}/steps`, { method: "POST", body: JSON.stringify({ stepKey: stepKey.trim().toLowerCase(), displayName: stepName.trim(), required: stepRequired, requiredRoleSlug: stepRequired ? stepRole : null }) }, "Workflow step added");
    if (done) { setStepKey(""); setStepName(""); }
  }
  async function patchStep(step: WorkflowStep, patch: Record<string, unknown>) {
    if (!selected) return;
    await request(`/api/projects/${encodeURIComponent(projectCode)}/workflows/${selected.id}/steps/${step.id}`, { method: "PATCH", body: JSON.stringify(patch) }, "Workflow step saved");
  }
  async function removeStep(step: WorkflowStep) {
    if (!selected || !window.confirm(`Delete workflow step “${step.displayName}”?`)) return;
    await request(`/api/projects/${encodeURIComponent(projectCode)}/workflows/${selected.id}/steps/${step.id}`, { method: "DELETE" }, "Workflow step deleted");
  }
  async function moveStep(step: WorkflowStep, direction: -1 | 1) {
    const target = step.sequenceNo + direction;
    if (!selected || target < 1 || target > selected.steps.length) return;
    await patchStep(step, { sequenceNo: target });
  }

  return <section className="setup-panel workflow-setup" aria-label="Workflow setup">
    <div className="setup-panel-head"><div><div className="eyebrow">PROJECT ADMINISTRATION</div><h2>Workflow setup</h2><p>Define the ordered ISO 19650 review and approval steps used for new submissions.</p></div><button className="button primary" onClick={() => setShowCreate((current) => !current)}><Plus size={15} /> New workflow</button></div>
    {error && <div className="data-state error" role="alert"><AlertCircle size={15} /><span>{error}</span><button className="icon-button" onClick={() => setError("")} aria-label="Dismiss error"><X size={14} /></button></div>}
    {showCreate && <div className="setup-create"><label className="field-label">Workflow name<input value={newName} onChange={(event) => setNewName(event.target.value)} placeholder="Formal submission" /></label><label className="field-label">Slug<input value={newSlug} onChange={(event) => setNewSlug(event.target.value)} placeholder="formal_submission" /></label><button className="button primary" disabled={saving || !newName.trim() || !newSlug.trim()} onClick={() => void createTemplate()}><Save size={14} /> Create</button></div>}
    {loading ? <div className="data-state">Loading workflow templates…</div> : templates.length === 0 ? <div className="data-state">No workflow templates configured. Create one to enable controlled submissions.</div> : <div className="workflow-setup-grid"><div className="setup-template-list"><strong>Templates</strong>{templates.map((template) => <button key={template.id} className={`setup-template ${template.id === selected?.id ? "selected" : ""}`} onClick={() => setSelectedId(template.id)}><span><strong>{template.name}</strong><small>{template.slug}</small></span>{template.active && <span className="setup-active"><Check size={12} /> Active</span>}</button>)}</div>{selected && <div className="setup-editor"><div className="setup-editor-head"><div><h3>{selected.name}</h3><span className="setup-slug">{selected.slug}</span></div><div className="setup-editor-actions"><button className="button secondary" disabled={saving} onClick={() => void updateTemplate({ active: !selected.active }, selected.active ? "Workflow deactivated" : "Workflow activated")}><Check size={14} /> {selected.active ? "Deactivate" : "Activate"}</button><button className="icon-button" title="Reload templates" onClick={() => void load()}><Save size={15} /></button></div></div><div className="setup-meta"><label className="field-label">Name<input value={selected.name} onChange={(event) => setTemplates((current) => current.map((template) => template.id === selected.id ? { ...template, name: event.target.value } : template))} onBlur={() => void updateTemplate({ name: selected.name }, "Workflow name saved")} /></label><label className="field-label">Slug<input value={selected.slug} onChange={(event) => setTemplates((current) => current.map((template) => template.id === selected.id ? { ...template, slug: event.target.value } : template))} onBlur={() => void updateTemplate({ slug: selected.slug }, "Workflow slug saved")} /></label></div><div className="setup-steps-head"><div><h3>Ordered steps</h3><span>{selected.steps.length} configured step{selected.steps.length === 1 ? "" : "s"}</span></div></div><div className="setup-step-list">{selected.steps.map((step, index) => <div className="setup-step" key={step.id}><span className="setup-step-number">{step.sequenceNo}</span><div className="setup-step-fields"><input aria-label={`Step ${step.sequenceNo} key`} defaultValue={step.stepKey} onBlur={(event) => { if (event.target.value.trim() && event.target.value.trim() !== step.stepKey) void patchStep(step, { stepKey: event.target.value.trim().toLowerCase() }); }} /><input aria-label={`Step ${step.sequenceNo} name`} defaultValue={step.displayName} onBlur={(event) => { if (event.target.value.trim() && event.target.value.trim() !== step.displayName) void patchStep(step, { displayName: event.target.value.trim() }); }} /><select aria-label={`Step ${step.sequenceNo} role`} defaultValue={step.requiredRoleSlug ?? ""} onChange={(event) => void patchStep(step, { requiredRoleSlug: event.target.value || null })}>{roleOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><label className="setup-required"><input type="checkbox" defaultChecked={step.required} onChange={(event) => void patchStep(step, { required: event.target.checked, requiredRoleSlug: event.target.checked ? (step.requiredRoleSlug ?? "contractor_pm") : null })} /> Required</label></div><div className="setup-step-actions"><button className="icon-button" disabled={saving || index === 0} title="Move up" onClick={() => void moveStep(step, -1)}><ChevronUp size={14} /></button><button className="icon-button" disabled={saving || index === selected.steps.length - 1} title="Move down" onClick={() => void moveStep(step, 1)}><ChevronDown size={14} /></button><button className="icon-button danger" disabled={saving} title="Delete step" onClick={() => void removeStep(step)}><Trash2 size={14} /></button></div></div>)}</div><div className="setup-add-step"><input value={stepKey} onChange={(event) => setStepKey(event.target.value)} placeholder="step_key" aria-label="New step key" /><input value={stepName} onChange={(event) => setStepName(event.target.value)} placeholder="Step display name" aria-label="New step display name" /><select value={stepRole} onChange={(event) => setStepRole(event.target.value)} aria-label="New step role">{roleOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><label className="setup-required"><input type="checkbox" checked={stepRequired} onChange={(event) => setStepRequired(event.target.checked)} /> Required</label><button className="button primary" disabled={saving || !stepKey.trim() || !stepName.trim()} onClick={() => void addStep()}><Plus size={14} /> Add step</button></div></div>}</div>}
  </section>;
}


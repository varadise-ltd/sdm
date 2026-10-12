// AppDesign.jsx — Vibe Coding workspace: AI chat + live preview
const AD_TABS = [
  { id: 'design',   label: 'Design',          icon: 'wand-2' },
  { id: 'data',     label: 'Data Management', icon: 'plug' },
  { id: 'workflow', label: 'Workflow',        icon: 'git-branch' },
  { id: 'access',   label: 'Access',          icon: 'user-check' },
  { id: 'monitor',  label: 'Monitoring',      icon: 'activity' },
  { id: 'version',  label: 'Version',         icon: 'history' },
  { id: 'settings', label: 'Settings',        icon: 'settings' },
];

const AD_CHAT_HISTORY = [
  { role: 'system', text: 'Blueprint accepted. Generating Safety Inspection Tracker · v1.2', ts: '2h ago', icon: 'sparkles' },
  { role: 'user',   text: 'Add a mini-trend sparkline inside the Critical Flags KPI. Turn it red when the last value is higher than the week average.', ts: '1h ago' },
  { role: 'assistant', text: "Added. Sparkline uses last 7 days of critical_flags aggregated by day. Threshold logic: renders in --v-danger when current > 7d avg × 1.2.", ts: '1h ago', icon: 'sparkles',
    edits: [
      { file: 'KPICard.jsx', kind: 'modified', hint: '+18 lines' },
      { file: 'queries/critical_flags.sql', kind: 'added', hint: 'new query' },
    ]},
  { role: 'user', text: 'Great. Also: the Recent Inspections table should let me click a row and open the inspection detail modal.', ts: 'just now' },
];

const AppDesign = ({ goto }) => {
  const [tab, setTab] = React.useState('design');
  const [prompt, setPrompt] = React.useState('');
  const [messages, setMessages] = React.useState(AD_CHAT_HISTORY);
  const [thinking, setThinking] = React.useState(false);

  React.useEffect(() => {
    // Kick off the "just now" reply on load
    const t = setTimeout(() => {
      setThinking(true);
      setTimeout(() => {
        setThinking(false);
        setMessages(m => [...m, {
          role: 'assistant',
          text: "Wired row click on Recent Inspections. Opens a right-side detail panel with the full form, findings, and signature. Would you like it as a full-screen modal instead?",
          ts: 'just now',
          icon: 'sparkles',
          edits: [
            { file: 'InspectionRow.jsx', kind: 'modified', hint: '+9 lines' },
            { file: 'InspectionDetail.jsx', kind: 'added', hint: 'new component' },
            { file: 'routes.js', kind: 'modified', hint: '+2 routes' },
          ],
        }]);
      }, 1800);
    }, 400);
    return () => clearTimeout(t);
  }, []);

  const send = () => {
    if (!prompt.trim()) return;
    setMessages(m => [...m, { role: 'user', text: prompt, ts: 'now' }]);
    setPrompt('');
    setThinking(true);
    setTimeout(() => {
      setThinking(false);
      setMessages(m => [...m, {
        role: 'assistant', icon: 'sparkles', ts: 'now',
        text: "Applied. Change is live in the preview. Version snapshot v1.3-draft created — publish when ready.",
      }]);
    }, 1400);
  };

  if (tab === 'data')    return <DataMgmt embed goto={goto} onTab={setTab} activeTab={tab} />;
  if (tab === 'monitor') return <Monitoring embed goto={goto} onTab={setTab} activeTab={tab} />;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', minHeight: 0 }}>
      <ScreenHeader
        crumbs={['My Apps', 'Safety Inspection Tracker']}
        title="Safety Inspection Tracker"
        subtitle="v1.2 · last modified 3h ago by K. Lam"
        actions={
          <>
            <VButton icon="arrow-left" onClick={() => goto('myapps')}>Back</VButton>
            <VButton icon="eye">Preview</VButton>
            <VButton icon="git-branch" onClick={() => goto('blueprint')}>Open Blueprint</VButton>
            <VButton icon="pause-circle">Unpublish</VButton>
            <VButton variant="primary" icon="rocket">Publish v1.3</VButton>
          </>
        }
        tabs={AD_TABS}
        activeTab={tab}
        onTab={setTab}
      />

      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '420px 1fr', minHeight: 0 }}>
        {/* LEFT: AI Chat */}
        <div style={{
          borderRight: '1px solid #E6E8EC', background: '#FFFFFF',
          display: 'flex', flexDirection: 'column', minHeight: 0,
        }}>
          <div style={{
            padding: '12px 16px', borderBottom: '1px solid #E6E8EC',
            display: 'flex', alignItems: 'center', gap: 8, background: '#FAFAFB',
          }}>
            <i data-lucide="sparkles" style={{ width: 14, height: 14, color: '#20668F' }} />
            <div style={{ fontSize: 12, fontWeight: 600, color: '#1B202D' }}>AI Vibe Coding</div>
            <div style={{ marginLeft: 'auto', fontSize: 11, color: '#667085' }}>Session · 4 changes</div>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
            {messages.map((m, i) => <ChatMessage key={i} msg={m} />)}
            {thinking && <ThinkingMsg />}
          </div>

          <div style={{ borderTop: '1px solid #E6E8EC', padding: 12, background: '#FAFAFB' }}>
            <div style={{
              background: '#FFFFFF', border: '1px solid #E6E8EC', borderRadius: 12,
              padding: 10, display: 'flex', flexDirection: 'column', gap: 8,
            }}>
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
                placeholder="Ask AppOS to change something — layout, data binding, workflow…"
                style={{
                  width: '100%', border: 'none', outline: 'none', resize: 'none',
                  fontSize: 13, color: '#1B202D', lineHeight: 1.5, minHeight: 44,
                  background: 'transparent',
                }}
              />
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', gap: 6 }}>
                  <ToolChip icon="at-sign" label="Reference element" />
                  <ToolChip icon="database" label="Add data" />
                </div>
                <button onClick={send} disabled={!prompt.trim()}
                  style={{
                    padding: '6px 10px', borderRadius: 8,
                    background: prompt.trim() ? '#20668F' : '#EEF1F4',
                    color: prompt.trim() ? '#FFFFFF' : '#9AA1AE',
                    fontSize: 12, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4,
                    cursor: prompt.trim() ? 'pointer' : 'not-allowed',
                  }}>
                  Send <i data-lucide="arrow-up" style={{ width: 12, height: 12 }} />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT: Live preview */}
        <div style={{ background: '#F3F4F1', padding: 20, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <VPill variant="info" icon="eye">preview</VPill>
              <div style={{ fontSize: 12, color: '#4B5361' }}>Draft v1.3 · autosaved</div>
            </div>
            <SegBtn options={[
              { id: 'desktop', label: 'Desktop', icon: 'monitor' },
              { id: 'tablet',  label: 'Tablet',  icon: 'tablet' },
              { id: 'mobile',  label: 'Mobile',  icon: 'smartphone' },
            ]} value="desktop" onChange={() => {}} />
          </div>
          <div style={{
            background: '#FFFFFF', border: '1px solid #E6E8EC', borderRadius: 16,
            overflow: 'hidden', flex: 1, boxShadow: '0 1px 2px rgba(15,23,42,0.04)',
          }}>
            <MockAppShell />
          </div>
        </div>
      </div>
    </div>
  );
};

const ChatMessage = ({ msg }) => {
  if (msg.role === 'user') return (
    <div style={{
      display: 'flex', gap: 10, marginBottom: 14, alignItems: 'flex-start',
      flexDirection: 'row-reverse',
    }}>
      <div style={{ width: 24, height: 24, borderRadius: 999, background: '#3167E3', color: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, flexShrink: 0 }}>KL</div>
      <div style={{
        background: '#F3F4F1', border: '1px solid #E6E8EC', borderRadius: 12,
        padding: '10px 12px', maxWidth: '82%',
        fontSize: 13, color: '#1B202D', lineHeight: 1.5,
      }}>
        {msg.text}
        <div style={{ fontSize: 10, color: '#9AA1AE', marginTop: 4 }}>{msg.ts}</div>
      </div>
    </div>
  );
  return (
    <div style={{ display: 'flex', gap: 10, marginBottom: 14, alignItems: 'flex-start' }}>
      <div style={{ width: 24, height: 24, borderRadius: 8, background: '#0F172A', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <CosmosMark size={13} color="#FFFFFF" />
      </div>
      <div style={{ flex: 1 }}>
        <div style={{
          background: '#FFFFFF', border: '1px solid #E6E8EC', borderRadius: 12,
          padding: '10px 12px', fontSize: 13, color: '#1B202D', lineHeight: 1.5,
        }}>
          {msg.text}
          {msg.edits && (
            <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 4 }}>
              {msg.edits.map((e, i) => (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '6px 10px', borderRadius: 6,
                  background: e.kind === 'added' ? '#E7F5EC' : '#F3F4F1',
                  border: `1px solid ${e.kind === 'added' ? '#B7DFC2' : '#E6E8EC'}`,
                  fontSize: 11,
                }}>
                  <i data-lucide={e.kind === 'added' ? 'file-plus' : 'file-diff'} style={{ width: 12, height: 12, color: e.kind === 'added' ? '#17803D' : '#4B5361' }} />
                  <span style={{ fontFamily: 'JetBrains Mono, monospace', color: '#1B202D', fontWeight: 500 }}>{e.file}</span>
                  <span style={{ color: '#667085', marginLeft: 'auto' }}>{e.hint}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        <div style={{ fontSize: 10, color: '#9AA1AE', marginTop: 4 }}>AppOS · {msg.ts}</div>
      </div>
    </div>
  );
};

const ThinkingMsg = () => (
  <div style={{ display: 'flex', gap: 10, marginBottom: 14, alignItems: 'flex-start' }}>
    <div style={{ width: 24, height: 24, borderRadius: 8, background: '#0F172A', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      <CosmosMark size={13} color="#FFFFFF" />
    </div>
    <div style={{
      background: '#FFFFFF', border: '1px solid #E6E8EC', borderRadius: 12,
      padding: '10px 14px', fontSize: 12, color: '#4B5361',
      display: 'flex', alignItems: 'center', gap: 6,
    }}>
      <span style={{ width: 6, height: 6, borderRadius: 999, background: '#20668F', animation: 'cos-pulse 1s ease-in-out infinite' }} />
      <span style={{ width: 6, height: 6, borderRadius: 999, background: '#20668F', animation: 'cos-pulse 1s ease-in-out .2s infinite' }} />
      <span style={{ width: 6, height: 6, borderRadius: 999, background: '#20668F', animation: 'cos-pulse 1s ease-in-out .4s infinite' }} />
      Applying change…
    </div>
  </div>
);

window.AppDesign = AppDesign;

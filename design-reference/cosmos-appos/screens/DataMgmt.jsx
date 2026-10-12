// DataMgmt.jsx — Data Management tab (works standalone or embedded in App Design)
const DM_REQUIRED = [
  { name: 'Safety Inspection Forms', purpose: 'Source of inspection records',           status: 'Connected',   tone: 'success' },
  { name: 'Personnel Roster',        purpose: 'Inspector identity & signature routing', status: 'Connected',   tone: 'success' },
  { name: 'Sites & Zones',           purpose: 'Site hierarchy for filtering',           status: 'Connected',   tone: 'success' },
  { name: 'Maintenance Records',     purpose: 'Cross-reference with recent maintenance',status: 'Missing',     tone: 'danger' },
  { name: 'Alert Events',            purpose: 'Trigger critical-flag notifications',    status: 'Mock Data',   tone: 'warn' },
];

const DM_INPUTS = [
  { name: 'safety_inspection_forms', source: 'Form Hub',      type: 'Real Data', updated: '12m ago', status: 'success' },
  { name: 'personnel_roster',        source: 'Workforce Hub', type: 'Real Data', updated: '2h ago',  status: 'success' },
  { name: 'sites_zones',             source: 'Asset Hub',     type: 'Real Data', updated: '1d ago',  status: 'success' },
  { name: 'mock_alert_events',       source: 'Mock Generator',type: 'Mock',      updated: 'Live',    status: 'warn' },
];

const DM_APIS = [
  { name: 'Safety Score API',       desc: 'Provides per-site rolling 7-day safety score.',           method: 'GET',  path: '/api/apps/safety/score' },
  { name: 'Critical Findings API',  desc: 'Streams unresolved critical findings.',                   method: 'GET',  path: '/api/apps/safety/critical' },
  { name: 'Work Order Trigger API', desc: 'Creates a work order when a critical flag is confirmed.', method: 'POST', path: '/api/apps/safety/work-order' },
  { name: 'Inspection Report API',  desc: 'Returns PDF report for a given inspection_id.',           method: 'GET',  path: '/api/apps/safety/report/:id' },
];

const DM_HEALTH = [
  { label: 'Data Freshness',      value: 'On schedule', tone: 'success', icon: 'clock',       detail: 'All feeds ≤ 15min stale' },
  { label: 'Missing Rate',        value: '0.8%',        tone: 'success', icon: 'target',      detail: 'Below 2% threshold' },
  { label: 'Schema Consistency',  value: 'Stable',      tone: 'success', icon: 'shield-check',detail: 'No changes in 14d' },
  { label: 'API Availability',    value: '99.94%',      tone: 'success', icon: 'server',      detail: 'Last downtime: 6d ago' },
  { label: 'Permission Status',   value: '1 warning',   tone: 'warn',    icon: 'key-round',   detail: 'Inspector role missing on BLD-B' },
];

const DataMgmt = ({ embed, goto, onTab, activeTab }) => {
  const content = (
    <div style={{ padding: '20px 28px', display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Three ways to connect */}
      <div style={{
        background: 'linear-gradient(135deg, #0F172A 0%, #20668F 100%)',
        color: '#FFFFFF', borderRadius: 16, padding: 24,
        position: 'relative', overflow: 'hidden',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, textTransform: 'uppercase', letterSpacing: '.08em', fontWeight: 700, marginBottom: 8, opacity: 0.8 }}>
          <i data-lucide="sparkles" style={{ width: 12, height: 12 }} />
          Three Ways to Connect Data
        </div>
        <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700, letterSpacing: '-0.01em' }}>Wire your app to real data — however you like.</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginTop: 20 }}>
          <ConnectMethod
            num="1" title="Manual Mapping"
            desc="Browse the Data Hub, pick fields, map them to your app's data requirements."
            cta="Browse Data Hub"
            icon="pointer"
            onClick={() => goto('hub')}
          />
          <ConnectMethod
            num="2" title="Ask AI to Find Data"
            desc={`Just say "I need equipment health, recent maintenance, and abnormal events." AppOS will match Hubs.`}
            cta="Ask AppOS"
            icon="sparkles"
            highlight
          />
          <ConnectMethod
            num="3" title="Create Mock Data"
            desc="Skip integration. Generate a complete mock data set so the app runs immediately."
            cta="Generate Mock Data"
            icon="beaker"
          />
        </div>
      </div>

      {/* Required Data */}
      <Section title="Required Data" hint="What this app needs to function.">
        <div style={{ background: '#FFFFFF', border: '1px solid #E6E8EC', borderRadius: 12, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#FAFAFB', color: '#667085', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.04em' }}>
                <th style={dmTh}>Required Data</th>
                <th style={dmTh}>Purpose</th>
                <th style={dmTh}>Status</th>
                <th style={{ ...dmTh, textAlign: 'right' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {DM_REQUIRED.map((r, i) => (
                <tr key={i} style={{ borderTop: '1px solid #F0F2F5' }}>
                  <td style={{ ...dmTd, fontWeight: 600, color: '#1B202D' }}>{r.name}</td>
                  <td style={{ ...dmTd, color: '#4B5361' }}>{r.purpose}</td>
                  <td style={dmTd}><VPill variant={r.tone} dot>{r.status.toLowerCase()}</VPill></td>
                  <td style={{ ...dmTd, textAlign: 'right' }}>
                    {r.tone === 'success' && <button style={{ fontSize: 12, color: '#20668F', fontWeight: 600 }}>View mapping →</button>}
                    {r.tone === 'danger'  && <button style={{ fontSize: 12, color: '#C0362C', fontWeight: 600 }}>Connect data →</button>}
                    {r.tone === 'warn'    && <button style={{ fontSize: 12, color: '#B27D3A', fontWeight: 600 }}>Switch to real →</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      {/* Current Data Inputs */}
      <Section title="Current Data Inputs" hint="Live sources feeding the app right now.">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
          {DM_INPUTS.map((inp, i) => (
            <div key={i} style={{
              background: '#FFFFFF', border: '1px solid #E6E8EC', borderRadius: 10,
              padding: 14, display: 'flex', alignItems: 'center', gap: 12,
            }}>
              <div style={{
                width: 36, height: 36, borderRadius: 8,
                background: inp.status === 'warn' ? '#FBF1DE' : '#E7EEF4',
                color: inp.status === 'warn' ? '#B27D3A' : '#20668F',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <i data-lucide={inp.type === 'Mock' ? 'beaker' : 'plug'} style={{ width: 16, height: 16 }} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#1B202D', fontFamily: 'JetBrains Mono, monospace' }}>{inp.name}</div>
                <div style={{ fontSize: 11, color: '#667085', marginTop: 2 }}>{inp.source} · {inp.type} · updated {inp.updated}</div>
              </div>
              <VPill variant={inp.status === 'warn' ? 'warn' : 'success'} dot>{inp.status === 'warn' ? 'mock' : 'live'}</VPill>
            </div>
          ))}
        </div>
      </Section>

      {/* App Output APIs */}
      <Section title="App Output APIs" hint="Endpoints exposed by this app to the rest of COSMOS.">
        <div style={{ background: '#FFFFFF', border: '1px solid #E6E8EC', borderRadius: 12, overflow: 'hidden' }}>
          {DM_APIS.map((api, i) => (
            <div key={i} style={{
              display: 'grid', gridTemplateColumns: '160px 1fr 60px 220px 80px',
              gap: 16, padding: '12px 20px',
              alignItems: 'center',
              borderTop: i ? '1px solid #F0F2F5' : 'none',
            }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#1B202D' }}>{api.name}</div>
              <div style={{ fontSize: 12, color: '#4B5361' }}>{api.desc}</div>
              <div><MethodTag method={api.method} /></div>
              <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: '#667085' }}>{api.path}</div>
              <button style={{ fontSize: 12, color: '#20668F', fontWeight: 600, justifySelf: 'end' }}>Try →</button>
            </div>
          ))}
        </div>
      </Section>

      {/* Data Health */}
      <Section title="Data Health" hint="Rolling checks against every connected feed.">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10 }}>
          {DM_HEALTH.map((h, i) => (
            <div key={i} style={{
              background: '#FFFFFF', border: '1px solid #E6E8EC', borderRadius: 10,
              padding: 14,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <i data-lucide={h.icon} style={{ width: 14, height: 14, color: '#667085' }} />
                <div style={{
                  width: 8, height: 8, borderRadius: 999,
                  background: h.tone === 'success' ? '#17803D' : h.tone === 'warn' ? '#B27D3A' : '#C0362C',
                }} />
              </div>
              <div style={{ fontSize: 11, color: '#667085', textTransform: 'uppercase', letterSpacing: '.04em', fontWeight: 600, marginBottom: 4 }}>{h.label}</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#1B202D', letterSpacing: '-0.01em' }}>{h.value}</div>
              <div style={{ fontSize: 11, color: '#667085', marginTop: 2 }}>{h.detail}</div>
            </div>
          ))}
        </div>
      </Section>
    </div>
  );

  if (embed) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
        <ScreenHeader
          crumbs={['My Apps', 'Safety Inspection Tracker']}
          title="Safety Inspection Tracker"
          subtitle="v1.2 · last modified 3h ago by K. Lam"
          actions={<>
            <VButton icon="arrow-left" onClick={() => goto('myapps')}>Back</VButton>
            <VButton variant="primary" icon="rocket">Publish v1.3</VButton>
          </>}
          tabs={[
            { id: 'design',   label: 'Design',          icon: 'wand-2' },
            { id: 'data',     label: 'Data Management', icon: 'plug' },
            { id: 'workflow', label: 'Workflow',        icon: 'git-branch' },
            { id: 'access',   label: 'Access',          icon: 'user-check' },
            { id: 'monitor',  label: 'Monitoring',      icon: 'activity' },
            { id: 'version',  label: 'Version',         icon: 'history' },
            { id: 'settings', label: 'Settings',        icon: 'settings' },
          ]}
          activeTab={activeTab || 'data'}
          onTab={onTab}
        />
        {content}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <ScreenHeader
        title="Data Management"
        subtitle="Manage the data behind Safety Inspection Tracker · v1.2"
        actions={<>
          <VButton icon="database" onClick={() => goto('hub')}>Data Hub</VButton>
          <VButton variant="primary" icon="plus">Add Data Source</VButton>
        </>}
      />
      {content}
    </div>
  );
};

const Section = ({ title, hint, children }) => (
  <div>
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 10 }}>
      <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#1B202D', letterSpacing: '-0.01em' }}>{title}</h2>
      {hint && <span style={{ fontSize: 12, color: '#667085' }}>{hint}</span>}
    </div>
    {children}
  </div>
);

const ConnectMethod = ({ num, title, desc, cta, icon, highlight, onClick }) => (
  <div style={{
    background: highlight ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.08)',
    border: highlight ? '1px solid rgba(255,255,255,0.4)' : '1px solid rgba(255,255,255,0.15)',
    borderRadius: 12, padding: 16,
    display: 'flex', flexDirection: 'column', gap: 8,
  }}>
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <div style={{
        width: 26, height: 26, borderRadius: 999,
        background: highlight ? '#FFFFFF' : 'rgba(255,255,255,0.2)',
        color: highlight ? '#20668F' : '#FFFFFF',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 12, fontWeight: 700,
      }}>{num}</div>
      <i data-lucide={icon} style={{ width: 18, height: 18, opacity: 0.85 }} />
    </div>
    <div style={{ fontSize: 15, fontWeight: 700, marginTop: 4 }}>{title}</div>
    <div style={{ fontSize: 12, opacity: 0.8, lineHeight: 1.5, flex: 1 }}>{desc}</div>
    <button onClick={onClick}
      style={{
        marginTop: 6, alignSelf: 'flex-start',
        padding: '6px 12px', borderRadius: 999,
        background: highlight ? '#FFFFFF' : 'transparent',
        color: highlight ? '#20668F' : '#FFFFFF',
        border: highlight ? 'none' : '1px solid rgba(255,255,255,0.3)',
        fontSize: 12, fontWeight: 600, cursor: 'pointer',
        display: 'inline-flex', alignItems: 'center', gap: 4,
      }}>
      {cta}
      <i data-lucide="arrow-right" style={{ width: 12, height: 12 }} />
    </button>
  </div>
);

const MethodTag = ({ method }) => {
  const colors = { GET: '#17803D', POST: '#20668F', PUT: '#B27D3A', DELETE: '#C0362C' };
  return (
    <span style={{
      display: 'inline-block', padding: '2px 8px', borderRadius: 6,
      background: '#F3F4F1', color: colors[method] || '#4B5361',
      fontSize: 10, fontWeight: 700, fontFamily: 'JetBrains Mono, monospace',
    }}>{method}</span>
  );
};

const dmTh = { padding: '10px 20px', textAlign: 'left', fontWeight: 600 };
const dmTd = { padding: '12px 20px', verticalAlign: 'middle' };

window.DataMgmt = DataMgmt;

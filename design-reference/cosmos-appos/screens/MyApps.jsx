// MyApps.jsx — app catalog
const MY_APPS = [
  {
    id: 'safety',      name: 'Safety Inspection Tracker',
    desc: 'Daily walk checklists, critical flag tracking, sign-off workflow.',
    icon: 'clipboard-check', accent: '#20668F',
    status: 'Needs Attention', tone: 'warn',
    version: 'v1.2', modified: '3h ago', by: 'K. Lam',
    visits: '842', dataStatus: 'Partial', monitoring: true,
    hubs: ['Form Hub', 'Workforce Hub', 'Asset Hub'],
  },
  {
    id: 'visitor',     name: 'Visitor Access',
    desc: 'Visitor registration, approval workflow, QR check-in at gate.',
    icon: 'user-round-plus', accent: '#3167E3',
    status: 'Published', tone: 'success',
    version: 'v3.4', modified: 'Yesterday', by: 'P. Wong',
    visits: '2,341', dataStatus: 'Live', monitoring: true,
    hubs: ['Form Hub', 'CCTV Hub'],
  },
  {
    id: 'equip',       name: 'Equipment Health',
    desc: 'Realtime equipment telemetry, health scores, anomaly alerts.',
    icon: 'gauge', accent: '#17803D',
    status: 'Published', tone: 'success',
    version: 'v2.1', modified: '2d ago', by: 'M. Sze',
    visits: '1,088', dataStatus: 'Live', monitoring: true,
    hubs: ['IoT Hub', 'Equipment Hub'],
  },
  {
    id: 'energy',      name: 'Chiller Plant Overview',
    desc: 'Energy consumption per zone, hour-by-hour drill down.',
    icon: 'zap', accent: '#B27D3A',
    status: 'Draft', tone: 'neutral',
    version: 'v0.3', modified: '2d ago', by: 'K. Lam',
    visits: '—', dataStatus: 'Mock', monitoring: false,
    hubs: ['IoT Hub'],
  },
  {
    id: 'permit',      name: 'Permit-to-Work',
    desc: 'Hot-work and confined-space permit issuance and audit trail.',
    icon: 'file-lock-2', accent: '#7A3EA1',
    status: 'Unpublished', tone: 'neutral',
    version: 'v1.0', modified: '1w ago', by: 'A. Chan',
    visits: '412', dataStatus: 'Live', monitoring: false,
    hubs: ['Form Hub', 'Workforce Hub'],
  },
  {
    id: 'workorder',   name: 'Work Order Kanban',
    desc: 'Cross-team work order triage with SLA and dispatch.',
    icon: 'kanban', accent: '#20668F',
    status: 'Published', tone: 'success',
    version: 'v2.7', modified: '4d ago', by: 'J. Ng',
    visits: '3,201', dataStatus: 'Live', monitoring: true,
    hubs: ['Form Hub', 'Workforce Hub', 'Equipment Hub'],
  },
];

const MY_TABS = [
  { id: 'all',       label: 'All Apps',        count: MY_APPS.length },
  { id: 'published', label: 'Published',       count: MY_APPS.filter(a => a.status === 'Published').length },
  { id: 'draft',     label: 'Drafts',          count: MY_APPS.filter(a => a.status === 'Draft').length },
  { id: 'attn',      label: 'Needs Attention', count: MY_APPS.filter(a => a.status === 'Needs Attention').length },
  { id: 'unpub',     label: 'Unpublished',     count: MY_APPS.filter(a => a.status === 'Unpublished').length },
  { id: 'arch',      label: 'Archived',        count: 0 },
];

const MyApps = ({ goto }) => {
  const [tab, setTab] = React.useState('all');
  const [view, setView] = React.useState('grid');

  const filtered = MY_APPS.filter(a => {
    if (tab === 'all') return true;
    if (tab === 'published') return a.status === 'Published';
    if (tab === 'draft')     return a.status === 'Draft';
    if (tab === 'attn')      return a.status === 'Needs Attention';
    if (tab === 'unpub')     return a.status === 'Unpublished';
    return false;
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <ScreenHeader
        title="My Apps"
        subtitle="Every app you've built with AppOS. Publish, unpublish, monitor, or edit."
        actions={
          <>
            <VButton icon="filter">Filter</VButton>
            <VButton variant="primary" icon="plus" onClick={() => goto('home')}>New App</VButton>
          </>
        }
        tabs={MY_TABS}
        activeTab={tab}
        onTab={setTab}
      />

      <div style={{ padding: '20px 28px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            padding: '6px 12px', background: '#FFFFFF', border: '1px solid #E6E8EC',
            borderRadius: 8, fontSize: 13, color: '#4B5361', flex: 1, maxWidth: 380,
          }}>
            <i data-lucide="search" style={{ width: 14, height: 14, color: '#9AA1AE' }} />
            <input placeholder="Search apps"
              style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontSize: 13, color: '#1B202D' }} />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <SegBtn options={[{ id: 'grid', label: 'Grid', icon: 'layout-grid' }, { id: 'table', label: 'Table', icon: 'list' }]}
              value={view} onChange={setView} />
          </div>
        </div>

        {view === 'grid'
          ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 12 }}>
              {filtered.map(a => <AppCard key={a.id} app={a} goto={goto} />)}
            </div>
          )
          : <AppTable apps={filtered} goto={goto} />
        }
      </div>
    </div>
  );
};

const AppCard = ({ app, goto }) => {
  const [hover, setHover] = React.useState(false);
  const openApp = () => {
    if (app.id === 'safety') goto('design');
    else goto('design');
  };
  return (
    <div
      onClick={openApp}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        background: '#FFFFFF', border: `1px solid ${hover ? '#CBD1DA' : '#E6E8EC'}`,
        borderRadius: 12, padding: 20, cursor: 'pointer',
        display: 'flex', flexDirection: 'column', gap: 12,
        transition: 'border-color 120ms, transform 120ms',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div style={{
          width: 44, height: 44, borderRadius: 10,
          background: hexToTint(app.accent),
          color: app.accent,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <i data-lucide={app.icon} style={{ width: 22, height: 22 }} />
        </div>
        <VPill variant={app.tone} dot>{app.status.toLowerCase()}</VPill>
      </div>

      <div>
        <div style={{ fontSize: 15, fontWeight: 700, color: '#1B202D', letterSpacing: '-0.01em' }}>{app.name}</div>
        <div style={{ fontSize: 12, color: '#667085', marginTop: 4, lineHeight: 1.45 }}>{app.desc}</div>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
        {app.hubs.map(h => (
          <span key={h} style={{
            fontSize: 10, padding: '2px 7px', borderRadius: 999,
            background: '#F3F4F1', color: '#4B5361', fontWeight: 500,
            border: '1px solid #E6E8EC',
          }}>{h}</span>
        ))}
      </div>

      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        paddingTop: 12, borderTop: '1px solid #F0F2F5',
        fontSize: 11, color: '#667085',
      }}>
        <div style={{ display: 'flex', gap: 12 }}>
          <span><span style={{ color: '#1B202D', fontWeight: 600 }}>{app.version}</span> · {app.modified}</span>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <i data-lucide="eye" style={{ width: 11, height: 11 }} />
            {app.visits}
          </span>
          {app.monitoring && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: '#17803D' }}>
              <span style={{ width: 6, height: 6, borderRadius: 999, background: '#17803D', animation: 'cos-pulse 2s ease-in-out infinite' }} />
              live
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

const thStyle = { padding: '10px 20px', textAlign: 'left', fontWeight: 600 };
const tdStyle = { padding: '10px 20px', verticalAlign: 'middle' };

const AppTable = ({ apps, goto }) => (
  <div style={{ background: '#FFFFFF', border: '1px solid #E6E8EC', borderRadius: 12, overflow: 'hidden' }}>
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
      <thead>
        <tr style={{ background: '#FAFAFB', color: '#667085', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.04em' }}>
          <th style={thStyle}>App</th>
          <th style={thStyle}>Status</th>
          <th style={thStyle}>Version</th>
          <th style={thStyle}>Modified</th>
          <th style={thStyle}>Visits</th>
          <th style={thStyle}>Data</th>
          <th style={{ ...thStyle, textAlign: 'right' }}>Actions</th>
        </tr>
      </thead>
      <tbody>
        {apps.map((a, i) => (
          <tr key={a.id} style={{ borderTop: '1px solid #F0F2F5', cursor: 'pointer' }}
              onClick={() => goto('design')}>
            <td style={tdStyle}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 32, height: 32, borderRadius: 8, background: hexToTint(a.accent), color: a.accent, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <i data-lucide={a.icon} style={{ width: 16, height: 16 }} />
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#1B202D' }}>{a.name}</div>
                  <div style={{ fontSize: 11, color: '#667085' }}>{a.hubs.join(' · ')}</div>
                </div>
              </div>
            </td>
            <td style={tdStyle}><VPill variant={a.tone} dot>{a.status.toLowerCase()}</VPill></td>
            <td style={{ ...tdStyle, color: '#4B5361', fontFamily: 'JetBrains Mono, monospace' }}>{a.version}</td>
            <td style={{ ...tdStyle, color: '#4B5361' }}>{a.modified} · {a.by}</td>
            <td style={{ ...tdStyle, color: '#1B202D', fontVariantNumeric: 'tabular-nums' }}>{a.visits}</td>
            <td style={tdStyle}>
              <VPill variant={a.dataStatus === 'Live' ? 'success' : a.dataStatus === 'Mock' ? 'warn' : 'neutral'}>
                {a.dataStatus.toLowerCase()}
              </VPill>
            </td>
            <td style={{ ...tdStyle, textAlign: 'right' }}>
              <button style={{ padding: '4px 8px', color: '#20668F', fontWeight: 600, fontSize: 12 }}>Open →</button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

const hexToTint = (hex) => {
  // simple tint: shift to #F3F4F1 + accent alpha look
  const map = { '#20668F': '#E7EEF4', '#3167E3': '#E8F0FE', '#17803D': '#E7F5EC', '#B27D3A': '#FBF1DE', '#7A3EA1': '#F1E7F7' };
  return map[hex] || '#F3F4F1';
};

window.MyApps = MyApps;

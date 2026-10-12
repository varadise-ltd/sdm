// DataHub.jsx — three-column data browser
const HUB_TREE = [
  { id: 'iot',   label: 'IoT Hub',            icon: 'radio-tower',   count: 4, sets: [
    { id: 'iot-temp',  name: 'Temperature Sensors',  records: '48.2K', freq: 'Real-time', status: 'connected' },
    { id: 'iot-vib',   name: 'Vibration Sensors',    records: '12.9K', freq: 'Real-time', status: 'connected' },
    { id: 'iot-emeter',name: 'Energy Meters',        records: '9.4K',  freq: 'Hourly',    status: 'connected' },
    { id: 'iot-tele',  name: 'Equipment Telemetry',  records: '128.0K',freq: 'Real-time', status: 'connected' },
  ]},
  { id: 'cctv',  label: 'CCTV Hub',           icon: 'video',         count: 3, sets: [] },
  { id: 'notif', label: 'Notification Center',icon: 'bell',          count: 2, sets: [] },
  { id: 'form',  label: 'Form Hub',           icon: 'clipboard-list',count: 6, expanded: true, sets: [
    { id: 'form-safety',    name: 'Safety Inspection Forms', records: '2,340', freq: 'Daily',      status: 'connected', selected: true, apps: 3 },
    { id: 'form-visitor',   name: 'Visitor Request Forms',   records: '4,120', freq: 'Real-time',  status: 'connected', apps: 1 },
    { id: 'form-maint',     name: 'Maintenance Checklists',  records: '1,890', freq: 'Daily',      status: 'warning', apps: 2 },
    { id: 'form-permit',    name: 'Permit-to-Work Forms',    records: '640',   freq: 'On submit',  status: 'connected', apps: 1 },
    { id: 'form-toolbox',   name: 'Toolbox Talk Records',    records: '2,110', freq: 'Daily',      status: 'connected', apps: 0 },
    { id: 'form-custom',    name: 'Custom Forms',            records: '380',   freq: 'Manual',     status: 'connected', apps: 0 },
  ]},
  { id: 'drive', label: 'Drive Hub',          icon: 'folder',        count: 5, sets: [] },
  { id: 'work',  label: 'Workforce Hub',      icon: 'users',         count: 4, sets: [
    { id: 'wf-personnel', name: 'Personnel Roster',      records: '1,240', freq: 'Daily',  status: 'connected', apps: 4 },
    { id: 'wf-shifts',    name: 'Shifts & Rosters',      records: '18.6K', freq: 'Hourly', status: 'connected', apps: 2 },
    { id: 'wf-attend',    name: 'Attendance Records',    records: '96.2K', freq: 'Real-time', status: 'connected', apps: 3 },
    { id: 'wf-teams',     name: 'Teams',                 records: '48',    freq: 'Manual', status: 'connected', apps: 1 },
  ]},
  { id: 'asset', label: 'Asset Hub',          icon: 'building-2',    count: 6, sets: [] },
  { id: 'equip', label: 'Equipment Hub',      icon: 'cog',           count: 5, sets: [] },
];

const SAFETY_FIELDS = [
  { name: 'inspection_id',   type: 'Text',     desc: 'Unique inspection reference',      example: 'INSP-2026-0338' },
  { name: 'site_id',         type: 'Text',     desc: 'Site / building identifier',       example: 'BLD-A' },
  { name: 'zone',            type: 'Text',     desc: 'Zone within site',                 example: 'L5 · Mechanical' },
  { name: 'inspector_id',    type: 'Ref',      desc: 'Ref → Workforce Hub personnel',    example: 'WK-1082' },
  { name: 'checklist_score', type: 'Number',   desc: 'Score out of 100',                 example: '87' },
  { name: 'critical_flags',  type: 'Number',   desc: 'Count of critical findings',       example: '2' },
  { name: 'status',          type: 'Enum',     desc: 'draft · submitted · reviewed',     example: 'submitted' },
  { name: 'submitted_at',    type: 'DateTime', desc: 'Submission timestamp',             example: '2026-07-08 09:24' },
  { name: 'signature',       type: 'Image',    desc: 'Inspector signature capture',      example: '<image>' },
];

const SAFETY_SAMPLE = [
  ['INSP-2026-0338', 'BLD-A', 'L5 · Mechanical', 'WK-1082', 87,  2, 'submitted', '2026-07-08 09:24'],
  ['INSP-2026-0337', 'BLD-A', 'L3 · Atrium',     'WK-1082', 94,  0, 'reviewed',  '2026-07-08 08:11'],
  ['INSP-2026-0336', 'BLD-B', 'Roof · West',     'WK-0917', 72,  4, 'submitted', '2026-07-07 16:48'],
  ['INSP-2026-0335', 'BLD-C', 'L1 · Loading',    'WK-1141', 98,  0, 'reviewed',  '2026-07-07 15:02'],
  ['INSP-2026-0334', 'BLD-A', 'L5 · Server Rm',  'WK-1082', 82,  1, 'submitted', '2026-07-07 11:35'],
  ['INSP-2026-0333', 'BLD-B', 'Basement · MEP',  'WK-0917', 65,  5, 'draft',     '2026-07-07 10:20'],
];

const DataHub = ({ goto }) => {
  const [selectedHub, setSelectedHub] = React.useState('form');
  const [selectedSet, setSelectedSet] = React.useState('form-safety');
  const [expanded, setExpanded] = React.useState({ form: true, iot: false, work: false });

  const currentHub = HUB_TREE.find(h => h.id === selectedHub);
  const currentSet = currentHub?.sets.find(s => s.id === selectedSet) || currentHub?.sets[0];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', minHeight: 0 }}>
      <ScreenHeader
        title="Data Hub"
        subtitle="Browse the data connected to COSMOS. Point AppOS at any of it."
        actions={
          <>
            <VButton icon="filter">Filter</VButton>
            <VButton variant="primary" icon="plug">Connect Data Source</VButton>
          </>
        }
      />

      {/* 3-column layout */}
      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '280px 340px 1fr', minHeight: 0 }}>
        {/* LEFT: Hub tree */}
        <div style={{
          borderRight: '1px solid #E6E8EC', background: '#FFFFFF',
          overflowY: 'auto', padding: '16px 12px',
        }}>
          <div style={{
            padding: '4px 10px 12px', fontSize: 11, fontWeight: 600,
            letterSpacing: '.06em', textTransform: 'uppercase', color: '#667085',
          }}>Hubs</div>
          {HUB_TREE.map(h => (
            <HubNode
              key={h.id}
              hub={h}
              expanded={!!expanded[h.id]}
              onToggle={() => setExpanded({ ...expanded, [h.id]: !expanded[h.id] })}
              onSelect={() => { setSelectedHub(h.id); if (h.sets[0]) setSelectedSet(h.sets[0].id); setExpanded({ ...expanded, [h.id]: true }); }}
              selectedHub={selectedHub}
              selectedSet={selectedSet}
              setSelectedSet={setSelectedSet}
            />
          ))}
        </div>

        {/* MIDDLE: Data set list */}
        <div style={{
          borderRight: '1px solid #E6E8EC', background: '#FAFAFB',
          overflowY: 'auto', padding: '16px 16px',
        }}>
          <div style={{ display:'flex', alignItems:'center', gap: 8, marginBottom: 14 }}>
            <i data-lucide={currentHub?.icon} style={{ width: 16, height: 16, color: '#20668F' }} />
            <div style={{ fontSize: 15, fontWeight: 600, color: '#1B202D' }}>{currentHub?.label}</div>
            <div style={{
              padding: '2px 8px', borderRadius: 999, background: '#EEF1F4',
              color: '#4B5361', fontSize: 11, fontWeight: 600,
            }}>{currentHub?.sets.length || 0} data sets</div>
          </div>
          <div style={{
            position: 'relative', marginBottom: 12,
          }}>
            <i data-lucide="search" style={{
              position: 'absolute', left: 10, top: 10, width: 14, height: 14, color: '#9AA1AE',
            }} />
            <input placeholder="Search data sets"
              style={{
                width: '100%', padding: '8px 12px 8px 32px', borderRadius: 8,
                border: '1px solid #E6E8EC', background: '#FFFFFF',
                fontSize: 13, color: '#1B202D', outline: 'none',
              }}
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {(currentHub?.sets || []).map(s => (
              <DataSetCard key={s.id} set={s} selected={selectedSet === s.id} onClick={() => setSelectedSet(s.id)} />
            ))}
            {(!currentHub?.sets || currentHub.sets.length === 0) && (
              <div style={{
                padding: 24, textAlign: 'center', color: '#9AA1AE', fontSize: 13,
                background: '#FFFFFF', border: '1px dashed #E6E8EC', borderRadius: 8,
              }}>No data sets in this hub yet.</div>
            )}
          </div>
        </div>

        {/* RIGHT: Field preview */}
        <div style={{ overflowY: 'auto', padding: '20px 28px', background: '#FAFAFB' }}>
          {currentSet && <FieldPreview set={currentSet} hub={currentHub} goto={goto} />}
        </div>
      </div>
    </div>
  );
};

const HubNode = ({ hub, expanded, onToggle, onSelect, selectedHub, selectedSet, setSelectedSet }) => {
  const isActive = hub.id === selectedHub;
  return (
    <div style={{ marginBottom: 2 }}>
      <div
        onClick={() => { onSelect(); }}
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '8px 10px', borderRadius: 8, cursor: 'pointer',
          background: isActive ? '#E7EEF4' : 'transparent',
          color: isActive ? '#20668F' : '#1B202D',
        }}
      >
        <button
          onClick={(e) => { e.stopPropagation(); onToggle(); }}
          style={{
            width: 14, height: 14, display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#9AA1AE',
          }}
        >
          <i data-lucide={expanded ? 'chevron-down' : 'chevron-right'} style={{ width: 12, height: 12 }} />
        </button>
        <i data-lucide={hub.icon} style={{ width: 16, height: 16 }} />
        <span style={{ flex: 1, fontSize: 13, fontWeight: isActive ? 600 : 500 }}>{hub.label}</span>
        <span style={{
          fontSize: 11, fontWeight: 600,
          padding: '2px 7px', borderRadius: 999,
          background: isActive ? '#FFFFFF' : '#EEF1F4',
          color: isActive ? '#20668F' : '#667085',
        }}>{hub.count}</span>
      </div>
      {expanded && hub.sets.length > 0 && (
        <div style={{ marginLeft: 28, marginTop: 2, borderLeft: '1px solid #E6E8EC', paddingLeft: 8 }}>
          {hub.sets.map(s => {
            const setActive = isActive && selectedSet === s.id;
            return (
              <div key={s.id}
                onClick={() => setSelectedSet(s.id)}
                style={{
                  padding: '6px 10px', borderRadius: 6, fontSize: 12,
                  color: setActive ? '#20668F' : '#4B5361',
                  fontWeight: setActive ? 600 : 400,
                  cursor: 'pointer',
                  background: setActive ? '#F3F4F1' : 'transparent',
                  marginBottom: 1,
                }}
              >{s.name}</div>
            );
          })}
        </div>
      )}
    </div>
  );
};

const DataSetCard = ({ set, selected, onClick }) => {
  const [hover, setHover] = React.useState(false);
  const statusMap = {
    connected: { tone: 'success', label: 'connected' },
    warning:   { tone: 'warn',    label: 'warning'   },
    missing:   { tone: 'danger',  label: 'missing'   },
  };
  const st = statusMap[set.status] || statusMap.connected;
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        background: '#FFFFFF',
        border: `1px solid ${selected ? '#20668F' : hover ? '#CBD1DA' : '#E6E8EC'}`,
        boxShadow: selected ? '0 0 0 3px rgba(32,102,143,.12)' : 'none',
        borderRadius: 10, padding: '12px 14px', cursor: 'pointer',
        transition: 'border-color 120ms, box-shadow 120ms',
      }}
    >
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap: 8, marginBottom: 6 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#1B202D' }}>{set.name}</div>
        <VPill variant={st.tone} dot>{st.label}</VPill>
      </div>
      <div style={{
        display: 'flex', gap: 12, fontSize: 11, color: '#667085',
      }}>
        <span>{set.records} records</span>
        <span>·</span>
        <span>{set.freq}</span>
        {typeof set.apps === 'number' && <>
          <span>·</span>
          <span>{set.apps} {set.apps === 1 ? 'app' : 'apps'}</span>
        </>}
      </div>
    </div>
  );
};

const FieldPreview = ({ set, hub, goto }) => {
  const fields = set.name === 'Safety Inspection Forms' ? SAFETY_FIELDS : SAFETY_FIELDS;
  const sample = set.name === 'Safety Inspection Forms' ? SAFETY_SAMPLE : SAFETY_SAMPLE;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Header */}
      <div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12, color: '#667085', marginBottom: 6 }}>
          <i data-lucide={hub?.icon} style={{ width: 12, height: 12 }} />
          {hub?.label}
          <i data-lucide="chevron-right" style={{ width: 12, height: 12 }} />
          <span style={{ color: '#1B202D', fontWeight: 500 }}>Data Set</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 20 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: '#1B202D', letterSpacing: '-0.01em' }}>{set.name}</h2>
            <p style={{ margin: '6px 0 0', fontSize: 13, color: '#4B5361', maxWidth: 640 }}>
              Digital inspection forms captured by site supervisors during daily and weekly walks.
              Includes checklist scores, critical flag counts, and signature capture.
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <VButton icon="download" size="sm">Export sample</VButton>
            <VButton variant="primary" icon="sparkles" size="sm" onClick={() => goto('home', { mode: 'spark' })}>Use in AppOS</VButton>
          </div>
        </div>
      </div>

      {/* Overview stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10 }}>
        <MiniStat label="Records"       value="2,340"       icon="database" />
        <MiniStat label="Update Freq."  value="Daily"       icon="clock" />
        <MiniStat label="Owner"         value="Safety Ops"  icon="user" />
        <MiniStat label="Permission"    value="Available"   icon="shield-check" tone="success" />
        <MiniStat label="Used By"       value="3 Apps"      icon="layout-grid" clickable onClick={() => goto('myapps')} />
      </div>

      {/* Fields */}
      <div style={{
        background: '#FFFFFF', border: '1px solid #E6E8EC', borderRadius: 12,
        overflow: 'hidden',
      }}>
        <div style={{
          padding: '14px 20px', borderBottom: '1px solid #E6E8EC',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#1B202D' }}>Fields ({fields.length})</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <VPill variant="neutral" icon="key">Primary: inspection_id</VPill>
            <VPill variant="info" icon="link">2 references</VPill>
          </div>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: '#FAFAFB', color: '#667085', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.04em' }}>
              <th style={thStyle}>Field</th>
              <th style={thStyle}>Type</th>
              <th style={thStyle}>Description</th>
              <th style={thStyle}>Example</th>
            </tr>
          </thead>
          <tbody>
            {fields.map((f, i) => (
              <tr key={i} style={{ borderTop: '1px solid #F0F2F5' }}>
                <td style={{ ...tdStyle, fontFamily: 'JetBrains Mono, monospace', color: '#1B202D', fontWeight: 500 }}>{f.name}</td>
                <td style={tdStyle}><TypeTag type={f.type} /></td>
                <td style={{ ...tdStyle, color: '#4B5361' }}>{f.desc}</td>
                <td style={{ ...tdStyle, fontFamily: 'JetBrains Mono, monospace', color: '#667085' }}>{f.example}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Sample data */}
      <div style={{
        background: '#FFFFFF', border: '1px solid #E6E8EC', borderRadius: 12,
        overflow: 'hidden',
      }}>
        <div style={{
          padding: '14px 20px', borderBottom: '1px solid #E6E8EC',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#1B202D' }}>Sample Data</div>
            <div style={{ fontSize: 11, color: '#667085' }}>Showing 6 of 2,340 rows · updated 12 min ago</div>
          </div>
          <button style={{ fontSize: 12, color: '#20668F', fontWeight: 600, cursor: 'pointer' }}>Refresh</button>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, fontFamily: 'JetBrains Mono, monospace' }}>
            <thead>
              <tr style={{ background: '#FAFAFB', color: '#667085', fontSize: 10, textTransform: 'uppercase', letterSpacing: '.06em' }}>
                {['id', 'site', 'zone', 'inspector', 'score', 'flags', 'status', 'submitted'].map(h => (
                  <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sample.map((row, i) => (
                <tr key={i} style={{ borderTop: '1px solid #F0F2F5' }}>
                  {row.map((cell, j) => (
                    <td key={j} style={{ padding: '10px 14px', color: j === 0 ? '#1B202D' : j === 4 ? statusForScore(cell) : '#4B5361', fontWeight: j === 0 ? 500 : 400, whiteSpace: 'nowrap' }}>
                      {j === 6 ? <VPill variant={statusPill(cell)}>{cell}</VPill> : cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

const thStyle = { padding: '10px 20px', textAlign: 'left', fontWeight: 600 };
const tdStyle = { padding: '10px 20px', verticalAlign: 'middle' };

const statusForScore = (n) => n >= 90 ? '#17803D' : n >= 75 ? '#4B5361' : '#B27D3A';
const statusPill = (s) => s === 'reviewed' ? 'success' : s === 'submitted' ? 'info' : 'neutral';

const TypeTag = ({ type }) => {
  const colors = {
    Text: '#4B5361', Number: '#20668F', DateTime: '#7A3EA1', Enum: '#B27D3A', Ref: '#3167E3', Image: '#17803D',
  };
  return (
    <span style={{
      display: 'inline-block', padding: '2px 8px', borderRadius: 6,
      background: '#F3F4F1', color: colors[type] || '#4B5361',
      fontSize: 11, fontWeight: 600, fontFamily: 'JetBrains Mono, monospace',
    }}>{type}</span>
  );
};

const MiniStat = ({ label, value, icon, tone, clickable, onClick }) => {
  const toneColor = tone === 'success' ? '#17803D' : '#1B202D';
  return (
    <div
      onClick={onClick}
      style={{
        background: '#FFFFFF', border: '1px solid #E6E8EC', borderRadius: 10,
        padding: '12px 14px', cursor: clickable ? 'pointer' : 'default',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#667085', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '.04em', fontWeight: 600 }}>
        <i data-lucide={icon} style={{ width: 12, height: 12 }} />
        {label}
      </div>
      <div style={{ fontSize: 16, fontWeight: 700, color: toneColor, letterSpacing: '-0.01em' }}>{value}</div>
    </div>
  );
};

// Shared: page header for module screens
const ScreenHeader = ({ title, subtitle, actions, crumbs, tabs, activeTab, onTab }) => (
  <div style={{
    background: '#FFFFFF', borderBottom: '1px solid #E6E8EC',
    padding: '18px 28px 0', flexShrink: 0,
  }}>
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 20 }}>
      <div>
        {crumbs && (
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12, color: '#667085', marginBottom: 8 }}>
            {crumbs.map((c, i) => (
              <React.Fragment key={i}>
                <span style={{ color: i === crumbs.length - 1 ? '#1B202D' : '#667085', fontWeight: i === crumbs.length - 1 ? 500 : 400 }}>{c}</span>
                {i < crumbs.length - 1 && <i data-lucide="chevron-right" style={{ width: 12, height: 12, color: '#9AA1AE' }} />}
              </React.Fragment>
            ))}
          </div>
        )}
        <h1 style={{ margin: 0, fontSize: 26, fontWeight: 700, color: '#1B202D', letterSpacing: '-0.015em', lineHeight: 1.2 }}>{title}</h1>
        {subtitle && <p style={{ margin: '6px 0 0', color: '#4B5361', fontSize: 14 }}>{subtitle}</p>}
      </div>
      {actions && <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>{actions}</div>}
    </div>
    {tabs && (
      <div style={{ display: 'flex', gap: 2, marginTop: 16, marginLeft: -4 }}>
        {tabs.map(t => {
          const isActive = t.id === activeTab;
          return (
            <div key={t.id}
              onClick={() => onTab && onTab(t.id)}
              style={{
                padding: '10px 14px', fontSize: 13,
                color: isActive ? '#1B202D' : '#667085',
                fontWeight: isActive ? 600 : 500,
                borderBottom: `2px solid ${isActive ? '#EA6A22' : 'transparent'}`,
                marginBottom: -1, cursor: 'pointer',
                display: 'inline-flex', alignItems: 'center', gap: 6,
              }}>
              {t.icon && <i data-lucide={t.icon} style={{ width: 13, height: 13 }} />}
              {t.label}
              {typeof t.count === 'number' && (
                <span style={{ marginLeft: 4, fontSize: 10, padding: '1px 6px', borderRadius: 999, background: isActive ? '#E7EEF4' : '#EEF1F4', color: isActive ? '#20668F' : '#667085', fontWeight: 600 }}>{t.count}</span>
              )}
            </div>
          );
        })}
      </div>
    )}
  </div>
);

window.DataHub = DataHub;
window.ScreenHeader = ScreenHeader;
window.MiniStat = MiniStat;

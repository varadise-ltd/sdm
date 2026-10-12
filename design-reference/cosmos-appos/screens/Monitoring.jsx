// Monitoring.jsx — app health surface
const MON_INCIDENTS = [
  { time: '09:24', ts: '2m ago',  type: 'schema-change', severity: 'warn',   title: 'Field type shifted', detail: '`critical_flags` changed from Int to Number in Safety Inspection Forms. AppOS auto-coerced; verify downstream.', app: 'Safety Inspection Tracker' },
  { time: '08:47', ts: '39m ago', type: 'permission',    severity: 'warn',   title: 'Role missing on new site', detail: 'Inspector role has no read on BLD-D introduced 3h ago.', app: 'Safety Inspection Tracker' },
  { time: '07:12', ts: '2h ago',  type: 'data-delay',    severity: 'info',   title: 'Feed caught up', detail: 'Personnel Roster feed delay (11min) resolved automatically.', app: 'Safety Inspection Tracker' },
  { time: '00:03', ts: '9h ago',  type: 'api-fail',      severity: 'danger', title: 'API failure', detail: '/api/apps/safety/report/:id — 3 consecutive 5xx responses. Rolled back to v1.1 cached payload.', app: 'Safety Inspection Tracker' },
  { time: 'Yesterday 22:15', ts: '1d ago', type: 'usage', severity: 'info', title: 'Usage spike', detail: '+87% inspection submissions vs. weekday average. Likely audit week.', app: 'Safety Inspection Tracker' },
];

const MON_CHANNELS = [
  { name: 'In-App',              icon: 'app-window',  enabled: true },
  { name: 'Email',               icon: 'mail',        enabled: true },
  { name: 'Notification Center', icon: 'bell',        enabled: true },
  { name: 'WhatsApp',            icon: 'message-circle', enabled: false },
  { name: 'Slack',               icon: 'hash',        enabled: true },
  { name: 'MS Teams',            icon: 'users',       enabled: false },
];

const Monitoring = ({ embed, goto, onTab, activeTab }) => {
  const content = (
    <div style={{ padding: '20px 28px', display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Top: Health at a glance */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
        <HealthCard label="App Uptime"       value="99.94%" delta="Last 30 days"   tone="success" icon="activity" />
        <HealthCard label="Active Users (7d)" value="128"    delta="+22 vs prev"   tone="success" icon="users" />
        <HealthCard label="Open Incidents"   value="2"       delta="1 schema · 1 permission" tone="warn" icon="alert-triangle" />
        <HealthCard label="Data Freshness"   value="On time" delta="All feeds ≤ 15m stale"   tone="success" icon="clock" />
      </div>

      {/* Middle: Timeline + right panel */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 16 }}>
        {/* Incident timeline */}
        <div style={{ background: '#FFFFFF', border: '1px solid #E6E8EC', borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ padding: '14px 20px', borderBottom: '1px solid #E6E8EC', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#1B202D' }}>Incident Timeline</div>
              <div style={{ fontSize: 11, color: '#667085', marginTop: 2 }}>Last 24h · 5 events · 2 open</div>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <VPill variant="danger" dot>1 danger</VPill>
              <VPill variant="warn" dot>2 warn</VPill>
              <VPill variant="info" dot>2 info</VPill>
            </div>
          </div>
          <div style={{ padding: 20 }}>
            {MON_INCIDENTS.map((ev, i) => (
              <IncidentRow key={i} ev={ev} isLast={i === MON_INCIDENTS.length - 1} />
            ))}
          </div>
        </div>

        {/* Right: subscriptions + channels */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ background: '#FFFFFF', border: '1px solid #E6E8EC', borderRadius: 12, padding: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#1B202D' }}>Notification Channels</div>
              <button style={{ fontSize: 11, color: '#20668F', fontWeight: 600 }}>Manage</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {MON_CHANNELS.map(c => <ChannelRow key={c.name} c={c} />)}
            </div>
          </div>

          <div style={{ background: '#FFFFFF', border: '1px solid #E6E8EC', borderRadius: 12, padding: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#1B202D', marginBottom: 10 }}>Watching For</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12 }}>
              {[
                { icon: 'database', label: 'Data missing', on: true },
                { icon: 'clock', label: 'Data delay > 10min', on: true },
                { icon: 'file-diff', label: 'Schema change', on: true },
                { icon: 'server-crash', label: 'API failure', on: true },
                { icon: 'key-round', label: 'Permission error', on: true },
                { icon: 'git-branch', label: 'Workflow failure', on: true },
                { icon: 'trending-down', label: 'Usage drop', on: false },
                { icon: 'trending-up', label: 'Unusual spike', on: true },
              ].map((w, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, color: w.on ? '#1B202D' : '#9AA1AE' }}>
                  <i data-lucide={w.icon} style={{ width: 13, height: 13, color: w.on ? '#20668F' : '#CBD1DA' }} />
                  <span style={{ flex: 1 }}>{w.label}</span>
                  <ToggleDot on={w.on} />
                </div>
              ))}
            </div>
          </div>

          <div style={{
            background: '#F3F4F1', border: '1px solid #E6E8EC', borderRadius: 12, padding: 16,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, textTransform: 'uppercase', letterSpacing: '.06em', fontWeight: 700, color: '#20668F', marginBottom: 6 }}>
              <i data-lucide="sparkles" style={{ width: 12, height: 12 }} />
              What Monitoring Does
            </div>
            <div style={{ fontSize: 12, color: '#1B202D', lineHeight: 1.5 }}>
              Generating an app is only the first step. AppOS also monitors data feeds, permissions,
              APIs, and usage so the app keeps running after go-live.
            </div>
          </div>
        </div>
      </div>

      {/* Bottom: Live usage chart */}
      <div style={{ background: '#FFFFFF', border: '1px solid #E6E8EC', borderRadius: 12, padding: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#1B202D' }}>App Traffic · 24h</div>
            <div style={{ fontSize: 11, color: '#667085', marginTop: 2 }}>Sessions across all sites</div>
          </div>
          <SegBtn options={[
            { id: '24h', label: '24h' }, { id: '7d', label: '7d' }, { id: '30d', label: '30d' },
          ]} value="24h" onChange={() => {}} />
        </div>
        <div style={{ height: 180, position: 'relative' }}>
          <TrafficChart />
        </div>
      </div>
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
          activeTab={activeTab || 'monitor'}
          onTab={onTab}
        />
        {content}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <ScreenHeader
        title="Monitoring"
        subtitle="Safety Inspection Tracker · v1.2 — live health"
        actions={<>
          <VButton icon="bell">Alert Rules</VButton>
          <VButton variant="primary" icon="line-chart">Open in Analytics</VButton>
        </>}
      />
      {content}
    </div>
  );
};

const HealthCard = ({ label, value, delta, tone, icon }) => {
  const toneColor = { success: '#17803D', warn: '#B27D3A', danger: '#C0362C' }[tone] || '#1B202D';
  const toneBg    = { success: '#E7F5EC', warn: '#FBF1DE', danger: '#FBE9E7' }[tone] || '#F3F4F1';
  return (
    <div style={{ background: '#FFFFFF', border: '1px solid #E6E8EC', borderRadius: 12, padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <div style={{
          width: 32, height: 32, borderRadius: 8, background: toneBg, color: toneColor,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <i data-lucide={icon} style={{ width: 16, height: 16 }} />
        </div>
        <span style={{
          fontSize: 8, textTransform: 'uppercase', letterSpacing: '.1em', fontWeight: 700,
          color: '#17803D', display: 'inline-flex', alignItems: 'center', gap: 4,
        }}>
          <span style={{ width: 5, height: 5, borderRadius: 999, background: '#17803D', animation: 'cos-pulse 2s ease-in-out infinite' }} />
          Live
        </span>
      </div>
      <div style={{ fontSize: 11, color: '#667085', textTransform: 'uppercase', letterSpacing: '.04em', fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: '#1B202D', marginTop: 4, letterSpacing: '-0.01em' }}>{value}</div>
      <div style={{ fontSize: 11, color: '#667085', marginTop: 2 }}>{delta}</div>
    </div>
  );
};

const IncidentRow = ({ ev, isLast }) => {
  const cfg = {
    danger: { color: '#C0362C', bg: '#FBE9E7', icon: 'alert-octagon' },
    warn:   { color: '#B27D3A', bg: '#FBF1DE', icon: 'alert-triangle' },
    info:   { color: '#20668F', bg: '#E7EEF4', icon: 'info' },
  }[ev.severity];
  return (
    <div style={{ display: 'flex', gap: 14, paddingBottom: isLast ? 0 : 14, position: 'relative' }}>
      {!isLast && <div style={{ position: 'absolute', left: 15, top: 32, bottom: 0, width: 2, background: '#EEF1F4' }} />}
      <div style={{
        width: 32, height: 32, borderRadius: 999, background: cfg.bg,
        color: cfg.color, display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0, position: 'relative', zIndex: 1,
        border: '2px solid #FFFFFF',
      }}>
        <i data-lucide={cfg.icon} style={{ width: 14, height: 14 }} />
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#1B202D' }}>{ev.title}</div>
          <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 4, background: '#F3F4F1', color: '#4B5361', fontWeight: 600, fontFamily: 'JetBrains Mono, monospace' }}>{ev.type}</span>
          <span style={{ marginLeft: 'auto', fontSize: 11, color: '#9AA1AE' }}>{ev.time} · {ev.ts}</span>
        </div>
        <div style={{ fontSize: 12, color: '#4B5361', lineHeight: 1.5 }}>{ev.detail}</div>
      </div>
    </div>
  );
};

const ChannelRow = ({ c }) => {
  const [on, setOn] = React.useState(c.enabled);
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '8px 10px', borderRadius: 8,
      background: on ? '#F3F4F1' : 'transparent',
    }}>
      <i data-lucide={c.icon} style={{ width: 14, height: 14, color: on ? '#20668F' : '#9AA1AE' }} />
      <span style={{ flex: 1, fontSize: 12, color: on ? '#1B202D' : '#9AA1AE', fontWeight: on ? 500 : 400 }}>{c.name}</span>
      <ToggleDot on={on} onClick={() => setOn(!on)} />
    </div>
  );
};

const ToggleDot = ({ on, onClick }) => (
  <button onClick={onClick} style={{
    width: 28, height: 16, borderRadius: 999, padding: 2,
    background: on ? '#20668F' : '#CBD1DA',
    transition: 'background 160ms', display: 'inline-flex',
    cursor: onClick ? 'pointer' : 'default',
  }}>
    <span style={{
      width: 12, height: 12, borderRadius: 999, background: '#FFFFFF',
      transform: on ? 'translateX(12px)' : 'translateX(0)',
      transition: 'transform 160ms cubic-bezier(0.2,0,0,1)',
    }} />
  </button>
);

const TrafficChart = () => {
  // 24-hour bars
  const data = [8, 12, 6, 4, 3, 5, 12, 28, 42, 48, 52, 55, 58, 62, 65, 58, 44, 32, 24, 18, 14, 22, 18, 12];
  const max = Math.max(...data);
  return (
    <div style={{ display: 'flex', gap: 4, alignItems: 'flex-end', height: '100%' }}>
      {data.map((v, i) => (
        <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
          <div style={{
            width: '100%', height: `${(v / max) * 100}%`,
            background: i === 14 ? '#20668F' : i > 6 && i < 20 ? '#B0C7D7' : '#DDE2E8',
            borderRadius: '4px 4px 0 0', minHeight: 3,
            transition: 'height 300ms cubic-bezier(0.2,0,0,1)',
          }} />
          {i % 4 === 0 && <div style={{ fontSize: 9, color: '#9AA1AE', fontFamily: 'JetBrains Mono, monospace' }}>{String(i).padStart(2,'0')}:00</div>}
        </div>
      ))}
    </div>
  );
};

window.Monitoring = Monitoring;

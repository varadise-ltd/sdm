// AppSidebar.jsx — COSMOS AppOS left rail
const COS_MODULES = [
  { id: 'home',      icon: 'sparkles',       label: 'AppOS' },
  { id: 'hub',       icon: 'database',       label: 'Data Hub' },
  { id: 'myapps',    icon: 'layout-grid',    label: 'My Apps' },
];

const COS_APP_SECTION = [
  { id: 'design',    icon: 'wand-2',         label: 'App Design' },
  { id: 'data',      icon: 'plug',           label: 'Data Management' },
  { id: 'monitor',   icon: 'activity',       label: 'Monitoring' },
];

const AppSidebar = ({ screen, goto }) => {
  const RailItem = ({ mod, indent }) => {
    const active = mod.id === screen ||
      (mod.id === 'home' && (screen === 'spark' || screen === 'blueprint'));
    const [hover, setHover] = React.useState(false);
    const bg = active ? '#E7EEF4' : hover ? '#F5F7FA' : 'transparent';
    const color = active ? '#20668F' : hover ? '#1B202D' : '#667085';
    return (
      <div
        title={mod.label}
        onClick={() => goto(mod.id)}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        style={{
          width: 44, height: 44, borderRadius: 10,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: bg, color, cursor: 'pointer',
          transition: 'background 120ms, color 120ms',
          position: 'relative',
        }}
      >
        <i data-lucide={mod.icon} style={{ width: 20, height: 20, strokeWidth: active ? 2 : 1.75 }} />
        {active && (
          <span style={{
            position: 'absolute', left: -12, top: 10, bottom: 10, width: 3,
            background: '#20668F', borderRadius: 999,
          }} />
        )}
      </div>
    );
  };

  return (
    <aside style={{
      width: 68,
      background: '#FFFFFF',
      borderRight: '1px solid #E6E8EC',
      padding: '14px 0',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 4,
      flexShrink: 0,
      height: '100vh',
      position: 'sticky',
      top: 0,
    }}>
      {/* Brand mark: COSMOS AppOS — four-dot AI riff on Varadise arc */}
      <div
        onClick={() => goto('home')}
        title="COSMOS AppOS"
        style={{
          width: 44, height: 44, borderRadius: 10,
          background: '#0F172A',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          marginBottom: 8, cursor: 'pointer',
          position: 'relative', overflow: 'hidden',
        }}
      >
        <CosmosMark size={22} color="#FFFFFF" />
      </div>

      {COS_MODULES.map(m => <RailItem key={m.id} mod={m} />)}

      <div style={{ width: 28, height: 1, background: '#E6E8EC', margin: '10px 0' }} />

      <div style={{
        fontSize: 9, fontWeight: 700, letterSpacing: '.08em', color: '#9AA1AE',
        textTransform: 'uppercase', marginBottom: 4,
      }}>App</div>

      {COS_APP_SECTION.map(m => <RailItem key={m.id} mod={m} />)}

      <div style={{ flex: 1 }} />

      <div
        onClick={() => goto('home')}
        style={{
          width: 44, height: 44, borderRadius: 10,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#667085', cursor: 'pointer',
        }}
      >
        <i data-lucide="settings" style={{ width: 20, height: 20, strokeWidth: 1.75 }} />
      </div>
      <div style={{
        width: 32, height: 32, borderRadius: 999,
        background: '#3167E3', color: '#fff',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 11, fontWeight: 700, marginTop: 4,
      }}>KL</div>
    </aside>
  );
};

// COSMOS mark: four dots orbiting an arc — reads as "apps around data"
const CosmosMark = ({ size = 20, color = '#0F172A' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    {/* Arc (echoes Varadise logo) */}
    <path d="M4 15 A 8 8 0 0 1 20 15" />
    {/* Four dots representing apps */}
    <circle cx="7" cy="8" r="1.2" fill={color} />
    <circle cx="12" cy="6" r="1.2" fill={color} />
    <circle cx="17" cy="8" r="1.2" fill={color} />
    <circle cx="12" cy="18" r="1.4" fill={color} />
  </svg>
);

window.AppSidebar = AppSidebar;
window.CosmosMark = CosmosMark;

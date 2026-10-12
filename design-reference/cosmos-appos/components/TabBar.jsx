// TabBar.jsx
const TopTabs = ({ tabs, active, onSelect }) => (
  <div style={{ display: 'flex', gap: 2, borderBottom: '1px solid #E6E8EC', paddingLeft: 8 }}>
    {tabs.map(t => {
      const isActive = t.id === active;
      return (
        <div
          key={t.id}
          onClick={() => onSelect(t.id)}
          style={{
            padding: '11px 16px',
            fontSize: 14,
            color: isActive ? '#1B202D' : '#667085',
            fontWeight: isActive ? 600 : 500,
            borderBottom: `2px solid ${isActive ? '#EA6A22' : 'transparent'}`,
            marginBottom: -1,
            display: 'inline-flex', alignItems: 'center', gap: 8,
            cursor: 'pointer',
            transition: 'color 120ms, border-color 120ms',
          }}
        >
          {t.icon && <i data-lucide={t.icon} style={{ width: 14, height: 14, strokeWidth: 2 }} />}
          {t.label}
        </div>
      );
    })}
  </div>
);

const ListTabs = ({ tabs, active, onSelect }) => (
  <div style={{ display: 'flex', borderBottom: '1px solid #E6E8EC' }}>
    {tabs.map(t => {
      const isActive = t.id === active;
      return (
        <div
          key={t.id}
          onClick={() => onSelect(t.id)}
          style={{
            flex: 1,
            textAlign: 'center',
            padding: '12px 16px',
            fontSize: 14,
            color: isActive ? '#1B202D' : '#667085',
            fontWeight: isActive ? 600 : 500,
            borderBottom: `2px solid ${isActive ? '#20668F' : 'transparent'}`,
            marginBottom: -1,
            cursor: 'pointer',
            transition: 'color 120ms, border-color 120ms',
          }}
        >{t.label}{typeof t.count === 'number' && (
          <span style={{
            marginLeft: 8, fontSize: 11, fontWeight: 600,
            padding: '2px 7px', borderRadius: 999,
            background: isActive ? '#E7EEF4' : '#EEF1F4',
            color: isActive ? '#20668F' : '#667085',
          }}>{t.count}</span>
        )}</div>
      );
    })}
  </div>
);

window.TopTabs = TopTabs;
window.ListTabs = ListTabs;

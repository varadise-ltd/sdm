// StatCard.jsx
const StatCard = ({ label, icon, value, unit, delta, deltaTone = 'up', progress }) => {
  const deltaColor = {
    up: '#17803D', down: '#C0362C', warn: '#B27D3A', neutral: '#667085'
  }[deltaTone] || '#667085';

  return (
    <div style={{
      background: '#fff',
      border: '1px solid #E6E8EC',
      borderRadius: 8,
      padding: '18px 20px',
      display: 'flex',
      flexDirection: 'column',
      gap: 4,
      minWidth: 0,
    }}>
      <div style={{
        fontSize: 13, color: '#4B5361', fontWeight: 600,
        display: 'flex', alignItems: 'center', gap: 6,
      }}>
        {icon && <i data-lucide={icon} style={{ width: 14, height: 14, color: '#667085', strokeWidth: 2 }} />}
        {label}
      </div>
      <div style={{
        fontSize: 30, fontWeight: 700, color: '#1B202D',
        letterSpacing: '-0.02em', lineHeight: 1.1,
        fontFeatureSettings: '"tnum" 1',
      }}>
        {value}
        {unit && <span style={{ fontSize: 20, color: '#4B5361', fontWeight: 700, marginLeft: 2 }}>{unit}</span>}
      </div>
      {delta && (
        <div style={{ fontSize: 12, color: deltaColor, marginTop: 2 }}>{delta}</div>
      )}
      {typeof progress === 'number' && (
        <div style={{
          height: 4, background: '#EEF1F4', borderRadius: 99,
          marginTop: 6, overflow: 'hidden',
        }}>
          <div style={{
            width: `${progress}%`, height: '100%',
            background: '#20668F', borderRadius: 99,
          }} />
        </div>
      )}
    </div>
  );
};

window.StatCard = StatCard;

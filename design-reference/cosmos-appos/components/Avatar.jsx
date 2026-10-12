// Avatar.jsx
const AVATAR_COLORS = ['#3167E3', '#20668F', '#17803D', '#B27D3A', '#4B5361', '#7A3EA1', '#C0362C'];

// Deterministic color pick by initials
const pickAvColor = (s) => {
  const key = (s || '').toUpperCase();
  let sum = 0;
  for (let i = 0; i < key.length; i++) sum = (sum * 31 + key.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[sum % AVATAR_COLORS.length];
};

const VAvatar = ({ initials = '?', size = 40, color, style }) => {
  const bg = color || pickAvColor(initials);
  const fontSize = size >= 48 ? 16 : size >= 36 ? 13 : size >= 28 ? 11 : 10;
  return (
    <div style={{
      width: size,
      height: size,
      borderRadius: 999,
      background: bg,
      color: '#fff',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontWeight: 700,
      fontSize,
      flexShrink: 0,
      letterSpacing: '.01em',
      ...style,
    }}>{initials}</div>
  );
};

window.VAvatar = VAvatar;
window.pickAvColor = pickAvColor;

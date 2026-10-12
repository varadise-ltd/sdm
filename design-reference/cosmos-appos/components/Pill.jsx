// Pill.jsx
const PILL_VARIANTS = {
  success: { bg: '#E7F5EC', fg: '#17803D', bd: '#B7DFC2' },
  warn:    { bg: '#FBF1DE', fg: '#B27D3A', bd: '#EBD3A5' },
  danger:  { bg: '#FBE9E7', fg: '#C0362C', bd: '#F1BEB9' },
  info:    { bg: '#E8F0FE', fg: '#2F6FEB', bd: '#BFD3F7' },
  neutral: { bg: '#EEF1F4', fg: '#4B5361', bd: '#DDE2E8' },
};

const VPill = ({ variant = 'neutral', icon, dot, children, style }) => {
  const v = PILL_VARIANTS[variant] || PILL_VARIANTS.neutral;
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '2px 8px',
        borderRadius: 999,
        fontSize: 11,
        fontWeight: 600,
        lineHeight: 1.5,
        background: v.bg,
        color: v.fg,
        border: `1px solid ${v.bd}`,
        whiteSpace: 'nowrap',
        ...style,
      }}
    >
      {dot && <span style={{ width: 6, height: 6, background: v.fg, borderRadius: 999 }} />}
      {icon && <i data-lucide={icon} style={{ width: 11, height: 11 }} />}
      {children}
    </span>
  );
};

window.VPill = VPill;
window.PILL_VARIANTS = PILL_VARIANTS;

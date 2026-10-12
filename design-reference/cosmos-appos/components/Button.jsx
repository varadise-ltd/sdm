// Button.jsx
const VButton = ({ variant = 'neutral', size = 'md', icon, children, onClick, style }) => {
  const base = {
    fontFamily: 'inherit',
    fontSize: size === 'sm' ? 13 : 14,
    fontWeight: 500,
    borderRadius: size === 'sm' ? 6 : 8,
    padding: size === 'sm' ? '6px 10px' : '9px 14px',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
    cursor: 'pointer',
    border: '1px solid transparent',
    transition: 'background 120ms cubic-bezier(0.2,0,0,1), border-color 120ms',
    whiteSpace: 'nowrap',
    lineHeight: 1.2,
  };
  const variants = {
    primary: { background: '#20668F', color: '#fff' },
    neutral: { background: '#fff', borderColor: '#E6E8EC', color: '#1B202D' },
    ghost:   { background: 'transparent', color: '#1B202D' },
    danger:  { background: '#fff', borderColor: '#F1BEB9', color: '#C0362C' },
  };
  const hovers = {
    primary: '#1B587E',
    neutral: '#F5F7FA',
    ghost:   '#F5F7FA',
    danger:  '#FBE9E7',
  };
  const [hover, setHover] = React.useState(false);
  const merged = {
    ...base,
    ...variants[variant],
    ...(hover ? (variant === 'primary'
      ? { background: hovers.primary }
      : variant === 'danger'
        ? { background: hovers.danger }
        : { background: hovers.neutral }) : {}),
    ...style,
  };
  return (
    <button
      style={merged}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={onClick}
    >
      {icon && <i data-lucide={icon} style={{ width: 16, height: 16 }} />}
      {children}
    </button>
  );
};

window.VButton = VButton;

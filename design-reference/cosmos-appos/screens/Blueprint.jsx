// Blueprint.jsx — Interactive wireframe with annotations
const BP_ELEMENTS = [
  { id: 'header',   type: 'Page Header',   x: 24,  y: 24,  w: 632, h: 56,  label: 'Safety Inspection Tracker', ann: 'App title bar. Includes current site selector and week filter.' },
  { id: 'kpi1',     type: 'KPI Card',      x: 24,  y: 96,  w: 152, h: 84,  label: 'Inspections', value: '48', ann: 'KPI showing count of inspections in current week filter.' },
  { id: 'kpi2',     type: 'KPI Card',      x: 184, y: 96,  w: 152, h: 84,  label: 'Critical', value: '3',    ann: 'Count of critical findings across all inspections. Filter by unresolved only. Should turn red when > 0.' },
  { id: 'kpi3',     type: 'KPI Card',      x: 344, y: 96,  w: 152, h: 84,  label: 'Avg Score', value: '87',   ann: 'Mean checklist score for the current filter window.' },
  { id: 'kpi4',     type: 'KPI Card',      x: 504, y: 96,  w: 152, h: 84,  label: 'Overdue',  value: '2',     ann: 'Inspections past their due date. Link opens the overdue list.' },
  { id: 'chart',    type: 'Chart',         x: 24,  y: 196, w: 400, h: 200, label: 'Score Trend', ann: 'Line chart of average score over the last 8 weeks. Zoom-in on click.' },
  { id: 'panel',    type: 'Detail Panel',  x: 436, y: 196, w: 220, h: 200, label: 'Top Findings', ann: 'Live list of the most frequent finding categories.' },
  { id: 'table',    type: 'Table',         x: 24,  y: 412, w: 632, h: 176, label: 'Recent Inspections', ann: 'Sortable list of recent submissions. Click a row to open the inspection detail.' },
];

const BP_LEFT_COMPONENTS = [
  { icon: 'square-stack',    label: 'KPI Card' },
  { icon: 'bar-chart-3',     label: 'Chart' },
  { icon: 'table',           label: 'Table' },
  { icon: 'clipboard-list',  label: 'Form' },
  { icon: 'file-text',       label: 'Detail Panel' },
  { icon: 'square',          label: 'Button' },
  { icon: 'filter',          label: 'Filter' },
  { icon: 'git-branch',      label: 'Timeline' },
  { icon: 'map-pin',         label: 'Map / Location' },
  { icon: 'image',           label: 'File Preview' },
  { icon: 'bell',            label: 'Alert Panel' },
  { icon: 'message-square',  label: 'Comment / Note' },
];

const Blueprint = ({ variant, setVariant, goto }) => {
  const [selected, setSelected] = React.useState('kpi2');
  const [device, setDevice] = React.useState('desktop');
  const selectedEl = BP_ELEMENTS.find(e => e.id === selected);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', minHeight: 0 }}>
      <ScreenHeader
        crumbs={['AppOS', 'Blueprint Mode']}
        title="Blueprint — Safety Inspection Tracker"
        subtitle="Design the app visually. Click any element to teach AppOS how it should behave."
        actions={
          <>
            <VButton icon="arrow-left" onClick={() => goto('home')}>Back</VButton>
            <VButton icon="eye">Preview Flow</VButton>
            <VButton variant="primary" icon="sparkles" onClick={() => goto('spark')}>Generate App</VButton>
          </>
        }
      />

      {/* Sub-toolbar */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px 24px', borderBottom: '1px solid #E6E8EC',
        background: '#FFFFFF', flexShrink: 0,
      }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.06em', fontWeight: 600, color: '#667085', marginRight: 4 }}>Device</div>
          <SegBtn options={[
            { id: 'desktop', label: 'Desktop', icon: 'monitor' },
            { id: 'tablet',  label: 'Tablet',  icon: 'tablet' },
            { id: 'mobile',  label: 'Mobile',  icon: 'smartphone' },
            { id: 'respond', label: 'Responsive', icon: 'monitor-smartphone' },
          ]} value={device} onChange={setDevice} />
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.06em', fontWeight: 600, color: '#667085', marginRight: 4 }}>View</div>
          <SegBtn options={[
            { id: 'canvas',    label: 'Canvas',    icon: 'layout' },
            { id: 'flow',      label: 'Flow',      icon: 'git-fork' },
            { id: 'annotated', label: 'Annotated', icon: 'message-square-text' },
          ]} value={variant} onChange={setVariant} />
        </div>
      </div>

      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '220px 1fr 340px', minHeight: 0 }}>
        {/* LEFT: Components */}
        <div style={{ borderRight: '1px solid #E6E8EC', background: '#FFFFFF', padding: '16px 12px', overflowY: 'auto' }}>
          <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.06em', fontWeight: 600, color: '#667085', padding: '4px 8px 10px' }}>Components</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {BP_LEFT_COMPONENTS.map(c => (
              <div key={c.label} style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px',
                borderRadius: 6, fontSize: 12, color: '#4B5361', cursor: 'grab',
              }}
                onMouseEnter={(e) => e.currentTarget.style.background = '#F5F7FA'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
              >
                <i data-lucide={c.icon} style={{ width: 14, height: 14, color: '#667085' }} />
                {c.label}
              </div>
            ))}
          </div>
          <div style={{ marginTop: 20, padding: '12px', background: '#F3F4F1', border: '1px solid #E6E8EC', borderRadius: 8 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#1B202D', marginBottom: 6 }}>Screens</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11 }}>
              <ScreenLink label="Dashboard" active />
              <ScreenLink label="Inspection List" />
              <ScreenLink label="Inspection Detail" />
              <ScreenLink label="New Inspection Form" />
            </div>
          </div>
        </div>

        {/* MIDDLE: Canvas */}
        <div style={{
          overflow: 'auto',
          background: `
            radial-gradient(circle at 1px 1px, #E6E8EC 1px, transparent 1px)
          `,
          backgroundSize: '20px 20px',
          backgroundColor: '#FAFAFB',
          padding: '32px 40px',
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'center',
        }}>
          {variant === 'canvas' && <CanvasView selected={selected} setSelected={setSelected} />}
          {variant === 'flow' && <FlowView setSelected={setSelected} />}
          {variant === 'annotated' && <AnnotatedView selected={selected} setSelected={setSelected} />}
        </div>

        {/* RIGHT: Annotation panel */}
        <div style={{ borderLeft: '1px solid #E6E8EC', background: '#FFFFFF', overflowY: 'auto' }}>
          {selectedEl && <AnnotationPanel el={selectedEl} onClose={() => setSelected(null)} />}
          {!selectedEl && <EmptyPanel />}
        </div>
      </div>
    </div>
  );
};

const SegBtn = ({ options, value, onChange }) => (
  <div style={{ display: 'inline-flex', background: '#F3F4F1', padding: 3, borderRadius: 8, border: '1px solid #E6E8EC' }}>
    {options.map(o => (
      <button key={o.id} onClick={() => onChange(o.id)} style={{
        padding: '5px 10px', borderRadius: 6, fontSize: 12,
        display: 'inline-flex', alignItems: 'center', gap: 6,
        background: value === o.id ? '#FFFFFF' : 'transparent',
        color: value === o.id ? '#1B202D' : '#667085',
        fontWeight: value === o.id ? 600 : 500,
        boxShadow: value === o.id ? '0 1px 2px rgba(15,23,42,0.06)' : 'none',
        transition: 'all 120ms',
      }}>
        {o.icon && <i data-lucide={o.icon} style={{ width: 12, height: 12 }} />}
        {o.label}
      </button>
    ))}
  </div>
);

const ScreenLink = ({ label, active }) => (
  <div style={{
    display: 'flex', alignItems: 'center', gap: 6, padding: '4px 6px', borderRadius: 4,
    color: active ? '#20668F' : '#4B5361', fontWeight: active ? 600 : 400,
    background: active ? '#E7EEF4' : 'transparent',
    cursor: 'pointer',
  }}>
    <i data-lucide={active ? 'circle-dot' : 'circle'} style={{ width: 10, height: 10 }} />
    {label}
  </div>
);

/* --- Canvas view: wireframe with interactive selection ------------------ */
const CanvasView = ({ selected, setSelected }) => (
  <div style={{
    position: 'relative',
    width: 680, minHeight: 620,
    background: '#FFFFFF',
    border: '1px solid #CBD1DA',
    borderRadius: 10,
    boxShadow: '0 8px 24px rgba(15, 23, 42, 0.06)',
    padding: 0,
  }}>
    {/* Wireframe browser chrome */}
    <div style={{
      display: 'flex', alignItems: 'center', gap: 6, padding: '10px 14px',
      borderBottom: '1px dashed #CBD1DA',
    }}>
      <div style={{ width: 8, height: 8, borderRadius: 999, background: '#E6E8EC' }} />
      <div style={{ width: 8, height: 8, borderRadius: 999, background: '#E6E8EC' }} />
      <div style={{ width: 8, height: 8, borderRadius: 999, background: '#E6E8EC' }} />
      <div style={{ flex: 1, height: 16, background: '#F3F4F1', borderRadius: 6, marginLeft: 8 }} />
    </div>

    <div style={{ position: 'relative', height: 612 }}>
      {BP_ELEMENTS.map(el => (
        <WireEl key={el.id} el={el} selected={selected === el.id} onSelect={() => setSelected(el.id)} />
      ))}
    </div>
  </div>
);

const WireEl = ({ el, selected, onSelect }) => {
  const [hover, setHover] = React.useState(false);
  const showBorder = selected ? '2px solid #20668F' : hover ? '1.5px dashed #20668F' : '1.5px dashed #9AA1AE';
  return (
    <div
      onClick={onSelect}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        position: 'absolute',
        left: el.x, top: el.y, width: el.w, height: el.h,
        border: showBorder,
        background: selected ? 'rgba(32,102,143,0.05)' : hover ? 'rgba(32,102,143,0.03)' : '#FAFAFB',
        borderRadius: 6, cursor: 'pointer',
        display: 'flex', flexDirection: 'column', padding: 10,
        transition: 'all 120ms',
      }}
    >
      {(hover || selected) && (
        <div style={{
          position: 'absolute', top: -22, left: 0,
          padding: '2px 8px', borderRadius: 4,
          background: selected ? '#20668F' : '#0F172A',
          color: '#FFFFFF', fontSize: 10, fontWeight: 600, letterSpacing: '.02em',
          whiteSpace: 'nowrap',
        }}>{el.type}</div>
      )}
      <WireContent el={el} />
    </div>
  );
};

const WireContent = ({ el }) => {
  if (el.type === 'Page Header') return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: '100%' }}>
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#1B202D' }}>{el.label}</div>
        <div style={{ fontSize: 10, color: '#9AA1AE', marginTop: 4 }}>[breadcrumb • filter]</div>
      </div>
      <div style={{ width: 90, height: 24, borderRadius: 4, background: '#E7EEF4', border: '1px dashed #20668F', display:'flex',alignItems:'center',justifyContent:'center', fontSize: 10, color: '#20668F', fontWeight: 600 }}>+ Button</div>
    </div>
  );
  if (el.type === 'KPI Card') return (
    <>
      <div style={{ fontSize: 9, color: '#9AA1AE', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.04em' }}>{el.label}</div>
      <div style={{ fontSize: 26, fontWeight: 700, color: '#1B202D', marginTop: 4, fontFamily: 'JetBrains Mono, monospace' }}>{el.value}</div>
      <div style={{ height: 3, background: '#EEF1F4', borderRadius: 999, marginTop: 'auto' }}>
        <div style={{ width: '65%', height: '100%', background: '#20668F', borderRadius: 999 }} />
      </div>
    </>
  );
  if (el.type === 'Chart') return (
    <>
      <div style={{ fontSize: 11, fontWeight: 600, color: '#4B5361' }}>{el.label}</div>
      <div style={{ flex: 1, marginTop: 8, position: 'relative' }}>
        <FakeChart />
      </div>
    </>
  );
  if (el.type === 'Detail Panel') return (
    <>
      <div style={{ fontSize: 11, fontWeight: 600, color: '#4B5361', marginBottom: 8 }}>{el.label}</div>
      {[0,1,2,3].map(i => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
          <div style={{ width: 6, height: 6, borderRadius: 999, background: '#20668F' }} />
          <div style={{ flex: 1, height: 8, background: '#EEF1F4', borderRadius: 3 }} />
          <div style={{ width: 20, height: 8, background: '#E7F5EC', borderRadius: 3 }} />
        </div>
      ))}
    </>
  );
  if (el.type === 'Table') return (
    <>
      <div style={{ fontSize: 11, fontWeight: 600, color: '#4B5361', marginBottom: 8 }}>{el.label}</div>
      <div style={{ display: 'flex', gap: 12, padding: '4px 0', borderBottom: '1px solid #EEF1F4', fontSize: 9, color: '#9AA1AE', textTransform: 'uppercase', letterSpacing: '.04em', fontWeight: 600 }}>
        <span style={{ width: 100 }}>id</span>
        <span style={{ flex: 1 }}>site</span>
        <span style={{ width: 60 }}>score</span>
        <span style={{ width: 60 }}>flags</span>
        <span style={{ width: 70 }}>status</span>
      </div>
      {[0,1,2,3].map(i => (
        <div key={i} style={{ display: 'flex', gap: 12, padding: '6px 0', borderBottom: '1px dashed #F0F2F5' }}>
          <div style={{ width: 100, height: 8, background: '#EEF1F4', borderRadius: 3 }} />
          <div style={{ flex: 1, height: 8, background: '#EEF1F4', borderRadius: 3 }} />
          <div style={{ width: 60, height: 8, background: '#EEF1F4', borderRadius: 3 }} />
          <div style={{ width: 60, height: 8, background: '#EEF1F4', borderRadius: 3 }} />
          <div style={{ width: 70, height: 8, background: i === 0 ? '#FBF1DE' : '#E7F5EC', borderRadius: 3 }} />
        </div>
      ))}
    </>
  );
  return null;
};

/* --- Flow view: shows screens connected -------------------------------- */
const FlowView = ({ setSelected }) => {
  const screens = [
    { id: 'dash', label: 'Dashboard',        x: 40,  y: 20  },
    { id: 'list', label: 'Inspection List',  x: 320, y: 20  },
    { id: 'det',  label: 'Inspection Detail',x: 600, y: 120 },
    { id: 'form', label: 'New Inspection',   x: 40,  y: 240 },
  ];
  return (
    <div style={{
      position: 'relative', width: 820, height: 460,
      background: '#FFFFFF', border: '1px solid #CBD1DA', borderRadius: 10,
      boxShadow: '0 8px 24px rgba(15,23,42,0.06)',
    }}>
      <svg style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }} width="100%" height="100%">
        <defs>
          <marker id="arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#20668F" />
          </marker>
        </defs>
        <path d="M 240 60 L 320 60" stroke="#20668F" strokeWidth="1.5" fill="none" markerEnd="url(#arr)" />
        <path d="M 520 60 Q 590 60 600 140" stroke="#20668F" strokeWidth="1.5" fill="none" markerEnd="url(#arr)" strokeDasharray="4 3" />
        <path d="M 140 100 Q 140 240 60 260" stroke="#20668F" strokeWidth="1.5" fill="none" markerEnd="url(#arr)" strokeDasharray="4 3" />
      </svg>
      {screens.map(s => (
        <div key={s.id}
          onClick={() => setSelected('header')}
          style={{
            position: 'absolute', left: s.x, top: s.y,
            width: 200, height: 120, background: '#FAFAFB',
            border: '1.5px dashed #9AA1AE', borderRadius: 8,
            padding: 12, cursor: 'pointer',
          }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#1B202D', marginBottom: 8 }}>{s.label}</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
            {[0,1,2,3].map(i => <div key={i} style={{ height: 24, background: '#EEF1F4', borderRadius: 3 }} />)}
          </div>
          <div style={{ height: 30, background: '#EEF1F4', borderRadius: 3, marginTop: 4 }} />
        </div>
      ))}
      <div style={{
        position: 'absolute', bottom: 12, left: 12, right: 12,
        padding: '8px 12px', background: '#F3F4F1', border: '1px solid #E6E8EC', borderRadius: 6,
        fontSize: 11, color: '#4B5361',
      }}>
        <strong style={{ color: '#20668F' }}>Flow view.</strong> Solid arrows are primary nav; dashed are drill-in from a list row.
      </div>
    </div>
  );
};

/* --- Annotated view: same canvas with visible annotations --------------- */
const AnnotatedView = ({ selected, setSelected }) => (
  <div style={{ position: 'relative', display: 'flex', gap: 12 }}>
    <CanvasView selected={selected} setSelected={setSelected} />
    <div style={{ width: 260, display: 'flex', flexDirection: 'column', gap: 10, paddingTop: 40 }}>
      {BP_ELEMENTS.slice(1, 5).map(el => (
        <div key={el.id}
          onClick={() => setSelected(el.id)}
          style={{
            background: selected === el.id ? '#FFFFFF' : '#FAFAFB',
            border: `1px solid ${selected === el.id ? '#20668F' : '#E6E8EC'}`,
            borderRadius: 8, padding: '10px 12px', cursor: 'pointer',
            boxShadow: selected === el.id ? '0 2px 8px rgba(15,23,42,0.06)' : 'none',
          }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
            <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 4, background: '#0F172A', color: '#FFFFFF', fontWeight: 600, letterSpacing: '.02em' }}>{el.type}</span>
            <div style={{ fontSize: 11, color: '#4B5361' }}>{el.label}</div>
          </div>
          <div style={{ fontSize: 11, color: '#4B5361', lineHeight: 1.4 }}>{el.ann}</div>
        </div>
      ))}
    </div>
  </div>
);

/* --- Annotation panel --------------------------------------------------- */
const AnnotationPanel = ({ el, onClose }) => {
  const [text, setText] = React.useState(el.ann);
  React.useEffect(() => { setText(el.ann); }, [el.id]);

  return (
    <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, background: '#20668F', color: '#FFFFFF', fontWeight: 700, letterSpacing: '.02em' }}>{el.type}</span>
          <span style={{ fontSize: 12, color: '#4B5361' }}>{el.label}</span>
        </div>
        <button onClick={onClose} style={{ width: 22, height: 22, borderRadius: 6, color: '#9AA1AE', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <i data-lucide="x" style={{ width: 14, height: 14 }} />
        </button>
      </div>

      <div>
        <div style={{ fontSize: 11, fontWeight: 600, color: '#667085', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 6 }}>Element Note (edit to teach AI)</div>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          style={{
            width: '100%', minHeight: 96, padding: '10px 12px',
            border: '1px solid #E6E8EC', borderRadius: 8, background: '#FAFAFB',
            fontSize: 13, color: '#1B202D', lineHeight: 1.5, resize: 'vertical',
            outline: 'none',
          }}
        />
        <div style={{ fontSize: 11, color: '#9AA1AE', marginTop: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
          <i data-lucide="info" style={{ width: 11, height: 11 }} />
          Speak naturally. Example: "Show only critical flags from BLD-A and turn red when > 0."
        </div>
      </div>

      <div>
        <div style={{ fontSize: 11, fontWeight: 600, color: '#667085', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8 }}>Data Binding</div>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
          background: '#F3F4F1', border: '1px solid #E6E8EC', borderRadius: 8,
        }}>
          <i data-lucide="database" style={{ width: 14, height: 14, color: '#20668F' }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#1B202D' }}>Safety Inspection Forms</div>
            <div style={{ fontSize: 10, color: '#667085' }}>critical_flags · count where status ≠ 'reviewed'</div>
          </div>
          <button style={{ fontSize: 11, color: '#20668F', fontWeight: 600 }}>Edit</button>
        </div>
      </div>

      <div>
        <div style={{ fontSize: 11, fontWeight: 600, color: '#667085', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8 }}>Behaviour on Click</div>
        <select style={{
          width: '100%', padding: '8px 12px', border: '1px solid #E6E8EC', borderRadius: 8,
          background: '#FFFFFF', fontSize: 13, color: '#1B202D', outline: 'none',
        }}>
          <option>Open filtered Inspection List</option>
          <option>Open detail modal</option>
          <option>Do nothing</option>
        </select>
      </div>

      <div>
        <div style={{ fontSize: 11, fontWeight: 600, color: '#667085', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8 }}>Style Variant</div>
        <div style={{ display: 'flex', gap: 6 }}>
          {['Default', 'Compact', 'Emphasis'].map((v, i) => (
            <button key={v} style={{
              flex: 1, padding: '6px 10px', borderRadius: 6, fontSize: 12,
              border: '1px solid #E6E8EC', background: i === 0 ? '#E7EEF4' : '#FFFFFF',
              color: i === 0 ? '#20668F' : '#4B5361', fontWeight: 600, cursor: 'pointer',
            }}>{v}</button>
          ))}
        </div>
      </div>

      <div style={{
        padding: 12, background: 'linear-gradient(135deg, #E7EEF4 0%, #F3F4F1 100%)',
        border: '1px solid #BFD3F7', borderRadius: 10,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 700, color: '#20668F', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 6 }}>
          <i data-lucide="sparkles" style={{ width: 12, height: 12 }} />
          AI Suggestion
        </div>
        <div style={{ fontSize: 12, color: '#1B202D', lineHeight: 1.4 }}>
          Consider adding a mini-trend sparkline. Critical flags dropped from 5 → 3 this week.
        </div>
      </div>
    </div>
  );
};

const EmptyPanel = () => (
  <div style={{ padding: 32, textAlign: 'center', color: '#9AA1AE', fontSize: 13 }}>
    <i data-lucide="mouse-pointer-click" style={{ width: 22, height: 22, marginBottom: 12 }} />
    <div>Click any wireframe element to annotate it.</div>
  </div>
);

window.Blueprint = Blueprint;
window.SegBtn = SegBtn;

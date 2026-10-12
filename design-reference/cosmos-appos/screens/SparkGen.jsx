// SparkGen.jsx — Spark Mode generation pipeline
const SPARK_STEPS = [
  { id: 'read',      icon: 'database',      label: 'Reading connected data',    detail: 'Form Hub · Workforce Hub' },
  { id: 'model',     icon: 'network',       label: 'Building data model',       detail: '3 tables · 2 relationships' },
  { id: 'blueprint', icon: 'layout',        label: 'Designing app blueprint',   detail: 'Dashboard · List · Detail · Form' },
  { id: 'generate',  icon: 'wand-2',        label: 'Generating UI & workflow',  detail: 'React components · rules · access' },
  { id: 'connect',   icon: 'plug-2',        label: 'Wiring data bindings',      detail: 'Realtime & cached fields' },
  { id: 'review',    icon: 'sparkles',      label: 'App ready to preview',     detail: 'Safety Inspection Tracker · v0.1' },
];

const SparkGen = ({ prompt, goto }) => {
  const [stepIdx, setStepIdx] = React.useState(0);
  const [done, setDone] = React.useState(false);

  React.useEffect(() => {
    if (stepIdx >= SPARK_STEPS.length) { setDone(true); return; }
    const t = setTimeout(() => setStepIdx(s => s + 1), stepIdx === 0 ? 800 : 900);
    return () => clearTimeout(t);
  }, [stepIdx]);

  const restart = () => { setStepIdx(0); setDone(false); };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', minHeight: 0 }}>
      <ScreenHeader
        crumbs={['AppOS', 'Spark Mode']}
        title="Generating your app"
        subtitle="AppOS reads your data, drafts the blueprint, and stands up a working preview."
        actions={
          <>
            <VButton icon="arrow-left" onClick={() => goto('home')}>Back</VButton>
            {done && <VButton variant="primary" icon="arrow-right" onClick={() => goto('design')}>Open in Design</VButton>}
          </>
        }
      />

      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '380px 1fr', minHeight: 0 }}>
        {/* LEFT: Prompt card + pipeline */}
        <div style={{
          borderRight: '1px solid #E6E8EC', background: '#FFFFFF',
          padding: '24px 24px', overflowY: 'auto',
        }}>
          {/* Prompt display */}
          <div style={{
            background: '#F3F4F1', border: '1px solid #E6E8EC', borderRadius: 12,
            padding: '14px 16px', marginBottom: 16,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6, fontSize: 11, textTransform: 'uppercase', letterSpacing: '.06em', fontWeight: 600, color: '#667085' }}>
              <i data-lucide="zap" style={{ width: 12, height: 12, color: '#EA6A22' }} />
              Spark prompt
            </div>
            <div style={{ fontSize: 13, color: '#1B202D', lineHeight: 1.5 }}>
              {prompt || 'Safety inspection tracker for site supervisors — daily walk checklist, critical flags, sign-off workflow.'}
            </div>
          </div>

          {/* Data sources locked in */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.06em', fontWeight: 600, color: '#667085', marginBottom: 8 }}>Data Sources</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <SourceRow icon="clipboard-list" name="Safety Inspection Forms" hub="Form Hub" />
              <SourceRow icon="users" name="Personnel Roster" hub="Workforce Hub" />
              <SourceRow icon="building-2" name="Sites & Zones" hub="Asset Hub" />
            </div>
          </div>

          {/* Pipeline steps */}
          <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.06em', fontWeight: 600, color: '#667085', marginBottom: 12 }}>Pipeline</div>
          <div style={{ position: 'relative' }}>
            {SPARK_STEPS.map((s, i) => {
              const status = i < stepIdx ? 'done' : i === stepIdx ? 'active' : 'pending';
              return <PipelineStep key={s.id} step={s} status={status} isLast={i === SPARK_STEPS.length - 1} />;
            })}
          </div>

          {done && (
            <button
              onClick={restart}
              style={{
                marginTop: 20, fontSize: 12, color: '#20668F', fontWeight: 600,
                display: 'inline-flex', alignItems: 'center', gap: 4,
              }}
            >
              <i data-lucide="rotate-cw" style={{ width: 12, height: 12 }} />
              Regenerate
            </button>
          )}
        </div>

        {/* RIGHT: Live preview area */}
        <div style={{ background: '#F3F4F1', padding: '32px', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
          {!done ? <GeneratingPreview stepIdx={stepIdx} /> : <AppPreview goto={goto} />}
        </div>
      </div>
    </div>
  );
};

const SourceRow = ({ icon, name, hub }) => (
  <div style={{
    display: 'flex', alignItems: 'center', gap: 10,
    padding: '8px 12px', borderRadius: 8,
    background: '#FFFFFF', border: '1px solid #E6E8EC',
  }}>
    <i data-lucide={icon} style={{ width: 14, height: 14, color: '#20668F' }} />
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: '#1B202D' }}>{name}</div>
      <div style={{ fontSize: 10, color: '#667085' }}>{hub}</div>
    </div>
    <i data-lucide="check" style={{ width: 12, height: 12, color: '#17803D' }} />
  </div>
);

const PipelineStep = ({ step, status, isLast }) => {
  const isActive = status === 'active';
  const isDone   = status === 'done';
  const dotBg    = isDone ? '#17803D' : isActive ? '#20668F' : '#FFFFFF';
  const dotBorder = isDone ? '#17803D' : isActive ? '#20668F' : '#E6E8EC';
  return (
    <div style={{ display: 'flex', gap: 12, paddingBottom: isLast ? 0 : 14, position: 'relative' }}>
      {!isLast && (
        <div style={{
          position: 'absolute', left: 15, top: 32, bottom: 0, width: 2,
          background: isDone ? '#B7DFC2' : '#E6E8EC',
        }} />
      )}
      <div style={{
        width: 32, height: 32, borderRadius: 999,
        background: dotBg, border: `2px solid ${dotBorder}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: isDone || isActive ? '#FFFFFF' : '#9AA1AE',
        flexShrink: 0, position: 'relative', zIndex: 1,
        transition: 'background 200ms, border-color 200ms',
      }}>
        {isDone
          ? <i data-lucide="check" style={{ width: 14, height: 14, strokeWidth: 3 }} />
          : <i data-lucide={step.icon} style={{ width: 14, height: 14 }} />
        }
        {isActive && (
          <span style={{
            position: 'absolute', inset: -4, borderRadius: 999,
            border: '2px solid #20668F', opacity: 0.3,
            animation: 'cos-pulse 1.2s ease-in-out infinite',
          }} />
        )}
      </div>
      <div style={{ paddingTop: 4 }}>
        <div style={{
          fontSize: 13, fontWeight: 600,
          color: isDone || isActive ? '#1B202D' : '#9AA1AE',
        }}>
          {step.label}
          {isActive && <span className="cos-caret" style={{ display: 'inline-block' }} />}
        </div>
        <div style={{ fontSize: 11, color: isActive ? '#4B5361' : '#9AA1AE', marginTop: 2 }}>
          {step.detail}
        </div>
      </div>
    </div>
  );
};

const GeneratingPreview = ({ stepIdx }) => (
  <div style={{
    flex: 1, background: '#FFFFFF', border: '1px solid #E6E8EC', borderRadius: 16,
    padding: 32, display: 'flex', flexDirection: 'column',
    position: 'relative', overflow: 'hidden',
    minHeight: 500,
  }}>
    {/* Scanning line */}
    <div style={{
      position: 'absolute', left: 0, right: 0, height: 60,
      background: 'linear-gradient(180deg, rgba(32,102,143,0) 0%, rgba(32,102,143,0.08) 50%, rgba(32,102,143,0) 100%)',
      animation: 'cos-scan 2.4s ease-in-out infinite',
      pointerEvents: 'none',
    }} />

    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
      <div style={{
        width: 24, height: 24, borderRadius: 6, background: '#0F172A',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <CosmosMark size={14} color="#FFFFFF" />
      </div>
      <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.08em', fontWeight: 700, color: '#20668F' }}>
        AppOS · generating preview
      </div>
    </div>

    {/* Skeleton dashboard */}
    <SkeletonRow />
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, marginTop: 16 }}>
      {[0,1,2,3].map(i => (
        <div key={i} style={{
          height: stepIdx > 2 ? 88 : 72,
          background: '#F3F4F1', borderRadius: 8, border: '1px solid #E6E8EC',
          transition: 'all 300ms',
        }}>
          {stepIdx > 3 && <FakeStat idx={i} />}
        </div>
      ))}
    </div>
    <div style={{
      marginTop: 16, background: '#F3F4F1', borderRadius: 8, border: '1px solid #E6E8EC',
      height: 200, position: 'relative', overflow: 'hidden',
    }}>
      {stepIdx > 3 && <FakeChart />}
    </div>
    <div style={{ marginTop: 16, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
      {[0,1].map(i => (
        <div key={i} style={{ height: 120, background: '#F3F4F1', borderRadius: 8, border: '1px solid #E6E8EC' }}>
          {stepIdx > 3 && <FakeTableStub />}
        </div>
      ))}
    </div>

    <div style={{
      marginTop: 'auto', paddingTop: 20, display: 'flex', alignItems: 'center', gap: 8,
      fontSize: 12, color: '#667085',
    }}>
      <div style={{
        height: 3, flex: 1, background: '#EEF1F4', borderRadius: 999, overflow: 'hidden',
      }}>
        <div style={{
          height: '100%', width: `${(stepIdx / SPARK_STEPS.length) * 100}%`,
          background: '#20668F', borderRadius: 999,
          transition: 'width 600ms cubic-bezier(0.2,0,0,1)',
        }} />
      </div>
      <span style={{ fontVariantNumeric: 'tabular-nums' }}>{Math.round((stepIdx / SPARK_STEPS.length) * 100)}%</span>
    </div>
  </div>
);

const SkeletonRow = () => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
    <div style={{ width: 32, height: 32, borderRadius: 8, background: '#F3F4F1' }} />
    <div style={{ flex: 1 }}>
      <div style={{ width: 220, height: 14, background: '#F3F4F1', borderRadius: 4, marginBottom: 6 }} />
      <div style={{ width: 140, height: 10, background: '#F3F4F1', borderRadius: 4 }} />
    </div>
  </div>
);

const FakeStat = ({ idx }) => {
  const items = [
    { l: 'Inspections', v: '48' },
    { l: 'Critical', v: '3' },
    { l: 'Avg Score', v: '87' },
    { l: 'Overdue', v: '2' },
  ];
  const it = items[idx];
  return (
    <div style={{ padding: '12px 14px' }} className="cos-fade-in">
      <div style={{ fontSize: 10, color: '#667085', textTransform: 'uppercase', fontWeight: 600 }}>{it.l}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: '#1B202D', marginTop: 4 }}>{it.v}</div>
    </div>
  );
};

const FakeChart = () => (
  <svg width="100%" height="100%" viewBox="0 0 400 200" className="cos-fade-in" preserveAspectRatio="none">
    <defs>
      <linearGradient id="cg" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#20668F" stopOpacity="0.35" />
        <stop offset="100%" stopColor="#20668F" stopOpacity="0" />
      </linearGradient>
    </defs>
    <path d="M0 140 L 40 120 L 80 130 L 120 90 L 160 100 L 200 70 L 240 85 L 280 50 L 320 65 L 360 40 L 400 55 L 400 200 L 0 200 Z" fill="url(#cg)" />
    <path d="M0 140 L 40 120 L 80 130 L 120 90 L 160 100 L 200 70 L 240 85 L 280 50 L 320 65 L 360 40 L 400 55" fill="none" stroke="#20668F" strokeWidth="2" />
  </svg>
);

const FakeTableStub = () => (
  <div className="cos-fade-in" style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
    {[0,1,2,3].map(i => (
      <div key={i} style={{ display: 'flex', gap: 8 }}>
        <div style={{ width: 20, height: 20, borderRadius: 999, background: '#E7EEF4' }} />
        <div style={{ flex: 1, height: 10, background: '#EEF1F4', borderRadius: 4, marginTop: 5 }} />
        <div style={{ width: 40, height: 10, background: '#E7F5EC', borderRadius: 4, marginTop: 5 }} />
      </div>
    ))}
  </div>
);

// Post-generation preview of the actual generated app
const AppPreview = ({ goto }) => (
  <div className="cos-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 4 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <VPill variant="success" icon="check-circle-2">Generated</VPill>
        <div style={{ fontSize: 13, color: '#4B5361' }}>Safety Inspection Tracker · v0.1</div>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <VButton size="sm" icon="refresh-cw">Regenerate</VButton>
        <VButton size="sm" icon="git-branch" variant="neutral">Open Blueprint</VButton>
        <VButton size="sm" variant="primary" icon="arrow-right" onClick={() => goto('design')}>Open in Design</VButton>
      </div>
    </div>

    <div style={{
      background: '#FFFFFF', border: '1px solid #E6E8EC', borderRadius: 16,
      overflow: 'hidden', boxShadow: '0 1px 2px rgba(15,23,42,0.04)',
    }}>
      <MockAppShell />
    </div>
  </div>
);

// Simplified mock of the generated Safety Inspection Tracker
const MockAppShell = () => (
  <div>
    <div style={{
      padding: '14px 20px', borderBottom: '1px solid #E6E8EC',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      background: '#F3F4F1',
    }}>
      <div>
        <div style={{ fontSize: 15, fontWeight: 700, color: '#1B202D' }}>Safety Inspection Tracker</div>
        <div style={{ fontSize: 11, color: '#667085' }}>All sites · Week 27</div>
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        <div style={{ fontSize: 11, padding: '4px 8px', borderRadius: 6, background: '#FFFFFF', border: '1px solid #E6E8EC', color: '#4B5361' }}>Filter</div>
        <div style={{ fontSize: 11, padding: '4px 8px', borderRadius: 6, background: '#20668F', color: '#FFFFFF', fontWeight: 600 }}>+ New Inspection</div>
      </div>
    </div>
    <div style={{ padding: 20, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
      {[
        { l: 'Inspections',   v: '48',  d: '+6 vs. last wk', tone: '#17803D' },
        { l: 'Critical Flags', v: '3',   d: '2 unresolved',   tone: '#C0362C' },
        { l: 'Avg Score',     v: '87',  d: '+2 pts',         tone: '#17803D' },
        { l: 'Overdue',       v: '2',   d: 'BLD-B, BLD-C',   tone: '#B27D3A' },
      ].map((s, i) => (
        <div key={i} style={{ background: '#FFFFFF', border: '1px solid #E6E8EC', borderRadius: 8, padding: '12px 14px' }}>
          <div style={{ fontSize: 11, color: '#667085', textTransform: 'uppercase', fontWeight: 600, letterSpacing: '.04em' }}>{s.l}</div>
          <div style={{ fontSize: 24, fontWeight: 700, color: '#1B202D', marginTop: 4, letterSpacing: '-0.02em' }}>{s.v}</div>
          <div style={{ fontSize: 11, color: s.tone, marginTop: 2 }}>{s.d}</div>
        </div>
      ))}
    </div>
    <div style={{ padding: '0 20px 20px' }}>
      <div style={{ background: '#F3F4F1', border: '1px solid #E6E8EC', borderRadius: 8, padding: 16, height: 160 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: '#1B202D', marginBottom: 8 }}>Score trend</div>
        <FakeChart />
      </div>
    </div>
    <div style={{ padding: '0 20px 20px' }}>
      <div style={{ background: '#FFFFFF', border: '1px solid #E6E8EC', borderRadius: 8 }}>
        <div style={{ padding: '10px 14px', borderBottom: '1px solid #E6E8EC', fontSize: 12, fontWeight: 600, color: '#1B202D', display: 'flex', justifyContent: 'space-between' }}>
          Recent Inspections
          <span style={{ fontSize: 11, color: '#667085', fontWeight: 500 }}>Showing 4 of 48</span>
        </div>
        {[
          { id: 'INSP-2026-0338', site: 'BLD-A · L5 Mech', by: 'K. Lam', score: 87, flags: 2, status: 'submitted', tone: 'info' },
          { id: 'INSP-2026-0337', site: 'BLD-A · L3 Atrium', by: 'K. Lam', score: 94, flags: 0, status: 'reviewed', tone: 'success' },
          { id: 'INSP-2026-0336', site: 'BLD-B · Roof W',  by: 'P. Wong', score: 72, flags: 4, status: 'submitted', tone: 'info' },
          { id: 'INSP-2026-0333', site: 'BLD-B · MEP',     by: 'P. Wong', score: 65, flags: 5, status: 'draft',     tone: 'neutral' },
        ].map((r, i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '140px 1fr 100px 80px 70px 90px', gap: 10, padding: '10px 14px', borderTop: i ? '1px solid #F0F2F5' : 'none', alignItems: 'center', fontSize: 12 }}>
            <div style={{ fontFamily: 'JetBrains Mono, monospace', color: '#4B5361' }}>{r.id}</div>
            <div style={{ color: '#1B202D', fontWeight: 500 }}>{r.site}</div>
            <div style={{ color: '#667085' }}>{r.by}</div>
            <div style={{ color: r.score >= 90 ? '#17803D' : r.score >= 75 ? '#4B5361' : '#B27D3A', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{r.score}</div>
            <div style={{ color: r.flags > 0 ? '#C0362C' : '#9AA1AE', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{r.flags} ⚑</div>
            <div><VPill variant={r.tone}>{r.status}</VPill></div>
          </div>
        ))}
      </div>
    </div>
  </div>
);

window.SparkGen = SparkGen;
window.MockAppShell = MockAppShell;
window.FakeChart = FakeChart;

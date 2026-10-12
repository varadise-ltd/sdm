// ChatHome.jsx — AppOS entry, Chatbot-style
const CH_SUGGESTIONS = {
  spark: [
    { icon: 'clipboard-check', label: 'Safety inspection tracker for site supervisors', hub: 'Form Hub' },
    { icon: 'gauge',           label: 'Equipment health monitoring with anomaly alerts', hub: 'IoT Hub' },
    { icon: 'user-round-plus', label: 'Visitor management with QR check-in',            hub: 'Form Hub' },
    { icon: 'zap',             label: 'Energy consumption dashboard by zone',           hub: 'IoT Hub' },
  ],
  blueprint: [
    { icon: 'layout-dashboard', label: 'Site operations dashboard with drill-down', device: 'Desktop' },
    { icon: 'clipboard-list',   label: 'Daily inspection form with signature capture', device: 'Mobile' },
    { icon: 'kanban',           label: 'Work order kanban across teams',              device: 'Tablet' },
  ],
};

const CH_RECENT = [
  { name: 'Safety Inspection Tracker', module: 'Form Hub', updated: '3h ago', status: 'Needs Attention', tone: 'warn' },
  { name: 'Visitor Access',            module: 'Form Hub', updated: 'Yesterday', status: 'Published', tone: 'success' },
  { name: 'Chiller Plant Overview',    module: 'IoT Hub',  updated: '2d ago', status: 'Draft',      tone: 'neutral' },
];

const ChatHome = ({ mode, setMode, prompt, setPrompt, goto }) => {
  const textareaRef = React.useRef(null);
  const [focused, setFocused] = React.useState(false);

  React.useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = Math.min(180, Math.max(52, textareaRef.current.scrollHeight)) + 'px';
    }
  }, [prompt]);

  const submit = () => {
    if (!prompt.trim()) return;
    goto(mode === 'spark' ? 'spark' : 'blueprint');
  };

  const suggestions = CH_SUGGESTIONS[mode];

  return (
    <div style={{
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      background: 'linear-gradient(180deg, #FAFAFB 0%, #F3F4F1 100%)',
      minHeight: '100vh',
    }}>
      {/* Slim top bar with breadcrumb-like brand row */}
      <div style={{
        height: 52, borderBottom: '1px solid #E6E8EC',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 24px', background: '#FAFAFB',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: '#667085' }}>
          <span style={{ color: '#1B202D', fontWeight: 600 }}>COSMOS AppOS</span>
          <i data-lucide="chevron-right" style={{ width: 13, height: 13, color: '#9AA1AE' }} />
          <span>Home</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            fontSize: 11, fontWeight: 600, letterSpacing: '.04em',
            padding: '4px 10px', borderRadius: 999,
            background: '#E7F5EC', color: '#17803D', border: '1px solid #B7DFC2',
            display: 'inline-flex', alignItems: 'center', gap: 6,
          }}>
            <span style={{ width: 6, height: 6, borderRadius: 999, background: '#17803D' }} />
            8 Hubs connected
          </div>
          <div style={{ width: 32, height: 32, borderRadius: 8, display:'flex', alignItems:'center', justifyContent:'center', color: '#4B5361' }}>
            <i data-lucide="bell" style={{ width: 18, height: 18 }} />
          </div>
        </div>
      </div>

      {/* Center hero */}
      <div style={{
        flex: 1, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        padding: '48px 32px 32px',
      }}>
        <div style={{
          width: '100%', maxWidth: 760, display: 'flex', flexDirection: 'column',
          gap: 32, alignItems: 'center',
        }}>
          {/* Wordmark */}
          <div style={{ textAlign: 'center' }}>
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 12,
              marginBottom: 20,
            }}>
              <div style={{
                width: 48, height: 48, borderRadius: 12, background: '#0F172A',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <CosmosMark size={26} color="#FFFFFF" />
              </div>
              <div style={{ textAlign: 'left' }}>
                <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: '-0.02em', color: '#0F172A', lineHeight: 1 }}>
                  COSMOS <span style={{ color: '#20668F' }}>AppOS</span>
                </div>
                <div style={{ fontSize: 12, color: '#667085', marginTop: 4 }}>
                  AI App Operating System · v1.4
                </div>
              </div>
            </div>
            <h1 style={{
              margin: 0, fontSize: 34, fontWeight: 700, letterSpacing: '-0.02em',
              color: '#1B202D', lineHeight: 1.2,
            }}>Turn your data into a working app.</h1>
            <p style={{
              margin: '12px 0 0', fontSize: 16, color: '#4B5361',
              maxWidth: 560, marginLeft: 'auto', marginRight: 'auto',
            }}>
              Describe what you need. AppOS reads your connected data, generates the app,
              and keeps it running.
            </p>
          </div>

          {/* Mode toggle */}
          <div style={{
            display: 'inline-flex', padding: 4, borderRadius: 999,
            background: '#FFFFFF', border: '1px solid #E6E8EC',
          }}>
            <ModeBtn active={mode === 'spark'} onClick={() => setMode('spark')} icon="zap"
              title="Spark" subtitle="Generate now" />
            <ModeBtn active={mode === 'blueprint'} onClick={() => setMode('blueprint')} icon="pen-line"
              title="Blueprint" subtitle="Design first" />
          </div>

          {/* Prompt box */}
          <div style={{
            width: '100%', background: '#FFFFFF',
            border: `1px solid ${focused ? '#20668F' : '#E6E8EC'}`,
            borderRadius: 16,
            boxShadow: focused ? '0 0 0 4px rgba(32, 102, 143, 0.12)' : '0 1px 2px rgba(15, 23, 42, 0.04)',
            transition: 'border-color 160ms, box-shadow 160ms',
            padding: '18px 20px 14px',
          }}>
            <textarea
              ref={textareaRef}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit(); }}
              placeholder={mode === 'spark'
                ? 'Describe the app you want to create. You can use connected data or start with mock data.'
                : 'Describe the app you want to design. AppOS will create an interactive wireframe first.'
              }
              style={{
                width: '100%', border: 'none', outline: 'none', resize: 'none',
                fontSize: 15, color: '#1B202D', lineHeight: 1.5,
                background: 'transparent', minHeight: 52,
              }}
            />
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              marginTop: 8, borderTop: '1px solid #F0F2F5', paddingTop: 10,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <ToolChip icon="database" label={mode === 'spark' ? 'Form Hub · Workforce Hub' : 'Choose data'} />
                <ToolChip icon={mode === 'blueprint' ? 'monitor' : 'file-cog'} label={mode === 'blueprint' ? 'Desktop · Responsive' : 'Real data'} />
                <ToolChip icon="paperclip" label="Attach" />
              </div>
              <button
                onClick={submit}
                disabled={!prompt.trim()}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '9px 14px', borderRadius: 999,
                  background: prompt.trim() ? '#20668F' : '#EEF1F4',
                  color: prompt.trim() ? '#FFFFFF' : '#9AA1AE',
                  fontSize: 13, fontWeight: 600,
                  cursor: prompt.trim() ? 'pointer' : 'not-allowed',
                  transition: 'background 120ms',
                }}
              >
                {mode === 'spark' ? 'Generate' : 'Design'}
                <i data-lucide="arrow-up" style={{ width: 14, height: 14 }} />
              </button>
            </div>
          </div>

          {/* Suggestions */}
          <div style={{ width: '100%' }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12,
              fontSize: 11, fontWeight: 600, letterSpacing: '.06em',
              textTransform: 'uppercase', color: '#667085',
            }}>
              <i data-lucide={mode === 'spark' ? 'zap' : 'pen-line'} style={{ width: 12, height: 12 }} />
              {mode === 'spark' ? 'Start from a prompt' : 'Start from a blueprint'}
            </div>
            <div style={{ display: 'grid', gap: 8 }}>
              {suggestions.map((s, i) => (
                <button
                  key={i}
                  onClick={() => { setPrompt(s.label); setTimeout(submit, 100); }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '12px 14px', background: '#FFFFFF',
                    border: '1px solid #E6E8EC', borderRadius: 12,
                    textAlign: 'left', width: '100%', cursor: 'pointer',
                    transition: 'border-color 120ms, background 120ms',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#CBD1DA'; e.currentTarget.style.background = '#F9FAFB'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#E6E8EC'; e.currentTarget.style.background = '#FFFFFF'; }}
                >
                  <div style={{
                    width: 32, height: 32, borderRadius: 8,
                    background: '#F3F4F1', color: '#20668F',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0,
                  }}>
                    <i data-lucide={s.icon} style={{ width: 16, height: 16 }} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 500, color: '#1B202D' }}>{s.label}</div>
                    <div style={{ fontSize: 12, color: '#667085', marginTop: 2 }}>
                      {s.hub && <>Uses <span style={{ color: '#20668F', fontWeight: 500 }}>{s.hub}</span></>}
                      {s.device && <>Target: <span style={{ color: '#20668F', fontWeight: 500 }}>{s.device}</span></>}
                    </div>
                  </div>
                  <i data-lucide="arrow-up-right" style={{ width: 14, height: 14, color: '#9AA1AE' }} />
                </button>
              ))}
            </div>
          </div>

          {/* Recent apps strip */}
          <div style={{ width: '100%', marginTop: 12 }}>
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              marginBottom: 12,
            }}>
              <div style={{
                fontSize: 11, fontWeight: 600, letterSpacing: '.06em',
                textTransform: 'uppercase', color: '#667085',
                display: 'inline-flex', alignItems: 'center', gap: 8,
              }}>
                <i data-lucide="clock" style={{ width: 12, height: 12 }} />
                Recent apps
              </div>
              <button onClick={() => goto('myapps')} style={{
                fontSize: 12, color: '#20668F', fontWeight: 600, cursor: 'pointer',
                display: 'inline-flex', alignItems: 'center', gap: 4,
              }}>
                View all
                <i data-lucide="arrow-right" style={{ width: 12, height: 12 }} />
              </button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
              {CH_RECENT.map((a, i) => (
                <button key={i}
                  onClick={() => goto(a.name === 'Safety Inspection Tracker' ? 'design' : 'myapps')}
                  style={{
                    background: '#FFFFFF', border: '1px solid #E6E8EC', borderRadius: 12,
                    padding: '14px 16px', textAlign: 'left', cursor: 'pointer',
                    display: 'flex', flexDirection: 'column', gap: 8,
                    transition: 'border-color 120ms',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#CBD1DA'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#E6E8EC'; }}
                >
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#1B202D' }}>{a.name}</div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <div style={{ fontSize: 11, color: '#667085' }}>{a.module} · {a.updated}</div>
                    <VPill variant={a.tone}>{a.status.toLowerCase()}</VPill>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const ModeBtn = ({ active, onClick, icon, title, subtitle }) => {
  const [hover, setHover] = React.useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 10,
        padding: '10px 18px', borderRadius: 999,
        background: active ? '#20668F' : hover ? '#F5F7FA' : 'transparent',
        color: active ? '#FFFFFF' : '#1B202D',
        cursor: 'pointer',
        transition: 'background 160ms',
      }}
    >
      <i data-lucide={icon} style={{ width: 15, height: 15 }} />
      <div style={{ textAlign: 'left' }}>
        <div style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.15 }}>{title}</div>
        <div style={{ fontSize: 11, opacity: 0.75, lineHeight: 1 }}>{subtitle}</div>
      </div>
    </button>
  );
};

const ToolChip = ({ icon, label }) => (
  <div style={{
    display: 'inline-flex', alignItems: 'center', gap: 6,
    padding: '5px 10px', borderRadius: 999,
    background: '#F3F4F1', color: '#4B5361',
    fontSize: 12, fontWeight: 500,
    border: '1px solid #E6E8EC',
    cursor: 'pointer',
  }}>
    <i data-lucide={icon} style={{ width: 12, height: 12 }} />
    {label}
  </div>
);

window.ChatHome = ChatHome;

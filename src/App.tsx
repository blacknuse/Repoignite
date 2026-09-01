import React, { useEffect, useMemo, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';

type View = 'editor' | 'scripts' | 'clients' | 'settings';
type Panel = 'problems' | 'output' | 'terminal';
type Theme = 'dark' | 'light';
type Density = 'comfortable' | 'compact';
type OutputLevel = 'output' | 'warning' | 'error' | 'info';

type Tab = { id: number; name: string; content: string; dirty: boolean };
type RuntimeStatus = { online: boolean; port: number; mode?: string };
type ClientInfo = { name: string; pid: number; memory: string };
type OutputEntry = { level: OutputLevel; message: string; timestamp?: string | null };
type ScriptItem = { id?: string; slug?: string; title?: string; game?: string; verified?: boolean; views?: number; scriptType?: string; script?: string };
type ScriptSearchResult = { scripts: ScriptItem[]; page: number; totalPages: number };
type AppInfo = { version: string; platform: string; arch: string };
type OpenedScript = { name: string; path: string; content: string };
type SavedScript = { ok: boolean; name: string; path: string };
type SettingsPayload = { theme?: Theme; motion?: boolean; density?: Density };

const PREVIEW = new URLSearchParams(location.search).get('preview');
const STORAGE_KEY = 'osirhidden-v2-tsx-workspace';
const DEFAULT_SCRIPT = '-- osirhidden workspace\n\nprint("Hello from osirhidden")';

async function safeInvoke<T>(command: string, args: Record<string, unknown> = {}, fallback: T): Promise<T> {
  try { return await invoke<T>(command, args); }
  catch (error) {
    if (PREVIEW) return fallback;
    throw error;
  }
}

const iconPaths: Record<string, string[]> = {
  code: ['M8 9 4 12l4 3','m16-6 4 3-4 3','m14 5-4 14'],
  globe: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z','M3.6 9h16.8','M3.6 15h16.8','M12 3c2.3 2.45 3.5 5.45 3.5 9S14.3 18.55 12 21c-2.3-2.45-3.5-5.45-3.5-9S9.7 5.45 12 3Z'],
  users: ['M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2','M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z','M22 21v-2a4 4 0 0 0-3-3.87'],
  settings: ['M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4Z','M19.4 15a7.6 7.6 0 0 0 .1-3l2-1.3-2-3.4-2.3.8a8 8 0 0 0-2.6-1.5L14 4h-4l-.5 2.6A8 8 0 0 0 7 8.1l-2.4-.8-2 3.4L4.6 12a7.6 7.6 0 0 0 .1 3l-2.1 1.3 2 3.4 2.4-.8a8 8 0 0 0 2.5 1.5L10 23h4l.5-2.6a8 8 0 0 0 2.6-1.5l2.3.8 2-3.4-2-1.3Z'],
  play: ['m8 5 11 7-11 7V5Z'], plus:['M12 5v14','M5 12h14'], x:['m6 6 12 12','M18 6 6 18'], minus:['M5 12h14'], square:['M6 6h12v12H6z'],
  folder:['M3 6.5h6l2 2h10v10.5H3V6.5Z'], file:['M6 2.5h8l4 4V21H6V2.5Z','M14 2.5v5h5'], search:['m21 21-4.2-4.2','M19 11a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z'],
  open:['M4 6h6l2 2h8v10H4V6Z','m12 4 4 4 4-4','M16 8V3'], save:['M4 4h14l2 2v14H4V4Z','M7 4v6h9V4','M8 20v-6h8v6'], copy:['M8 8h11v12H8V8Z','M5 16H4V4h11v1'],
  chevron:['m9 18 6-6-6-6'], terminal:['m4 6 5 5-5 5','M11 18h9'], refresh:['M20 6v5h-5','M4 18v-5h5','M6.2 8.8A7 7 0 0 1 18.5 6.5L20 11','M4 13l1.5 4.5A7 7 0 0 0 17.8 15'],
  bolt:['m13 2-9 12h7l-1 8 9-12h-7l1-8Z'], monitor:['M3 4h18v12H3V4Z','M8 21h8','M12 16v5'], check:['m5 12 4 4L19 6'], link:['M10 13a5 5 0 0 0 7.1.1l2-2a5 5 0 0 0-7.1-7.1l-1.1 1.1','M14 11a5 5 0 0 0-7.1-.1l-2 2A5 5 0 0 0 12 20l1.1-1.1']
};

function Icon({ name, size = 15 }: { name: string; size?: number }) {
  return <svg className="ico" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {(iconPaths[name] || iconPaths.code).map((d, i) => <path d={d} key={i} />)}
  </svg>;
}

function BrandMark({ size = 20 }: { size?: number }) {
  return <svg className="brand-mark" width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
    <path d="M7.2 11.1C9.5 7.7 12.4 6 16 6c3.7 0 6.6 1.7 8.8 5.1" stroke="currentColor" strokeWidth="2.15" strokeLinecap="round" />
    <path d="M24.8 20.9C22.5 24.3 19.6 26 16 26c-3.7 0-6.6-1.7-8.8-5.1" stroke="currentColor" strokeWidth="2.15" strokeLinecap="round" opacity=".66" />
    <path d="M9.1 24.3 22.9 7.7" stroke="currentColor" strokeWidth="2.55" strokeLinecap="round" />
  </svg>;
}

function WindowControls() {
  return <div className="window-controls">
    <button className="window-button" onClick={() => void safeInvoke('window_minimize', {}, null)} aria-label="Minimize"><Icon name="minus" size={14} /></button>
    <button className="window-button" onClick={() => void safeInvoke('window_toggle_maximize', {}, null)} aria-label="Maximize"><Icon name="square" size={13} /></button>
    <button className="window-button window-button--close" onClick={() => void safeInvoke('window_close', {}, null)} aria-label="Close"><Icon name="x" size={14} /></button>
  </div>;
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (next: boolean) => void; label: string }) {
  return <button type="button" className={`toggle ${checked ? 'is-on' : ''}`} onClick={() => onChange(!checked)} aria-pressed={checked} aria-label={label}>
    <span className="toggle-knob" />
  </button>;
}

const bootStages = [
  ['Preparing workspace', 18],
  ['Restoring interface', 38],
  ['Starting native shell', 61],
  ['Checking local runtime', 78],
  ['Discovering clients', 92],
  ['Ready', 100]
] as const;

export default function App() {
  const stored = useMemo(() => {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') as { theme?: Theme; motion?: boolean; density?: Density; tabs?: Tab[]; activeTab?: number; nextTab?: number }; }
    catch { return {}; }
  }, []);

  const [phase, setPhase] = useState<'splash' | 'main'>(PREVIEW === 'main' ? 'main' : 'splash');
  const [progress, setProgress] = useState(PREVIEW === 'splash' ? 64 : 4);
  const [bootTitle, setBootTitle] = useState('Initializing osirhidden');
  const [view, setView] = useState<View>('editor');
  const [panel, setPanel] = useState<Panel>('output');
  const [theme, setTheme] = useState<Theme>(stored.theme || 'dark');
  const [motion, setMotion] = useState(stored.motion !== false);
  const [density, setDensity] = useState<Density>(stored.density || 'comfortable');
  const [scriptsOpen, setScriptsOpen] = useState(true);
  const [autoOpen, setAutoOpen] = useState(true);
  const [tabs, setTabs] = useState<Tab[]>(stored.tabs?.length ? stored.tabs : [{ id: 1, name: 'Tab #1', content: DEFAULT_SCRIPT, dirty: false }]);
  const [activeTabId, setActiveTabId] = useState(stored.activeTab || 1);
  const [nextTabId, setNextTabId] = useState(stored.nextTab || 2);
  const [runtime, setRuntime] = useState<RuntimeStatus>({ online: false, port: 6969, mode: 'detached' });
  const [clients, setClients] = useState<ClientInfo[]>([]);
  const [output, setOutput] = useState<OutputEntry[]>([]);
  const [terminal, setTerminal] = useState<OutputEntry[]>([{ level: 'info', message: 'Native Tauri workspace ready.' }]);
  const [problems] = useState<OutputEntry[]>([]);
  const [outputQuery, setOutputQuery] = useState('');
  const [scriptQuery, setScriptQuery] = useState('');
  const [scriptResults, setScriptResults] = useState<ScriptItem[]>([]);
  const [scriptPage, setScriptPage] = useState(1);
  const [scriptTotalPages, setScriptTotalPages] = useState(1);
  const [scriptLoading, setScriptLoading] = useState(false);
  const [scriptError, setScriptError] = useState('');
  const [toast, setToast] = useState<string | null>(null);
  const [appInfo, setAppInfo] = useState<AppInfo>({ version: '2.0.0', platform: 'windows', arch: 'x86_64' });
  const gutterRef = useRef<HTMLPreElement>(null);
  const toastTimer = useRef<number | undefined>(undefined);

  const activeTab = tabs.find(tab => tab.id === activeTabId) || tabs[0];
  const lineNumbers = useMemo(() => Array.from({ length: Math.max(1, activeTab?.content.split('\n').length || 1) }, (_, index) => index + 1).join('\n'), [activeTab?.content]);

  const showToast = (message: string) => {
    setToast(message);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 1500);
  };

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ theme, motion, density, tabs, activeTab: activeTabId, nextTab: nextTabId }));
    void safeInvoke('save_settings', { value: { theme, motion, density } satisfies SettingsPayload }, null);
  }, [theme, motion, density, tabs, activeTabId, nextTabId]);

  useEffect(() => {
    if (PREVIEW === 'splash') return;
    if (PREVIEW === 'main') return;
    let cancelled = false;
    (async () => {
      for (const [title, pct] of bootStages) {
        if (cancelled) return;
        setBootTitle(title);
        setProgress(pct);
        if (pct === 38) {
          const settings = await safeInvoke<SettingsPayload>('load_settings', {}, {});
          if (settings.theme) setTheme(settings.theme);
          if (typeof settings.motion === 'boolean') setMotion(settings.motion);
          if (settings.density) setDensity(settings.density);
        }
        if (pct === 61) setAppInfo(await safeInvoke<AppInfo>('app_info', {}, appInfo));
        if (pct === 78) setRuntime(await safeInvoke<RuntimeStatus>('runtime_status', { port: 6969 }, { online: false, port: 6969, mode: 'detached' }));
        if (pct === 92) setClients(await safeInvoke<ClientInfo[]>('list_clients', {}, []));
        await new Promise(resolve => window.setTimeout(resolve, 155));
      }
      await safeInvoke('promote_main_window', {}, null);
      if (!cancelled) setPhase('main');
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (phase !== 'main') return;
    let cancelled = false;
    const poll = async () => {
      const [nextClients, nextRuntime, nextOutput] = await Promise.all([
        safeInvoke<ClientInfo[]>('list_clients', {}, []),
        safeInvoke<RuntimeStatus>('runtime_status', { port: 6969 }, { online: false, port: 6969, mode: 'detached' }),
        safeInvoke<OutputEntry[]>('read_roblox_output', { limit: 180 }, [])
      ]);
      if (!cancelled) { setClients(nextClients); setRuntime(nextRuntime); setOutput(nextOutput); }
    };
    void poll();
    const timer = window.setInterval(() => void poll(), 1800);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [phase]);

  const addTab = (content = '', name?: string) => {
    const id = nextTabId;
    setTabs(current => [...current, { id, name: name || `Tab #${id}`, content, dirty: Boolean(content) }]);
    setActiveTabId(id);
    setNextTabId(id + 1);
  };

  const closeTab = (id: number) => {
    if (tabs.length === 1) return;
    const index = tabs.findIndex(tab => tab.id === id);
    const nextTabs = tabs.filter(tab => tab.id !== id);
    setTabs(nextTabs);
    if (activeTabId === id) setActiveTabId(nextTabs[Math.min(index, nextTabs.length - 1)].id);
  };

  const updateActiveTab = (content: string) => {
    setTabs(current => current.map(tab => tab.id === activeTabId ? { ...tab, content, dirty: true } : tab));
  };

  const openFile = async () => {
    const data = await safeInvoke<OpenedScript | null>('open_script', {}, null);
    if (data) addTab(data.content, data.name);
  };

  const saveFile = async () => {
    if (!activeTab) return;
    const result = await safeInvoke<SavedScript | null>('save_script', {
      suggestedName: activeTab.name.endsWith('.lua') ? activeTab.name : `${activeTab.name}.lua`,
      content: activeTab.content
    }, null);
    if (!result) return;
    setTabs(current => current.map(tab => tab.id === activeTabId ? { ...tab, name: result.name, dirty: false } : tab));
    showToast('Saved');
  };

  const searchScripts = async (page = 1) => {
    setScriptLoading(true);
    setScriptError('');
    try {
      const result = await safeInvoke<ScriptSearchResult>('scriptblox_search', { query: scriptQuery, page }, { scripts: [], page, totalPages: 1 });
      setScriptResults(result.scripts || []);
      setScriptPage(result.page || page);
      setScriptTotalPages(result.totalPages || 1);
    } catch (error) { setScriptError(String(error)); }
    finally { setScriptLoading(false); }
  };

  const openScriptItem = async (item: ScriptItem) => {
    let source = item.script || '';
    const identifier = item.slug || item.id || '';
    if (!source && identifier) {
      const result = await safeInvoke<{ script: string }>('scriptblox_raw', { identifier }, { script: '' });
      source = result.script || '';
    }
    if (!source) return;
    addTab(source, `${item.title || 'Script'}.lua`);
    setView('editor');
  };

  const closeClient = async (pid: number) => {
    if (!window.confirm(`Close detected Roblox client ${pid}?`)) return;
    try { await safeInvoke('close_client', { pid }, null); showToast('Client closed'); }
    catch (error) { showToast(String(error)); }
  };

  if (phase === 'splash') {
    return <div className="splash-shell">
      <div className="splash-grid" />
      <div className="splash-orb splash-orb--a" />
      <div className="splash-orb splash-orb--b" />
      <header className="splash-header"><BrandMark size={27} /><span>DESKTOP · V2.0</span></header>
      <div className="splash-center"><div className="splash-word">OSIRHIDDEN</div><div className="splash-tagline">NATIVE / REACT / TAURI</div></div>
      <div className="splash-progress">
        <div className="splash-copy"><strong>{bootTitle}</strong><span>Preparing the workspace.</span></div>
        <div className="splash-percent">{String(progress).padStart(2, '0')}%</div>
        <div className="splash-track"><div className="splash-fill" style={{ width: `${progress}%` }} /></div>
      </div>
    </div>;
  }

  const filteredOutput = output.filter(row => row.message.toLowerCase().includes(outputQuery.toLowerCase()));
  const currentRows = panel === 'output' ? filteredOutput : panel === 'terminal' ? terminal : problems;

  return <div className={`app theme-${theme} density-${density} ${motion ? '' : 'reduce-motion'}`}>
    <div className="app-frame">
      <header className="titlebar" data-tauri-drag-region>
        <div className="brand" data-tauri-drag-region><BrandMark size={20} /><strong>osirhidden</strong><span className="version-pill">2.0</span></div>
        <nav className="top-nav" aria-label="Main navigation">
          {([['editor','code','Editor'],['scripts','globe','Scripts'],['clients','users','Clients'],['settings','settings','Settings']] as const).map(([id, icon, label]) =>
            <button key={id} className={`top-nav-button ${view === id ? 'is-active' : ''}`} onClick={() => setView(id)}><Icon name={icon} /> <span>{label}</span></button>
          )}
        </nav>
        <WindowControls />
      </header>

      <main className="workspace">
        <aside className="explorer">
          <div className="explorer-title"><span>EXPLORER</span><button aria-label="Explorer options">•••</button></div>
          <section className="tree-section">
            <button className="tree-heading" onClick={() => setScriptsOpen(value => !value)}><Icon name="chevron" size={13} /><Icon name="folder" size={14} /><span>Scripts</span></button>
            <div className={`tree-content ${scriptsOpen ? 'is-open' : ''}`}>
              <div className="tree-content-inner">
                {['welcome.lua','movement.lua','ui-test.lua'].map(name => <button className="tree-file" key={name} onClick={() => addTab(`-- ${name}\n`, name)}><Icon name="file" size={13} /><span>{name}</span></button>)}
              </div>
            </div>
          </section>
          <section className="tree-section">
            <button className="tree-heading" onClick={() => setAutoOpen(value => !value)}><Icon name="chevron" size={13} /><Icon name="folder" size={14} /><span>Auto-Execute</span></button>
            <div className={`tree-content ${autoOpen ? 'is-open' : ''}`}><div className="tree-content-inner"><div className="tree-empty">Folder not selected</div></div></div>
          </section>
        </aside>

        <section className="content-area">
          {view === 'editor' && <div className="editor-layout view-enter">
            <div className="tabbar">
              <div className="tab-strip">
                {tabs.map(tab => <div key={tab.id} className={`editor-tab ${activeTabId === tab.id ? 'is-active' : ''}`}>
                  <button className="tab-main" onClick={() => setActiveTabId(tab.id)}><span className="tab-accent" /><span className="tab-label">{tab.name}</span>{tab.dirty && <span className="dirty-dot" />}</button>
                  <button className="tab-close" onClick={() => closeTab(tab.id)} aria-label={`Close ${tab.name}`}><Icon name="x" size={12} /></button>
                </div>)}
                <button className="new-tab" onClick={() => addTab()} aria-label="New tab"><Icon name="plus" size={14} /></button>
              </div>
            </div>

            <div className="commandbar">
              <div className="command-left">
                <button className="command-button" onClick={() => setTerminal(current => [...current, { level: 'info', message: runtime.online ? 'Local runtime detected; execution bridge remains disabled in this build.' : 'Local runtime detached.' }])}><Icon name="play" size={13} />Execute</button>
                <button className="command-button" onClick={() => updateActiveTab('')}>Clear</button>
                <span className="command-divider" />
                <button className="command-button" onClick={() => void openFile()}><Icon name="open" size={13} />Open</button>
                <button className="command-button" onClick={() => void saveFile()}><Icon name="save" size={13} />Save</button>
                <button className="command-button" onClick={() => { void navigator.clipboard?.writeText(activeTab?.content || ''); showToast('Copied'); }}><Icon name="copy" size={13} />Copy</button>
              </div>
              <div className="command-right">
                <div className="runtime-badge"><span className={`runtime-dot ${runtime.online ? 'is-online' : ''}`} />{runtime.online ? `Local :${runtime.port}` : 'Detached'}</div>
                <button className="inject-button" onClick={() => showToast(runtime.online ? 'Local listener detected' : 'Local runtime detached')}><Icon name="bolt" size={13} />Inject</button>
              </div>
            </div>

            <div className="editor-surface">
              <pre className="line-gutter" ref={gutterRef} aria-hidden="true">{lineNumbers}</pre>
              <textarea
                className="code-editor"
                spellCheck={false}
                value={activeTab?.content || ''}
                onChange={event => updateActiveTab(event.target.value)}
                onScroll={event => { if (gutterRef.current) gutterRef.current.scrollTop = event.currentTarget.scrollTop; }}
              />
            </div>

            <section className="bottom-panel">
              <div className="panel-header">
                <div className="panel-tabs">
                  {([['problems','Problems',problems.length],['output','Roblox Output',output.length],['terminal','Terminal',terminal.length]] as const).map(([id, label, count]) =>
                    <button key={id} className={`panel-tab ${panel === id ? 'is-active' : ''}`} onClick={() => setPanel(id)}><span>{label}</span>{count > 0 && <b>{count}</b>}</button>
                  )}
                </div>
                <div className="panel-actions">
                  {panel === 'output' && <label className="panel-search"><Icon name="search" size={12} /><input value={outputQuery} onChange={event => setOutputQuery(event.target.value)} placeholder="Filter output" /></label>}
                  <button className="icon-button" onClick={() => panel === 'terminal' ? setTerminal([]) : undefined} aria-label="Clear panel"><Icon name="x" size={12} /></button>
                </div>
              </div>
              <div className="console">
                {currentRows.length === 0 ? <div className="console-empty">No {panel === 'output' ? 'Roblox output' : panel} entries.</div> : currentRows.map((row, index) => <div className={`console-row level-${row.level}`} key={`${row.timestamp || ''}-${index}`}><time>{row.timestamp?.slice(11,19) || '--:--:--'}</time><span>{row.message}</span></div>)}
              </div>
            </section>
          </div>}

          {view === 'scripts' && <div className="page view-enter">
            <div className="page-header"><div><span className="eyebrow">SCRIPT LIBRARY</span><h1>Scripts</h1><p>Search ScriptBlox and open a result directly in the editor.</p></div><button className="secondary-button" onClick={() => void searchScripts(scriptPage)}><Icon name="refresh" size={13} />Refresh</button></div>
            <div className="script-search"><Icon name="search" size={14} /><input value={scriptQuery} onChange={event => setScriptQuery(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') void searchScripts(1); }} placeholder="Search scripts" /><button onClick={() => void searchScripts(1)}>Search</button></div>
            {scriptError && <div className="inline-error">{scriptError}</div>}
            <div className="script-list">
              {scriptLoading ? <div className="list-empty">Loading scripts…</div> : scriptResults.length === 0 ? <div className="list-empty">Search to load scripts.</div> : scriptResults.map((item, index) => <div className="script-row" key={item.id || item.slug || index}>
                <div className="script-row-main"><strong>{item.title || 'Untitled script'}</strong><span>{item.game || 'Unknown game'}</span></div>
                <div className="script-meta"><span>{item.verified ? 'Verified' : 'Community'}</span><span>{Number(item.views || 0).toLocaleString()} views</span></div>
                <button onClick={() => void openScriptItem(item)}>Open in editor</button>
              </div>)}
            </div>
            <div className="pager"><button disabled={scriptPage <= 1} onClick={() => void searchScripts(scriptPage - 1)}>Previous</button><span>{scriptPage} / {scriptTotalPages}</span><button disabled={scriptPage >= scriptTotalPages} onClick={() => void searchScripts(scriptPage + 1)}>Next</button></div>
          </div>}

          {view === 'clients' && <div className="page view-enter">
            <div className="page-header"><div><span className="eyebrow">LOCAL DESKTOP</span><h1>Clients</h1><p>Detected Roblox desktop clients. Process access is limited to listing and explicit close.</p></div><div className="header-status"><span className={`runtime-dot ${runtime.online ? 'is-online' : ''}`} />{runtime.online ? `Listener :${runtime.port}` : 'Listener detached'}</div></div>
            <div className="client-list">
              <div className="list-head"><span>Process</span><span>PID</span><span>Memory</span><span /> </div>
              {clients.length === 0 ? <div className="list-empty">No Roblox desktop client detected.</div> : clients.map(client => <div className="client-row" key={client.pid}><span className="process-name"><Icon name="monitor" size={14} />{client.name}</span><code>{client.pid}</code><span>{client.memory || '—'}</span><button onClick={() => void closeClient(client.pid)}>Close</button></div>)}
            </div>
          </div>}

          {view === 'settings' && <div className="settings-page view-enter">
            <aside className="settings-nav"><span className="eyebrow">SETTINGS</span>{['Appearance','Motion','Workspace','About'].map((item, index) => <a key={item} href={`#setting-${index}`}>{item}</a>)}</aside>
            <div className="settings-content">
              <section id="setting-0" className="settings-section"><div className="settings-heading"><h2>Appearance</h2><p>Interface theme and density.</p></div>
                <div className="setting-row"><div><strong>Theme</strong><span>Switch between dark and light surfaces.</span></div><div className="segmented"><button className={theme === 'dark' ? 'is-active' : ''} onClick={() => setTheme('dark')}>Dark</button><button className={theme === 'light' ? 'is-active' : ''} onClick={() => setTheme('light')}>Light</button></div></div>
                <div className="setting-row"><div><strong>Density</strong><span>Adjust vertical spacing without changing the layout grid.</span></div><div className="segmented"><button className={density === 'comfortable' ? 'is-active' : ''} onClick={() => setDensity('comfortable')}>Comfort</button><button className={density === 'compact' ? 'is-active' : ''} onClick={() => setDensity('compact')}>Compact</button></div></div>
              </section>
              <section id="setting-1" className="settings-section"><div className="settings-heading"><h2>Motion</h2><p>All interaction animations share one timing curve.</p></div><div className="setting-row"><div><strong>Interface motion</strong><span>160ms transitions for navigation, panels, tabs, and controls.</span></div><Toggle checked={motion} onChange={setMotion} label="Interface motion" /></div></section>
              <section id="setting-2" className="settings-section"><div className="settings-heading"><h2>Workspace</h2><p>Native runtime state and editor persistence.</p></div><div className="setting-row"><div><strong>Local listener</strong><span>Only localhost:{runtime.port} reachability is checked.</span></div><span className="value-chip"><span className={`runtime-dot ${runtime.online ? 'is-online' : ''}`} />{runtime.online ? 'Detected' : 'Detached'}</span></div></section>
              <section id="setting-3" className="settings-section"><div className="settings-heading"><h2>About</h2><p>Native desktop build information.</p></div><div className="about-grid"><div><span>Version</span><strong>{appInfo.version}</strong></div><div><span>Platform</span><strong>{appInfo.platform}</strong></div><div><span>Architecture</span><strong>{appInfo.arch}</strong></div></div></section>
            </div>
          </div>}
        </section>
      </main>

      <footer className="statusbar"><div><span className={`status-dot ${runtime.online ? 'is-online' : ''}`} /><span>{runtime.online ? `Local listener :${runtime.port}` : 'Local runtime detached'}</span></div><div><span>{clients.length} client{clients.length === 1 ? '' : 's'}</span><span className="status-separator">·</span><span>{appInfo.arch}</span></div></footer>
      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  </div>;
}

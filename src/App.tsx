import React, { useEffect, useMemo, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';

type View = 'editor' | 'scripts' | 'clients' | 'settings';
type Panel = 'problems' | 'output' | 'terminal';
type Density = 'comfortable' | 'compact';
type SettingsSection = 'appearance' | 'editor' | 'roblox' | 'workspace' | 'about';
type OutputLevel = 'output' | 'warning' | 'error' | 'info';
type InjectPhase = 'idle' | 'injecting' | 'ready';

type Tab = { id: number; name: string; content: string; dirty: boolean };
type RuntimeStatus = { online: boolean; port: number; mode?: string };
type ClientInfo = { name: string; pid: number; memory: string };
type OutputEntry = { level: OutputLevel; message: string; timestamp?: string | null };
type ScriptItem = { id?: string; slug?: string; title?: string; game?: string; verified?: boolean; views?: number; scriptType?: string; script?: string };
type ScriptSearchResult = { scripts: ScriptItem[]; page: number; totalPages: number };
type AppInfo = { version: string; platform: string; arch: string };
type OpenedScript = { name: string; path: string; content: string };
type SavedScript = { ok: boolean; name: string; path: string };
type FolderScript = { name: string; path: string };
type SettingsPayload = {
  motion?: boolean;
  density?: Density;
  accent?: string;
  editorFontSize?: number;
  autocomplete?: boolean;
  outputAutoScroll?: boolean;
  autoFolder?: string;
};
type Completion = { label: string; insert: string; detail: string; cursorOffset?: number; kind: 'function' | 'keyword' | 'snippet' | 'global' };
type CompletionContext = { start: number; end: number; row: number; col: number; prefix: string };

const PREVIEW = new URLSearchParams(location.search).get('preview');
const STORAGE_KEY = 'osirhidden-v21-workspace';
const DEFAULT_SCRIPT = '-- osirhidden workspace\n\nprint("Hello from osirhidden")';
const ACCENTS = ['#7c8cff', '#9b7cff', '#53c8ff', '#5ed6a7', '#f0a86b', '#ef7188'];
const LUAU_COMPLETIONS: Completion[] = [
  { label: 'print', insert: 'print()', detail: 'Write values to output', cursorOffset: -1, kind: 'function' },
  { label: 'pairs', insert: 'pairs()', detail: 'Iterate key/value pairs', cursorOffset: -1, kind: 'function' },
  { label: 'ipairs', insert: 'ipairs()', detail: 'Iterate array values', cursorOffset: -1, kind: 'function' },
  { label: 'pcall', insert: 'pcall(function()\n\t\nend)', detail: 'Protected function call', cursorOffset: -5, kind: 'snippet' },
  { label: 'xpcall', insert: 'xpcall(function()\n\t\nend, function(err)\n\treturn err\nend)', detail: 'Protected call with handler', kind: 'snippet' },
  { label: 'warn', insert: 'warn()', detail: 'Write a warning', cursorOffset: -1, kind: 'function' },
  { label: 'error', insert: 'error()', detail: 'Raise an error', cursorOffset: -1, kind: 'function' },
  { label: 'tostring', insert: 'tostring()', detail: 'Convert value to string', cursorOffset: -1, kind: 'function' },
  { label: 'tonumber', insert: 'tonumber()', detail: 'Convert value to number', cursorOffset: -1, kind: 'function' },
  { label: 'type', insert: 'type()', detail: 'Lua type query', cursorOffset: -1, kind: 'function' },
  { label: 'typeof', insert: 'typeof()', detail: 'Luau type query', cursorOffset: -1, kind: 'function' },
  { label: 'require', insert: 'require()', detail: 'Load a module', cursorOffset: -1, kind: 'function' },
  { label: 'task.wait', insert: 'task.wait()', detail: 'Yield for a duration', cursorOffset: -1, kind: 'global' },
  { label: 'task.spawn', insert: 'task.spawn(function()\n\t\nend)', detail: 'Schedule a task', cursorOffset: -5, kind: 'snippet' },
  { label: 'task.defer', insert: 'task.defer(function()\n\t\nend)', detail: 'Defer a task', cursorOffset: -5, kind: 'snippet' },
  { label: 'table.insert', insert: 'table.insert()', detail: 'Insert into a table', cursorOffset: -1, kind: 'function' },
  { label: 'table.remove', insert: 'table.remove()', detail: 'Remove from a table', cursorOffset: -1, kind: 'function' },
  { label: 'game:GetService', insert: 'game:GetService("")', detail: 'Get a Roblox service', cursorOffset: -2, kind: 'global' },
  { label: 'local', insert: 'local ', detail: 'Declare a local variable', kind: 'keyword' },
  { label: 'function', insert: 'function name()\n\t\nend', detail: 'Function declaration', cursorOffset: -8, kind: 'snippet' },
  { label: 'if', insert: 'if condition then\n\t\nend', detail: 'Conditional block', cursorOffset: -8, kind: 'snippet' },
  { label: 'for', insert: 'for key, value in pairs(table) do\n\t\nend', detail: 'Generic for loop', cursorOffset: -8, kind: 'snippet' },
  { label: 'while', insert: 'while condition do\n\t\nend', detail: 'While loop', cursorOffset: -8, kind: 'snippet' },
  { label: 'return', insert: 'return ', detail: 'Return from function', kind: 'keyword' }
];

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
  bolt:['m13 2-9 12h7l-1 8 9-12h-7l1-8Z'], monitor:['M3 4h18v12H3V4Z','M8 21h8','M12 16v5'], check:['m5 12 4 4L19 6'],
  rocket:['M4 15c-1 2-1 4-1 6 2 0 4 0 6-1','M14 4c3-2 6-1 7-1 0 1 1 4-1 7L13 15l-4-4 5-7Z','M9 11l-4 1-2 3 5 1','M13 15l-1 4-3 2-1-5'],
  palette:['M12 3a9 9 0 1 0 0 18h1.2a1.8 1.8 0 0 0 0-3.6H12a2 2 0 0 1 0-4h2a7 7 0 0 0-2-10Z'],
  sliders:['M4 6h10','M18 6h2','M14 3v6','M4 18h4','M12 18h8','M8 15v6','M4 12h2','M10 12h10','M6 9v6'],
  spark:['m12 3 1.4 4.2L18 9l-4.6 1.7L12 15l-1.4-4.3L6 9l4.6-1.8L12 3Z','m19 14 .7 2.1L22 17l-2.3.9L19 20l-.7-2.1L16 17l2.3-.9L19 14Z']
};

function Icon({ name, size = 15 }: { name: string; size?: number }) {
  return <svg className="ico" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {(iconPaths[name] || iconPaths.code).map((d, i) => <path d={d} key={i} />)}
  </svg>;
}

function BrandMark({ size = 20 }: { size?: number }) {
  return <svg className="brand-mark" width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
    <path d="M6.5 16c2.6-5.7 5.7-8.6 9.5-8.6 3.7 0 6.9 2.9 9.5 8.6-2.6 5.7-5.8 8.6-9.5 8.6-3.8 0-6.9-2.9-9.5-8.6Z" stroke="currentColor" strokeWidth="1.9" />
    <path d="M10.2 21.8 21.9 10.1" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" />
    <circle cx="16" cy="16" r="2.2" fill="currentColor" opacity=".9" />
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
  return <button type="button" className={`toggle ${checked ? 'is-on' : ''}`} onClick={() => onChange(!checked)} aria-pressed={checked} aria-label={label}><span className="toggle-knob" /></button>;
}

function completionContext(value: string, caret: number): CompletionContext | null {
  const before = value.slice(0, caret);
  const match = before.match(/[A-Za-z_][A-Za-z0-9_:.]*$/);
  if (!match) return null;
  const prefix = match[0];
  if (!prefix) return null;
  const start = caret - prefix.length;
  const lines = value.slice(0, start).split('\n');
  return { start, end: caret, row: lines.length - 1, col: lines[lines.length - 1].length, prefix };
}

const bootStages = [
  ['Reading local preferences', 16],
  ['Restoring workspace', 34],
  ['Starting native shell', 56],
  ['Checking local services', 73],
  ['Indexing desktop clients', 89],
  ['Ready', 100]
] as const;

export default function App() {
  const stored = useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') as {
        motion?: boolean; density?: Density; accent?: string; editorFontSize?: number; autocomplete?: boolean; outputAutoScroll?: boolean;
        autoFolder?: string; tabs?: Tab[]; activeTab?: number; nextTab?: number;
      };
    } catch { return {}; }
  }, []);

  const [phase, setPhase] = useState<'splash' | 'main'>(PREVIEW === 'main' ? 'main' : 'splash');
  const [progress, setProgress] = useState(PREVIEW === 'splash' ? 63 : 4);
  const [bootTitle, setBootTitle] = useState('Starting workspace');
  const [view, setView] = useState<View>('editor');
  const [panel, setPanel] = useState<Panel>('output');
  const [settingsSection, setSettingsSection] = useState<SettingsSection>('appearance');
  const [motion, setMotion] = useState(stored.motion !== false);
  const [density, setDensity] = useState<Density>(stored.density || 'compact');
  const [accent, setAccent] = useState(stored.accent || '#7c8cff');
  const [editorFontSize, setEditorFontSize] = useState(Math.min(16, Math.max(10, stored.editorFontSize || 12)));
  const [autocomplete, setAutocomplete] = useState(stored.autocomplete !== false);
  const [outputAutoScroll, setOutputAutoScroll] = useState(stored.outputAutoScroll !== false);
  const [scriptsOpen, setScriptsOpen] = useState(true);
  const [autoOpen, setAutoOpen] = useState(true);
  const [autoFolder, setAutoFolder] = useState(stored.autoFolder || '');
  const [autoScripts, setAutoScripts] = useState<FolderScript[]>([]);
  const [tabs, setTabs] = useState<Tab[]>(stored.tabs?.length ? stored.tabs : [{ id: 1, name: 'Tab #1', content: DEFAULT_SCRIPT, dirty: false }]);
  const [activeTabId, setActiveTabId] = useState(stored.activeTab || 1);
  const [nextTabId, setNextTabId] = useState(stored.nextTab || 2);
  const [runtime, setRuntime] = useState<RuntimeStatus>({ online: false, port: 6969, mode: 'detached' });
  const [clients, setClients] = useState<ClientInfo[]>([]);
  const [output, setOutput] = useState<OutputEntry[]>([]);
  const [terminal, setTerminal] = useState<OutputEntry[]>([{ level: 'info', message: 'Tauri workspace ready.' }]);
  const [problems] = useState<OutputEntry[]>([]);
  const [outputQuery, setOutputQuery] = useState('');
  const [scriptQuery, setScriptQuery] = useState('');
  const [scriptResults, setScriptResults] = useState<ScriptItem[]>([]);
  const [scriptPage, setScriptPage] = useState(1);
  const [scriptTotalPages, setScriptTotalPages] = useState(1);
  const [scriptLoading, setScriptLoading] = useState(false);
  const [scriptError, setScriptError] = useState('');
  const [injectPhase, setInjectPhase] = useState<InjectPhase>('idle');
  const [toast, setToast] = useState<string | null>(null);
  const [appInfo, setAppInfo] = useState<AppInfo>({ version: '2.1.0', platform: 'windows', arch: 'x86_64' });
  const [completion, setCompletion] = useState<CompletionContext | null>(null);
  const [completionIndex, setCompletionIndex] = useState(0);
  const [editorScroll, setEditorScroll] = useState({ top: 0, left: 0 });

  const gutterRef = useRef<HTMLPreElement>(null);
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const consoleRef = useRef<HTMLDivElement>(null);
  const toastTimer = useRef<number | undefined>(undefined);
  const injectTimers = useRef<number[]>([]);

  const activeTab = tabs.find(tab => tab.id === activeTabId) || tabs[0];
  const lineHeight = editorFontSize + 8;
  const lineNumbers = useMemo(() => Array.from({ length: Math.max(1, activeTab?.content.split('\n').length || 1) }, (_, index) => index + 1).join('\n'), [activeTab?.content]);
  const completionItems = useMemo(() => {
    if (!autocomplete || !completion) return [];
    const prefix = completion.prefix.toLowerCase();
    return LUAU_COMPLETIONS.filter(item => item.label.toLowerCase().startsWith(prefix)).slice(0, 7);
  }, [autocomplete, completion]);

  const rootStyle = { '--accent': accent, '--editor-font': `${editorFontSize}px`, '--editor-line': `${lineHeight}px` } as React.CSSProperties;

  const showToast = (message: string) => {
    setToast(message);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 1700);
  };

  useEffect(() => () => injectTimers.current.forEach(timer => window.clearTimeout(timer)), []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ motion, density, accent, editorFontSize, autocomplete, outputAutoScroll, autoFolder, tabs, activeTab: activeTabId, nextTab: nextTabId }));
    void safeInvoke('save_settings', { value: { motion, density, accent, editorFontSize, autocomplete, outputAutoScroll, autoFolder } satisfies SettingsPayload }, null);
  }, [motion, density, accent, editorFontSize, autocomplete, outputAutoScroll, autoFolder, tabs, activeTabId, nextTabId]);

  useEffect(() => {
    if (!autoFolder) { setAutoScripts([]); return; }
    void safeInvoke<FolderScript[]>('list_folder_scripts', { path: autoFolder }, []).then(setAutoScripts);
  }, [autoFolder]);

  useEffect(() => {
    if (PREVIEW === 'splash' || PREVIEW === 'main') return;
    let cancelled = false;
    (async () => {
      for (const [title, pct] of bootStages) {
        if (cancelled) return;
        setBootTitle(title);
        setProgress(pct);
        if (pct === 34) {
          const settings = await safeInvoke<SettingsPayload>('load_settings', {}, {});
          if (typeof settings.motion === 'boolean') setMotion(settings.motion);
          if (settings.density) setDensity(settings.density);
          if (settings.accent) setAccent(settings.accent);
          if (settings.editorFontSize) setEditorFontSize(settings.editorFontSize);
          if (typeof settings.autocomplete === 'boolean') setAutocomplete(settings.autocomplete);
          if (typeof settings.outputAutoScroll === 'boolean') setOutputAutoScroll(settings.outputAutoScroll);
          if (settings.autoFolder) setAutoFolder(settings.autoFolder);
        }
        if (pct === 56) setAppInfo(await safeInvoke<AppInfo>('app_info', {}, appInfo));
        if (pct === 73) setRuntime(await safeInvoke<RuntimeStatus>('runtime_status', { port: 6969 }, { online: false, port: 6969, mode: 'detached' }));
        if (pct === 89) setClients(await safeInvoke<ClientInfo[]>('list_clients', {}, []));
        await new Promise(resolve => window.setTimeout(resolve, 150));
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
    const timer = window.setInterval(() => void poll(), 1900);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [phase]);

  useEffect(() => {
    if (panel === 'output' && outputAutoScroll && consoleRef.current) consoleRef.current.scrollTop = consoleRef.current.scrollHeight;
  }, [output, panel, outputAutoScroll]);

  const addTab = (content = '', name?: string) => {
    const id = nextTabId;
    setTabs(current => [...current, { id, name: name || `Tab #${id}`, content, dirty: Boolean(content) }]);
    setActiveTabId(id);
    setNextTabId(id + 1);
    setCompletion(null);
  };

  const closeTab = (id: number) => {
    if (tabs.length === 1) return;
    const index = tabs.findIndex(tab => tab.id === id);
    const nextTabs = tabs.filter(tab => tab.id !== id);
    setTabs(nextTabs);
    if (activeTabId === id) setActiveTabId(nextTabs[Math.min(index, nextTabs.length - 1)].id);
  };

  const updateActiveTab = (content: string) => setTabs(current => current.map(tab => tab.id === activeTabId ? { ...tab, content, dirty: true } : tab));

  const refreshCompletion = (value: string, caret: number) => {
    const ctx = autocomplete ? completionContext(value, caret) : null;
    setCompletion(ctx);
    setCompletionIndex(0);
  };

  const applyCompletion = (item: Completion) => {
    if (!completion || !activeTab) return;
    const next = activeTab.content.slice(0, completion.start) + item.insert + activeTab.content.slice(completion.end);
    const caret = completion.start + item.insert.length + (item.cursorOffset || 0);
    updateActiveTab(next);
    setCompletion(null);
    window.requestAnimationFrame(() => {
      editorRef.current?.focus();
      editorRef.current?.setSelectionRange(caret, caret);
    });
  };

  const openFile = async () => {
    const data = await safeInvoke<OpenedScript | null>('open_script', {}, null);
    if (data) addTab(data.content, data.name);
  };

  const saveFile = async () => {
    if (!activeTab) return;
    const result = await safeInvoke<SavedScript | null>('save_script', { suggestedName: activeTab.name.endsWith('.lua') ? activeTab.name : `${activeTab.name}.lua`, content: activeTab.content }, null);
    if (!result) return;
    setTabs(current => current.map(tab => tab.id === activeTabId ? { ...tab, name: result.name, dirty: false } : tab));
    showToast('Saved');
  };

  const chooseAutoFolder = async () => {
    const path = await safeInvoke<string | null>('choose_autoexec_folder', {}, null);
    if (path) { setAutoFolder(path); showToast('Auto-Execute folder selected'); }
  };

  const openFolderScript = async (script: FolderScript) => {
    const data = await safeInvoke<OpenedScript | null>('read_script_path', { path: script.path }, null);
    if (data) addTab(data.content, data.name);
  };

  const searchScripts = async (page = 1) => {
    setScriptLoading(true); setScriptError('');
    try {
      const result = await safeInvoke<ScriptSearchResult>('scriptblox_search', { query: scriptQuery, page }, { scripts: [], page, totalPages: 1 });
      setScriptResults(result.scripts || []); setScriptPage(result.page || page); setScriptTotalPages(result.totalPages || 1);
    } catch (error) { setScriptError(String(error)); }
    finally { setScriptLoading(false); }
  };

  const openScriptItem = async (item: ScriptItem) => {
    let source = item.script || '';
    const identifier = item.slug || item.id || '';
    if (!source && identifier) source = (await safeInvoke<{ script: string }>('scriptblox_raw', { identifier }, { script: '' })).script || '';
    if (!source) return;
    addTab(source, `${item.title || 'Script'}.lua`); setView('editor');
  };

  const closeClient = async (pid: number) => {
    if (!window.confirm(`Close detected Roblox client ${pid}?`)) return;
    try { await safeInvoke('close_client', { pid }, null); showToast('Client closed'); }
    catch (error) { showToast(String(error)); }
  };

  const launchRoblox = async () => {
    try { await safeInvoke('launch_roblox', {}, null); showToast('Roblox launch requested'); }
    catch (error) { showToast(String(error)); }
  };

  const startInjectAnimation = () => {
    if (injectPhase === 'injecting') return;
    injectTimers.current.forEach(timer => window.clearTimeout(timer)); injectTimers.current = [];
    setInjectPhase('injecting');
    setPanel('terminal');
    setTerminal(current => [...current, { level: 'info', message: 'Inject UI sequence started. No process injection is connected in this build.' }]);
    injectTimers.current.push(window.setTimeout(() => setInjectPhase('ready'), 900));
    injectTimers.current.push(window.setTimeout(() => setInjectPhase('idle'), 1900));
  };

  if (phase === 'splash') {
    return <div className="boot-shell" style={rootStyle}>
      <div className="boot-aura" />
      <div className="boot-lines" />
      <header className="boot-header"><div className="boot-brand"><BrandMark size={22} /><span>osirhidden</span></div><span className="boot-build">DESKTOP / 2.1</span></header>
      <main className="boot-body">
        <div className="boot-copy-block"><span className="boot-eyebrow">NATIVE WORKSPACE</span><h1>Quietly preparing<br />your workspace.</h1><p>{bootTitle}</p></div>
        <div className="boot-core">
          <div className="boot-core-mark"><BrandMark size={44} /></div>
          <div className="boot-core-ring" />
          <span>CORE</span>
        </div>
        <div className="boot-checks">
          {bootStages.slice(0, 5).map(([label, pct]) => <div className={`boot-check ${progress >= pct ? 'is-done' : progress + 20 >= pct ? 'is-active' : ''}`} key={label}><i /> <span>{label}</span><b>{progress >= pct ? 'OK' : '—'}</b></div>)}
        </div>
      </main>
      <footer className="boot-footer"><div className="boot-progress"><div style={{ width: `${progress}%` }} /></div><span>{String(progress).padStart(2, '0')}%</span></footer>
    </div>;
  }

  const filteredOutput = output.filter(row => row.message.toLowerCase().includes(outputQuery.toLowerCase()));
  const currentRows = panel === 'output' ? filteredOutput : panel === 'terminal' ? terminal : problems;
  const completionStyle = completion ? {
    left: Math.max(48, 58 + completion.col * (editorFontSize * 0.61) - editorScroll.left),
    top: Math.max(8, 14 + (completion.row + 1) * lineHeight - editorScroll.top)
  } : undefined;

  return <div className={`app density-${density} ${motion ? '' : 'reduce-motion'}`} style={rootStyle}>
    <div className="app-frame">
      <header className="titlebar" data-tauri-drag-region>
        <div className="brand" data-tauri-drag-region><BrandMark size={19} /><strong>osirhidden</strong><span className="version-pill">2.1</span></div>
        <nav className="top-nav" aria-label="Main navigation">
          {([['editor','code','Editor'],['scripts','globe','Scripts'],['clients','users','Clients'],['settings','settings','Settings']] as const).map(([id, icon, label]) =>
            <button key={id} className={`top-nav-button ${view === id ? 'is-active' : ''}`} onClick={() => setView(id)}><Icon name={icon} /> <span>{label}</span></button>
          )}
        </nav>
        <WindowControls />
      </header>

      <main className={`workspace ${view === 'editor' ? '' : 'workspace--wide'}`}>
        {view === 'editor' && <aside className="explorer">
          <div className="explorer-title"><span>EXPLORER</span><button aria-label="Explorer options">•••</button></div>
          <section className="tree-section">
            <button className="tree-heading" onClick={() => setScriptsOpen(value => !value)}><Icon name="chevron" size={12} /><Icon name="folder" size={13} /><span>Scripts</span></button>
            <div className={`tree-content ${scriptsOpen ? 'is-open' : ''}`}><div className="tree-content-inner">
              {['welcome.lua','movement.lua','ui-test.lua'].map(name => <button className="tree-file" key={name} onClick={() => addTab(`-- ${name}\n`, name)}><Icon name="file" size={12} /><span>{name}</span></button>)}
            </div></div>
          </section>
          <section className="tree-section">
            <button className="tree-heading" onClick={() => setAutoOpen(value => !value)}><Icon name="chevron" size={12} /><Icon name="folder" size={13} /><span>Auto-Execute</span><em>{autoScripts.length || ''}</em></button>
            <div className={`tree-content ${autoOpen ? 'is-open' : ''}`}><div className="tree-content-inner">
              {!autoFolder ? <button className="tree-empty-button" onClick={() => void chooseAutoFolder()}>Choose folder…</button> : autoScripts.length === 0 ? <div className="tree-empty">No .lua/.luau files</div> : autoScripts.map(script => <button className="tree-file" key={script.path} onClick={() => void openFolderScript(script)}><Icon name="file" size={12} /><span>{script.name}</span></button>)}
            </div></div>
          </section>
        </aside>}

        <section className="content-area">
          {view === 'editor' && <div className="editor-layout view-enter">
            <div className="tabbar"><div className="tab-strip">
              {tabs.map(tab => <div key={tab.id} className={`editor-tab ${activeTabId === tab.id ? 'is-active' : ''}`}>
                <button className="tab-main" onClick={() => { setActiveTabId(tab.id); setCompletion(null); }}><span className="tab-accent" /><span className="tab-label">{tab.name}</span>{tab.dirty && <span className="dirty-dot" />}</button>
                <button className="tab-close" onClick={() => closeTab(tab.id)} aria-label={`Close ${tab.name}`}><Icon name="x" size={11} /></button>
              </div>)}
              <button className="new-tab" onClick={() => addTab()} aria-label="New tab"><Icon name="plus" size={13} /></button>
            </div></div>

            <div className="commandbar">
              <div className="command-left">
                <button className="command-button" onClick={() => setTerminal(current => [...current, { level: 'info', message: runtime.online ? 'Local listener detected; execution bridge is not connected.' : 'Local listener detached.' }])}><Icon name="play" size={12} />Execute</button>
                <button className="command-button" onClick={() => updateActiveTab('')}>Clear</button><span className="command-divider" />
                <button className="command-button" onClick={() => void openFile()}><Icon name="open" size={12} />Open</button>
                <button className="command-button" onClick={() => void saveFile()}><Icon name="save" size={12} />Save</button>
                <button className="command-button" onClick={() => { void navigator.clipboard?.writeText(activeTab?.content || ''); showToast('Copied'); }}><Icon name="copy" size={12} />Copy</button>
              </div>
              <div className="command-right">
                <div className="runtime-badge"><span className={`runtime-dot ${runtime.online ? 'is-online' : ''}`} />{runtime.online ? `Local :${runtime.port}` : 'Detached'}</div>
                <button className={`inject-button inject-${injectPhase}`} onClick={startInjectAnimation} disabled={injectPhase === 'injecting'}>
                  <span className="inject-icon">{injectPhase === 'ready' ? <Icon name="check" size={12} /> : <Icon name="bolt" size={12} />}</span><span>{injectPhase === 'injecting' ? 'Injecting…' : injectPhase === 'ready' ? 'Ready' : 'Inject'}</span>
                </button>
              </div>
            </div>

            <div className="editor-surface">
              <pre className="line-gutter" ref={gutterRef} aria-hidden="true">{lineNumbers}</pre>
              <textarea
                ref={editorRef}
                className="code-editor"
                spellCheck={false}
                value={activeTab?.content || ''}
                onChange={event => { updateActiveTab(event.target.value); refreshCompletion(event.target.value, event.target.selectionStart); }}
                onClick={event => refreshCompletion(event.currentTarget.value, event.currentTarget.selectionStart)}
                onKeyUp={event => { if (!['ArrowDown','ArrowUp','Enter','Tab','Escape'].includes(event.key)) refreshCompletion(event.currentTarget.value, event.currentTarget.selectionStart); }}
                onKeyDown={event => {
                  if (completionItems.length === 0) return;
                  if (event.key === 'ArrowDown') { event.preventDefault(); setCompletionIndex(index => (index + 1) % completionItems.length); }
                  else if (event.key === 'ArrowUp') { event.preventDefault(); setCompletionIndex(index => (index - 1 + completionItems.length) % completionItems.length); }
                  else if (event.key === 'Tab' || event.key === 'Enter') { event.preventDefault(); applyCompletion(completionItems[completionIndex] || completionItems[0]); }
                  else if (event.key === 'Escape') { event.preventDefault(); setCompletion(null); }
                }}
                onScroll={event => {
                  const next = { top: event.currentTarget.scrollTop, left: event.currentTarget.scrollLeft };
                  setEditorScroll(next);
                  if (gutterRef.current) gutterRef.current.scrollTop = next.top;
                }}
              />
              {completion && completionItems.length > 0 && <div className="completion-popup" style={completionStyle}>
                <div className="completion-head"><span>Luau</span><kbd>Tab</kbd></div>
                {completionItems.map((item, index) => <button key={`${item.label}-${index}`} className={completionIndex === index ? 'is-selected' : ''} onMouseDown={event => { event.preventDefault(); applyCompletion(item); }}>
                  <span className={`completion-kind kind-${item.kind}`}>{item.kind === 'function' ? 'ƒ' : item.kind === 'keyword' ? 'K' : item.kind === 'global' ? 'G' : 'S'}</span><strong>{item.label}</strong><em>{item.detail}</em>
                </button>)}
              </div>}
            </div>

            <section className="bottom-panel">
              <div className="panel-header"><div className="panel-tabs">
                {([['problems','Problems',problems.length],['output','Roblox Output',output.length],['terminal','Terminal',terminal.length]] as const).map(([id, label, count]) => <button key={id} className={`panel-tab ${panel === id ? 'is-active' : ''}`} onClick={() => setPanel(id)}><span>{label}</span>{count > 0 && <b>{count}</b>}</button>)}
              </div><div className="panel-actions">
                {panel === 'output' && <label className="panel-search"><Icon name="search" size={11} /><input value={outputQuery} onChange={event => setOutputQuery(event.target.value)} placeholder="Filter output" /></label>}
                <button className="icon-button" onClick={() => panel === 'terminal' ? setTerminal([]) : panel === 'output' ? setOutput([]) : undefined} aria-label="Clear panel"><Icon name="x" size={11} /></button>
              </div></div>
              <div className="console" ref={consoleRef}>{currentRows.length === 0 ? <div className="console-empty">No {panel === 'output' ? 'Roblox output' : panel} entries.</div> : currentRows.map((row, index) => <div className={`console-row level-${row.level}`} key={`${row.timestamp || ''}-${index}`}><time>{row.timestamp?.slice(11,19) || '--:--:--'}</time><span>{row.message}</span></div>)}</div>
            </section>
          </div>}

          {view === 'scripts' && <div className="page view-enter">
            <div className="page-header"><div><span className="eyebrow">SCRIPT LIBRARY</span><h1>Scripts</h1><p>Search ScriptBlox and open a result in the editor.</p></div><button className="secondary-button" onClick={() => void searchScripts(scriptPage)}><Icon name="refresh" size={12} />Refresh</button></div>
            <div className="script-search"><Icon name="search" size={13} /><input value={scriptQuery} onChange={event => setScriptQuery(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') void searchScripts(1); }} placeholder="Search scripts" /><button onClick={() => void searchScripts(1)}>Search</button></div>
            {scriptError && <div className="inline-error">{scriptError}</div>}
            <div className="script-list">{scriptLoading ? <div className="list-empty">Loading scripts…</div> : scriptResults.length === 0 ? <div className="list-empty">Search to load scripts.</div> : scriptResults.map((item, index) => <div className="script-row" key={item.id || item.slug || index}><div className="script-row-main"><strong>{item.title || 'Untitled script'}</strong><span>{item.game || 'Unknown game'}</span></div><div className="script-meta"><span>{item.verified ? 'Verified' : 'Community'}</span><span>{Number(item.views || 0).toLocaleString()} views</span></div><button onClick={() => void openScriptItem(item)}>Open</button></div>)}</div>
            <div className="pager"><button disabled={scriptPage <= 1} onClick={() => void searchScripts(scriptPage - 1)}>Previous</button><span>{scriptPage} / {scriptTotalPages}</span><button disabled={scriptPage >= scriptTotalPages} onClick={() => void searchScripts(scriptPage + 1)}>Next</button></div>
          </div>}

          {view === 'clients' && <div className="page view-enter">
            <div className="page-header"><div><span className="eyebrow">ROBLOX DESKTOP</span><h1>Clients</h1><p>Launch, detect, refresh, or explicitly close a desktop client.</p></div><div className="page-actions"><button className="secondary-button" onClick={() => void launchRoblox()}><Icon name="rocket" size={12} />Launch Roblox</button><button className="secondary-button" onClick={() => void safeInvoke<ClientInfo[]>('list_clients', {}, []).then(setClients)}><Icon name="refresh" size={12} />Refresh</button></div></div>
            <div className="client-list"><div className="list-head"><span>Process</span><span>PID</span><span>Memory</span><span /></div>{clients.length === 0 ? <div className="list-empty">No Roblox desktop client detected.</div> : clients.map(client => <div className="client-row" key={client.pid}><span className="process-name"><Icon name="monitor" size={13} />{client.name}</span><code>{client.pid}</code><span>{client.memory || '—'}</span><button onClick={() => void closeClient(client.pid)}>Close</button></div>)}</div>
          </div>}

          {view === 'settings' && <div className="settings-page view-enter">
            <aside className="settings-nav"><div><span className="eyebrow">SETTINGS</span><strong>Customize</strong></div>{([['appearance','palette','Appearance'],['editor','code','Editor'],['roblox','monitor','Roblox'],['workspace','sliders','Workspace'],['about','spark','About']] as const).map(([id, icon, label]) => <button key={id} className={settingsSection === id ? 'is-active' : ''} onClick={() => setSettingsSection(id)}><Icon name={icon} size={13} /><span>{label}</span></button>)}</aside>
            <div className="settings-content">
              {settingsSection === 'appearance' && <section className="settings-section"><div className="settings-heading"><span className="eyebrow">APPEARANCE</span><h2>Pure black. Your accent.</h2><p>The workspace stays black; only the interface accent changes.</p></div>
                <div className="setting-row"><div><strong>Accent color</strong><span>Tabs, focus rings, activity indicators, and completion selection.</span></div><div className="accent-picker">{ACCENTS.map(color => <button key={color} className={accent.toLowerCase() === color ? 'is-active' : ''} style={{ background: color }} onClick={() => setAccent(color)} aria-label={`Accent ${color}`} />)}<label className="custom-color"><input type="color" value={accent} onChange={event => setAccent(event.target.value)} /><span>Custom</span></label></div></div>
                <div className="setting-row"><div><strong>Density</strong><span>Compact is tuned for the smaller desktop window.</span></div><div className="segmented"><button className={density === 'compact' ? 'is-active' : ''} onClick={() => setDensity('compact')}>Compact</button><button className={density === 'comfortable' ? 'is-active' : ''} onClick={() => setDensity('comfortable')}>Comfort</button></div></div>
                <div className="setting-row"><div><strong>Interface motion</strong><span>Subtle 150ms transitions and restrained micro-motion.</span></div><Toggle checked={motion} onChange={setMotion} label="Interface motion" /></div>
              </section>}
              {settingsSection === 'editor' && <section className="settings-section"><div className="settings-heading"><span className="eyebrow">EDITOR</span><h2>Luau editing.</h2><p>Lightweight editing features without replacing the native shell.</p></div>
                <div className="setting-row"><div><strong>Luau autocomplete</strong><span>Type pr, task., tab, local and more to open completions beside the caret.</span></div><Toggle checked={autocomplete} onChange={setAutocomplete} label="Luau autocomplete" /></div>
                <div className="setting-row"><div><strong>Editor font size</strong><span>Cascadia Code / Consolas fallback.</span></div><div className="font-stepper"><button onClick={() => setEditorFontSize(size => Math.max(10, size - 1))}>−</button><strong>{editorFontSize}px</strong><button onClick={() => setEditorFontSize(size => Math.min(16, size + 1))}>+</button></div></div>
              </section>}
              {settingsSection === 'roblox' && <section className="settings-section"><div className="settings-heading"><span className="eyebrow">ROBLOX</span><h2>Desktop controls.</h2><p>Launch and inspect local client presence. No process injection is wired here.</p></div>
                <div className="setting-row"><div><strong>Launch Roblox</strong><span>Open the registered Roblox desktop protocol.</span></div><button className="setting-action" onClick={() => void launchRoblox()}><Icon name="rocket" size={12} />Launch</button></div>
                <div className="setting-row"><div><strong>Local listener</strong><span>Reachability check on localhost:{runtime.port}.</span></div><span className="value-chip"><span className={`runtime-dot ${runtime.online ? 'is-online' : ''}`} />{runtime.online ? 'Detected' : 'Detached'}</span></div>
                <div className="setting-row"><div><strong>Detected clients</strong><span>Current RobloxPlayerBeta.exe process count.</span></div><span className="value-chip">{clients.length}</span></div>
              </section>}
              {settingsSection === 'workspace' && <section className="settings-section"><div className="settings-heading"><span className="eyebrow">WORKSPACE</span><h2>Persistence & output.</h2><p>Keep the editor compact while retaining useful desktop controls.</p></div>
                <div className="setting-row"><div><strong>Auto-Execute folder</strong><span className="path-text">{autoFolder || 'No folder selected'}</span></div><button className="setting-action" onClick={() => void chooseAutoFolder()}><Icon name="folder" size={12} />Choose</button></div>
                <div className="setting-row"><div><strong>Output auto-scroll</strong><span>Keep Roblox Output pinned to the newest visible entry.</span></div><Toggle checked={outputAutoScroll} onChange={setOutputAutoScroll} label="Output auto-scroll" /></div>
              </section>}
              {settingsSection === 'about' && <section className="settings-section"><div className="settings-heading"><span className="eyebrow">ABOUT</span><h2>osirhidden desktop.</h2><p>Tauri + React + strict TypeScript.</p></div><div className="about-grid"><div><span>Version</span><strong>{appInfo.version}</strong></div><div><span>Platform</span><strong>{appInfo.platform}</strong></div><div><span>Architecture</span><strong>{appInfo.arch}</strong></div><div><span>Renderer</span><strong>React / TSX</strong></div></div></section>}
            </div>
          </div>}
        </section>
      </main>

      <footer className="statusbar"><div><span className={`status-dot ${runtime.online ? 'is-online' : ''}`} /><span>{runtime.online ? `Local listener :${runtime.port}` : 'Local runtime detached'}</span></div><div><span>Luau autocomplete {autocomplete ? 'on' : 'off'}</span><span className="status-separator">·</span><span>{clients.length} client{clients.length === 1 ? '' : 's'}</span><span className="status-separator">·</span><span>{appInfo.arch}</span></div></footer>
      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  </div>;
}

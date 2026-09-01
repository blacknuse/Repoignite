import React, { useEffect, useMemo, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';

type View = 'editor' | 'scripts' | 'clients' | 'settings';
type Panel = 'problems' | 'output' | 'terminal';
type Density = 'comfortable' | 'compact';
type Accent = 'white' | 'silver' | 'red' | 'violet' | 'emerald';
type OutputLevel = 'output' | 'warning' | 'error' | 'info';
type Tab = { id: number; name: string; content: string; dirty: boolean };
type RuntimeStatus = { online: boolean; port: number; mode?: string };
type ClientInfo = { name: string; pid: number; memory: string };
type OutputEntry = { level: OutputLevel; message: string; timestamp?: string | null };
type FolderScript = { name: string; path: string };
type ScriptItem = { id?: string; slug?: string; title?: string; game?: string; verified?: boolean; key?: boolean; isUniversal?: boolean; isPatched?: boolean; views?: number; scriptType?: string; script?: string };
type ScriptSearchResult = { scripts: ScriptItem[]; page: number; totalPages: number; source?: string };
type AppInfo = { version: string; platform: string; arch: string };
type OpenedScript = { name: string; path: string; content: string };
type SavedScript = { ok: boolean; name: string; path: string };
type SettingsPayload = { accent?: Accent; motion?: boolean; density?: Density; editorFontSize?: number; autocomplete?: boolean; timestamps?: boolean; maxOutput?: number; panelHeight?: number };
type ReferenceStage = { name: string; detail: string; durationMs: number };
type ReferencePlan = { ok: boolean; mode: string; stages: ReferenceStage[]; warnings?: string[]; digest?: string; lineCount?: number; tokenCount?: number; byteCount?: number; externalEffects: number; targetWiring: boolean };
type Completion = { label: string; kind: string; detail: string };

const PREVIEW = new URLSearchParams(location.search).get('preview');
const STORAGE_KEY = 'osirhidden-v2.2-workspace';
const DEFAULT_SCRIPT = '-- osirhidden / Luau workspace\n\nprint("Hello from osirhidden")';
const ACCENTS: Record<Accent, string> = { white: '#f4f4f5', silver: '#b8bcc5', red: '#f05b64', violet: '#a98cff', emerald: '#6dd6a2' };

const LUAU_COMPLETIONS: Completion[] = [
  { label: 'print', kind: 'function', detail: 'print(...): void' },
  { label: 'warn', kind: 'function', detail: 'warn(...): void' },
  { label: 'pairs', kind: 'function', detail: 'pairs(t)' },
  { label: 'ipairs', kind: 'function', detail: 'ipairs(t)' },
  { label: 'pcall', kind: 'function', detail: 'pcall(f, ...)' },
  { label: 'xpcall', kind: 'function', detail: 'xpcall(f, handler, ...)' },
  { label: 'type', kind: 'function', detail: 'type(v): string' },
  { label: 'typeof', kind: 'function', detail: 'typeof(v): string' },
  { label: 'tostring', kind: 'function', detail: 'tostring(v): string' },
  { label: 'tonumber', kind: 'function', detail: 'tonumber(v): number?' },
  { label: 'assert', kind: 'function', detail: 'assert(v, message?)' },
  { label: 'error', kind: 'function', detail: 'error(message, level?)' },
  { label: 'select', kind: 'function', detail: 'select(index, ...)' },
  { label: 'next', kind: 'function', detail: 'next(t, index?)' },
  { label: 'require', kind: 'function', detail: 'require(module)' },
  { label: 'local', kind: 'keyword', detail: 'local variable declaration' },
  { label: 'function', kind: 'keyword', detail: 'function declaration' },
  { label: 'return', kind: 'keyword', detail: 'return values' },
  { label: 'if', kind: 'keyword', detail: 'conditional' },
  { label: 'then', kind: 'keyword', detail: 'conditional branch' },
  { label: 'elseif', kind: 'keyword', detail: 'conditional branch' },
  { label: 'else', kind: 'keyword', detail: 'conditional branch' },
  { label: 'end', kind: 'keyword', detail: 'close block' },
  { label: 'for', kind: 'keyword', detail: 'loop' },
  { label: 'while', kind: 'keyword', detail: 'loop' },
  { label: 'repeat', kind: 'keyword', detail: 'repeat loop' },
  { label: 'until', kind: 'keyword', detail: 'repeat loop terminator' },
  { label: 'break', kind: 'keyword', detail: 'break loop' },
  { label: 'continue', kind: 'keyword', detail: 'continue loop' },
  { label: 'and', kind: 'keyword', detail: 'logical and' },
  { label: 'or', kind: 'keyword', detail: 'logical or' },
  { label: 'not', kind: 'keyword', detail: 'logical not' },
  { label: 'true', kind: 'value', detail: 'boolean' },
  { label: 'false', kind: 'value', detail: 'boolean' },
  { label: 'nil', kind: 'value', detail: 'nil value' },
  { label: 'game', kind: 'global', detail: 'DataModel' },
  { label: 'workspace', kind: 'global', detail: 'Workspace' },
  { label: 'script', kind: 'global', detail: 'current Script' },
  { label: 'Enum', kind: 'global', detail: 'Roblox Enum table' },
  { label: 'Instance', kind: 'global', detail: 'Instance.new(className)' },
  { label: 'Vector2', kind: 'global', detail: 'Vector2.new(x, y)' },
  { label: 'Vector3', kind: 'global', detail: 'Vector3.new(x, y, z)' },
  { label: 'CFrame', kind: 'global', detail: 'CFrame.new(...)' },
  { label: 'Color3', kind: 'global', detail: 'Color3.new(r, g, b)' },
  { label: 'UDim2', kind: 'global', detail: 'UDim2.new(...)' },
  { label: 'task', kind: 'global', detail: 'task scheduler library' },
  { label: 'table', kind: 'library', detail: 'table library' },
  { label: 'string', kind: 'library', detail: 'string library' },
  { label: 'math', kind: 'library', detail: 'math library' },
  { label: 'coroutine', kind: 'library', detail: 'coroutine library' },
  { label: 'utf8', kind: 'library', detail: 'utf8 library' },
];

const iconPaths: Record<string, string[]> = {
  editor:['M8 6h8','M8 12h8','M8 18h5','M4 6h.01','M4 12h.01','M4 18h.01'], search:['m21 21-4.3-4.3','M19 11a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z'],
  users:['M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2','M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z','M22 21v-2a4 4 0 0 0-3-3.87'],
  settings:['M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4Z','M19.4 15a7.6 7.6 0 0 0 .1-3l2-1.3-2-3.4-2.3.8a8 8 0 0 0-2.6-1.5L14 4h-4l-.5 2.6A8 8 0 0 0 7 8.1l-2.4-.8-2 3.4L4.6 12a7.6 7.6 0 0 0 .1 3l-2.1 1.3 2 3.4 2.4-.8a8 8 0 0 0 2.5 1.5L10 23h4l.5-2.6a8 8 0 0 0 2.6-1.5l2.3.8 2-3.4-2-1.3Z'],
  play:['m8 5 11 7-11 7V5Z'], plus:['M12 5v14','M5 12h14'], x:['m6 6 12 12','M18 6 6 18'], minus:['M5 12h14'], square:['M6 6h12v12H6z'],
  folder:['M3 6.5h6l2 2h10v10.5H3V6.5Z'], file:['M6 2.5h8l4 4V21H6V2.5Z','M14 2.5v5h5'], open:['M4 6h6l2 2h8v10H4V6Z','m12 4 4 4 4-4','M16 8V3'],
  save:['M4 4h14l2 2v14H4V4Z','M7 4v6h9V4','M8 20v-6h8v6'], copy:['M8 8h11v12H8V8Z','M5 16H4V4h11v1'], chevron:['m9 18 6-6-6-6'],
  terminal:['m4 6 5 5-5 5','M11 18h9'], refresh:['M20 6v5h-5','M4 18v-5h5','M6.2 8.8A7 7 0 0 1 18.5 6.5L20 11','M4 13l1.5 4.5A7 7 0 0 0 17.8 15'],
  bolt:['m13 2-9 12h7l-1 8 9-12h-7l1-8Z'], monitor:['M3 4h18v12H3V4Z','M8 21h8','M12 16v5'], check:['m5 12 4 4L19 6'],
  rocket:['M14 6 18 2l4 4-4 4','M13 7 7 13-3-6-6-3L24 0'], pause:['M8 5v14','M16 5v14'], trash:['M4 7h16','M9 7V4h6v3','m7 0 1 14h10l1-14'],
  sliders:['M4 6h16','M8 6v0','M4 12h16','M15 12v0','M4 18h16','M11 18v0'], palette:['M12 3a9 9 0 1 0 0 18h1.5a1.5 1.5 0 0 0 0-3H11a2 2 0 0 1 0-4h4a6 6 0 0 0-3-11Z'],
  spark:['m12 3 1.3 4.2L17 9l-3.7 1.8L12 15l-1.3-4.2L7 9l3.7-1.8L12 3Z'], download:['M12 3v12','m7 10 5 5 5-5','M5 21h14'],
};

function Icon({ name, size = 15 }: { name: string; size?: number }) {
  return <svg className="ico" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{(iconPaths[name] || iconPaths.editor).map((d,i)=><path d={d} key={i}/>)}</svg>;
}
function BrandMark({ size=20 }: { size?: number }) {
  return <svg className="brand-mark" width={size} height={size} viewBox="0 0 28 28" fill="none" aria-hidden="true"><path d="M5 18.5 11.8 6h4.4L9.4 18.5H5Z" fill="currentColor"/><path d="M11.8 22 18.6 9.5H23L16.2 22h-4.4Z" fill="currentColor" opacity=".48"/></svg>;
}

async function invokeSafe<T>(command: string, args: Record<string, unknown> = {}, fallback: T): Promise<T> {
  try { return await invoke<T>(command, args); } catch (error) { console.error(command, error); return fallback; }
}
function sleep(ms:number){ return new Promise(resolve=>window.setTimeout(resolve,ms)); }

const bootStages = [
  ['Loading interface', 16], ['Restoring workspace', 34], ['Starting native shell', 56], ['Reading local state', 73], ['Discovering clients', 89], ['Ready', 100]
] as const;

export default function App(){
  const stored = useMemo(()=>{ try{return JSON.parse(localStorage.getItem(STORAGE_KEY)||'{}') as {accent?:Accent;motion?:boolean;density?:Density;editorFontSize?:number;autocomplete?:boolean;timestamps?:boolean;maxOutput?:number;panelHeight?:number;tabs?:Tab[];activeTab?:number;nextTab?:number;autoFolder?:string;scriptFolder?:string};}catch{return {}; }},[]);
  const [phase,setPhase]=useState<'splash'|'main'>(PREVIEW==='main'?'main':'splash');
  const [bootTitle,setBootTitle]=useState('Booting native workspace');
  const [progress,setProgress]=useState(PREVIEW==='splash'?61:4);
  const [view,setView]=useState<View>('editor');
  const [panel,setPanel]=useState<Panel>('output');
  const [accent,setAccent]=useState<Accent>(stored.accent||'white');
  const [motion,setMotion]=useState(stored.motion!==false);
  const [density,setDensity]=useState<Density>(stored.density||'comfortable');
  const [editorFontSize,setEditorFontSize]=useState(stored.editorFontSize||12);
  const [autocomplete,setAutocomplete]=useState(stored.autocomplete!==false);
  const [timestamps,setTimestamps]=useState(stored.timestamps!==false);
  const [maxOutput,setMaxOutput]=useState(stored.maxOutput||220);
  const [panelHeight,setPanelHeight]=useState(stored.panelHeight||174);
  const [tabs,setTabs]=useState<Tab[]>(stored.tabs?.length?stored.tabs:[{id:1,name:'Tab #1',content:DEFAULT_SCRIPT,dirty:false}]);
  const [activeTabId,setActiveTabId]=useState(stored.activeTab||1);
  const [nextTabId,setNextTabId]=useState(stored.nextTab||2);
  const [runtime,setRuntime]=useState<RuntimeStatus>({online:false,port:6969,mode:'detached'});
  const [clients,setClients]=useState<ClientInfo[]>([]);
  const [output,setOutput]=useState<OutputEntry[]>([]);
  const [outputPaused,setOutputPaused]=useState(false);
  const [outputQuery,setOutputQuery]=useState('');
  const [terminal,setTerminal]=useState<OutputEntry[]>([{level:'info',message:'Native workspace initialized.'}]);
  const [problems,setProblems]=useState<OutputEntry[]>([]);
  const [appInfo,setAppInfo]=useState<AppInfo>({version:'2.2.0',platform:'windows',arch:'x86_64'});
  const [scriptFolder,setScriptFolder]=useState(stored.scriptFolder||'');
  const [scriptFiles,setScriptFiles]=useState<FolderScript[]>([]);
  const [autoFolder,setAutoFolder]=useState(stored.autoFolder||'');
  const [autoFiles,setAutoFiles]=useState<FolderScript[]>([]);
  const [scriptQuery,setScriptQuery]=useState('');
  const [scriptResults,setScriptResults]=useState<ScriptItem[]>([]);
  const [scriptPage,setScriptPage]=useState(1);
  const [scriptTotalPages,setScriptTotalPages]=useState(1);
  const [scriptLoading,setScriptLoading]=useState(false);
  const [scriptError,setScriptError]=useState('');
  const [filterVerified,setFilterVerified]=useState(false);
  const [filterUniversal,setFilterUniversal]=useState(false);
  const [filterKeyless,setFilterKeyless]=useState(false);
  const [filterUnpatched,setFilterUnpatched]=useState(false);
  const [injectState,setInjectState]=useState<'idle'|'injecting'|'ready'>('idle');
  const [injectLabel,setInjectLabel]=useState('Inject');
  const [injectProgress,setInjectProgress]=useState(0);
  const [executeState,setExecuteState]=useState<'idle'|'checking'|'ready'>('idle');
  const [toast,setToast]=useState<string|null>(null);
  const [suggestions,setSuggestions]=useState<Completion[]>([]);
  const [suggestIndex,setSuggestIndex]=useState(0);
  const [suggestPrefix,setSuggestPrefix]=useState('');
  const [suggestPos,setSuggestPos]=useState({left:70,top:38});
  const editorRef=useRef<HTMLTextAreaElement>(null);
  const gutterRef=useRef<HTMLPreElement>(null);
  const toastTimer=useRef<number|undefined>(undefined);

  const activeTab=tabs.find(t=>t.id===activeTabId)||tabs[0];
  const lineNumbers=useMemo(()=>Array.from({length:Math.max(1,activeTab?.content.split('\n').length||1)},(_,i)=>i+1).join('\n'),[activeTab?.content]);
  const appStyle={ '--accent':ACCENTS[accent], '--editor-font':`${editorFontSize}px`, '--panel-h':`${panelHeight}px` } as React.CSSProperties;

  const showToast=(message:string)=>{setToast(message);window.clearTimeout(toastTimer.current);toastTimer.current=window.setTimeout(()=>setToast(null),1700);};
  const pushTerminal=(message:string,level:OutputLevel='info')=>setTerminal(rows=>[...rows.slice(-250),{level,message,timestamp:new Date().toISOString()}]);

  useEffect(()=>{
    const payload={accent,motion,density,editorFontSize,autocomplete,timestamps,maxOutput,panelHeight,tabs,activeTab:activeTabId,nextTab:nextTabId,autoFolder,scriptFolder};
    localStorage.setItem(STORAGE_KEY,JSON.stringify(payload));
    void invokeSafe('save_settings',{value:{accent,motion,density,editorFontSize,autocomplete,timestamps,maxOutput,panelHeight} satisfies SettingsPayload},null);
  },[accent,motion,density,editorFontSize,autocomplete,timestamps,maxOutput,panelHeight,tabs,activeTabId,nextTabId,autoFolder,scriptFolder]);

  useEffect(()=>{
    if(PREVIEW) return;
    let cancelled=false;
    (async()=>{
      for(const [title,pct] of bootStages){ if(cancelled)return; setBootTitle(title);setProgress(pct);
        if(pct===34){const s=await invokeSafe<SettingsPayload>('load_settings',{},{});if(s.accent)setAccent(s.accent);if(typeof s.motion==='boolean')setMotion(s.motion);if(s.density)setDensity(s.density);if(s.editorFontSize)setEditorFontSize(s.editorFontSize);if(typeof s.autocomplete==='boolean')setAutocomplete(s.autocomplete);if(typeof s.timestamps==='boolean')setTimestamps(s.timestamps);if(s.maxOutput)setMaxOutput(s.maxOutput);if(s.panelHeight)setPanelHeight(s.panelHeight);}
        if(pct===56)setAppInfo(await invokeSafe('app_info',{},appInfo));
        if(pct===73)setRuntime(await invokeSafe('runtime_status',{port:6969},{online:false,port:6969,mode:'detached'}));
        if(pct===89)setClients(await invokeSafe('list_clients',{},[]));
        await sleep(145);
      }
      await invokeSafe('promote_main_window',{},null); if(!cancelled)setPhase('main');
    })();return()=>{cancelled=true;};
  },[]);

  useEffect(()=>{
    if(phase!=='main')return;let cancelled=false;
    const poll=async()=>{const [nextClients,nextRuntime,nextOutput]=await Promise.all([invokeSafe<ClientInfo[]>('list_clients',{},[]),invokeSafe<RuntimeStatus>('runtime_status',{port:6969},{online:false,port:6969,mode:'detached'}),outputPaused?Promise.resolve(output):invokeSafe<OutputEntry[]>('read_roblox_output',{limit:maxOutput},[])]);if(!cancelled){setClients(nextClients);setRuntime(nextRuntime);if(!outputPaused)setOutput(nextOutput);}};
    void poll();const timer=window.setInterval(()=>void poll(),1700);return()=>{cancelled=true;window.clearInterval(timer);};
  },[phase,outputPaused,maxOutput]);

  useEffect(()=>{if(scriptFolder)void refreshFolder(scriptFolder,false);},[]);
  useEffect(()=>{if(autoFolder)void refreshFolder(autoFolder,true);},[]);

  const startDrag=(event:React.PointerEvent<HTMLElement>)=>{if(event.button!==0)return;const target=event.target as HTMLElement;if(target.closest('button,input,textarea,a,[data-no-drag]'))return;void invokeSafe('window_start_dragging',{},null);};
  const addTab=(content='',name?:string)=>{const id=nextTabId;setTabs(current=>[...current,{id,name:name||`Tab #${id}`,content,dirty:Boolean(content)}]);setActiveTabId(id);setNextTabId(id+1);setView('editor');};
  const closeTab=(id:number)=>{if(tabs.length===1)return;const index=tabs.findIndex(t=>t.id===id);const next=tabs.filter(t=>t.id!==id);setTabs(next);if(activeTabId===id)setActiveTabId(next[Math.min(index,next.length-1)].id);};
  const updateActive=(content:string)=>setTabs(current=>current.map(t=>t.id===activeTabId?{...t,content,dirty:true}:t));
  const clearEditor=()=>{updateActive('');setSuggestions([]);};

  const openFile=async()=>{const data=await invokeSafe<OpenedScript|null>('open_script',{},null);if(data)addTab(data.content,data.name);};
  const openPath=async(path:string)=>{const data=await invokeSafe<OpenedScript|null>('read_script_path',{path},null);if(data)addTab(data.content,data.name);};
  const saveFile=async()=>{if(!activeTab)return;const result=await invokeSafe<SavedScript|null>('save_script',{suggestedName:activeTab.name.endsWith('.lua')||activeTab.name.endsWith('.luau')?activeTab.name:`${activeTab.name}.luau`,content:activeTab.content},null);if(result){setTabs(current=>current.map(t=>t.id===activeTabId?{...t,name:result.name,dirty:false}:t));showToast('Saved');}};
  const chooseFolder=async(auto:boolean)=>{const path=await invokeSafe<string|null>('choose_script_folder',{},null);if(!path)return;if(auto)setAutoFolder(path);else setScriptFolder(path);await refreshFolder(path,auto);};
  const refreshFolder=async(path:string,auto:boolean)=>{const rows=await invokeSafe<FolderScript[]>('list_folder_scripts',{path},[]);auto?setAutoFiles(rows):setScriptFiles(rows);};

  const updateCompletions=(value:string,caret:number,scrollTop=0,scrollLeft=0)=>{
    if(!autocomplete){setSuggestions([]);return;}
    const before=value.slice(0,caret);const match=before.match(/([A-Za-z_][A-Za-z0-9_]*)$/);const prefix=match?.[1]||'';
    if(prefix.length<1){setSuggestions([]);return;}
    const matches=LUAU_COMPLETIONS.filter(item=>item.label.toLowerCase().startsWith(prefix.toLowerCase())&&item.label!==prefix).slice(0,8);
    if(!matches.length){setSuggestions([]);return;}
    const lines=before.split('\n');const line=lines.length-1;const col=lines[lines.length-1].length;
    setSuggestPrefix(prefix);setSuggestions(matches);setSuggestIndex(0);setSuggestPos({left:Math.min(520,55+col*(editorFontSize*.61)-scrollLeft),top:Math.min(330,17+(line+1)*20-scrollTop)});
  };
  const acceptSuggestion=(item=suggestions[suggestIndex])=>{if(!item||!editorRef.current)return;const el=editorRef.current;const caret=el.selectionStart;const start=caret-suggestPrefix.length;const next=(activeTab?.content||'').slice(0,start)+item.label+(activeTab?.content||'').slice(caret);updateActive(next);setSuggestions([]);window.requestAnimationFrame(()=>{el.focus();el.setSelectionRange(start+item.label.length,start+item.label.length);});};
  const editorKeyDown=(event:React.KeyboardEvent<HTMLTextAreaElement>)=>{
    if(suggestions.length){if(event.key==='ArrowDown'){event.preventDefault();setSuggestIndex(i=>(i+1)%suggestions.length);return;}if(event.key==='ArrowUp'){event.preventDefault();setSuggestIndex(i=>(i-1+suggestions.length)%suggestions.length);return;}if(event.key==='Tab'||event.key==='Enter'){event.preventDefault();acceptSuggestion();return;}if(event.key==='Escape'){setSuggestions([]);return;}}
    if(event.key==='Tab'){event.preventDefault();const el=event.currentTarget;const start=el.selectionStart,end=el.selectionEnd;const next=(activeTab?.content||'').slice(0,start)+'    '+(activeTab?.content||'').slice(end);updateActive(next);window.requestAnimationFrame(()=>el.setSelectionRange(start+4,start+4));}
  };

  const executeReference=async()=>{if(!activeTab||executeState==='checking')return;setExecuteState('checking');setPanel('terminal');const plan=await invokeSafe<ReferencePlan>('reference_execute_plan',{script:activeTab.content},{ok:false,mode:'reference-only',stages:[],warnings:['Reference planner unavailable'],externalEffects:0,targetWiring:false});setProblems((plan.warnings||[]).map(message=>({level:'warning',message})));pushTerminal(`[execute/reference] ${plan.ok?'preflight accepted':'preflight rejected'} · ${plan.lineCount||0} lines · ${plan.tokenCount||0} tokens`);for(const stage of plan.stages){pushTerminal(`→ ${stage.name}: ${stage.detail}`);await sleep(Math.min(stage.durationMs,240));}pushTerminal(`[boundary] external effects=${plan.externalEffects}, target wiring=${plan.targetWiring}`);setExecuteState(plan.ok?'ready':'idle');window.setTimeout(()=>setExecuteState('idle'),1000);};
  const injectReference=async()=>{if(injectState==='injecting')return;setInjectState('injecting');setInjectProgress(2);setPanel('terminal');const plan=await invokeSafe<ReferencePlan>('reference_inject_plan',{}, {ok:true,mode:'reference-only',stages:[],externalEffects:0,targetWiring:false});pushTerminal('[inject/reference] internal planning pipeline started');let done=0;for(const stage of plan.stages){setInjectLabel(stage.name);pushTerminal(`→ ${stage.name}: ${stage.detail}`);await sleep(Math.min(stage.durationMs,300));done++;setInjectProgress(Math.round(done/Math.max(1,plan.stages.length)*100));}pushTerminal(`[boundary] sealed · external effects=${plan.externalEffects} · target wiring=${plan.targetWiring}`);setInjectLabel('Ready');setInjectState('ready');setInjectProgress(100);window.setTimeout(()=>{setInjectState('idle');setInjectLabel('Inject');setInjectProgress(0);},1500);};

  const launchRoblox=async()=>{const ok=await invokeSafe<{ok:boolean}|null>('launch_roblox',{},null);showToast(ok?'Roblox launch requested':'Could not launch Roblox');window.setTimeout(()=>void invokeSafe<ClientInfo[]>('list_clients',{},[]).then(setClients),1200);};
  const closeClient=async(pid:number)=>{if(!window.confirm(`Close Roblox client ${pid}?`))return;const result=await invokeSafe<{ok:boolean}|null>('close_client',{pid},null);showToast(result?.ok?'Client closed':'Close failed');setClients(await invokeSafe('list_clients',{},[]));};

  const searchScripts=async(page=1)=>{setScriptLoading(true);setScriptError('');try{const result=await invoke<ScriptSearchResult>('scriptblox_search',{query:scriptQuery,page,verified:filterVerified?true:null,universal:filterUniversal?true:null,keyless:filterKeyless?true:null,unpatched:filterUnpatched?true:null});setScriptResults(result.scripts||[]);setScriptPage(result.page||page);setScriptTotalPages(Math.max(1,result.totalPages||1));}catch(error){setScriptError(String(error));setScriptResults([]);}finally{setScriptLoading(false);}};
  const openScriptItem=async(item:ScriptItem)=>{let source=item.script||'';const identifier=item.slug||item.id||'';if(!source&&identifier){const result=await invokeSafe<{script:string}>('scriptblox_raw',{identifier},{script:''});source=result.script||'';}if(!source){showToast('No source returned');return;}addTab(source,`${item.title||'Script'}.luau`);};
  const saveOutput=async()=>{const text=output.map(row=>`${row.timestamp||''} [${row.level}] ${row.message}`).join('\n');const result=await invokeSafe<{ok:boolean}|null>('save_text_file',{suggestedName:'roblox-output.txt',content:text},null);if(result)showToast('Output saved');};

  if(phase==='splash')return <div className="boot-shell">
    <div className="boot-noise"/><div className="boot-rule boot-rule-a"/><div className="boot-rule boot-rule-b"/>
    <header className="boot-top" onPointerDown={startDrag}><div className="boot-brand"><BrandMark size={19}/><span>osirhidden</span></div><div className="boot-build">DESKTOP / 2.2</div></header>
    <main className="boot-center"><div className="boot-index">01</div><div className="boot-emblem"><span/><BrandMark size={58}/><i/></div><div className="boot-copy"><strong>NATIVE WORKSPACE</strong><span>TAURI · REACT · TSX</span></div></main>
    <footer className="boot-footer"><div className="boot-status"><span>{bootTitle}</span><b>{String(progress).padStart(2,'0')}%</b></div><div className="boot-segments">{Array.from({length:24},(_,i)=><i key={i} className={i<Math.round(progress/100*24)?'is-on':''}/>)}</div></footer>
  </div>;

  const filteredOutput=output.filter(row=>row.message.toLowerCase().includes(outputQuery.toLowerCase()));
  const currentRows=panel==='output'?filteredOutput:panel==='terminal'?terminal:problems;

  return <div className={`app density-${density} ${motion?'':'reduce-motion'}`} style={appStyle}>
    <div className="app-frame">
      <header className="titlebar" onPointerDown={startDrag}>
        <div className="brand"><BrandMark size={18}/><strong>osirhidden</strong><span className="version-pill">2.2</span></div>
        <nav className="top-nav" data-no-drag>{([['editor','editor','Editor'],['scripts','search','Scripts'],['clients','users','Clients'],['settings','settings','Settings']] as const).map(([id,icon,label])=><button key={id} className={view===id?'is-active':''} onClick={()=>setView(id)}><Icon name={icon} size={14}/><span>{label}</span></button>)}</nav>
        <div className="title-actions" data-no-drag><button className="roblox-mini" onClick={()=>void launchRoblox()}><Icon name="rocket" size={13}/>Launch Roblox</button><div className="window-controls"><button onClick={()=>void invokeSafe('window_minimize',{},null)}><Icon name="minus" size={13}/></button><button onClick={()=>void invokeSafe('window_toggle_maximize',{},null)}><Icon name="square" size={12}/></button><button className="close" onClick={()=>void invokeSafe('window_close',{},null)}><Icon name="x" size={13}/></button></div></div>
      </header>

      <main className="workspace">
        <aside className="explorer">
          <div className="explorer-head"><span>EXPLORER</span><button title="Refresh folders" onClick={()=>{if(scriptFolder)void refreshFolder(scriptFolder,false);if(autoFolder)void refreshFolder(autoFolder,true);}}><Icon name="refresh" size={12}/></button></div>
          <ExplorerSection title="Scripts" files={scriptFiles} path={scriptFolder} onChoose={()=>void chooseFolder(false)} onOpen={path=>void openPath(path)}/>
          <ExplorerSection title="Auto-Execute" files={autoFiles} path={autoFolder} onChoose={()=>void chooseFolder(true)} onOpen={path=>void openPath(path)}/>
          <div className="explorer-foot"><span className={runtime.online?'online':''}/><div><strong>{runtime.online?`Listener :${runtime.port}`:'Runtime detached'}</strong><small>{clients.length} Roblox client{clients.length===1?'':'s'}</small></div></div>
        </aside>

        <section className="content-area">
          {view==='editor'&&<div className="editor-layout view-enter">
            <div className="tabbar"><div className="tab-strip">{tabs.map(tab=><div className={`editor-tab ${tab.id===activeTabId?'is-active':''}`} key={tab.id}><button className="tab-main" onClick={()=>setActiveTabId(tab.id)}><span className="tab-dot"/><span>{tab.name}</span>{tab.dirty&&<i/>}</button><button className="tab-close" onClick={()=>closeTab(tab.id)}><Icon name="x" size={11}/></button></div>)}<button className="new-tab" onClick={()=>addTab()}><Icon name="plus" size={13}/></button></div></div>
            <div className="commandbar"><div className="command-group"><button className={`command ${executeState==='checking'?'is-busy':''}`} onClick={()=>void executeReference()}><Icon name="play" size={12}/>{executeState==='checking'?'Checking…':executeState==='ready'?'Ready':'Execute'}</button><button className="command" onClick={clearEditor}>Clear</button><span className="divider"/><button className="command" onClick={()=>void openFile()}><Icon name="open" size={12}/>Open</button><button className="command" onClick={()=>void saveFile()}><Icon name="save" size={12}/>Save</button><button className="command" onClick={()=>{void navigator.clipboard?.writeText(activeTab?.content||'');showToast('Copied');}}><Icon name="copy" size={12}/>Copy</button></div><div className="command-group command-group-right"><div className="runtime-chip"><span className={runtime.online?'online':''}/>{runtime.online?'Local listener':'Detached'}</div><button className={`inject ${injectState==='injecting'?'is-injecting':''} ${injectState==='ready'?'is-ready':''}`} onClick={()=>void injectReference()}><span className="inject-sheen"/>{injectState==='injecting'?<span className="spinner"/>:<Icon name={injectState==='ready'?'check':'bolt'} size={12}/>}<b>{injectLabel}</b>{injectState==='injecting'&&<em>{injectProgress}%</em>}</button></div></div>
            <div className="editor-surface"><pre className="line-gutter" ref={gutterRef}>{lineNumbers}</pre><textarea ref={editorRef} className="code-editor" spellCheck={false} value={activeTab?.content||''} onChange={event=>{updateActive(event.target.value);updateCompletions(event.target.value,event.target.selectionStart,event.target.scrollTop,event.target.scrollLeft);}} onClick={event=>updateCompletions(event.currentTarget.value,event.currentTarget.selectionStart,event.currentTarget.scrollTop,event.currentTarget.scrollLeft)} onKeyDown={editorKeyDown} onScroll={event=>{if(gutterRef.current)gutterRef.current.scrollTop=event.currentTarget.scrollTop;if(suggestions.length)updateCompletions(event.currentTarget.value,event.currentTarget.selectionStart,event.currentTarget.scrollTop,event.currentTarget.scrollLeft);}}/>{suggestions.length>0&&<div className="completion" style={{left:suggestPos.left,top:suggestPos.top}}>{suggestions.map((item,index)=><button key={item.label} className={index===suggestIndex?'is-active':''} onMouseDown={e=>{e.preventDefault();acceptSuggestion(item);}}><span className={`completion-kind kind-${item.kind}`}>{item.kind.slice(0,1).toUpperCase()}</span><strong>{item.label}</strong><small>{item.detail}</small></button>)}<footer>Tab / Enter to accept · Esc to close</footer></div>}</div>
            <section className="bottom-panel"><div className="panel-head"><div className="panel-tabs">{([['problems','Problems',problems.length],['output','Roblox Output',output.length],['terminal','Terminal',terminal.length]] as const).map(([id,label,count])=><button key={id} className={panel===id?'is-active':''} onClick={()=>setPanel(id)}>{label}{count>0&&<b>{count}</b>}</button>)}</div><div className="panel-tools">{panel==='output'&&<><label className="panel-search"><Icon name="search" size={11}/><input value={outputQuery} onChange={e=>setOutputQuery(e.target.value)} placeholder="Filter output"/></label><button title={outputPaused?'Resume':'Pause'} onClick={()=>setOutputPaused(v=>!v)}><Icon name={outputPaused?'play':'pause'} size={11}/></button><button title="Copy" onClick={()=>void navigator.clipboard?.writeText(filteredOutput.map(r=>r.message).join('\n'))}><Icon name="copy" size={11}/></button><button title="Save" onClick={()=>void saveOutput()}><Icon name="download" size={11}/></button></>}{panel==='terminal'&&<button title="Clear terminal" onClick={()=>setTerminal([])}><Icon name="trash" size={11}/></button>}</div></div><div className="console">{currentRows.length===0?<div className="console-empty">No {panel} entries.</div>:currentRows.map((row,index)=><div className={`console-row level-${row.level}`} key={`${row.timestamp||''}-${index}`}>{timestamps&&<time>{row.timestamp?.slice(11,19)||'--:--:--'}</time>}<span>{row.message}</span></div>)}</div></section>
          </div>}

          {view==='scripts'&&<div className="page scripts-page view-enter"><div className="page-head"><div><span className="eyebrow">SCRIPTBLOX LIBRARY</span><h1>Script search</h1><p>Search the public ScriptBlox catalogue and open source directly in a local editor tab.</p></div><span className="powered">Powered by ScriptBlox.com</span></div><div className="search-box"><Icon name="search" size={14}/><input value={scriptQuery} onChange={e=>setScriptQuery(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')void searchScripts(1);}} placeholder="Search scripts, games, utilities…"/><button onClick={()=>void searchScripts(1)} disabled={scriptLoading}>{scriptLoading?'Searching…':'Search'}</button></div><div className="filters"><FilterToggle label="Verified" checked={filterVerified} onChange={setFilterVerified}/><FilterToggle label="Universal" checked={filterUniversal} onChange={setFilterUniversal}/><FilterToggle label="Keyless" checked={filterKeyless} onChange={setFilterKeyless}/><FilterToggle label="Unpatched" checked={filterUnpatched} onChange={setFilterUnpatched}/><button className="refresh-results" onClick={()=>void searchScripts(scriptPage)}><Icon name="refresh" size={11}/>Refresh</button></div>{scriptError&&<div className="inline-error"><strong>Search failed</strong><span>{scriptError}</span></div>}<div className="script-list">{scriptLoading?<div className="list-empty">Contacting ScriptBlox…</div>:scriptResults.length===0?<div className="list-empty">Search for a script or press Search with an empty query for recent results.</div>:scriptResults.map((item,index)=><article className="script-row" key={item.id||item.slug||index}><div className="script-main"><strong>{item.title||'Untitled script'}</strong><span>{item.game||'Universal / unknown game'}</span></div><div className="badges">{item.verified&&<span>Verified</span>}{item.isUniversal&&<span>Universal</span>}{item.key===false&&<span>Keyless</span>}{item.isPatched===false&&<span>Active</span>}</div><div className="views">{Number(item.views||0).toLocaleString()} views</div><button onClick={()=>void openScriptItem(item)}>Open</button></article>)}</div><div className="pager"><button disabled={scriptPage<=1} onClick={()=>void searchScripts(scriptPage-1)}>Previous</button><span>{scriptPage} / {scriptTotalPages}</span><button disabled={scriptPage>=scriptTotalPages} onClick={()=>void searchScripts(scriptPage+1)}>Next</button></div></div>}

          {view==='clients'&&<div className="page view-enter"><div className="page-head"><div><span className="eyebrow">LOCAL WINDOWS CLIENTS</span><h1>Roblox clients</h1><p>Launch, detect and explicitly close local Roblox desktop processes.</p></div><div className="head-actions"><button className="secondary" onClick={()=>void launchRoblox()}><Icon name="rocket" size={12}/>Launch Roblox</button><button className="secondary" onClick={()=>void invokeSafe<ClientInfo[]>('list_clients',{},[]).then(setClients)}><Icon name="refresh" size={12}/>Refresh</button></div></div><div className="client-table"><div className="client-head"><span>Process</span><span>PID</span><span>Memory</span><span>Status</span><span/></div>{clients.length===0?<div className="list-empty">No Roblox desktop client detected.</div>:clients.map(client=><div className="client-row" key={client.pid}><span className="process"><Icon name="monitor" size={13}/>{client.name}</span><code>{client.pid}</code><span>{client.memory||'—'}</span><span className="state"><i/>Running</span><button onClick={()=>void closeClient(client.pid)}>Close</button></div>)}</div><div className="diagnostic-strip"><div><span>Local listener</span><strong>{runtime.online?`Detected :${runtime.port}`:'Detached'}</strong></div><div><span>Execution bridge</span><strong>Sealed</strong></div><div><span>Reference pipeline</span><strong>Available</strong></div></div></div>}

          {view==='settings'&&<div className="settings-page view-enter"><aside className="settings-nav"><span className="eyebrow">SETTINGS</span>{['Appearance','Editor','Motion','Output','Workspace','About'].map((x,i)=><a key={x} href={`#s${i}`}>{x}</a>)}</aside><div className="settings-content">
            <SettingsSection id="s0" title="Appearance" description="Pure-black surfaces with an optional interaction accent."><SettingRow title="Accent" description="Default is neutral white. No blue is used anywhere in the base theme."><div className="accent-palette">{(Object.keys(ACCENTS) as Accent[]).map(a=><button key={a} className={accent===a?'is-active':''} style={{'--swatch':ACCENTS[a]} as React.CSSProperties} onClick={()=>setAccent(a)} title={a}><span/></button>)}</div></SettingRow><SettingRow title="Density" description="Keep the geometry fixed while tightening control spacing."><Segmented value={density} values={[['comfortable','Comfort'],['compact','Compact']]} onChange={v=>setDensity(v as Density)}/></SettingRow></SettingsSection>
            <SettingsSection id="s1" title="Editor" description="Luau authoring and completion behavior."><SettingRow title="Autocomplete" description="Prefix completion for Luau keywords, globals and standard functions."><Toggle checked={autocomplete} onChange={setAutocomplete}/></SettingRow><SettingRow title="Font size" description="Cascadia Code / Consolas editor size."><Range value={editorFontSize} min={10} max={17} suffix="px" onChange={setEditorFontSize}/></SettingRow></SettingsSection>
            <SettingsSection id="s2" title="Motion" description="Short, consistent desktop transitions."><SettingRow title="Interface motion" description="Navigation, tabs, completion menus and status animations."><Toggle checked={motion} onChange={setMotion}/></SettingRow></SettingsSection>
            <SettingsSection id="s3" title="Output" description="Roblox log presentation and panel sizing."><SettingRow title="Timestamps" description="Show parsed log timestamps."><Toggle checked={timestamps} onChange={setTimestamps}/></SettingRow><SettingRow title="Maximum rows" description="Bound log history to keep rendering stable."><Range value={maxOutput} min={80} max={500} step={20} onChange={setMaxOutput}/></SettingRow><SettingRow title="Panel height" description="Adjust the editor console region."><Range value={panelHeight} min={120} max={260} step={10} suffix="px" onChange={setPanelHeight}/></SettingRow></SettingsSection>
            <SettingsSection id="s4" title="Workspace" description="Local folders and application integration."><SettingRow title="Scripts folder" description={scriptFolder||'Not selected'}><button className="secondary" onClick={()=>void chooseFolder(false)}>Choose</button></SettingRow><SettingRow title="Auto-Execute folder" description={autoFolder||'Not selected'}><button className="secondary" onClick={()=>void chooseFolder(true)}>Choose</button></SettingRow><SettingRow title="Launch Roblox" description="Uses the registered roblox-player protocol on Windows."><button className="secondary" onClick={()=>void launchRoblox()}><Icon name="rocket" size={12}/>Launch</button></SettingRow></SettingsSection>
            <SettingsSection id="s5" title="About" description="Native application and sealed reference-runtime information."><div className="about-grid"><div><span>Version</span><strong>{appInfo.version}</strong></div><div><span>Platform</span><strong>{appInfo.platform}</strong></div><div><span>Architecture</span><strong>{appInfo.arch}</strong></div><div><span>Target wiring</span><strong>Disabled</strong></div></div></SettingsSection>
          </div></div>}
        </section>
      </main>
      <footer className="statusbar"><div><span className={`status-dot ${runtime.online?'online':''}`}/><span>{runtime.online?`Listener :${runtime.port}`:'Runtime detached'}</span><span className="status-sep">·</span><span>target boundary sealed</span></div><div><span>Luau</span><span className="status-sep">·</span><span>{activeTab?.content.split('\n').length||1} lines</span><span className="status-sep">·</span><span>{clients.length} client{clients.length===1?'':'s'}</span><span className="status-sep">·</span><span>{appInfo.arch}</span></div></footer>
      {toast&&<div className="toast">{toast}</div>}
    </div>
  </div>;
}

function ExplorerSection({title,files,path,onChoose,onOpen}:{title:string;files:FolderScript[];path:string;onChoose:()=>void;onOpen:(path:string)=>void}){const [open,setOpen]=useState(true);return <section className="tree-section"><div className="tree-heading"><button className={open?'open':''} onClick={()=>setOpen(v=>!v)}><Icon name="chevron" size={12}/><Icon name="folder" size={13}/><strong>{title}</strong></button><button className="tree-add" onClick={onChoose} title={`Choose ${title} folder`}><Icon name="plus" size={12}/></button></div><div className={`tree-content ${open?'is-open':''}`}><div>{path&&<div className="folder-path" title={path}>{path}</div>}{!path?<button className="empty-folder" onClick={onChoose}>Choose folder</button>:files.length===0?<div className="empty-folder static">No .lua or .luau files</div>:files.map(file=><button className="tree-file" key={file.path} onClick={()=>onOpen(file.path)}><Icon name="file" size={12}/><span>{file.name}</span></button>)}</div></div></section>}
function FilterToggle({label,checked,onChange}:{label:string;checked:boolean;onChange:(v:boolean)=>void}){return <button className={`filter ${checked?'is-active':''}`} onClick={()=>onChange(!checked)}><span/>{label}</button>}
function Toggle({checked,onChange}:{checked:boolean;onChange:(v:boolean)=>void}){return <button className={`toggle ${checked?'is-on':''}`} onClick={()=>onChange(!checked)} aria-pressed={checked}><span/></button>}
function Segmented({value,values,onChange}:{value:string;values:[string,string][];onChange:(v:string)=>void}){return <div className="segmented">{values.map(([v,l])=><button key={v} className={value===v?'is-active':''} onClick={()=>onChange(v)}>{l}</button>)}</div>}
function Range({value,min,max,step=1,suffix='',onChange}:{value:number;min:number;max:number;step?:number;suffix?:string;onChange:(v:number)=>void}){return <div className="range"><input type="range" value={value} min={min} max={max} step={step} onChange={e=>onChange(Number(e.target.value))}/><output>{value}{suffix}</output></div>}
function SettingsSection({id,title,description,children}:{id:string;title:string;description:string;children:React.ReactNode}){return <section id={id} className="settings-section"><header><h2>{title}</h2><p>{description}</p></header>{children}</section>}
function SettingRow({title,description,children}:{title:string;description:string;children:React.ReactNode}){return <div className="setting-row"><div><strong>{title}</strong><span>{description}</span></div><div>{children}</div></div>}

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { buildExecuteReference, buildInjectReference } from './referenceRuntime';

type View = 'editor' | 'scripts' | 'clients' | 'settings';
type Panel = 'problems' | 'output' | 'terminal';
type Accent = 'white' | 'silver' | 'crimson' | 'emerald' | 'violet';
type Density = 'comfortable' | 'compact';
type OutputLevel = 'output' | 'warning' | 'error' | 'info';
type Tab = { id:number; name:string; content:string; dirty:boolean };
type RuntimeStatus = { online:boolean; port:number; mode?:string };
type ClientInfo = { name:string; pid:number; memory:string };
type FolderScript = { name:string; path:string };
type OutputEntry = { level:OutputLevel; message:string; timestamp?:string|null };
type OpenedScript = { name:string; path:string; content:string };
type SavedScript = { ok:boolean; name:string; path:string };
type AppInfo = { version:string; platform:string; arch:string };
type ScriptItem = { id?:string; slug?:string; title?:string; game?:string; verified?:boolean; key?:boolean; isUniversal?:boolean; isPatched?:boolean; views?:number; scriptType?:string; script?:string };
type ScriptSearchResult = { scripts:ScriptItem[]; page:number; totalPages:number; source?:string };
type ToastTone = 'success'|'error'|'info';
type Toast = { id:number; title:string; detail?:string; tone:ToastTone };
type Completion = { label:string; kind:'fn'|'kw'|'global'|'type'|'lib'; detail:string; insert?:string; caretBack?:number };
type StoredState = { accent?:Accent; density?:Density; motion?:boolean; editorFont?:number; autocomplete?:boolean; timestamps?:boolean; maxOutput?:number; panelHeight?:number; scriptFolder?:string; autoFolder?:string; tabs?:Tab[]; activeTab?:number; nextTab?:number };

const STORAGE_KEY = 'osirhidden-v3-workspace';
const PREVIEW = new URLSearchParams(location.search).get('preview');
const DEFAULT_SCRIPT = '-- osirhidden · Luau workspace\n\nprint("Hello from osirhidden")';
const ACCENTS:Record<Accent,string> = {
  white:'#f4f4f5', silver:'#b8bac0', crimson:'#e9626b', emerald:'#65c99b', violet:'#a88cf0'
};

const COMPLETIONS:Completion[] = [
  {label:'print',kind:'fn',detail:'print(...): void',insert:'print()',caretBack:1},
  {label:'warn',kind:'fn',detail:'warn(...): void',insert:'warn()',caretBack:1},
  {label:'pairs',kind:'fn',detail:'pairs(table)',insert:'pairs()',caretBack:1},
  {label:'ipairs',kind:'fn',detail:'ipairs(table)',insert:'ipairs()',caretBack:1},
  {label:'pcall',kind:'fn',detail:'pcall(callback, ...)',insert:'pcall()',caretBack:1},
  {label:'xpcall',kind:'fn',detail:'xpcall(callback, handler, ...)',insert:'xpcall()',caretBack:1},
  {label:'typeof',kind:'fn',detail:'typeof(value): string',insert:'typeof()',caretBack:1},
  {label:'tostring',kind:'fn',detail:'tostring(value): string',insert:'tostring()',caretBack:1},
  {label:'tonumber',kind:'fn',detail:'tonumber(value): number?',insert:'tonumber()',caretBack:1},
  {label:'assert',kind:'fn',detail:'assert(condition, message?)',insert:'assert()',caretBack:1},
  {label:'require',kind:'fn',detail:'require(module)',insert:'require()',caretBack:1},
  {label:'local',kind:'kw',detail:'local variable declaration'},
  {label:'function',kind:'kw',detail:'function declaration'},
  {label:'return',kind:'kw',detail:'return values'},
  {label:'if',kind:'kw',detail:'conditional block'},
  {label:'then',kind:'kw',detail:'conditional branch'},
  {label:'elseif',kind:'kw',detail:'conditional branch'},
  {label:'else',kind:'kw',detail:'fallback branch'},
  {label:'end',kind:'kw',detail:'close block'},
  {label:'for',kind:'kw',detail:'iteration block'},
  {label:'while',kind:'kw',detail:'loop block'},
  {label:'repeat',kind:'kw',detail:'repeat block'},
  {label:'until',kind:'kw',detail:'repeat terminator'},
  {label:'continue',kind:'kw',detail:'continue loop'},
  {label:'game',kind:'global',detail:'DataModel global'},
  {label:'workspace',kind:'global',detail:'Workspace global'},
  {label:'script',kind:'global',detail:'current Script'},
  {label:'Enum',kind:'type',detail:'Roblox enum namespace'},
  {label:'Instance',kind:'type',detail:'Instance constructor',insert:'Instance.new()',caretBack:1},
  {label:'Vector2',kind:'type',detail:'Vector2 constructor',insert:'Vector2.new()',caretBack:1},
  {label:'Vector3',kind:'type',detail:'Vector3 constructor',insert:'Vector3.new()',caretBack:1},
  {label:'CFrame',kind:'type',detail:'CFrame constructor',insert:'CFrame.new()',caretBack:1},
  {label:'Color3',kind:'type',detail:'Color3 constructor',insert:'Color3.fromRGB()',caretBack:1},
  {label:'UDim2',kind:'type',detail:'UDim2 constructor',insert:'UDim2.new()',caretBack:1},
  {label:'task',kind:'lib',detail:'task scheduler library'},
  {label:'table',kind:'lib',detail:'table library'},
  {label:'string',kind:'lib',detail:'string library'},
  {label:'math',kind:'lib',detail:'math library'},
  {label:'coroutine',kind:'lib',detail:'coroutine library'},
  {label:'utf8',kind:'lib',detail:'utf8 library'},
];

const paths:Record<string,string[]> = {
  editor:['M5 5h14v14H5z','M8 9h8','M8 13h5'], search:['M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14Z','m16 16 4 4'], users:['M9 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z','M2 21a7 7 0 0 1 14 0','M17 11a3 3 0 1 0 0-6','M17 15a5 5 0 0 1 5 5'], settings:['M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4Z','M19 14.7a7 7 0 0 0 0-5.4l2-1.3-2-3.4-2.3.8A8 8 0 0 0 14.4 4L14 1h-4l-.4 3A8 8 0 0 0 7.3 5.4L5 4.6 3 8l2 1.3a7 7 0 0 0 0 5.4L3 16l2 3.4 2.3-.8A8 8 0 0 0 9.6 20l.4 3h4l.4-3a8 8 0 0 0 2.3-1.4l2.3.8 2-3.4-2-1.3Z'],
  play:['m8 5 11 7-11 7V5Z'], plus:['M12 5v14','M5 12h14'], x:['m6 6 12 12','M18 6 6 18'], minus:['M5 12h14'], square:['M6 6h12v12H6z'],
  folder:['M3 7h7l2 2h9v10H3V7Z'], file:['M6 3h8l4 4v14H6V3Z','M14 3v5h5'], open:['M4 7h6l2 2h8v10H4V7Z','m13 1 3-3 3 3','M16 5v6'], save:['M4 4h14l2 2v14H4V4Z','M8 4v6h8V4','M8 20v-6h8v6'], copy:['M8 8h11v12H8V8Z','M5 16H4V4h11v1'], refresh:['M20 6v5h-5','M4 18v-5h5','M6 8a7 7 0 0 1 12-1l2 4','M4 13l2 4a7 7 0 0 0 12-1'], chevron:['m9 18 6-6-6-6'],
  bolt:['m13 2-9 12h7l-1 8 9-12h-7l1-8Z'], rocket:['M14 6 18 2l4 4-4 4','M13 7 7 13-3-6-6-3L24 0'], terminal:['m4 7 5 5-5 5','M11 18h9'], pause:['M8 5v14','M16 5v14'], trash:['M4 7h16','M9 7V4h6v3','m7 0 1 14h10l1-14'], monitor:['M3 5h18v12H3z','M8 21h8','M12 17v4'], check:['m5 12 4 4L19 6'], download:['M12 3v12','m7 10 5 5 5-5','M5 21h14'],
};

function Icon({name,size=14}:{name:string;size?:number}){
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.55" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{(paths[name]||paths.editor).map((d,i)=><path key={i} d={d}/>)}</svg>;
}
function Mark({size=20}:{size?:number}){
  return <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true"><path d="M7 21.6 13.8 8h4.7l-6.8 13.6H7Z" fill="currentColor"/><path d="m13.5 24 6.8-13.6H25L18.2 24h-4.7Z" fill="currentColor" opacity=".42"/></svg>;
}
async function safeInvoke<T>(command:string,args:Record<string,unknown>,fallback:T):Promise<T>{try{return await invoke<T>(command,args);}catch(error){console.error(command,error);return fallback;}}
function delay(ms:number){return new Promise<void>(resolve=>window.setTimeout(resolve,ms));}

function useStored():StoredState{
  return useMemo(()=>{try{return JSON.parse(localStorage.getItem(STORAGE_KEY)||'{}') as StoredState;}catch{return {}; }},[]);
}

export default function AppV3(){
  const stored=useStored();
  const [phase,setPhase]=useState<'splash'|'main'>(PREVIEW==='main'?'main':'splash');
  const [boot,setBoot]=useState({label:'Initializing workspace',value:8});
  const [view,setView]=useState<View>('editor');
  const [panel,setPanel]=useState<Panel>('output');
  const [accent,setAccent]=useState<Accent>(stored.accent||'white');
  const [density,setDensity]=useState<Density>(stored.density||'comfortable');
  const [motion,setMotion]=useState(stored.motion!==false);
  const [editorFont,setEditorFont]=useState(stored.editorFont||12);
  const [autocomplete,setAutocomplete]=useState(stored.autocomplete!==false);
  const [timestamps,setTimestamps]=useState(stored.timestamps!==false);
  const [maxOutput,setMaxOutput]=useState(stored.maxOutput||220);
  const [panelHeight,setPanelHeight]=useState(stored.panelHeight||166);
  const [tabs,setTabs]=useState<Tab[]>(stored.tabs?.length?stored.tabs:[{id:1,name:'Tab #1',content:DEFAULT_SCRIPT,dirty:false}]);
  const [activeTabId,setActiveTabId]=useState(stored.activeTab||1);
  const [nextTab,setNextTab]=useState(stored.nextTab||2);
  const [runtime,setRuntime]=useState<RuntimeStatus>({online:false,port:6969,mode:'detached'});
  const [clients,setClients]=useState<ClientInfo[]>([]);
  const [scriptFolder,setScriptFolder]=useState(stored.scriptFolder||'');
  const [autoFolder,setAutoFolder]=useState(stored.autoFolder||'');
  const [scriptFiles,setScriptFiles]=useState<FolderScript[]>([]);
  const [autoFiles,setAutoFiles]=useState<FolderScript[]>([]);
  const [output,setOutput]=useState<OutputEntry[]>([]);
  const [outputPaused,setOutputPaused]=useState(false);
  const [outputQuery,setOutputQuery]=useState('');
  const [terminal,setTerminal]=useState<OutputEntry[]>([{level:'info',message:'Workspace initialized.',timestamp:new Date().toISOString()}]);
  const [problems,setProblems]=useState<OutputEntry[]>([]);
  const [injecting,setInjecting]=useState(false);
  const [toasts,setToasts]=useState<Toast[]>([]);
  const [appInfo,setAppInfo]=useState<AppInfo>({version:'2.3.0',platform:'windows',arch:'x86_64'});
  const [suggestions,setSuggestions]=useState<Completion[]>([]);
  const [suggestIndex,setSuggestIndex]=useState(0);
  const [suggestPrefix,setSuggestPrefix]=useState('');
  const [suggestPos,setSuggestPos]=useState({left:70,top:32});
  const [scriptQuery,setScriptQuery]=useState('');
  const [scriptResults,setScriptResults]=useState<ScriptItem[]>([]);
  const [scriptLoading,setScriptLoading]=useState(false);
  const [scriptError,setScriptError]=useState('');
  const [scriptPage,setScriptPage]=useState(1);
  const [scriptPages,setScriptPages]=useState(1);
  const [verified,setVerified]=useState(false);
  const [universal,setUniversal]=useState(false);
  const [keyless,setKeyless]=useState(false);
  const [unpatched,setUnpatched]=useState(false);
  const editorRef=useRef<HTMLTextAreaElement>(null);
  const gutterRef=useRef<HTMLPreElement>(null);
  const toastId=useRef(1);

  const activeTab=tabs.find(t=>t.id===activeTabId)||tabs[0];
  const lineNumbers=useMemo(()=>Array.from({length:Math.max(1,activeTab?.content.split('\n').length||1)},(_,i)=>i+1).join('\n'),[activeTab?.content]);
  const style={'--accent':ACCENTS[accent],'--editor-font':`${editorFont}px`,'--panel-height':`${panelHeight}px`} as React.CSSProperties;

  const notify=(title:string,detail?:string,tone:ToastTone='success')=>{
    const id=toastId.current++;setToasts(current=>[...current,{id,title,detail,tone}]);
    window.setTimeout(()=>setToasts(current=>current.filter(t=>t.id!==id)),2600);
  };
  const pushTerminal=(message:string,level:OutputLevel='info')=>setTerminal(rows=>[...rows.slice(-299),{level,message,timestamp:new Date().toISOString()}]);

  useEffect(()=>{
    const snapshot:StoredState={accent,density,motion,editorFont,autocomplete,timestamps,maxOutput,panelHeight,scriptFolder,autoFolder,tabs,activeTab:activeTabId,nextTab};
    localStorage.setItem(STORAGE_KEY,JSON.stringify(snapshot));
    void safeInvoke('save_settings',{value:{accent,density,motion,editorFont,autocomplete,timestamps,maxOutput,panelHeight}},null);
  },[accent,density,motion,editorFont,autocomplete,timestamps,maxOutput,panelHeight,scriptFolder,autoFolder,tabs,activeTabId,nextTab]);

  useEffect(()=>{
    if(PREVIEW)return;
    let dead=false;
    const stages:[string,number][]=[['Loading native shell',18],['Restoring workspace',41],['Reading local state',62],['Discovering clients',82],['Finalizing interface',100]];
    void (async()=>{
      for(const [label,value] of stages){if(dead)return;setBoot({label,value});
        if(value===41){const settings=await safeInvoke<Record<string,unknown>>('load_settings',{},{});if(typeof settings.accent==='string'&&settings.accent in ACCENTS)setAccent(settings.accent as Accent);}
        if(value===62)setAppInfo(await safeInvoke<AppInfo>('app_info',{},appInfo));
        if(value===82){setRuntime(await safeInvoke('runtime_status',{port:6969},{online:false,port:6969,mode:'detached'}));setClients(await safeInvoke('list_clients',{},[]));}
        await delay(115);
      }
      await safeInvoke('promote_main_window',{},null);if(!dead)setPhase('main');
    })();
    return()=>{dead=true;};
  },[]);

  useEffect(()=>{
    if(phase!=='main')return;
    let dead=false;
    const poll=async()=>{
      const [nextRuntime,nextClients,nextOutput]=await Promise.all([
        safeInvoke<RuntimeStatus>('runtime_status',{port:6969},{online:false,port:6969,mode:'detached'}),
        safeInvoke<ClientInfo[]>('list_clients',{},[]),
        outputPaused?Promise.resolve(output):safeInvoke<OutputEntry[]>('read_roblox_output',{limit:maxOutput},[]),
      ]);
      if(!dead){setRuntime(nextRuntime);setClients(nextClients);if(!outputPaused)setOutput(nextOutput);}
    };
    void poll();const timer=window.setInterval(()=>void poll(),1800);return()=>{dead=true;window.clearInterval(timer);};
  },[phase,outputPaused,maxOutput]);

  useEffect(()=>{if(scriptFolder)void refreshFolder(scriptFolder,false);},[]);
  useEffect(()=>{if(autoFolder)void refreshFolder(autoFolder,true);},[]);

  const startDrag=(event:React.PointerEvent<HTMLElement>)=>{if(event.button!==0)return;const target=event.target as HTMLElement;if(target.closest('button,input,textarea,a,[data-no-drag]'))return;void safeInvoke('window_start_dragging',{},null);};
  const updateTab=(content:string)=>setTabs(current=>current.map(t=>t.id===activeTabId?{...t,content,dirty:true}:t));
  const addTab=(content='',name?:string)=>{const id=nextTab;setTabs(current=>[...current,{id,name:name||`Tab #${id}`,content,dirty:Boolean(content)}]);setActiveTabId(id);setNextTab(id+1);setView('editor');};
  const closeTab=(id:number)=>{if(tabs.length===1)return;const index=tabs.findIndex(t=>t.id===id);const next=tabs.filter(t=>t.id!==id);setTabs(next);if(activeTabId===id)setActiveTabId(next[Math.min(index,next.length-1)].id);};
  const clearEditor=()=>{updateTab('');setSuggestions([]);};
  const openFile=async()=>{const file=await safeInvoke<OpenedScript|null>('open_script',{},null);if(file)addTab(file.content,file.name);};
  const openPath=async(path:string)=>{const file=await safeInvoke<OpenedScript|null>('read_script_path',{path},null);if(file)addTab(file.content,file.name);};
  const saveFile=async()=>{if(!activeTab)return;const name=/\.(lua|luau)$/i.test(activeTab.name)?activeTab.name:`${activeTab.name}.luau`;const result=await safeInvoke<SavedScript|null>('save_script',{suggestedName:name,content:activeTab.content},null);if(result){setTabs(current=>current.map(t=>t.id===activeTabId?{...t,name:result.name,dirty:false}:t));notify('Saved',result.name);}};
  const chooseFolder=async(auto:boolean)=>{const path=await safeInvoke<string|null>('choose_script_folder',{},null);if(!path)return;if(auto)setAutoFolder(path);else setScriptFolder(path);await refreshFolder(path,auto);};
  const refreshFolder=async(path:string,auto:boolean)=>{const files=await safeInvoke<FolderScript[]>('list_folder_scripts',{path},[]);auto?setAutoFiles(files):setScriptFiles(files);};

  const updateSuggestions=(value:string,caret:number,scrollTop=0,scrollLeft=0)=>{
    if(!autocomplete){setSuggestions([]);return;}
    const prefix=value.slice(0,caret).match(/([A-Za-z_][A-Za-z0-9_]*)$/)?.[1]||'';
    if(!prefix){setSuggestions([]);return;}
    const matches=COMPLETIONS.filter(c=>c.label.toLowerCase().startsWith(prefix.toLowerCase())&&c.label!==prefix).slice(0,7);
    if(!matches.length){setSuggestions([]);return;}
    const before=value.slice(0,caret).split('\n');const line=before.length-1;const col=before[before.length-1].length;
    setSuggestPrefix(prefix);setSuggestIndex(0);setSuggestions(matches);setSuggestPos({left:Math.min(520,60+col*(editorFont*.61)-scrollLeft),top:Math.min(350,14+(line+1)*20-scrollTop)});
  };
  const acceptSuggestion=(item=suggestions[suggestIndex])=>{
    if(!item||!editorRef.current)return;const el=editorRef.current;const caret=el.selectionStart;const start=caret-suggestPrefix.length;const insert=item.insert||item.label;const source=activeTab?.content||'';const next=source.slice(0,start)+insert+source.slice(caret);updateTab(next);setSuggestions([]);const position=start+insert.length-(item.caretBack||0);window.requestAnimationFrame(()=>{el.focus();el.setSelectionRange(position,position);});
  };
  const editorKeyDown=(event:React.KeyboardEvent<HTMLTextAreaElement>)=>{
    if(suggestions.length){if(event.key==='ArrowDown'){event.preventDefault();setSuggestIndex(i=>(i+1)%suggestions.length);return;}if(event.key==='ArrowUp'){event.preventDefault();setSuggestIndex(i=>(i-1+suggestions.length)%suggestions.length);return;}if(event.key==='Tab'||event.key==='Enter'){event.preventDefault();acceptSuggestion();return;}if(event.key==='Escape'){setSuggestions([]);return;}}
    if(event.key==='Tab'){event.preventDefault();const el=event.currentTarget;const start=el.selectionStart,end=el.selectionEnd;const source=activeTab?.content||'';const next=source.slice(0,start)+'    '+source.slice(end);updateTab(next);window.requestAnimationFrame(()=>el.setSelectionRange(start+4,start+4));}
  };

  const execute=()=>{
    if(!activeTab)return;
    const plan=buildExecuteReference(activeTab.content);
    setProblems(plan.warnings.map(message=>({level:'warning',message,timestamp:new Date().toISOString()})));
    pushTerminal(`[execute/reference] ${plan.ok?'completed':'rejected'} · ${plan.lines} lines · ${plan.tokens} tokens · ${plan.digest.slice(0,10)}`,plan.ok?'info':'warning');
    if(!plan.ok)setPanel('problems');
    void safeInvoke('reference_execute_plan',{script:activeTab.content},null);
  };

  const inject=async()=>{
    if(injecting)return;setInjecting(true);
    const local=buildInjectReference();
    const nativePromise=safeInvoke<Record<string,unknown>|null>('reference_inject_plan',{},null);
    const minimum=delay(motion?820:180);
    await Promise.all([nativePromise,minimum]);
    pushTerminal(`[inject/reference] completed · session ${local.session.slice(0,10)} · ${local.stages.length} stages · external effects=0`);
    setInjecting(false);
    notify('Injection simulation completed','Reference pipeline finished. No target wiring was used.','success');
  };

  const launchRoblox=async()=>{const result=await safeInvoke<{ok:boolean}|null>('launch_roblox',{},null);if(result?.ok){notify('Roblox launch requested',undefined,'info');window.setTimeout(()=>void safeInvoke<ClientInfo[]>('list_clients',{},[]).then(setClients),1100);}else notify('Could not launch Roblox',undefined,'error');};
  const closeClient=async(pid:number)=>{if(!window.confirm(`Close Roblox client ${pid}?`))return;const result=await safeInvoke<{ok:boolean}|null>('close_client',{pid},null);notify(result?.ok?'Client closed':'Close failed',String(pid),result?.ok?'success':'error');setClients(await safeInvoke('list_clients',{},[]));};

  const searchScripts=async(page=1)=>{setScriptLoading(true);setScriptError('');try{const result=await invoke<ScriptSearchResult>('scriptblox_search',{query:scriptQuery,page,verified:verified?true:null,universal:universal?true:null,keyless:keyless?true:null,unpatched:unpatched?true:null});setScriptResults(result.scripts||[]);setScriptPage(result.page||page);setScriptPages(Math.max(1,result.totalPages||1));}catch(error){setScriptResults([]);setScriptError(String(error));}finally{setScriptLoading(false);}};
  const openScriptItem=async(item:ScriptItem)=>{let source=item.script||'';const id=item.slug||item.id||'';if(!source&&id){const raw=await safeInvoke<{script:string}>('scriptblox_raw',{identifier:id},{script:''});source=raw.script;}if(!source){notify('No source returned',item.title,'error');return;}addTab(source,`${(item.title||'Script').replace(/[\\/:*?"<>|]/g,'_')}.luau`);};
  const saveOutput=async()=>{const text=output.map(row=>`${row.timestamp||''} [${row.level}] ${row.message}`).join('\n');const result=await safeInvoke<{ok:boolean}|null>('save_text_file',{suggestedName:'roblox-output.txt',content:text},null);if(result)notify('Output saved');};

  if(phase==='splash')return <div className="v3-splash" onPointerDown={startDrag}>
    <div className="splash-grid"/><div className="splash-vignette"/>
    <header><div className="splash-brand"><Mark size={18}/><span>osirhidden</span></div><span>DESKTOP / {appInfo.version}</span></header>
    <main><div className="splash-core"><i/><div className="splash-mark"><Mark size={38}/></div><b/></div><div className="splash-title"><strong>{boot.label}</strong><span>Native workspace · React · TSX · Tauri</span></div></main>
    <footer><div className="splash-meter"><span style={{width:`${boot.value}%`}}/></div><div><span>LOCAL INTERFACE</span><b>{String(boot.value).padStart(2,'0')}%</b></div></footer>
  </div>;

  const filteredOutput=output.filter(row=>row.message.toLowerCase().includes(outputQuery.toLowerCase()));
  const currentRows=panel==='output'?filteredOutput:panel==='terminal'?terminal:problems;

  return <div className={`v3-app density-${density} ${motion?'':'reduce-motion'}`} style={style}>
    <div className="v3-frame">
      <header className="v3-titlebar" onPointerDown={startDrag}>
        <div className="v3-brand"><Mark size={18}/><strong>osirhidden</strong><span>2.3</span></div>
        <nav className="v3-nav" data-no-drag>{([['editor','editor','Editor'],['scripts','search','Scripts'],['clients','users','Clients'],['settings','settings','Settings']] as const).map(([id,icon,label])=><button key={id} className={view===id?'active':''} onClick={()=>{setView(id);if(id==='scripts'&&!scriptResults.length&&!scriptLoading)void searchScripts(1);}}><Icon name={icon}/><span>{label}</span></button>)}</nav>
        <div className="v3-title-actions" data-no-drag><button className="launch-compact" onClick={()=>void launchRoblox()}><Icon name="rocket" size={12}/>Launch</button><span className="title-separator"/><button onClick={()=>void safeInvoke('window_minimize',{},null)}><Icon name="minus" size={12}/></button><button onClick={()=>void safeInvoke('window_toggle_maximize',{},null)}><Icon name="square" size={11}/></button><button className="danger" onClick={()=>void safeInvoke('window_close',{},null)}><Icon name="x" size={12}/></button></div>
      </header>

      <main className="v3-workspace">
        <aside className="v3-explorer">
          <div className="explorer-top"><span>EXPLORER</span><button onClick={()=>{if(scriptFolder)void refreshFolder(scriptFolder,false);if(autoFolder)void refreshFolder(autoFolder,true);}} title="Refresh"><Icon name="refresh" size={11}/></button></div>
          <Tree title="Scripts" path={scriptFolder} files={scriptFiles} onChoose={()=>void chooseFolder(false)} onOpen={p=>void openPath(p)}/>
          <Tree title="Auto-Execute" path={autoFolder} files={autoFiles} onChoose={()=>void chooseFolder(true)} onOpen={p=>void openPath(p)}/>
          <div className="explorer-spacer"/>
          <div className="runtime-card"><span className={runtime.online?'online':''}/><div><strong>{runtime.online?`Listener :${runtime.port}`:'Runtime detached'}</strong><small>{clients.length} Roblox client{clients.length===1?'':'s'}</small></div></div>
        </aside>

        <section className="v3-content">
          {view==='editor'&&<div className="editor-view page-enter">
            <div className="tab-row"><div className="tabs">{tabs.map(tab=><div key={tab.id} className={`tab ${tab.id===activeTabId?'active':''}`}><button onClick={()=>setActiveTabId(tab.id)}><span className="tab-status"/>{tab.name}{tab.dirty&&<i/>}</button><button className="tab-x" onClick={()=>closeTab(tab.id)}><Icon name="x" size={10}/></button></div>)}<button className="tab-add" onClick={()=>addTab()}><Icon name="plus" size={12}/></button></div></div>
            <div className="editor-toolbar"><div className="toolbar-left"><button className="execute-btn" onClick={execute}><Icon name="play" size={11}/>Execute</button><button onClick={clearEditor}>Clear</button><i/><button onClick={()=>void openFile()}><Icon name="open" size={11}/>Open</button><button onClick={()=>void saveFile()}><Icon name="save" size={11}/>Save</button><button onClick={()=>{void navigator.clipboard?.writeText(activeTab?.content||'');notify('Copied');}}><Icon name="copy" size={11}/>Copy</button></div><div className="toolbar-right"><div className="listener-pill"><span className={runtime.online?'online':''}/>{runtime.online?'Listener online':'Detached'}</div><button className={`inject-btn ${injecting?'injecting':''}`} disabled={injecting} onClick={()=>void inject()}>{injecting?'Injecting':<><Icon name="bolt" size={11}/>Inject</>}</button></div></div>
            <div className="editor-body"><pre ref={gutterRef} className="gutter">{lineNumbers}</pre><textarea ref={editorRef} className="luau-editor" value={activeTab?.content||''} spellCheck={false} onChange={e=>{updateTab(e.target.value);updateSuggestions(e.target.value,e.target.selectionStart,e.target.scrollTop,e.target.scrollLeft);}} onClick={e=>updateSuggestions(e.currentTarget.value,e.currentTarget.selectionStart,e.currentTarget.scrollTop,e.currentTarget.scrollLeft)} onKeyDown={editorKeyDown} onScroll={e=>{if(gutterRef.current)gutterRef.current.scrollTop=e.currentTarget.scrollTop;if(suggestions.length)updateSuggestions(e.currentTarget.value,e.currentTarget.selectionStart,e.currentTarget.scrollTop,e.currentTarget.scrollLeft);}}/>{suggestions.length>0&&<div className="completion-menu" style={{left:suggestPos.left,top:suggestPos.top}}>{suggestions.map((item,index)=><button key={item.label} className={index===suggestIndex?'active':''} onMouseDown={e=>{e.preventDefault();acceptSuggestion(item);}}><span className={`kind ${item.kind}`}>{item.kind.toUpperCase()}</span><strong>{item.label}</strong><small>{item.detail}</small></button>)}<footer>↑↓ navigate · Tab / Enter accept · Esc close</footer></div>}</div>
            <section className="console-panel"><div className="console-head"><div>{([['problems','Problems',problems.length],['output','Roblox Output',output.length],['terminal','Terminal',terminal.length]] as const).map(([id,label,count])=><button key={id} className={panel===id?'active':''} onClick={()=>setPanel(id)}>{label}{count>0&&<b>{count}</b>}</button>)}</div><aside>{panel==='output'&&<><label><Icon name="search" size={10}/><input value={outputQuery} onChange={e=>setOutputQuery(e.target.value)} placeholder="Filter output"/></label><button title={outputPaused?'Resume':'Pause'} onClick={()=>setOutputPaused(v=>!v)}><Icon name={outputPaused?'play':'pause'} size={10}/></button><button title="Save" onClick={()=>void saveOutput()}><Icon name="download" size={10}/></button></>}{panel==='terminal'&&<button title="Clear" onClick={()=>setTerminal([])}><Icon name="trash" size={10}/></button>}</aside></div><div className="console-body">{currentRows.length===0?<div className="empty-console">No {panel} entries.</div>:currentRows.map((row,index)=><div key={`${row.timestamp||''}-${index}`} className={`console-line ${row.level}`}>{timestamps&&<time>{row.timestamp?.slice(11,19)||'--:--:--'}</time>}<span>{row.message}</span></div>)}</div></section>
          </div>}

          {view==='scripts'&&<div className="v3-page page-enter"><PageHead eyebrow="SCRIPT LIBRARY" title="Search ScriptBlox" description="Browse public scripts and open returned source directly in the local Luau editor."/><div className="search-shell"><Icon name="search"/><input value={scriptQuery} onChange={e=>setScriptQuery(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')void searchScripts(1);}} placeholder="Search scripts or games"/><button disabled={scriptLoading} onClick={()=>void searchScripts(1)}>{scriptLoading?'Searching':'Search'}</button></div><div className="filter-row"><Filter label="Verified" value={verified} set={setVerified}/><Filter label="Universal" value={universal} set={setUniversal}/><Filter label="Keyless" value={keyless} set={setKeyless}/><Filter label="Unpatched" value={unpatched} set={setUnpatched}/><button className="filter-refresh" onClick={()=>void searchScripts(scriptPage)}><Icon name="refresh" size={10}/>Refresh</button></div>{scriptError&&<div className="error-banner"><strong>Search failed</strong><span>{scriptError}</span></div>}<div className="result-list">{scriptLoading?<div className="empty-page">Contacting ScriptBlox…</div>:scriptResults.length===0?<div className="empty-page">No results yet. Search above or refresh recent scripts.</div>:scriptResults.map((item,index)=><article key={item.id||item.slug||index}><div className="result-title"><strong>{item.title||'Untitled script'}</strong><span>{item.game||'Unknown game'}</span></div><div className="result-tags">{item.verified&&<i>Verified</i>}{item.isUniversal&&<i>Universal</i>}{item.key===false&&<i>Keyless</i>}{item.isPatched===false&&<i>Active</i>}</div><span className="views">{Number(item.views||0).toLocaleString()} views</span><button onClick={()=>void openScriptItem(item)}>Open</button></article>)}</div><div className="pager"><button disabled={scriptPage<=1} onClick={()=>void searchScripts(scriptPage-1)}>Previous</button><span>{scriptPage} / {scriptPages}</span><button disabled={scriptPage>=scriptPages} onClick={()=>void searchScripts(scriptPage+1)}>Next</button></div></div>}

          {view==='clients'&&<div className="v3-page page-enter"><PageHead eyebrow="LOCAL WINDOWS" title="Roblox clients" description="Launch, discover, inspect and explicitly close local Roblox desktop clients." actions={<><button className="page-action" onClick={()=>void launchRoblox()}><Icon name="rocket" size={11}/>Launch Roblox</button><button className="page-action" onClick={()=>void safeInvoke<ClientInfo[]>('list_clients',{},[]).then(setClients)}><Icon name="refresh" size={11}/>Refresh</button></>}/><div className="client-grid"><header><span>Process</span><span>PID</span><span>Memory</span><span>Status</span><span/></header>{clients.length===0?<div className="empty-page">No Roblox desktop client detected.</div>:clients.map(client=><div className="client-entry" key={client.pid}><span><Icon name="monitor" size={12}/>{client.name}</span><code>{client.pid}</code><span>{client.memory||'—'}</span><span className="running"><i/>Running</span><button onClick={()=>void closeClient(client.pid)}>Close</button></div>)}</div><div className="system-strip"><div><span>Local listener</span><strong>{runtime.online?`Detected :${runtime.port}`:'Detached'}</strong></div><div><span>Reference runtime</span><strong>Available</strong></div><div><span>Target wiring</span><strong>Disabled</strong></div></div></div>}

          {view==='settings'&&<div className="settings-view page-enter"><aside><span>SETTINGS</span>{['Appearance','Editor','Motion','Output','Workspace','About'].map((x,i)=><a key={x} href={`#setting-${i}`}>{x}</a>)}</aside><div className="settings-scroll"><SettingSection id="setting-0" title="Appearance" detail="Obsidian-black base with restrained optional accents."><SettingRow title="Accent" detail="White is the default; no blue palette is used."><div className="swatches">{(Object.keys(ACCENTS) as Accent[]).map(a=><button key={a} className={accent===a?'active':''} style={{'--swatch':ACCENTS[a]} as React.CSSProperties} onClick={()=>setAccent(a)} title={a}><span/></button>)}</div></SettingRow><SettingRow title="Density" detail="Tighten controls without changing the underlying geometry."><Segmented value={density} options={[['comfortable','Comfort'],['compact','Compact']]} onChange={v=>setDensity(v as Density)}/></SettingRow></SettingSection><SettingSection id="setting-1" title="Editor" detail="Luau authoring behavior."><SettingRow title="Autocomplete" detail="Prefix suggestions for Luau keywords, globals and common constructors."><Toggle value={autocomplete} set={setAutocomplete}/></SettingRow><SettingRow title="Font size" detail="Editor type scale."><Range value={editorFont} set={setEditorFont} min={10} max={17} suffix="px"/></SettingRow></SettingSection><SettingSection id="setting-2" title="Motion" detail="Short desktop-grade transitions only."><SettingRow title="Interface motion" detail="Tabs, views, menu and notification transitions."><Toggle value={motion} set={setMotion}/></SettingRow></SettingSection><SettingSection id="setting-3" title="Output" detail="Control parsed Roblox output presentation."><SettingRow title="Timestamps" detail="Display timestamps beside parsed output rows."><Toggle value={timestamps} set={setTimestamps}/></SettingRow><SettingRow title="Maximum rows" detail="Bound history for stable rendering."><Range value={maxOutput} set={setMaxOutput} min={80} max={500} step={20}/></SettingRow><SettingRow title="Panel height" detail="Resize the editor console region."><Range value={panelHeight} set={setPanelHeight} min={120} max={250} step={10} suffix="px"/></SettingRow></SettingSection><SettingSection id="setting-4" title="Workspace" detail="Local folders and Roblox launch integration."><SettingRow title="Scripts folder" detail={scriptFolder||'Not selected'}><button className="page-action" onClick={()=>void chooseFolder(false)}>Choose</button></SettingRow><SettingRow title="Auto-Execute folder" detail={autoFolder||'Not selected'}><button className="page-action" onClick={()=>void chooseFolder(true)}>Choose</button></SettingRow><SettingRow title="Launch Roblox" detail="Uses the registered Roblox desktop protocol on Windows."><button className="page-action" onClick={()=>void launchRoblox()}><Icon name="rocket" size={11}/>Launch</button></SettingRow></SettingSection><SettingSection id="setting-5" title="About" detail="Native shell and reference-runtime status."><div className="about-cards"><div><span>Version</span><strong>{appInfo.version}</strong></div><div><span>Platform</span><strong>{appInfo.platform}</strong></div><div><span>Architecture</span><strong>{appInfo.arch}</strong></div><div><span>Target wiring</span><strong>Disabled</strong></div></div></SettingSection></div></div>}
        </section>
      </main>

      <footer className="v3-status"><div><span className={`dot ${runtime.online?'online':''}`}/><span>{runtime.online?`Listener :${runtime.port}`:'Runtime detached'}</span><i/> <span>reference boundary sealed</span></div><div><span>Luau</span><i/><span>{activeTab?.content.split('\n').length||1} lines</span><i/><span>{clients.length} client{clients.length===1?'':'s'}</span><i/><span>{appInfo.arch}</span></div></footer>
      <div className="toast-stack">{toasts.map(toast=><div key={toast.id} className={`toast ${toast.tone}`}><span className="toast-icon"><Icon name={toast.tone==='success'?'check':toast.tone==='error'?'x':'terminal'} size={12}/></span><div><strong>{toast.title}</strong>{toast.detail&&<small>{toast.detail}</small>}</div></div>)}</div>
    </div>
  </div>;
}

function Tree({title,path,files,onChoose,onOpen}:{title:string;path:string;files:FolderScript[];onChoose:()=>void;onOpen:(path:string)=>void}){
  const [open,setOpen]=useState(true);return <section className="tree"><div className="tree-head"><button onClick={()=>setOpen(v=>!v)} className={open?'open':''}><Icon name="chevron" size={10}/><Icon name="folder" size={12}/><strong>{title}</strong></button><button className="tree-plus" onClick={onChoose}><Icon name="plus" size={10}/></button></div><div className={`tree-body ${open?'open':''}`}><div>{path&&<span className="tree-path" title={path}>{path}</span>}{!path?<button className="tree-empty" onClick={onChoose}>Choose folder</button>:files.length===0?<span className="tree-empty static">No Lua/Luau files</span>:files.map(file=><button className="tree-file" key={file.path} onClick={()=>onOpen(file.path)}><Icon name="file" size={11}/><span>{file.name}</span></button>)}</div></div></section>;
}
function PageHead({eyebrow,title,description,actions}:{eyebrow:string;title:string;description:string;actions?:React.ReactNode}){return <header className="page-head"><div><span>{eyebrow}</span><h1>{title}</h1><p>{description}</p></div>{actions&&<aside>{actions}</aside>}</header>}
function Filter({label,value,set}:{label:string;value:boolean;set:(v:boolean)=>void}){return <button className={`filter-chip ${value?'active':''}`} onClick={()=>set(!value)}><span/>{label}</button>}
function SettingSection({id,title,detail,children}:{id:string;title:string;detail:string;children:React.ReactNode}){return <section id={id} className="setting-section"><header><h2>{title}</h2><p>{detail}</p></header>{children}</section>}
function SettingRow({title,detail,children}:{title:string;detail:string;children:React.ReactNode}){return <div className="setting-row"><div><strong>{title}</strong><span>{detail}</span></div><aside>{children}</aside></div>}
function Toggle({value,set}:{value:boolean;set:(v:boolean)=>void}){return <button className={`switch ${value?'on':''}`} onClick={()=>set(!value)} aria-pressed={value}><span/></button>}
function Segmented({value,options,onChange}:{value:string;options:[string,string][];onChange:(v:string)=>void}){return <div className="segmented">{options.map(([v,l])=><button key={v} className={value===v?'active':''} onClick={()=>onChange(v)}>{l}</button>)}</div>}
function Range({value,set,min,max,step=1,suffix=''}:{value:number;set:(v:number)=>void;min:number;max:number;step?:number;suffix?:string}){return <div className="range-control"><input type="range" value={value} min={min} max={max} step={step} onChange={e=>set(Number(e.target.value))}/><output>{value}{suffix}</output></div>}

import React from 'react';
import { invoke } from '@tauri-apps/api/core';

const h = React.createElement;
const DEFAULT_SCRIPT = '-- osirhidden workspace\n\nprint("Hello from osirhidden")';
const PREVIEW = new URLSearchParams(location.search).get('preview');

const safeInvoke = async (command, args = {}, fallback = null) => {
  try { return await invoke(command, args); }
  catch (error) { if (PREVIEW) return fallback; throw error; }
};

function cx(...items) { return items.filter(Boolean).join(' '); }

const ICONS = {
  code: ['M8 9 4 12l4 3','m16-6 4 3-4 3','m14 5-4 14'],
  globe: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z','M3.6 9h16.8','M3.6 15h16.8','M12 3c2.3 2.45 3.5 5.45 3.5 9S14.3 18.55 12 21c-2.3-2.45-3.5-5.45-3.5-9S9.7 5.45 12 3Z'],
  users: ['M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2','M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z','M22 21v-2a4 4 0 0 0-3-3.87'],
  settings: ['M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4Z','M19.4 15a7.6 7.6 0 0 0 .1-3l2-1.3-2-3.4-2.3.8a8 8 0 0 0-2.6-1.5L14 4h-4l-.5 2.6A8 8 0 0 0 7 8.1l-2.4-.8-2 3.4L4.6 12a7.6 7.6 0 0 0 .1 3l-2.1 1.3 2 3.4 2.4-.8a8 8 0 0 0 2.5 1.5L10 23h4l.5-2.6a8 8 0 0 0 2.6-1.5l2.3.8 2-3.4-2-1.3Z'],
  play: ['m8 5 11 7-11 7V5Z'], plus:['M12 5v14','M5 12h14'], x:['m6 6 12 12','M18 6 6 18'], minus:['M5 12h14'], square:['M6 6h12v12H6z'],
  folder:['M3 6.5h6l2 2h10v10.5H3V6.5Z'], file:['M6 2.5h8l4 4V21H6V2.5Z','M14 2.5v5h5'], search:['m21 21-4.2-4.2','M19 11a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z'],
  open:['M4 6h6l2 2h8v10H4V6Z','m12 4 4 4 4-4','M16 8V3'], save:['M4 4h14l2 2v14H4V4Z','M7 4v6h9V4','M8 20v-6h8v6'], copy:['M8 8h11v12H8V8Z','M5 16H4V4h11v1'],
  trash:['M4 7h16','M9 7V4h6v3','M7 7l1 14h8l1-14'], chevron:['m9 18 6-6-6-6'], terminal:['m4 6 5 5-5 5','M11 18h9'], warning:['M12 3 2 21h20L12 3Z','M12 9v5','M12 18h.01'],
  refresh:['M20 6v5h-5','M4 18v-5h5','M6.2 8.8A7 7 0 0 1 18.5 6.5L20 11','M4 13l1.5 4.5A7 7 0 0 0 17.8 15'], bolt:['m13 2-9 12h7l-1 8 9-12h-7l1-8Z'],
  monitor:['M3 4h18v12H3V4Z','M8 21h8','M12 16v5'], palette:['M12 3a9 9 0 1 0 0 18h1.2a1.8 1.8 0 0 0 0-3.6H12a2 2 0 0 1 0-4h2a7 7 0 0 0-2-10Z'],
  shield:['M12 3 20 6v5c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6l8-3Z','m9 12 2 2 4-5'], info:['M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Z','M12 11v6','M12 7h.01']
};
function Icon({name='info', size=16}) {
  return h('svg',{className:'ico',width:size,height:size,viewBox:'0 0 24 24',fill:'none',stroke:'currentColor',strokeWidth:1.7,strokeLinecap:'round',strokeLinejoin:'round','aria-hidden':true},
    (ICONS[name]||ICONS.info).map((d,i)=>h('path',{d,key:i})));
}
function Mark({size=24}) { return h('svg',{className:'brand-mark',width:size,height:size,viewBox:'0 0 32 32',fill:'none'},
  h('path',{d:'M7.2 11.1C9.5 7.7 12.4 6 16 6c3.7 0 6.6 1.7 8.8 5.1',stroke:'currentColor',strokeWidth:'2.15',strokeLinecap:'round'}),
  h('path',{d:'M24.8 20.9C22.5 24.3 19.6 26 16 26c-3.7 0-6.6-1.7-8.8-5.1',stroke:'currentColor',strokeWidth:'2.15',strokeLinecap:'round',opacity:'.68'}),
  h('path',{d:'M9.1 24.3 22.9 7.7',stroke:'currentColor',strokeWidth:'2.55',strokeLinecap:'round'})); }

function WindowControls() { return h('div',{className:'window-controls'},
  h('button',{className:'win-btn',onClick:()=>safeInvoke('window_minimize')},h(Icon,{name:'minus',size:15})),
  h('button',{className:'win-btn',onClick:()=>safeInvoke('window_toggle_maximize')},h(Icon,{name:'square',size:14})),
  h('button',{className:'win-btn win-btn--close',onClick:()=>safeInvoke('window_close')},h(Icon,{name:'x',size:15})));
}

const BOOT_STAGES = [
  ['Verifying application','Checking signed assets and local configuration.',12,'verify_assets'],
  ['Preparing workspace','Restoring tabs, preferences, and interface state.',31,'load_settings'],
  ['Starting native bridge','Initializing the lightweight Tauri shell.',52,'app_info'],
  ['Checking local services','Probing localhost runtime status only.',72,'runtime_status'],
  ['Discovering clients','Reading the current desktop client list.',88,'list_clients'],
  ['Ready','Finalizing the workspace.',100,'ready']
];

class App extends React.Component {
  constructor(props){ super(props); const saved=this.loadLocal(); this.state={
    phase: PREVIEW==='main'?'main':'splash', progress: PREVIEW==='splash'?64:4, bootTitle:'Initializing osirhidden', bootSubtitle:'Preparing the native workspace.',
    view:'editor', theme:saved.theme||'dark', motion:saved.motion!==false, density:saved.density||'comfortable', explorerOpen:true, scriptsOpen:true, autoOpen:true,
    tabs:saved.tabs?.length?saved.tabs:[{id:1,name:'Tab #1',content:DEFAULT_SCRIPT,dirty:false}], activeTab:saved.activeTab||1,nextTab:saved.nextTab||2,
    panel:'output',panelCollapsed:false, output:[], terminal:[{level:'info',message:'Tauri shell ready.'}], problems:[], clients:[], runtime:{online:false,port:6969},
    scriptQuery:'',scriptResults:[],scriptLoading:false,scriptError:'',scriptPage:1, scriptTotalPages:1, toast:null,
    outputQuery:'', editorTyping:false, settingsSection:'Appearance', appInfo:{version:'2.0.0',platform:'windows',arch:'x86_64'}
  }; this.poller=null; this.typeTimer=null; }
  componentDidMount(){ if(PREVIEW==='splash') return; if(PREVIEW==='main'){ this.startPolling(); return; } this.boot(); }
  componentWillUnmount(){ clearInterval(this.poller); clearTimeout(this.typeTimer); }
  loadLocal(){ try{return JSON.parse(localStorage.getItem('osirhidden-v2-workspace')||'{}')}catch{return{}} }
  persist(){ const s=this.state; localStorage.setItem('osirhidden-v2-workspace',JSON.stringify({theme:s.theme,motion:s.motion,density:s.density,tabs:s.tabs,activeTab:s.activeTab,nextTab:s.nextTab})); safeInvoke('save_settings',{value:{theme:s.theme,motion:s.motion,density:s.density}},null); }
  async boot(){
    for(const [title,subtitle,pct,cmd] of BOOT_STAGES){
      this.setState({bootTitle:title,bootSubtitle:subtitle,progress:pct});
      if(cmd==='load_settings') await safeInvoke('load_settings',{},{});
      if(cmd==='app_info') this.setState({appInfo:await safeInvoke('app_info',{},this.state.appInfo)});
      if(cmd==='runtime_status') this.setState({runtime:await safeInvoke('runtime_status',{port:6969},{online:false,port:6969})});
      if(cmd==='list_clients') this.setState({clients:await safeInvoke('list_clients',{},[])});
      await new Promise(r=>setTimeout(r,190));
    }
    await safeInvoke('promote_main_window',{},null);
    this.setState({phase:'main'},()=>this.startPolling());
  }
  startPolling(){ clearInterval(this.poller); const go=async()=>{ const [clients,runtime,output]=await Promise.all([
      safeInvoke('list_clients',{},[]),safeInvoke('runtime_status',{port:6969},{online:false,port:6969}),safeInvoke('read_roblox_output',{limit:180},[])]);
      this.setState({clients,runtime,output}); }; go(); this.poller=setInterval(go,1800); }
  toast(message){ this.setState({toast:message}); setTimeout(()=>this.setState({toast:null}),1500); }
  active(){ return this.state.tabs.find(t=>t.id===this.state.activeTab)||this.state.tabs[0]; }
  addTab(content='',name=null){ const id=this.state.nextTab; const tab={id,name:name||`Tab #${id}`,content,dirty:!!content}; this.setState(s=>({tabs:[...s.tabs,tab],activeTab:id,nextTab:id+1}),()=>this.persist()); }
  updateTab(content){ clearTimeout(this.typeTimer); this.setState(s=>({tabs:s.tabs.map(t=>t.id===s.activeTab?{...t,content,dirty:true}:t),editorTyping:true})); this.typeTimer=setTimeout(()=>this.setState({editorTyping:false}),150); }
  closeTab(id){ this.setState(s=>{ if(s.tabs.length===1) return {}; const tabs=s.tabs.filter(t=>t.id!==id); return{tabs,activeTab:s.activeTab===id?tabs[Math.max(0,tabs.length-1)].id:s.activeTab}; },()=>this.persist()); }
  async openFile(){ const data=await safeInvoke('open_script',{},null); if(data) this.addTab(data.content,data.name); }
  async saveFile(){ const t=this.active(); if(!t)return; const saved=await safeInvoke('save_script',{suggestedName:t.name.endsWith('.lua')?t.name:`${t.name}.lua`,content:t.content},null); if(saved){this.setState(s=>({tabs:s.tabs.map(x=>x.id===s.activeTab?{...x,dirty:false}:x)}));this.toast('Saved');} }
  clearEditor(){ this.updateTab(''); }
  copyEditor(){ navigator.clipboard?.writeText(this.active()?.content||''); this.toast('Copied'); }
  async closeClient(pid){ if(!confirm(`Close detected Roblox client ${pid}?`))return; try{await safeInvoke('close_client',{pid});this.toast('Client closed');this.startPolling();}catch(e){this.toast(String(e));} }
  async searchScripts(page=1){ this.setState({scriptLoading:true,scriptError:''}); try{const data=await safeInvoke('scriptblox_search',{query:this.state.scriptQuery,page},{scripts:[],page,totalPages:1});this.setState({scriptResults:data.scripts||[],scriptPage:data.page||page,scriptTotalPages:data.totalPages||1});}catch(e){this.setState({scriptError:String(e)});}finally{this.setState({scriptLoading:false});} }
  async loadScript(item){ let code=item.script||''; if(!code && (item.slug||item.id)){ try{code=(await safeInvoke('scriptblox_raw',{identifier:item.slug||item.id},{script:''})).script||'';}catch{} } if(code){this.addTab(code,(item.title||'Script')+'.lua');this.setState({view:'editor'});} }
  renderSplash(){ const s=this.state; return h('div',{className:'splash-shell'},
    h('div',{className:'splash-noise'}), h('div',{className:'splash-light splash-light--one'}),h('div',{className:'splash-light splash-light--two'}),h('div',{className:'splash-arc'}),
    h('header',{className:'splash-top'},h('div',{className:'splash-mark'},h(Mark,{size:28})),h('div',{className:'splash-meta'},h('span',null,'DESKTOP'),h('span',{className:'meta-dot'}),h('span',null,'V2.0'))),
    h('div',{className:'splash-wordmark'},'OSIRHIDDEN'),
    h('div',{className:'splash-bottom'},h('div',{className:'boot-copy'},h('strong',null,s.bootTitle),h('span',null,s.bootSubtitle)),
      h('div',{className:'progress-meta'},h('span',null,`${String(s.progress).padStart(2,'0')}%`)),h('div',{className:'progress-track'},h('div',{className:'progress-fill',style:{width:`${s.progress}%`}}))),
    h('div',{className:'splash-corner'},'NATIVE / REACT / TAURI')); }
  render(){ if(this.state.phase==='splash')return this.renderSplash(); return this.renderMain(); }
  renderMain(){ return h('div',{className:cx('app',`theme-${this.state.theme}`,`density-${this.state.density}`,this.state.motion?'':'reduce-motion')},
    h('div',{className:'app-frame'},
      h('header',{className:'titlebar','data-tauri-drag-region':true},h('div',{className:'brand','data-tauri-drag-region':true},h(Mark,{size:21}),h('span',null,'osirhidden'),h('em',null,'2.0')),
        h('nav',{className:'nav'},[['editor','code','Editor'],['scripts','globe','Scripts'],['clients','users','Clients'],['settings','settings','Settings']].map(([id,icon,label])=>h('button',{key:id,className:cx('nav-btn',this.state.view===id&&'active'),onClick:()=>this.setState({view:id})},h(Icon,{name:icon,size:15}),label))),h(WindowControls)),
      this.renderBody(),
      h('footer',{className:'statusbar'},h('div',null,h('span',{className:cx('status-dot',this.state.runtime.online&&'online')}),this.state.runtime.online?`Local runtime · ${this.state.runtime.port}`:'Local runtime detached'),h('div',null,`${this.state.clients.length} client${this.state.clients.length===1?'':'s'} · ${this.state.appInfo.arch}`))
    ), this.state.toast&&h('div',{className:'toast'},this.state.toast)); }
  renderBody(){ if(this.state.view==='scripts')return this.renderScripts();if(this.state.view==='clients')return this.renderClients();if(this.state.view==='settings')return this.renderSettings();return this.renderEditor(); }
  renderEditor(){ const t=this.active(); return h('main',{className:'workspace'},this.renderExplorer(),h('section',{className:'editor-stack'},
    h('div',{className:'tabs'},this.state.tabs.map(tab=>h('button',{key:tab.id,className:cx('tab',tab.id===this.state.activeTab&&'active'),onClick:()=>this.setState({activeTab:tab.id})},h('span',{className:'tab-dot'}),h('span',{className:'tab-name'},tab.name),tab.dirty&&h('span',{className:'dirty'}),h('span',{className:'tab-x',onClick:e=>{e.stopPropagation();this.closeTab(tab.id)}},'×'))),h('button',{className:'new-tab',onClick:()=>this.addTab()},h(Icon,{name:'plus',size:14}))),
    h('div',{className:'commandbar'},h('div',{className:'command-group'},h('button',{onClick:()=>this.toast('No execution bridge is connected.')},h(Icon,{name:'play',size:14}),'Execute'),h('button',{onClick:()=>this.clearEditor()},'Clear'),h('span',{className:'command-sep'}),h('button',{onClick:()=>this.openFile()},h(Icon,{name:'open',size:14}),'Open'),h('button',{onClick:()=>this.saveFile()},h(Icon,{name:'save',size:14}),'Save'),h('button',{onClick:()=>this.copyEditor()},h(Icon,{name:'copy',size:14}),'Copy')),h('div',{className:'command-right'},h('span',{className:'bridge-state'},h('i'),this.state.runtime.online?'Listener online':'Detached'),h('button',{className:'primary',onClick:()=>this.toast('Injection is not connected in this build.')},h(Icon,{name:'bolt',size:14}),'Inject'))),
    h('div',{className:cx('editor-wrap',this.state.editorTyping&&'typing')},h('div',{className:'line-gutter'},Array.from({length:Math.max(28,(t?.content||'').split('\n').length)},(_,i)=>h('span',{key:i},i+1)),h('textarea',{className:'code-editor',spellCheck:false,value:t?.content||'',onChange:e=>this.updateTab(e.target.value)})),this.renderPanel())); }
  renderExplorer(){ return h('aside',{className:'explorer'},h('div',{className:'pane-title'},h('span',null,'EXPLORER'),h('button',null,'…')),this.explorerSection('scriptsOpen','Scripts',[['file','welcome.lua'],['file','movement.lua'],['file','ui-test.lua']]),this.explorerSection('autoOpen','Auto-Execute',[])); }
  explorerSection(key,title,items){ return h('div',{className:'tree-section'},h('button',{className:'tree-head',onClick:()=>this.setState(s=>({[key]:!s[key]}))},h(Icon,{name:'chevron',size:12}),h(Icon,{name:'folder',size:14}),title),this.state[key]&&h('div',{className:'tree-items'},items.length?items.map(([icon,name])=>h('button',{key:name,onClick:()=>this.addTab(`-- ${name}\n`,name)},h(Icon,{name:icon,size:13}),name)):h('span',{className:'tree-empty'},'Folder not selected'))); }
  renderPanel(){ if(this.state.panelCollapsed)return h('button',{className:'panel-collapsed',onClick:()=>this.setState({panelCollapsed:false})},'Open bottom panel'); const tabs=[['problems','Problems'],['output','Roblox Output'],['terminal','Terminal']];let rows=this.state.panel==='output'?this.state.output:this.state.panel==='terminal'?this.state.terminal:this.state.problems; if(this.state.outputQuery&&this.state.panel==='output')rows=rows.filter(x=>x.message.toLowerCase().includes(this.state.outputQuery.toLowerCase()));return h('div',{className:'bottom-panel'},h('div',{className:'panel-tabs'},tabs.map(([id,label])=>h('button',{key:id,className:this.state.panel===id?'active':'',onClick:()=>this.setState({panel:id})},label,id==='problems'&&this.state.problems.length?h('b',null,this.state.problems.length):null)),h('div',{className:'panel-tools'},this.state.panel==='output'&&h('label',{className:'mini-search'},h(Icon,{name:'search',size:12}),h('input',{placeholder:'Filter output',value:this.state.outputQuery,onChange:e=>this.setState({outputQuery:e.target.value})})),h('button',{onClick:()=>this.setState({panelCollapsed:true})},'⌄'))),h('div',{className:'console'},rows.length?rows.map((row,i)=>h('div',{key:i,className:cx('console-row',row.level)},h('span',{className:'console-time'},row.timestamp||'—'),h('span',null,row.message))):h('div',{className:'empty-console'},'No entries'))); }
  renderScripts(){ return h('section',{className:'page scripts-page'},h('div',{className:'page-hero'},h('div',null,h('span',{className:'eyebrow'},'SCRIPT LIBRARY'),h('h2',null,'Browse without leaving the workspace'),h('p',null,'Read-only ScriptBlox discovery. Scripts open in the editor; this build does not execute them.'))),h('div',{className:'search-bar'},h(Icon,{name:'search',size:16}),h('input',{value:this.state.scriptQuery,onChange:e=>this.setState({scriptQuery:e.target.value}),onKeyDown:e=>e.key==='Enter'&&this.searchScripts(1),placeholder:'Search ScriptBlox'}),h('button',{onClick:()=>this.searchScripts(1)},'Search')),this.state.scriptError&&h('div',{className:'inline-error'},this.state.scriptError),h('div',{className:'script-grid'},this.state.scriptLoading?h('div',{className:'page-loader'},'Searching…'):this.state.scriptResults.map((item,i)=>h('article',{className:'script-item',key:item.id||i},h('div',{className:'script-card-top'},h('span',{className:'script-type'},item.scriptType||'free'),item.verified&&h('span',{className:'verified'},'Verified')),h('h3',null,item.title),h('p',null,item.game||'Unknown game'),h('div',{className:'script-meta'},h('span',null,`${item.views||0} views`),h('button',{onClick:()=>this.loadScript(item)},'Open in editor'))))),this.state.scriptResults.length>0&&h('div',{className:'pagination'},h('button',{disabled:this.state.scriptPage<=1,onClick:()=>this.searchScripts(this.state.scriptPage-1)},'Previous'),h('span',null,`${this.state.scriptPage} / ${this.state.scriptTotalPages}`),h('button',{disabled:this.state.scriptPage>=this.state.scriptTotalPages,onClick:()=>this.searchScripts(this.state.scriptPage+1)},'Next'))); }
  renderClients(){ return h('section',{className:'page clients-page'},h('div',{className:'page-hero'},h('div',null,h('span',{className:'eyebrow'},'CLIENTS'),h('h2',null,'Local client overview'),h('p',null,'Process discovery and close controls only. No memory or injection bridge is connected.')),h('button',{className:'secondary-btn',onClick:()=>this.startPolling()},h(Icon,{name:'refresh',size:14}),'Refresh')),h('div',{className:'client-table'},h('div',{className:'client-head'},h('span',null,'PROCESS'),h('span',null,'PID'),h('span',null,'MEMORY'),h('span',null,'STATUS'),h('span')),this.state.clients.length?this.state.clients.map(c=>h('div',{className:'client-row',key:c.pid},h('span',{className:'client-name'},h(Icon,{name:'monitor',size:15}),c.name),h('span',null,c.pid),h('span',null,c.memory||'—'),h('span',{className:'client-live'},h('i'),'Detected'),h('button',{className:'icon-danger',title:'Close client',onClick:()=>this.closeClient(c.pid)},h(Icon,{name:'x',size:13})))):h('div',{className:'client-empty'},h(Icon,{name:'monitor',size:22}),h('strong',null,'No Roblox client detected'),h('span',null,'This list updates automatically.')))); }
  renderSettings(){ const sections=['Appearance','Editor','Workspace','Output','Startup','Privacy']; const rows={
    Appearance:[['Theme','Choose the interface palette.',this.segment('theme',[['dark','Dark'],['light','Light']])],['Interface density','Adjust spacing without changing layout.',this.segment('density',[['compact','Compact'],['comfortable','Comfortable']])],['Motion','Use restrained transitions and typing feedback.',this.toggle('motion')]],
    Editor:[['Font','Editor uses the operating-system monospace stack.',h('span',{className:'setting-value'},'System mono')],['Draft recovery','Tabs are restored from local browser storage.',h('span',{className:'setting-value'},'On')]],
    Workspace:[['Native shell','Tauri 2 + WebView2.',h('span',{className:'setting-value'},'Active')],['Execution boundary','External script execution, injection, and remote memory are not registered.',h('span',{className:'setting-value setting-value--safe'},'Disconnected')]],
    Output:[['Roblox log filter','Known Wrap-Deformer engine noise is filtered before display.',h('span',{className:'setting-value'},'Active')],['Refresh interval','Local output and client state.',h('span',{className:'setting-value'},'1.8 s')]],
    Startup:[['Splash','Premium single-window initialization sequence.',h('span',{className:'setting-value'},'On')],['WebView runtime','Uses installed Microsoft Edge WebView2.',h('span',{className:'setting-value'},'System')]],
    Privacy:[['Telemetry','No application telemetry endpoint is configured.',h('span',{className:'setting-value setting-value--safe'},'Off')],['Network','Only explicit ScriptBlox requests are available from the native bridge.',h('span',{className:'setting-value'},'On demand')]]
  }; return h('section',{className:'settings-page'},h('aside',{className:'settings-nav'},h('span',{className:'eyebrow'},'SETTINGS'),h('h2',null,'Preferences'),sections.map(x=>h('button',{key:x,className:this.state.settingsSection===x?'active':'',onClick:()=>this.setState({settingsSection:x})},x))),h('div',{className:'settings-content'},h('div',{className:'settings-heading'},h('span',{className:'eyebrow'},this.state.settingsSection.toUpperCase()),h('h3',null,this.state.settingsSection),h('p',null,'Changes apply immediately and are stored locally.')),h('div',{className:'settings-list'},rows[this.state.settingsSection].map(([title,desc,control])=>h('div',{className:'setting-row',key:title},h('div',null,h('strong',null,title),h('span',null,desc)),control)))); }
  segment(key,items){ return h('div',{className:'segmented'},items.map(([id,label])=>h('button',{key:id,className:this.state[key]===id?'active':'',onClick:()=>this.setState({[key]:id},()=>this.persist())},label))); }
  toggle(key){ return h('button',{className:cx('switch',this.state[key]&&'on'),onClick:()=>this.setState(s=>({[key]:!s[key]}),()=>this.persist())},h('span')); }
}

export default App;

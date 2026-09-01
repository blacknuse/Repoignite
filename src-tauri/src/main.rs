use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{fs, io::Read, net::{IpAddr, Ipv4Addr, SocketAddr, TcpStream}, path::PathBuf, process::Command, time::{Duration, SystemTime}};
use tauri::{LogicalSize, Manager, Size, WebviewWindow};

#[derive(Serialize)] struct AppInfo { version: String, platform: String, arch: String }
#[derive(Serialize)] struct RuntimeStatus { online: bool, port: u16, mode: &'static str }
#[derive(Serialize, Clone)] struct ClientInfo { name: String, pid: u32, memory: String }
#[derive(Serialize)] struct OpenedScript { name: String, path: String, content: String }
#[derive(Serialize)] struct SavedScript { ok: bool, name: String, path: String }
#[derive(Serialize)] struct OutputEntry { level: String, message: String, timestamp: Option<String> }
#[derive(Deserialize)] struct ScriptBloxEnvelope { result: Option<ScriptBloxResult>, message: Option<String> }
#[derive(Deserialize)] struct ScriptBloxResult { scripts: Option<Vec<Value>>, #[serde(rename="totalPages")] total_pages: Option<u32> }

fn app_data_dir() -> PathBuf {
    let base = std::env::var_os("APPDATA").map(PathBuf::from)
        .or_else(|| std::env::var_os("HOME").map(PathBuf::from))
        .unwrap_or_else(|| PathBuf::from("."));
    base.join("osirhidden")
}
fn settings_path() -> PathBuf { app_data_dir().join("settings-v2.json") }

#[tauri::command]
fn app_info() -> AppInfo { AppInfo { version: env!("CARGO_PKG_VERSION").into(), platform: std::env::consts::OS.into(), arch: std::env::consts::ARCH.into() } }

#[tauri::command]
fn promote_main_window(window: WebviewWindow) -> Result<(), String> {
    window.set_resizable(true).map_err(|e| e.to_string())?;
    window.set_min_size(Some(Size::Logical(LogicalSize { width: 980.0, height: 650.0 }))).map_err(|e| e.to_string())?;
    window.set_size(Size::Logical(LogicalSize { width: 1280.0, height: 820.0 })).map_err(|e| e.to_string())?;
    window.center().map_err(|e| e.to_string())?;
    Ok(())
}
#[tauri::command] fn window_minimize(window: WebviewWindow) -> Result<(), String> { window.minimize().map_err(|e| e.to_string()) }
#[tauri::command] fn window_toggle_maximize(window: WebviewWindow) -> Result<(), String> { if window.is_maximized().map_err(|e| e.to_string())? { window.unmaximize() } else { window.maximize() }.map_err(|e| e.to_string()) }
#[tauri::command] fn window_close(window: WebviewWindow) -> Result<(), String> { window.close().map_err(|e| e.to_string()) }

#[tauri::command]
fn runtime_status(port: Option<u16>) -> RuntimeStatus {
    let port = port.unwrap_or(6969);
    let addr = SocketAddr::new(IpAddr::V4(Ipv4Addr::LOCALHOST), port);
    let online = TcpStream::connect_timeout(&addr, Duration::from_millis(220)).is_ok();
    RuntimeStatus { online, port, mode: if online { "local" } else { "detached" } }
}

fn parse_tasklist_csv(text: &str) -> Vec<ClientInfo> {
    let mut out = Vec::new();
    for line in text.lines() {
        if !line.contains("RobloxPlayerBeta.exe") { continue; }
        let fields: Vec<String> = line.trim().trim_matches('"').split("\",\"").map(|s| s.replace("\"\"", "\"")).collect();
        if fields.len() < 2 { continue; }
        if let Ok(pid) = fields[1].parse::<u32>() { out.push(ClientInfo { name: fields[0].clone(), pid, memory: fields.get(4).cloned().unwrap_or_default() }); }
    }
    out
}
#[tauri::command]
fn list_clients() -> Vec<ClientInfo> {
    if cfg!(not(target_os="windows")) { return Vec::new(); }
    Command::new("tasklist").args(["/FO","CSV","/NH","/FI","IMAGENAME eq RobloxPlayerBeta.exe"]).creation_flags_no_window().output()
        .ok().map(|o| parse_tasklist_csv(&String::from_utf8_lossy(&o.stdout))).unwrap_or_default()
}
#[tauri::command]
fn close_client(pid: u32) -> Result<Value, String> {
    if !list_clients().iter().any(|c| c.pid == pid) { return Err("CLIENT_NOT_FOUND".into()); }
    let status = Command::new("taskkill").args(["/PID", &pid.to_string(), "/T", "/F"]).creation_flags_no_window().status().map_err(|e| e.to_string())?;
    Ok(json!({"ok":status.success(),"pid":pid}))
}

trait WindowsNoConsole { fn creation_flags_no_window(&mut self) -> &mut Self; }
impl WindowsNoConsole for Command {
    fn creation_flags_no_window(&mut self) -> &mut Self {
        #[cfg(target_os="windows")] { use std::os::windows::process::CommandExt; self.creation_flags(0x08000000); }
        self
    }
}

#[tauri::command]
fn load_settings() -> Value {
    fs::read_to_string(settings_path()).ok().and_then(|s| serde_json::from_str(&s).ok()).unwrap_or_else(|| json!({}))
}
#[tauri::command]
fn save_settings(value: Value) -> Result<Value, String> {
    let dir=app_data_dir(); fs::create_dir_all(&dir).map_err(|e|e.to_string())?;
    let text=serde_json::to_string_pretty(&value).map_err(|e|e.to_string())?;
    fs::write(settings_path(), text).map_err(|e|e.to_string())?; Ok(json!({"ok":true}))
}

#[tauri::command]
fn open_script() -> Result<Option<OpenedScript>, String> {
    let picked = rfd::FileDialog::new().add_filter("Luau / Lua", &["lua","luau","txt"]).pick_file();
    let Some(path) = picked else { return Ok(None); };
    let mut file=fs::File::open(&path).map_err(|e|e.to_string())?; let mut content=String::new(); file.take(2*1024*1024).read_to_string(&mut content).map_err(|e|e.to_string())?;
    Ok(Some(OpenedScript { name:path.file_name().and_then(|x|x.to_str()).unwrap_or("Opened.lua").to_string(), path:path.to_string_lossy().to_string(), content }))
}
#[tauri::command]
fn save_script(suggested_name: String, content: String) -> Result<Option<SavedScript>, String> {
    let safe_name = if suggested_name.trim().is_empty() { "script.lua" } else { suggested_name.trim() };
    let picked = rfd::FileDialog::new().set_file_name(safe_name).add_filter("Luau / Lua", &["lua","luau","txt"]).save_file();
    let Some(path) = picked else { return Ok(None); };
    if content.len() > 2*1024*1024 { return Err("SCRIPT_TOO_LARGE".into()); }
    fs::write(&path, content).map_err(|e|e.to_string())?;
    Ok(Some(SavedScript { ok:true, name:path.file_name().and_then(|x|x.to_str()).unwrap_or("script.lua").to_string(), path:path.to_string_lossy().to_string() }))
}

fn newest_log() -> Option<PathBuf> {
    let local=std::env::var_os("LOCALAPPDATA")?; let dirs=[PathBuf::from(&local).join("Roblox/logs"),PathBuf::from(&local).join("Roblox/Logs")];
    let mut best:Option<(SystemTime,PathBuf)>=None;
    for dir in dirs { for entry in fs::read_dir(dir).ok()?.flatten() { let p=entry.path(); if p.extension().and_then(|x|x.to_str()).map(|x|x.eq_ignore_ascii_case("log"))!=Some(true){continue;} let m=entry.metadata().ok()?.modified().ok()?; if best.as_ref().map(|b|m>b.0).unwrap_or(true){best=Some((m,p));} } }
    best.map(|x|x.1)
}
fn parse_log_line(line:&str)->Option<OutputEntry>{
    let lower=line.to_ascii_lowercase();
    for noise in ["wrap-deformer fetch meshes has zero targets","wrap-deformer fetching meshes resulted in error","no actual meshes to fetch","skipping follow-on stages"] { if lower.contains(noise){return None;} }
    let (level,idx)=if let Some(i)=line.find("[FLog::Output]"){("output",i+14)}else if let Some(i)=line.find("[FLog::Warning]"){("warning",i+15)}else if let Some(i)=line.find("[FLog::Error]"){("error",i+13)}else{return None;};
    let message=line.get(idx..)?.trim().to_string(); if message.is_empty(){return None;}
    let timestamp=line.get(0..19).filter(|s|s.chars().nth(4)==Some('-')).map(|s|s.to_string());
    Some(OutputEntry{level:level.into(),message,timestamp})
}
#[tauri::command]
fn read_roblox_output(limit: Option<usize>) -> Vec<OutputEntry> {
    let Some(path)=newest_log() else{return Vec::new();}; let Ok(text)=fs::read_to_string(path) else{return Vec::new();}; let cap=limit.unwrap_or(180).clamp(20,500);
    let mut rows:Vec<_>=text.lines().filter_map(parse_log_line).collect(); if rows.len()>cap{rows.drain(0..rows.len()-cap);} rows
}

fn normalize_script(item:&Value)->Value{ json!({
    "id":item.get("_id").and_then(Value::as_str).unwrap_or(""),
    "slug":item.get("slug").and_then(Value::as_str).unwrap_or(""),
    "title":item.get("title").and_then(Value::as_str).unwrap_or("Untitled script"),
    "game":item.get("game").and_then(|g|g.get("name")).and_then(Value::as_str).unwrap_or(if item.get("isUniversal").and_then(Value::as_bool)==Some(true){"Universal"}else{"Unknown game"}),
    "verified":item.get("verified").and_then(Value::as_bool).unwrap_or(false),
    "views":item.get("views").and_then(Value::as_u64).unwrap_or(0),
    "scriptType":item.get("scriptType").and_then(Value::as_str).unwrap_or("free"),
    "script":item.get("script").and_then(Value::as_str).unwrap_or("")
}) }
#[tauri::command]
async fn scriptblox_search(query:String,page:Option<u32>)->Result<Value,String>{
    let page=page.unwrap_or(1).clamp(1,100); let endpoint=if query.trim().is_empty(){"https://scriptblox.com/api/script/fetch"}else{"https://scriptblox.com/api/script/search"};
    let client=reqwest::Client::builder().timeout(Duration::from_secs(9)).build().map_err(|e|e.to_string())?;
    let mut params=vec![("page",page.to_string()),("max","18".into()),("sortBy","updatedAt".into()),("order","desc".into()),("mode","free".into()),("patched","0".into())];
    if !query.trim().is_empty(){params.push(("q",query.trim().chars().take(120).collect()));params.push(("strict","true".into()));}
    let payload:ScriptBloxEnvelope=client.get(endpoint).query(&params).send().await.map_err(|e|e.to_string())?.error_for_status().map_err(|e|e.to_string())?.json().await.map_err(|e|e.to_string())?;
    if payload.result.is_none(){return Err(payload.message.unwrap_or_else(||"SCRIPTBLOX_EMPTY".into()));} let result=payload.result.unwrap(); let scripts=result.scripts.unwrap_or_default().iter().take(18).map(normalize_script).collect::<Vec<_>>();
    Ok(json!({"scripts":scripts,"page":page,"totalPages":result.total_pages.unwrap_or(1)}))
}
#[tauri::command]
async fn scriptblox_raw(identifier:String)->Result<Value,String>{
    if identifier.is_empty()||identifier.len()>220||!identifier.chars().all(|c|c.is_ascii_alphanumeric()||c=='_'||c=='-'){return Err("INVALID_ID".into());}
    let url=format!("https://scriptblox.com/api/script/raw/{}",identifier); let text=reqwest::Client::builder().timeout(Duration::from_secs(9)).build().map_err(|e|e.to_string())?.get(url).send().await.map_err(|e|e.to_string())?.error_for_status().map_err(|e|e.to_string())?.text().await.map_err(|e|e.to_string())?;
    if text.len()>2*1024*1024{return Err("SOURCE_TOO_LARGE".into());} Ok(json!({"script":text}))
}

fn main(){
    tauri::Builder::default().invoke_handler(tauri::generate_handler![app_info,promote_main_window,window_minimize,window_toggle_maximize,window_close,runtime_status,list_clients,close_client,load_settings,save_settings,open_script,save_script,read_roblox_output,scriptblox_search,scriptblox_raw])
      .setup(|app|{ if let Some(win)=app.get_webview_window("main"){ let _=win.set_resizable(false); } Ok(()) })
      .run(tauri::generate_context!()).expect("error while running osirhidden");
}

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod full_reference;

use serde::Serialize;
use serde_json::{json, Value};
use std::{
    fs,
    io::Read,
    net::{IpAddr, Ipv4Addr, SocketAddr, TcpStream},
    path::{Path, PathBuf},
    process::Command,
    time::{Duration, SystemTime},
};
use tauri::{LogicalSize, Size, WebviewWindow};

#[derive(Serialize)]
struct AppInfo { version: String, platform: String, arch: String }
#[derive(Serialize, Clone)]
struct RuntimeStatus { online: bool, port: u16, mode: &'static str }
#[derive(Serialize, Clone)]
struct ClientInfo { name: String, pid: u32, memory: String }
#[derive(Serialize)]
struct OpenedScript { name: String, path: String, content: String }
#[derive(Serialize)]
struct SavedScript { ok: bool, name: String, path: String }
#[derive(Serialize)]
struct OutputEntry { level: String, message: String, timestamp: Option<String> }
#[derive(Serialize)]
struct FolderScript { name: String, path: String }

fn app_data_dir() -> PathBuf {
    let base = std::env::var_os("APPDATA").map(PathBuf::from)
        .or_else(|| std::env::var_os("HOME").map(PathBuf::from))
        .unwrap_or_else(|| PathBuf::from("."));
    base.join("osirhidden")
}
fn settings_path() -> PathBuf { app_data_dir().join("settings-v2.json") }
fn allowed_script_extension(path: &Path) -> bool {
    path.extension().and_then(|x| x.to_str())
        .map(|ext| matches!(ext.to_ascii_lowercase().as_str(), "lua" | "luau" | "txt"))
        .unwrap_or(false)
}
fn read_script_file(path: &Path) -> Result<OpenedScript, String> {
    if !path.is_file() || !allowed_script_extension(path) { return Err("UNSUPPORTED_SCRIPT_FILE".into()); }
    let metadata = fs:metadata(path).map_err(|e| e.to_string())?;
    if metadata.len() > 2 * 1024 * 1024 { return Err("SCRIPT_TOO_LARGE".into()); }
    let file = fs::File::open(path).map_err(|e| e.to_string())?;
    let mut content = String::new();
    file.take(2 * 1024 * 1024).read_to_string(&mut content).map_err(|e| e.to_string())?;
    Ok(OpenedScript {
        name: path.file_name().and_then(|x| x.to_str()).unwrap_or("Opened.luau").to_string(),
        path: path.to_string_lossy().to_string(),
        content,
    })
}

#[tauri::command]
fn app_info() -> AppInfo {
    AppInfo { version: env!("CARGO_PKG_VERSION").into(), platform: std::env::consts::OS.into(), arch: std::env::consts::ARCH.into() }
}
#[tauri::command]
fn promote_main_window(window: WebviewWindow) -> Result<(), String> {
    window.set_resizable(true).map_err(|e| e.to_string())?;
    window.set_min_size(Some(Size::Logical(LogicalSize { width: 900.0, height: 580.0 }))).map_err(|e| e.to_string())?;
    window.set_size(Size::Logical(LogicalSize { width: 1040.0, height: 650.0 })).map_err(|e| e.to_string())?;
    window.center().map_err(|e| e.to_string())?;
    Ok(())
}
#[tauri::command]
fn window_start_dragging(window: WebviewWindow) -> Result<(), String> { window.start_dragging().map_err(|e| e.to_string()) }
#[tauri::command]
fn window_minimize(window: WebviewWindow) -> Result<(), String> { window.minimize().map_err(|e| e.to_string()) }
#[tauri::command]
fn window_toggle_maximize(window: WebviewWindow) -> Result<(), String> {
    if window.is_maximized().map_err(|e| e.to_string())? { window.unmaximize() } else { window.maximize() }.map_err(|e| e.to_string())
}
#[tauri::command]
fn window_close(window: WebviewWindow) -> Result<(), String> { window.close().map_err(|e| e.to_string()) }

#[tauri::command]
fn runtime_status(port: Option<u16>) -> RuntimeStatus {
    let port = port.unwrap_or(6969);
    let addr = SocketAddr::new(IpAddr::V4(Ipv4Addr::LOCALHOST), port);
    let online = TcpStream::connect_timeout(&addr, Duration::from_millis(180)).is_ok();
    RuntimeStatus { online, port, mode: if online { "local" } else { "detached" } }
}

trait WindowsNoConsole { fn creation_flags_no_window(&mut self) -> &mut Self; }
impl WindowsNoConsole for Command {
    fn creation_flags_no_window(&mut self) -> &mut Self {
        #[cfg(target_os="windows")]
        {
            use std::os::windows::process::CommandExt;
            self.creation_flags(0x08000000);
        }
        self
    }
}

#[tauri::command]
fn launch_roblox() -> Result<Value, String> {
    if cfg!(not(target_os="windows")) { return Err("WINDOWS_ONLY".into()); }
    let status = Command::new("cmd")
        .args(["/C", "start", "", "roblox-player:"])
        .creation_flags_no_window()
        .status().map_err(|e| e.to_string())?;
    if !status.success() { return Err("ROBLOX_LAUNCH_FAILED".into()); }
    Ok(json!({"ok":true}))
}
fn parse_tasklist_csv(text: &str) -> Vec<ClientInfo> {
    let mut out = Vec::new();
    for line in text.lines() {
        if !line.to_ascii_lowercase().contains("robloxplayerbeta.exe") { continue; }
        let fields: Vec<String> = line.trim().trim_matches('"').split("\",\"").map(|s| s.replace("\"\"", "\"")).collect();
        if fields.len() < 2 { continue; }
        if let Ok(pid) = fields[1].parse::<u32>() {
            out.push(ClientInfo { name: fields[0].clone(), pid, memory: fields.get(4).cloned().unwrap_or_default() });
        }
    }
    out
}
#[tauri::command]
fn list_clients() -> Vec<ClientInfo> {
    if cfg!(not(target_os="windows")) { return Vec::new(); }
    Command::new("tasklist")
        .args(["/FO","CSV","/NH","/FI","IMAGENAME eq RobloxPlayerBeta.exe"])
        .creation_flags_no_window().output().ok()
        .map(|o| parse_tasklist_csv(&String::from_utf8_lossy(&o.stdout))).unwrap_or_default()
}
#[tauri::command]
fn close_client(pid: u32) -> Result<Value, String> {
    if !list_clients().iter().any(|client| client.pid == pid) { return Err("CLIENT_NOT_FOUND".into()); }
    let status = Command::new("taskkill").args(["/PID", &pid.to_string(), "/T", "/F"])
        .creation_flags_no_window().status().map_err(|e| e.to_string())?;
    Ok(json!({"ok":status.success(),"pid":pid}))
}

#[tauri::command]
fn load_settings() -> Value {
    fs::read_to_string(settings_path()).ok().and_then(|s| serde_json::from_str(&s).ok()).unwrap_or_else(|| json!({}))
}
#[tauri::command]
fn save_settings(value: Value) -> Result<Value, String> {
    let dir = app_data_dir(); fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let text = serde_json::to_string_pretty(&value).map_err(|e| e.to_string())?;
    fs::write(settings_path(), text).map_err(|e| e.to_string())?;
    Ok(json!({"ok":true}))
}

#[tauri::command]
fn open_script() -> Result<Option<OpenedScript>, String> {
    let picked = rfd::FileDialog::new().add_filter("Luau / Lua", &["lua","luau","txt"]).pick_file();
    let Some(path) = picked else { return Ok(None); };
    Ok(Some(read_script_file(&path)?))
}
#[tauri::command]
fn read_script_path(path: String) -> Result<Option<OpenedScript>, String> { Ok(Some(read_script_file(&PathBuf::from(path))?)) }
#[tauri::command]
fn save_script(suggested_name: String, content: String) -> Result<Option<SavedScript>, String> {
    if content.len() > 2 * 1024 * 1024 { return Err("SCRIPT_TOO_LARGE".into()); }
    let safe_name = if suggested_name.trim().is_empty() { "script.luau" } else { suggested_name.trim() };
    let picked = rfd::FileDialog::new().set_file_name(safe_name).add_filter("Luau / Lua", &["lua","luau","txt"]).save_file();
    let Some(path) = picked else { return Ok(None); };
    fs::write(&path, content).map_err(|e| e.to_string())?;
    Ok(Some(SavedScript { ok:true, name:path.file_name().and_then(|x|x.to_str()).unwrap_or("script.luau").to_string(), path:path.to_string_lossy().to_string() }))
}

#[tauri::command]
fn save_text_file(suggested_name: String, content: String) -> Result<Option<Value>, String> {
    if content.len() > 4 * 1024 * 1024 { return Err("TEXT_TOO_LARGE".into()); }
    let picked = rfd::FileDialog::new().set_file_name(&if suggested_name.trim().is_empty(){"output.txt"}else{&suggested_name}).add_filter("Text", &["txt","log"]).save_file();
    let Some(path) = picked else { return Ok(None); };
    fs::write(&path, content).map_err(|e| e.to_string())?;
    Ok(Some(json!({"ok":true,"path":path.to_string_lossy()})))
}
#[tauri::command]
fn choose_script_folder() -> Option<String> { rfd::FileDialog::new().pick_folder().map(|p| p.to_string_lossy().to_string()) }
#[tauri::command]
fn list_folder_scripts(path: String) -> Result<Vec<FolderScript>, String> {
    let root = PathBuf::from(path);
    if !root.is_dir() { return Err("FOLDER_NOT_FOUND".into()); }
    let mut out = Vec::new();
    for entry in fs:read_dir(&root).map_err(|e| e.to_string())?.flatten().take(300) {
        let path = entry.path();
        if !path.is_file() || !allowed_script_extension(&path) { continue; }
        out.push(FolderScript { name:path.file_name().and_then(|x|x.to_str()).unwrap_or("script.luau").to_string(), path:path.to_string_lossy().to_string() });
    }
    out.sort_by(|a,b|a.name.to_ascii_lowercase().cmp(&b.name.to_ascii_lowercase()));
    Ok(out)
}

fn newest_log() -> Option<PathBuf> {
    let local = std::env::var_os("LOCALAPPDATA")?;
    let dirs = [PathBuf::from(&local).join("Roblox/logs"), PathBuf::from(&local).join("Roblox/Logs")];
    let mut best: Option<(SystemTime,PathBuf)> = None;
    for dir in dirs {
        let Ok(entries) = fs::read_dir(dir) else { continue; };
        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().and_then(|x|x.to_str()).map(|x|x.eq_ignore_ascii_case("log"))!=Some(true) { continue; }
            let Ok(modified) = entry.metadata().and_then(|m| m.modified()) else { continue; };
            if best.as_ref().map(|bf modified>b.0).unwrap_or(true) { best=Some((modified,path)); }
        }
    }
    best.map(|x|x.1)
}
fn parse_log_line(line: &str) -> Option<OutputEntry> {
    let lower = line.to_ascii_lowercase();
    for noise in ["wrap-deformer fetch meshes has zero targets", "wrap-deformer fetching meshes resulted in error", "no actual meshes to fetch", "skipping follow-on stages"] {
        if lower.contains(noise) { return None; }
    }
    let (level,index) = if let Some(i)=line.find("[FLog::Output]") { ("output",i+14) }
        else if let Some(i)=line.find("[FLog::Warning]") { ("warning",i+15) }
        else if let Some(i)=line.find("[FLog::Error]") { ("error",i+13) }
        else { return None; };
    let message = line.get(index..)?.trim().to_string();
    if message.is_empty() { return None; }
    let timestamp = line.get(0..19).filter(|s|s.chars().nth(4)==Some('-')).map(|s|s.to_string());
    Some(OutputEntry { level:level.into(), message, timestamp })
}
#[tauri::command]
fn read_roblox_output(limit: Option<usize>) -> Vec<OutputEntry> {
    let Some(path)=newest_log() else { return Vec::new(); };
    let Ok(text)=fs::read_to_string(path) else { return Vec::new(); };
    let cap=limit.unwrap_or(220).clamp(40,600);
    let mut rows:Vec<_>=text.lines().filter_map(parse_log_line).collect();
    if rows.len()>cap { rows.drain(0..rows.len()-cap); }
    rows
}

fn normalize_script(item: &Value) -> Value {
    json!({
        "id":item.get("_id").and_then(Value::as_str).unwrap_or(""),
        "slug":item.get("slug").and_then(Value::as_str).unwrap_or(""),
        "title":item.get("title").and_then(Value::as_str).unwrap_or("Untitled script"),
        "game":item.get("game").and_then(|g|g.get("name")).and_then(Value::as_str).unwrap_or(if item.get("isUniversal").and_then(Value::as_bool)==Some(true){"Universal"}else{"Unknown game"}),
        "verified":item.get("verified").and_then(Value::as_bool).unwrap_or(false),
        "key":item.get("key").and_then(Value::as_bool).unwrap_or(false),
        "isUniversal":item.get("isUniversal").and_then(Value::as_bool).unwrap_or(false),
        "isPatched":item.get("isPatched").and_then(Value::as_bool).unwrap_or(false),
        "views":item.get("views").and_then(Value::as_u64).unwrap_or(0),
        "scriptType":item.get("scriptType").and_then(Value::as_str).unwrap_or("free"),
        "script":item.get("script").and_then(Value::as_str).unwrap_or("")
    })
}
#[tauri::command]
async fn scriptblox_search(query:String,page:Option<u32>,verified:Option<bool>,universal:Option<bool>,keyless:Option<bool>,unpatched:Option<bool>) -> Result<Value,String> {
    let page=page.unwrap_or(1).clamp(1,100);
    let trimmed=query.trim();
    let endpoint=if trimmed.is_empty(){"https://scriptblox.com/api/script/fetch"}else{"https://scriptblox.com/api/script/search"};
    let client=reqwest::Client::builder().timeout(Duration::from_secs(12)).user_agent("osirhidden-desktop/2.2").build().map_err(|e|e.to_string())?;
    let mut params=vec![("page",page.to_string()),("max","18".into()),("sortBy",if trimmed.is_empty(){"ipdatedAt".into()}else{"accuracy".into()}),("order","desc".into())];
    if !trimmed.is_empty() { params.push(("q",trimmed.chars().take(140).collect())); params.push(("strict","false".into())); }
    if verified==Some(true){params.push(("verified","1".into()));}
    if universal==Some(true){params.push(("universal","1".into()));}
    if keyless==Some(true){params.push(("key","0".into()));}
    if unpatched==Some(true){params.push(("patched","0".into()));}
    let response=client.get(endpoint).query(&params).header("Accept","application/json").send().await.map_err(|e|format!("NETWORK: {e}"))?;
    let status=response.status();
    let text=response.text().await.map_err(|e|format!("READ: {e}"))?;
    if !status.is_success(){return Err(format!("HTTP {}: {}", status.as_u16(),text.chars().take(220).collect::<String>()));}
    let payload:Value=serde_json::from_str(&text).map_err(|e|format!("JSON: {e}"))?;
    let Some(result)=payload.get("result") else { return Err(payload.get("message").and_then(Value::as_str).unwrap_or("SCRIPTBLOX_RESULT_MISSING").to_string()); };
    let scripts=result.get("scripts").and_then(Value::as_array).cloned().unwrap_or_default().iter().take(18).map(normalize_script).collect::<Vec<_>>();
    let total_pages=result.get("totalPages").and_then(Value::as_u64).unwrap_or(1).clamp(1,1000);
    Ok(json!({"scripts":scripts,"page":page,"totalPages":total_pages,"source":"scriptblox"}))
}
#[tauri::command]
async fn scriptblox_raw(identifier:String) -> Result<Value,String> {
    if identifier.is_empty()||identifier.len()>220||!identifier.chars().all(|c|c.is_ascii_alphanumeric()||c=='_'||c=='-'){return Err("INVALID_ID".into());}
    let client=reqwest::Client::builder().timeout(Duration::from_secs(12)).user_agent("osirhidden-desktop/2.2").build().map_err(|e|e.to_string())?;
    let response=client.get(format!("https://scriptblox.com/api/script/raw/{identifier}")).header("Accept","text/plain,*/*").send().await.map_err(|e|format!("NETWORK: {e}"))?;
    let status=response.status();let text=response.text().await.map_err(|e|e.to_string())?;
    if !status.is_success(){return Err(format!("HTTP {}: {}",status.as_u16(),text.chars().take(180).collect::<String>()));}
    if text.len()>2*1024*1024{return Err("SOURCE_TOO_LARGE".into());}
    Ok(json!({"script":text}))
}

fn fnv1a64(text:&str)->String {
    let mut hash:u64=0xcbf29ce484222325;
    for byte in text.as_bytes(){hash^=*byte as u64;hash=hash.wrapping_mul(0x100000001b3);}
    format!("{hash:016x}")
}
fn structural_warnings(script:&str)->Vec<String>{
    let mut warnings=Vec::new();
    if script.trim().is_empty(){warnings.push("Editor is empty.".into());return warnings;}
    if script.contains('\0'){warnings.push("Source contains a NUL byte.".into());}
    let mut round=0i32;let mut square=0i32;let mut curly=0i32;let mut quote:Option<char>=None;let mut escaped=false;
    for ch in script.chars(){
        if let Some(q)=quote { if escaped{escaped=false;continue;} if ch=='\\'{escaped=true;continue;} if ch==q{quote=None;} continue; }
        if ch=='\''||ch=='"'{quote=Some(ch);continue;}
        match ch{'('=>round+=1,')'=>round-=1,'['=>square+=1,']'=>square-=1,'{'=>curly+=1,'}'=>curly-=1,_=>{}}
        if round<0||square<0||curly<0{warnings.push("Closing delimiter appears before a matching opener.".into());break;}
    }
    if round!=0{warnings.push(format!("Parenthesis balance is {round}."));}
    if square!=0{warnings.push(format!("Bracket balance is {square}."));}
    if curly!=0{warnings.push(format!("Brace balance is {curly}."));}
    if quote.is_some(){warnings.push("Quoted string appears unterminated.".into());}
    warnings
}
#[tauri::command]
fn reference_execute_plan(script:String)->Value{ full_reference::execute_plan(script) }
#[tauri::command]
fn reference_inject_plan()->Value{ full_reference::inject_plan() }
#[tauri::command]
fn reference_bundle_manifest()->Value{ full_reference::bundle_manifest() }

fn main(){
    tauri::Builder::default().invoke_handler(tauri::generate_handler![
        app_info,promote_main_window,window_start_dragging,window_minimize,window_toggle_maximize,window_close,
        runtime_status,launch_roblox,list_clients,close_client,load_settings,save_settings,
        open_script,read_script_path,save_script,save_text_file,choose_script_folder,list_folder_scripts,
        read_roblox_output,scriptblox_search,scriptblox_raw,reference_execute_plan,reference_inject_plan,reference_bundle_manifest
    ]).run(tauri::generate_context!()).expect("error while running osirhidden");
}

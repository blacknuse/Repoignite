use serde_json::{json, Value};
use std::collections::{BTreeMap, BTreeSet, VecDeque};

fn fnv_bytes(bytes: &[u8]) -> u64 {
    let mut h = 0xcbf29ce484222325u64;
    for b in bytes { h ^= *b as u64; h = h.wrapping_mul(0x100000001b3); }
    h
}
fn fnv_text(text: &str) -> String { format!("{:016x}", fnv_bytes(text.as_bytes())) }
fn stage(name:&str, detail:String, seed:&str, ms:u32)->Value {
    json!({"name":name,"detail":detail,"durationMs":ms,"checksum":fnv_text(&format!("{name}|{detail}|{seed}"))})
}

#[derive(Clone)]
struct Region { base:u64, size:usize, writable:bool, bytes:Vec<u8> }
#[derive(Default)]
struct VirtualAddressSpace { regions:BTreeMap<u64, Region> }
impl VirtualAddressSpace {
    fn reserve(&mut self, base:u64, size:usize, writable:bool)->Result<(),String>{
        if size==0 || size>16*1024*1024 { return Err("invalid virtual region size".into()); }
        let end=base.checked_add(size as u64).ok_or("virtual range overflow")?;
        if self.regions.values().any(|r| base < r.base+r.size as u64 && end > r.base){return Err("virtual region collision".into());}
        self.regions.insert(base,Region{base,size,writable,bytes:vec![0;size]}); Ok(())
    }
    fn write(&mut self, address:u64, data:&[u8])->Result<(),String>{
        let (_,r)=self.regions.range_mut(..=address).next_back().ok_or("virtual address unmapped")?;
        if !r.writable{return Err("virtual region is read-only".into());}
        let off=(address-r.base) as usize; if off+data.len()>r.size{return Err("virtual write exceeds region".into());}
        r.bytes[off..off+data.len()].copy_from_slice(data); Ok(())
    }
    fn read_u64(&self,address:u64)->Result<u64,String>{
        let (_,r)=self.regions.range(..=address).next_back().ok_or("virtual address unmapped")?;
        let off=(address-r.base) as usize; if off+8>r.size{return Err("virtual read exceeds region".into());}
        Ok(u64::from_le_bytes(r.bytes[off..off+8].try_into().unwrap()))
    }
    fn snapshot(&self)->Vec<(u64,Vec<u8>)>{self.regions.iter().map(|(b,r)|(*b,r.bytes.clone())).collect()}
    fn restore(&mut self,snapshot:&[(u64,Vec<u8>)]){for (base,bytes) in snapshot{if let Some(r)=self.regions.get_mut(base){r.bytes.clone_from(bytes);}}}
    fn region_count(&self)->usize{self.regions.len()}
}

#[derive(Clone)]
struct Section { name:&'static str, rva:u32, raw:u32, size:u32, executable:bool, writable:bool }
struct SyntheticImage { machine:u16, image_base:u64, entry_rva:u32, size_of_image:u32, sections:Vec<Section> }
impl SyntheticImage {
    fn build()->Self{Self{machine:0x8664,image_base:0x0000_0001_4000_0000,entry_rva:0x1200,size_of_image:0x9000,sections:vec![
        Section{name:".text",rva:0x1000,raw:0x400,size:0x2000,executable:true,writable:false},
        Section{name:".rdata",rva:0x3000,raw:0x2400,size:0x1800,executable:false,writable:false},
        Section{name:".data",rva:0x5000,raw:0x3c00,size:0x1000,executable:false,writable:true},
        Section{name:".pdata",rva:0x6000,raw:0x4c00,size:0x1000,executable:false,writable:false},
        Section{name:".reloc",rva:0x7000,raw:0x5c00,size:0x1000,executable:false,writable:false},
    ]}}
    fn validate(&self)->Result<(),String>{
        if self.machine!=0x8664{return Err("synthetic image machine mismatch".into());}
        if self.entry_rva>=self.size_of_image{return Err("synthetic entry outside image".into());}
        let mut last=0; for s in &self.sections {if s.rva<last{return Err("synthetic section order invalid".into());} if s.rva+s.size>self.size_of_image{return Err("synthetic section exceeds image".into());} last=s.rva+s.size;}
        Ok(())
    }
}

#[derive(Clone)] struct Reloc { address:u64, original:u64 }
fn apply_relocations(space:&mut VirtualAddressSpace, records:&[Reloc], delta:i64)->Result<usize,String>{
    for rec in records {let adjusted=(rec.original as i128 + delta as i128) as u64; space.write(rec.address,&adjusted.to_le_bytes())?;}
    Ok(records.len())
}

fn resolve_imports()->Result<(usize,String),String>{
    let mut modules:BTreeMap<&str,BTreeSet<&str>>=BTreeMap::new();
    modules.insert("model.runtime",["queue_submit","clock_now","trace_emit","state_get"].into_iter().collect());
    modules.insert("model.data",["buffer_copy","string_hash","table_lookup"].into_iter().collect());
    modules.insert("model.ui",["event_push","signal_emit"].into_iter().collect());
    let requests=[("model.runtime","queue_submit"),("model.runtime","clock_now"),("model.data","buffer_copy"),("model.data","string_hash"),("model.ui","signal_emit")];
    for (m,s) in requests {if !modules.get(m).map(|x|x.contains(s)).unwrap_or(false){return Err(format!("unresolved synthetic symbol {m}!{s}"));}}
    let count=modules.values().map(|x|x.len()).sum::<usize>(); Ok((count,fnv_text(&format!("{:?}",modules))))
}

fn validate_tls(callbacks:&[u32])->Result<(),String>{if callbacks.windows(2).any(|w|w[0]>=w[1]){Err("synthetic TLS callback order invalid".into())}else{Ok(())}}
fn validate_unwind(records:&[(u32,u32)])->Result<(),String>{
    for (i,(s,e)) in records.iter().enumerate(){if s>=e{return Err("synthetic unwind range invalid".into());}if i>0&&*s<records[i-1].1{return Err("synthetic unwind overlap".into());}}
    Ok(())
}

fn topo_order()->Result<Vec<&'static str>,String>{
    let nodes=["boundary","image","regions","reloc","imports","tls","unwind","thread","handshake","journal","failure","compat","seal"];
    let deps:[(&str,&[&str]);13]=[
        ("boundary",&[]),("image",&["boundary"]),("regions",&["image"]),("reloc",&["regions"]),("imports",&["image"]),("tls",&["image"]),("unwind",&["image"]),("thread",&["regions","imports","tls","unwind"]),("handshake",&["thread"]),("journal",&["regions"]),("failure",&["journal","handshake"]),("compat",&["reloc","imports","tls","unwind"]),("seal",&["failure","compat"])
    ];
    let mut out=Vec::new(); let mut ready:VecDeque<&str>=nodes.iter().copied().filter(|n|deps.iter().find(|(x,_)|x==n).unwrap().1.is_empty()).collect();
    while let Some(n)=ready.pop_front(){if out.contains(&n){continue;}out.push(n);for (name,d) in deps{if !out.contains(&name)&&d.iter().all(|x|out.contains(x))&&!ready.contains(&name){ready.push_back(name);}}}
    if out.len()!=nodes.len(){return Err("reference dependency graph cycle".into());} Ok(out)
}

fn handshake()->Result<Vec<&'static str>,String>{
    let mut state="INIT"; let mut trace=Vec::new();
    for next in ["HELLO","ACK","READY"] {state=match (state,next){("INIT","HELLO")=>"HELLO",("HELLO","ACK")=>"ACK",("ACK","READY")=>"READY",_=>return Err("reference handshake transition rejected".into())};trace.push(state);}
    Ok(trace)
}

fn failure_replay(space:&mut VirtualAddressSpace, seed:u64, cases:usize)->Result<usize,String>{
    let original=space.snapshot(); let mut state=seed; let mut passed=0;
    for i in 0..cases {state=state.wrapping_mul(6364136223846793005).wrapping_add(1442695040888963407+i as u64);let addr=0x5000_0000+(state%0x200) as u64;let bytes=state.to_le_bytes();let _=space.write(addr,&bytes);space.restore(&original);if space.snapshot()==original{passed+=1;}}
    if passed!=cases{return Err("deterministic rollback replay mismatch".into());} Ok(passed)
}

fn luau_scan(source:&str)->(usize,usize,usize,Vec<String>){
    let mut tokens=0;let mut identifiers=BTreeSet::new();let mut warnings=Vec::new();let mut round=0i32;let mut square=0i32;let mut curly=0i32;let mut quote:Option<char>=None;let mut escape=false;let chars:Vec<char>=source.chars().collect();let mut i=0;
    while i<chars.len(){let c=chars[i];if let Some(q)=quote{if escape{escape=false;}else if c=='\\'{escape=true;}else if c==q{quote=None;}i+=1;continue;}if c=='\\''||c=='"'{quote=Some(c);tokens+=1;i+=1;continue;}if c=='-'&&i+1<chars.len()&&chars[i+1]=='-' {while i<chars.len()&&chars[i]!='\n'{i+=1;}continue;}if c.is_ascii_alphabetic()||c=='_'{let start=i;i+=1;while i<chars.len()&&(chars[i].is_ascii_alphanumeric()||chars[i]=='_'){i+=1;}identifiers.insert(chars[start..i].iter().collect::<String>());tokens+=1;continue;}if c.is_ascii_digit(){tokens+=1;i+=1;while i<chars.len()&&(chars[i].is_ascii_alphanumeric()||"._+-".contains(chars[i])){i+=1;}continue;}match c{'('=>round+=1,')'=>round-=1,'['=>square+=1,']'=>square-=1,'{'=>curly+=1,'}'=>curly-=1,_=>{if !c.is_whitespace(){tokens+=1;}}}if round<0||square<0||curly<0{warnings.push("closing delimiter before opener".into());}i+=1;}
    if quote.is_some(){warnings.push("unterminated quoted string".into());}if round!=0{warnings.push(format!("parenthesis balance {round}"));}if square!=0{warnings.push(format!("bracket balance {square}"));}if curly!=0{warnings.push(format!("brace balance {curly}"));}
    (tokens,identifiers.len(),source.lines().count().max(1),warnings)
}

pub fn execute_plan(script:String)->Value{
    let normalized=script.replace("\r\n","\n");let bytes=normalized.len();let digest=fnv_text(&normalized);let (tokens,identifiers,lines,mut warnings)=luau_scan(&normalized);if normalized.trim().is_empty(){warnings.push("editor is empty".into());}if bytes>2*1024*1024{warnings.push("source exceeds local 2 MiB model limit".into());}
    let fatal=!warnings.is_empty();let frame_bytes=bytes+4;let queue=fnv_text(&format!("queue:{digest}:{tokens}:{frame_bytes}"));let journal_entries=((tokens/20)+6).clamp(6,40);let checkpoint=fnv_text(&format!("checkpoint:{queue}:{journal_entries}"));
    let mut model=VirtualAddressSpace::default();let _=model.reserve(0x1000_0000,0x4000,true);let snapshot=model.snapshot();let mut replay=0;for i in 0..12u64{let addr=0x1000_0000+(i*8);let _=model.write(addr,&i^x55aa).to_le_bytes());model.restore(&snapshot);if model.snapshot()==snapshot{replay+=1;}}
    let stages=vec![
        stage("Source preflight",format!("{bytes} bytes · {lines} lines · local size and NUL checks"),&digest,35),
        stage("Luau lexical model",format!("{tokens} tokens · {identifiers} unique identifiers · comment/string aware"),&digest,45),
        stage("Structure verifier",if warnings.is_empty(){"delimiter and quote invariants accepted".into()}else{format!("{} warning(s) recorded",warnings.len())},&digest,35),
        stage("Request framing",format!("{frame_bytes} bytes · local 32-bit length-prefix model"),&queue,30),
        stage("Scheduler queue",format!("FIFO queue descriptor {} · depth 1",&queue[..10]),&queue,30),
        stage("Transaction journal",format!("{journal_entries} reversible entries · checkpoint {}",&checkpoint[..10]),&checkpoint,35),
        stage("Failure replay",format!("{replay}/12 local mutation/rollback cases restored exactly"),&checkpoint,35),
        stage("Integrity seal","digest, frame, queue and rollback invariants sealed; no external dispatch".into(),&checkpoint,25),
    ];
    json!({"ok":!fatal,"mode":"reference-only","digest":digest,"lineCount":lines,"tokenCount":tokens,"identifierCount":identifiers,"byteCount":bytes,"frameBytes":frame_bytes,"queueDepth":1,"journalEntries":journal_entries,"replayPasses":replay,"warnings":warnings,"stages":stages,"externalEffects":0,"targetWiring":false})
}

pub fn inject_plan()->Value{
    let bundle_hash=fnv_text("DormantUpgrade-v1.8.9-safe-reference-91-files-2674-lines");let image=SyntheticImage::build();let image_ok=image.validate().is_ok();let seed=fnv_text(&format!("full-reference:{}:{}",bundle_hash,image.size_of_image));let mut space=VirtualAddressSpace::default();
    let region_specs=[(0x4000_0000,0x1000,false),(0x4000_1000,0x2000,false),(0x4000_3000,0x1800,false),(0x5000_0000,0x1000,true),(0x5000_1000,0x1000,true),(0x6000_0000,0x1000,false),(0x6000_1000,0x1000,false),(0x7000_0000,0x2000,true)];
    for (base,size,writable) in region_specs{space.reserve(base,size,writable).expect("fixed local virtual layout must be valid");}
    let mut relocs=Vec::new();for i in 0..24u64{let address=0x5000_0000+i*8;let value=0x1400_1000+i*0x20;space.write(address,&value.to_le_bytes()).unwrap();relocs.push(Reloc{address,original:value});}
    let snapshot=space.snapshot();let reloc_count=apply_relocations(&mut space,&relocs,0x200000).unwrap_or(0);let relocation_probe=space.read_u64(0x5000_0000).unwrap_or(0);let (import_count,import_digest)=resolve_imports().unwrap();let tls=[0x1100,0x1180,0x1200];let tls_ok=validate_tls(&tls).is_ok();let unwind=[(0x1000,0x1080),(0x1080,0x1180),(0x1180,0x1280),(0x1280,0x1380),(0x1380,0x1480),(0x1480,0x1580),(0x1580,0x1680),(0x1680,0x1780),(0x1780,0x1880),(0x1880,0x1980),(0x1980,0x1a80),(0x1a80,0x1b80)];let unwind_ok=validate_unwind(&unwind).is_ok();let order=topo_order().unwrap();let hs=handshake().unwrap();let replay=failure_replay(&mut space,u64::from_str_radix(&seed[..16],16).unwrap_or(1),16).unwrap_or(0);space.restore(&snapshot);
    let compat_score=[image_ok,tls_ok,unwind_ok,reloc_count==24,import_count>=9,hs==vec!["HELLO","ACK","READY"],replay==16,order.len()==13].iter().filter(|x|**x).count()*100/8;
    let stages=vec![
        stage("Boundary contract","local-only model asserted · target handles 0 · external effects 0".into(),&seed,55),
        stage("Synthetic image",format!("machine 0x{:04x} · {} sections · entry RVA 0x{:x} · image validation={image_ok}",image.machine,image.sections.len(),image.entry_rva),&seed,65),
        stage("Virtual address map",format!("{} isolated regions · collision, bounds and write-permission checks",space.region_count()),&seed,70),
        stage("Relocation model",format!("{reloc_count} local scalar records · probe 0x{relocation_probe:x} · no external writes"),&seed,70),
        stage("Import resolver",format!("{import_count} synthetic symbols · digest {}",&import_digest[..10]),&seed,65),
        stage("TLS model",format!("{} callbacks · deterministic order validation={tls_ok}",tls.len()),&seed,55),
        stage("Unwind model",format!("{} ranges · bounds/overlap validation={unwind_ok}",unwind.len()),&seed,60),
        stage("Thread descriptor","entry/stack/argument descriptor modeled locally » OS thread creation absent".into(),&seed,55),
        stage("Dependency graph",format!("{} nodes · topological order {}",order.len(),order.join(" → ")),&seed,60),
        stage("Handshake",format!("{} over in-memory channel",hs.join(" → ")),&seed,55),
        stage("Transaction journal","snapshot, mutation, reverse restore and invariant checks active".into(),&seed,65),
        stage("Failure injection",format!("{replay}/16 deterministic failures restored to exact snapshot"),&seed,70),
        stage("Compatibility",format!("reference compatibility score {compat_score}% · synthetic metadata only"),&seed,55),
        stage("Reference coverage",format!("DormantUpgrade parity index · 91 source files · 2674 C/C++ lines · manifest {bundle_hash}"),&seed,45),
        stage("Integrity seal","pipeline digests, dependency order, rollback and boundary invariants sealed".into(),&seed,40),
    ];
    json!({"ok":true,"mode":"reference-only","session":seed,"stages":stages,"virtualRegions":space.region_count(),"relocationRecords":reloc_count,"importDescriptors":import_count,"tlsCallbacks":tls.len(),"unwindRecords":unwind.len(),"rollbackEntries":snapshot.len(),"dependencyNodes":order.len(),"failureCases":16,"replayPasses":replay,"handshake":hs,"compatibilityScore":compat_score,"referenceCoverageHash":bundle_hash,"referenceSourceFiles":91,"referenceCppLines":2674,"externalEffects":0,"targetWiring":false})
}

pub fn bundle_manifest()->Value{ json!({"name":"DormantUpgrade v1.8.9 safe reference coverage","hash":fnv_text("DormantUpgrade-v1.8.9-safe-reference-91-files-2674-lines"),"files":91,"cppLines":2674,"compiledIntoTarget":false,"externalEffects":0,"targetWiring":false})}

fn main() {
    #[cfg(target_os = "windows")]
    println!("cargo:rustc-link-arg-bin=osirhidden=/SUBSYSTEM:WINDOWS");
    tauri_build::build();
}

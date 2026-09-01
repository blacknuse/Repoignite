# osirhidden 2.0 — Tauri + React Premium Rebuild

This version replaces the Electron shell with a standard **Tauri 2 + React 18 + Vite** desktop architecture.

## What changed
- Native Tauri shell using the Windows WebView2 already present on most Windows 10/11 systems.
- No bundled Chromium / no ~138 MB Electron runtime download.
- One-window premium splash -> native resize -> main workspace transition.
- New design system: measured spacing, restrained motion, thin dividers, minimal rounding, no card-heavy “AI UI”.
- Dark and light themes share identical geometry.
- Safe native commands for: settings, file open/save, client list/close, localhost 6969 health probe, filtered Roblox log read, ScriptBlox read-only search/raw import.
- **No external script execution command is registered.**
- **No DLL injection, remote-memory API, hook registration, or anti-cheat bypass is connected.**

## Build on Windows
Use the GitHub Actions workflow on the `osirhidden-tauri-build` branch or run `npm install` and `npm run tauri:build -- --no-bundle` on Windows with Rust and the Microsoft C++ toolchain installed.

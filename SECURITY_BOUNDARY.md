# Runtime boundary

The Tauri runtime compiles only `src-tauri/src/main.rs` and the React frontend under `src/`.

Registered native functions are limited to desktop UI support, localhost health checks, file dialogs, read-only log/library retrieval, and closing a user-selected detected client. There is no command that transmits editor source to a game process or performs injection / remote memory operations.

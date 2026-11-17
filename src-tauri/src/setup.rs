use aether_runtime_core::{
    installer::{self, Release},
    runtime::{self, ManagedConfig, ManagedRuntime},
    storage::{self, StorageLayout, StorageReport},
};
use std::{
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
};
use tauri::{Emitter, Manager, State};
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons};
#[derive(Default)]
pub struct SetupState {
    prepared: Mutex<Option<StorageLayout>>,
    release: Mutex<Option<Release>>,
    installed: Mutex<Option<PathBuf>>,
    cancel: Mutex<Option<Arc<AtomicBool>>>,
    child: tokio::sync::Mutex<Option<ManagedRuntime>>,
}
fn app_data(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    app.path().app_data_dir().map_err(|e| e.to_string())
}
fn repo() -> Option<&'static Path> {
    if cfg!(debug_assertions) {
        Path::new(env!("CARGO_MANIFEST_DIR")).parent()
    } else {
        None
    }
}
#[tauri::command]
pub async fn setup_environment(
    app: tauri::AppHandle,
    state: State<'_, SetupState>,
) -> Result<serde_json::Value, String> {
    let data = app_data(&app)?;
    let existing = tokio::task::spawn_blocking(runtime::inspect_existing)
        .await
        .map_err(|e| e.to_string())?;
    let running = state.child.lock().await.as_ref().map(|c| c.config.clone());
    let managed = running.or_else(|| {
        std::fs::read(data.join("managed-runtime.json"))
            .ok()
            .and_then(|b| serde_json::from_slice::<ManagedConfig>(&b).ok())
    });
    Ok(
        serde_json::json!({"appData":data,"defaultStorage":data.join("library"),"automaticInstall":cfg!(target_os="linux")&&matches!(std::env::consts::ARCH,"x86_64"|"aarch64"),"existing":existing,"managed":managed}),
    )
}
#[tauri::command]
pub fn inspect_storage(path: String, required_bytes: Option<u64>) -> Result<StorageReport, String> {
    storage::inspect(Path::new(&path), required_bytes, repo())
}
#[tauri::command]
pub async fn pick_storage_location(app: tauri::AppHandle) -> Result<Option<String>, String> {
    app.dialog()
        .file()
        .set_title("Choose a location for Aether's own model library")
        .blocking_pick_folder()
        .map(|f| {
            f.into_path()
                .map(|p| p.to_string_lossy().into_owned())
                .map_err(|e| e.to_string())
        })
        .transpose()
}
#[tauri::command]
pub async fn prepare_storage(
    app: tauri::AppHandle,
    path: String,
    consent: bool,
    state: State<'_, SetupState>,
) -> Result<StorageLayout, String> {
    if !consent {
        return Err("Storage creation requires explicit consent".into());
    }
    approve(&app,&format!("Create/use {path}/aether-data for Aether-owned models, downloads and imports? Existing services and files will not be relocated."))?;
    let layout = storage::prepare(Path::new(&path), repo())?;
    *state.prepared.lock().map_err(|e| e.to_string())? = Some(layout.clone());
    Ok(layout)
}
#[tauri::command]
pub async fn runtime_release(state: State<'_, SetupState>) -> Result<Release, String> {
    let r = installer::latest_release().await?;
    *state.release.lock().map_err(|e| e.to_string())? = Some(r.clone());
    Ok(r)
}
#[tauri::command]
pub async fn install_runtime(
    app: tauri::AppHandle,
    state: State<'_, SetupState>,
    consent: bool,
) -> Result<String, String> {
    if !consent {
        return Err("Runtime download/install requires explicit consent".into());
    }
    let release = state
        .release
        .lock()
        .map_err(|e| e.to_string())?
        .clone()
        .ok_or("Review the official runtime release and download size first")?;
    approve(&app,&format!("Download official Ollama {} ({:.2} GB) into application data and verify/extract it? No system service will be changed.",release.version,release.bytes as f64/1e9))?;
    let cancel = Arc::new(AtomicBool::new(false));
    {
        let mut current = state.cancel.lock().map_err(|e| e.to_string())?;
        if current.is_some() {
            return Err("An installation is already in progress".into());
        }
        *current = Some(cancel.clone());
    }
    let result = installer::install(&release, &app_data(&app)?, cancel, |p| {
        let _ = app.emit("runtime-install-progress", p);
    })
    .await;
    *state.cancel.lock().map_err(|e| e.to_string())? = None;
    let binary = result?;
    *state.installed.lock().map_err(|e| e.to_string())? = Some(binary.clone());
    Ok(binary.to_string_lossy().into_owned())
}
#[tauri::command]
pub fn cancel_runtime_install(state: State<'_, SetupState>) -> Result<(), String> {
    if let Some(c) = state.cancel.lock().map_err(|e| e.to_string())?.as_ref() {
        c.store(true, Ordering::Relaxed);
    }
    Ok(())
}
#[tauri::command]
pub async fn start_managed_runtime(
    app: tauri::AppHandle,
    state: State<'_, SetupState>,
    layout: StorageLayout,
    use_existing_binary: bool,
    consent: bool,
) -> Result<ManagedConfig, String> {
    if !consent {
        return Err("Starting a runtime requires explicit consent".into());
    }
    if !cfg!(target_os = "linux") {
        return Err("Managed runtime start is currently supported on Linux; connect an existing/remote server instead".into());
    }
    let approved = state
        .prepared
        .lock()
        .map_err(|e| e.to_string())?
        .clone()
        .ok_or("Approve storage creation first")?;
    if approved.root != layout.root {
        return Err("Storage was not approved this session".into());
    }
    approve(&app,&format!("Start a private Aether runtime using {} on a separate loopback port? Existing runtimes will not be restarted.",approved.models.display()))?;
    let mut child = state.child.lock().await;
    if child
        .as_mut()
        .is_some_and(|r| r.child.try_wait().ok().flatten().is_none())
    {
        return Err("An Aether runtime is already running. Reuse it or stop only that process before reconfiguration.".into());
    }
    child.take();
    let data = app_data(&app)?;
    let binary = if use_existing_binary {
        runtime::inspect_existing()
            .binary
            .ok_or("No existing executable found")?
    } else {
        state
            .installed
            .lock()
            .map_err(|e| e.to_string())?
            .clone()
            .or_else(|| {
                std::fs::read(data.join("managed-runtime.json"))
                    .ok()
                    .and_then(|b| serde_json::from_slice::<ManagedConfig>(&b).ok())
                    .map(|c| c.binary)
                    .filter(|p| p.starts_with(data.join("runtimes")))
            })
            .ok_or("Install and verify the runtime first")?
    };
    let runtime = ManagedRuntime::start(&binary, approved, &data).await?;
    let config = runtime.config.clone();
    let temp = data.join("managed-runtime.json.tmp");
    std::fs::write(
        &temp,
        serde_json::to_vec_pretty(&config).map_err(|e| e.to_string())?,
    )
    .map_err(|e| e.to_string())?;
    std::fs::rename(temp, data.join("managed-runtime.json")).map_err(|e| e.to_string())?;
    *child = Some(runtime);
    Ok(config)
}
#[tauri::command]
pub async fn stop_managed_runtime(
    app: tauri::AppHandle,
    state: State<'_, SetupState>,
    consent: bool,
) -> Result<(), String> {
    if !consent {
        return Err("Stopping a runtime requires consent".into());
    }
    approve(&app,"Stop only the Aether-owned child for this session? Its model files are preserved and external services are unaffected.")?;
    if let Some(mut child) = state.child.lock().await.take() {
        child.stop().await?;
    }
    Ok(())
}
#[derive(Default)]
pub struct ImportState(pub tokio::sync::Mutex<Option<aether_runtime_core::imports::ImportFile>>);
#[tauri::command]
pub async fn select_import_file(
    app: tauri::AppHandle,
    state: State<'_, ImportState>,
) -> Result<Option<aether_runtime_core::imports::ImportFile>, String> {
    let selected = app
        .dialog()
        .file()
        .add_filter("Model files", &["gguf"])
        .blocking_pick_file();
    let Some(selected) = selected else {
        return Ok(None);
    };
    let path = selected.into_path().map_err(|e| e.to_string())?;
    let file = aether_runtime_core::imports::inspect(&path).await?;
    *state.inner().0.lock().await = Some(file.clone());
    Ok(Some(file))
}
#[tauri::command]
pub async fn register_import_file(
    app: tauri::AppHandle,
    state: State<'_, ImportState>,
    endpoint: String,
    name: String,
    system: String,
    consent: bool,
) -> Result<serde_json::Value, String> {
    if !consent {
        return Err("Model upload and registration require consent".into());
    }
    let file = state
        .inner()
        .0
        .lock()
        .await
        .clone()
        .ok_or("Select and inspect a model file first")?;
    approve(&app,&format!("Upload {:.2} GB from {} to {endpoint} and create new model {name}? Original source is preserved; managed weights require extra space.",file.size as f64/1e9,file.path.display()))?;
    aether_runtime_core::imports::register(&file, &endpoint, &name, &system).await
}
#[tauri::command]
pub async fn starter_models() -> Result<Vec<aether_runtime_core::catalog::CatalogModel>, String> {
    aether_runtime_core::catalog::starter_models().await
}
#[tauri::command]
pub async fn storage_usage(path: String) -> Result<storage::StorageUsage, String> {
    tokio::task::spawn_blocking(move || storage::usage(Path::new(&path)))
        .await
        .map_err(|e| e.to_string())?
}

fn approve(app: &tauri::AppHandle, message: &str) -> Result<(), String> {
    if app
        .dialog()
        .message(message)
        .title("Aether — review changes")
        .buttons(MessageDialogButtons::OkCancel)
        .blocking_show()
    {
        Ok(())
    } else {
        Err("Action cancelled before changes".into())
    }
}
#[tauri::command]
pub async fn confirm_setup_action(app: tauri::AppHandle, message: String) -> Result<bool, String> {
    if message.len() > 10000 {
        return Err("Consent message too long".into());
    }
    Ok(app
        .dialog()
        .message(message)
        .title("Aether — review action")
        .buttons(MessageDialogButtons::OkCancel)
        .blocking_show())
}

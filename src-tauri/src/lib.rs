mod setup;
use futures_util::StreamExt;
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::{
    collections::HashMap,
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
};
use tauri::{Emitter, State};
use tauri_plugin_dialog::DialogExt;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
#[derive(Default)]
struct NativeState {
    root: Mutex<Option<PathBuf>>,
    jobs: Mutex<HashMap<String, Arc<AtomicBool>>>,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Directory {
    path: String,
    free_bytes: u64,
}
#[tauri::command]
async fn choose_model_directory(
    app: tauri::AppHandle,
    state: State<'_, NativeState>,
) -> Result<Option<Directory>, String> {
    let selected = app
        .dialog()
        .file()
        .set_title("Select a dedicated model directory outside the source repository")
        .blocking_pick_folder();
    let Some(selected) = selected else {
        return Ok(None);
    };
    let path = selected
        .into_path()
        .map_err(|e| e.to_string())?
        .canonicalize()
        .map_err(|e| e.to_string())?;
    let repo = Path::new(env!("CARGO_MANIFEST_DIR")).parent().unwrap();
    if path == Path::new("/") || path.starts_with(repo) || repo.starts_with(&path) {
        return Err(
            "Select a dedicated directory outside the source repository and its parents".into(),
        );
    }
    let free = fs2::available_space(&path).map_err(|e| e.to_string())?;
    *state.root.lock().map_err(|e| e.to_string())? = Some(path.clone());
    Ok(Some(Directory {
        path: path.to_string_lossy().into(),
        free_bytes: free,
    }))
}
#[tauri::command]
fn use_download_directory(
    path: String,
    state: State<'_, NativeState>,
) -> Result<Directory, String> {
    let path = PathBuf::from(path)
        .canonicalize()
        .map_err(|e| e.to_string())?;
    let repo = if cfg!(debug_assertions) {
        Path::new(env!("CARGO_MANIFEST_DIR")).parent()
    } else {
        None
    };
    let report = aether_runtime_core::storage::inspect(&path, None, repo)?;
    if !report.writable {
        return Err("Download directory is not writable".into());
    }
    *state.root.lock().map_err(|e| e.to_string())? = Some(path.clone());
    Ok(Directory {
        path: path.to_string_lossy().into_owned(),
        free_bytes: report.free_bytes,
    })
}
fn safe_destination(root: &Path, name: &str) -> Result<PathBuf, String> {
    if name.is_empty()
        || name.contains('/')
        || name.contains('\\')
        || name.contains(':')
        || name.chars().any(|c| c.is_control())
        || name == "."
        || name == ".."
        || !name.to_ascii_lowercase().ends_with(".gguf")
    {
        return Err("Use a plain .gguf filename".into());
    }
    let p = root.join(name);
    if p.exists() {
        return Err(
            "Destination already exists; existing model files will not be overwritten".into(),
        );
    }
    Ok(p)
}
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct Progress {
    id: String,
    downloaded: u64,
    total: Option<u64>,
    bytes_per_second: f64,
}
#[tauri::command]
async fn download_model(
    app: tauri::AppHandle,
    state: State<'_, NativeState>,
    id: String,
    url: String,
    filename: String,
    checksum: Option<String>,
) -> Result<String, String> {
    let root = state
        .root
        .lock()
        .map_err(|e| e.to_string())?
        .clone()
        .ok_or("Select a model directory for this session first")?;
    let dest = safe_destination(&root, &filename)?;
    let parsed = reqwest::Url::parse(&url).map_err(|e| e.to_string())?;
    if parsed.scheme() != "https" || !parsed.username().is_empty() || parsed.password().is_some() {
        return Err("Downloads require HTTPS without embedded credentials".into());
    }
    let cancel = Arc::new(AtomicBool::new(false));
    {
        let mut jobs = state.jobs.lock().map_err(|e| e.to_string())?;
        if !jobs.is_empty() {
            return Err("Wait for or cancel the active download".into());
        }
        jobs.insert(id.clone(), cancel.clone());
    }
    let result=async {
 let client=reqwest::Client::builder().connect_timeout(std::time::Duration::from_secs(20)).timeout(std::time::Duration::from_secs(86400)).build().map_err(|e|e.to_string())?;
 let response=client.get(parsed).send().await.map_err(|e|e.to_string())?.error_for_status().map_err(|e|e.to_string())?;
 let total=response.content_length();let available=fs2::available_space(&root).map_err(|e|e.to_string())?;if total.is_some_and(|n|n.saturating_add(100_000_000)>available){return Err("Insufficient free disk space".to_string());}
 // A unique temporary sibling opened with create_new prevents clobbering or following an existing symlink.
 let partial=root.join(format!(".{}.{}.part",filename,id.chars().filter(|c|c.is_ascii_alphanumeric()).take(64).collect::<String>()));
 let mut file=tokio::fs::OpenOptions::new().write(true).create_new(true).open(&partial).await.map_err(|e|e.to_string())?;
 let transfer=async {
 let mut body=response.bytes_stream();let mut n=0u64;let mut hash=Sha256::new();let start=std::time::Instant::now();let mut emitted=start;
 while let Some(chunk)=body.next().await{if cancel.load(Ordering::Relaxed){return Err("Download cancelled; partial file retained for inspection (resume not yet supported)".to_string());}let chunk=chunk.map_err(|e|e.to_string())?;file.write_all(&chunk).await.map_err(|e|e.to_string())?;hash.update(&chunk);n+=chunk.len() as u64;if emitted.elapsed().as_millis()>200{let _=app.emit("download-progress",Progress{id:id.clone(),downloaded:n,total,bytes_per_second:n as f64/start.elapsed().as_secs_f64()});emitted=std::time::Instant::now();}}
 file.flush().await.map_err(|e|e.to_string())?;file.sync_all().await.map_err(|e|e.to_string())?;
 if total.is_some_and(|t|t!=n){return Err("Incomplete response length; partial retained".into());}
 let digest=format!("{:x}",hash.finalize());if checksum.as_ref().is_some_and(|c|!c.eq_ignore_ascii_case(&digest)){return Err("SHA-256 mismatch; partial retained".into());}
 let mut reader=tokio::fs::File::open(&partial).await.map_err(|e|e.to_string())?;let mut magic=[0;4];reader.read_exact(&mut magic).await.map_err(|e|e.to_string())?;if &magic!=b"GGUF"{return Err("Downloaded file is not GGUF; partial retained".into());}
 // Hard-link creation atomically fails if a competing destination appeared. No overwrite rename.
 tokio::fs::hard_link(&partial,&dest).await.map_err(|e|format!("Cannot finalize safely on this filesystem: {e}. Verified partial retained."))?;
 tokio::fs::remove_file(&partial).await.map_err(|e|e.to_string())?;
 Ok(format!("{} · SHA-256 {}",dest.display(),digest))
 }.await;
 transfer
 }.await;
    state.jobs.lock().map_err(|e| e.to_string())?.remove(&id);
    result
}
#[tauri::command]
fn cancel_download(state: State<'_, NativeState>, id: String) -> Result<(), String> {
    if let Some(job) = state.jobs.lock().map_err(|e| e.to_string())?.get(&id) {
        job.store(true, Ordering::Relaxed);
    }
    Ok(())
}
#[tauri::command]
async fn inspect_gguf(app: tauri::AppHandle) -> Result<Option<serde_json::Value>, String> {
    let selected = app
        .dialog()
        .file()
        .add_filter("GGUF", &["gguf"])
        .blocking_pick_file();
    let Some(file) = selected else {
        return Ok(None);
    };
    let path = file.into_path().map_err(|e| e.to_string())?;
    let metadata = tokio::fs::metadata(&path)
        .await
        .map_err(|e| e.to_string())?;
    let mut f = tokio::fs::File::open(&path)
        .await
        .map_err(|e| e.to_string())?;
    let mut header = [0u8; 8];
    f.read_exact(&mut header).await.map_err(|e| e.to_string())?;
    if &header[..4] != b"GGUF" {
        return Err("Invalid GGUF magic".into());
    }
    let version = u32::from_le_bytes(header[4..8].try_into().unwrap());
    if !(2..=3).contains(&version) {
        return Err(format!("Unsupported GGUF version {version}"));
    }
    Ok(Some(
        serde_json::json!({"path":path,"size":metadata.len(),"version":version,"note":"Header validated only; checksum and tensor metadata not verified. Original file is untouched."}),
    ))
}
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default().manage(setup::SetupState::default()).manage(setup::ImportState::default()).manage(NativeState::default()).plugin(tauri_plugin_dialog::init()).plugin(tauri_plugin_sql::Builder::default().add_migrations("sqlite:aether.db",vec![tauri_plugin_sql::Migration{version:1,description:"structured_records",sql:"CREATE TABLE IF NOT EXISTS records (collection TEXT NOT NULL, id TEXT NOT NULL, value TEXT NOT NULL, PRIMARY KEY(collection,id));",kind:tauri_plugin_sql::MigrationKind::Up}]).build()).invoke_handler(tauri::generate_handler![use_download_directory,choose_model_directory,download_model,cancel_download,inspect_gguf,setup::confirm_setup_action,setup::storage_usage,setup::starter_models,setup::select_import_file,setup::register_import_file,setup::setup_environment,setup::inspect_storage,setup::pick_storage_location,setup::prepare_storage,setup::runtime_release,setup::install_runtime,setup::cancel_runtime_install,setup::start_managed_runtime,setup::stop_managed_runtime]).run(tauri::generate_context!()).expect("Unable to start native application");
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn paths() {
        for name in [
            "../x.gguf",
            "/x.gguf",
            "x\\x.gguf",
            "x:evil.gguf",
            "not.bin",
        ] {
            assert!(safe_destination(Path::new("/tmp"), name).is_err());
        }
        assert!(safe_destination(Path::new("/tmp"), "example-unique-model.gguf").is_ok());
    }
}

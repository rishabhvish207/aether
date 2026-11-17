use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::path::{Path, PathBuf};
use tokio::io::AsyncReadExt;
#[derive(Clone, Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ImportFile {
    pub path: PathBuf,
    pub size: u64,
    pub digest: String,
    pub version: u32,
}
pub async fn inspect(path: &Path) -> Result<ImportFile, String> {
    let path = path.canonicalize().map_err(|e| e.to_string())?;
    let mut file = tokio::fs::File::open(&path)
        .await
        .map_err(|e| e.to_string())?;
    let size = file.metadata().await.map_err(|e| e.to_string())?.len();
    let mut header = [0; 8];
    file.read_exact(&mut header)
        .await
        .map_err(|e| e.to_string())?;
    let version = u32::from_le_bytes(header[4..8].try_into().unwrap());
    if &header[..4] != b"GGUF" || !(2..=3).contains(&version) {
        return Err("Select a supported GGUF v2/v3 model file".into());
    }
    let mut hash = Sha256::new();
    hash.update(header);
    let mut buffer = vec![0u8; 1024 * 1024];
    loop {
        let n = file.read(&mut buffer).await.map_err(|e| e.to_string())?;
        if n == 0 {
            break;
        }
        hash.update(&buffer[..n]);
    }
    Ok(ImportFile {
        path,
        size,
        digest: format!("sha256:{:x}", hash.finalize()),
        version,
    })
}
/// Upload/create through supported APIs only; never touches runtime manifests/blobs directly.
pub async fn register(
    file: &ImportFile,
    endpoint: &str,
    name: &str,
    system: &str,
) -> Result<serde_json::Value, String> {
    let url = reqwest::Url::parse(endpoint).map_err(|e| e.to_string())?;
    if url.scheme() != "http"
        || !matches!(url.host_str(), Some("127.0.0.1" | "localhost" | "[::1]"))
        || url.path() != "/"
        || url.username() != ""
        || url.password().is_some()
    {
        return Err("Native GGUF upload currently supports local loopback Ollama only; remote/authenticated import is unavailable".into());
    }
    if name.is_empty()
        || name.len() > 100
        || !name
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || "-_.:".contains(c))
        || system.len() > 100000
    {
        return Err("Invalid new model name or instructions".into());
    }
    if file.path.is_symlink() {
        return Err("Selected file became a symlink".into());
    }
    let client = reqwest::Client::builder()
        .no_proxy()
        .connect_timeout(std::time::Duration::from_secs(10))
        .timeout(std::time::Duration::from_secs(7200))
        .build()
        .map_err(|e| e.to_string())?;
    let base = endpoint.trim_end_matches('/');
    let tags: serde_json::Value = client
        .get(format!("{base}/api/tags"))
        .send()
        .await
        .map_err(|e| e.to_string())?
        .error_for_status()
        .map_err(|e| e.to_string())?
        .json()
        .await
        .map_err(|e| e.to_string())?;
    let existing = tags["models"].as_array().ok_or("Invalid model inventory")?;
    let normalized = if name.contains(':') {
        name.to_owned()
    } else {
        format!("{name}:latest")
    };
    if existing
        .iter()
        .any(|m| m["name"] == name || m["name"] == normalized)
    {
        return Err("That model name already exists. Choose a new name; existing registrations will not be replaced.".into());
    }
    let source = tokio::fs::File::open(&file.path)
        .await
        .map_err(|e| e.to_string())?;
    if source.metadata().await.map_err(|e| e.to_string())?.len() != file.size {
        return Err("File changed after inspection; inspect again".into());
    }
    let stream = tokio_util::io::ReaderStream::new(source);
    client
        .post(format!("{base}/api/blobs/{}", file.digest))
        .header(reqwest::header::CONTENT_LENGTH, file.size)
        .body(reqwest::Body::wrap_stream(stream))
        .send()
        .await
        .map_err(|e| e.to_string())?
        .error_for_status()
        .map_err(|e| e.to_string())?;
    let filename = file
        .path
        .file_name()
        .ok_or("Invalid source filename")?
        .to_string_lossy();
    let payload = serde_json::json!({"model":name,"files":{filename.to_string():file.digest},"system":system,"stream":false});
    let receipt: serde_json::Value = client
        .post(format!("{base}/api/create"))
        .json(&payload)
        .send()
        .await
        .map_err(|e| e.to_string())?
        .error_for_status()
        .map_err(|e| e.to_string())?
        .json()
        .await
        .map_err(|e| e.to_string())?;
    if receipt["status"] != "success" {
        return Err(format!("Runtime did not confirm model creation: {receipt}"));
    }
    Ok(
        serde_json::json!({"model":name,"originalPath":file.path,"size":file.size,"digest":file.digest,"status":"success","note":"Original GGUF preserved. Runtime-managed weights may consume additional storage and may be shared."}),
    )
}

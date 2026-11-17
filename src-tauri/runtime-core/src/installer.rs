use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    fs::{self, OpenOptions},
    io::{Read, Write},
    path::{Component, Path, PathBuf},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
};
#[derive(Clone, Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Release {
    pub version: String,
    pub url: String,
    pub sha256: String,
    pub bytes: u64,
}
pub async fn latest_release() -> Result<Release, String> {
    if !cfg!(target_os = "linux") {
        return Err("Automatic portable installation currently supports Linux only. Connect an existing or remote server on this platform.".into());
    }
    let arch = match std::env::consts::ARCH {
        "x86_64" => "amd64",
        "aarch64" => "arm64",
        _ => return Err("No supported portable runtime for this CPU".into()),
    };
    let client = reqwest::Client::builder()
        .user_agent("Aether runtime setup")
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| e.to_string())?;
    let json: serde_json::Value = client
        .get("https://api.github.com/repos/ollama/ollama/releases/latest")
        .send()
        .await
        .map_err(|e| e.to_string())?
        .error_for_status()
        .map_err(|e| e.to_string())?
        .json()
        .await
        .map_err(|e| e.to_string())?;
    let name = format!("ollama-linux-{arch}.tar.zst");
    let asset = json["assets"]
        .as_array()
        .ok_or("Invalid official release metadata")?
        .iter()
        .find(|a| a["name"] == name)
        .ok_or("Official portable archive not available")?;
    let digest = asset["digest"]
        .as_str()
        .and_then(|v| v.strip_prefix("sha256:"))
        .ok_or("Official release lacks a SHA-256 digest; automatic installation refused")?;
    Ok(Release {
        version: json["tag_name"]
            .as_str()
            .ok_or("Missing release version")?
            .into(),
        url: asset["browser_download_url"]
            .as_str()
            .ok_or("Missing download URL")?
            .into(),
        sha256: digest.into(),
        bytes: asset["size"].as_u64().ok_or("Missing archive size")?,
    })
}
#[derive(Clone, Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct InstallProgress {
    pub phase: String,
    pub downloaded: u64,
    pub total: u64,
}
pub async fn install(
    release: &Release,
    app_data: &Path,
    cancel: Arc<AtomicBool>,
    progress: impl Fn(InstallProgress),
) -> Result<PathBuf, String> {
    if cancel.load(Ordering::Relaxed) {
        return Err("Installation cancelled before changes".into());
    }
    let url = reqwest::Url::parse(&release.url).map_err(|e| e.to_string())?;
    if url.scheme() != "https"
        || url.host_str() != Some("github.com")
        || !url.path().starts_with("/ollama/ollama/releases/download/")
        || release.sha256.len() != 64
        || !release.sha256.bytes().all(|b| b.is_ascii_hexdigit())
        || release
            .version
            .chars()
            .any(|c| !c.is_ascii_alphanumeric() && c != '.' && c != '-' && c != '_')
    {
        return Err("Only official, integrity-checked Ollama releases may be installed".into());
    }
    fs::create_dir_all(app_data).map_err(|e| e.to_string())?;
    if fs2::available_space(app_data).map_err(|e| e.to_string())? < release.bytes.saturating_mul(4)
    {
        return Err("Insufficient space for runtime archive and extraction".into());
    }
    let destination = app_data.join("runtimes").join(&release.version);
    if destination.exists() {
        let marker = destination.join(".verified-sha256");
        if fs::read_to_string(marker).ok().as_deref() == Some(release.sha256.as_str())
            && destination.join("bin/ollama").is_file()
        {
            return Ok(destination.join("bin/ollama"));
        }
        return Err(
            "An unrecognized runtime installation already exists; nothing was overwritten".into(),
        );
    }
    let staging = app_data.join(format!(
        "runtime-install-{}.partial",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map_err(|e| e.to_string())?
            .as_nanos()
    ));
    fs::create_dir(&staging).map_err(|e|format!("An earlier installation may be incomplete ({e}). Select another app-data location or inspect the partial folder; no automatic deletion is performed."))?;
    let archive = staging.join("runtime.tar.zst");
    let mut file = tokio::fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&archive)
        .await
        .map_err(|e| e.to_string())?;
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(7200))
        .build()
        .map_err(|e| e.to_string())?;
    let request = client.get(url).send();
    tokio::pin!(request);
    let r = loop {
        tokio::select! {response=&mut request=>break response.map_err(|e|e.to_string())?.error_for_status().map_err(|e|e.to_string())?,_ = tokio::time::sleep(std::time::Duration::from_millis(100))=>{if cancel.load(Ordering::Relaxed){return Err("Installation cancelled while connecting; partial retained".into());}}}
    };
    let mut stream = r.bytes_stream();
    let mut hasher = Sha256::new();
    let mut size = 0;
    use tokio::io::AsyncWriteExt;
    let mut emitted = std::time::Instant::now();
    loop {
        let next = tokio::select! {next=stream.next()=>next,_=tokio::time::sleep(std::time::Duration::from_millis(100))=>{if cancel.load(Ordering::Relaxed){return Err("Installation cancelled; partial retained".into());}continue;}};
        let Some(chunk) = next else { break };
        if cancel.load(Ordering::Relaxed) {
            return Err(
                "Installation cancelled. Partial archive retained; no runtime started.".into(),
            );
        }
        let chunk = chunk.map_err(|e| e.to_string())?;
        size += chunk.len() as u64;
        if size > release.bytes {
            return Err("Runtime archive exceeds announced size".into());
        }
        hasher.update(&chunk);
        file.write_all(&chunk).await.map_err(|e| e.to_string())?;
        if emitted.elapsed().as_millis() >= 200 {
            progress(InstallProgress {
                phase: "Downloading official runtime".into(),
                downloaded: size,
                total: release.bytes,
            });
            emitted = std::time::Instant::now();
        }
    }
    file.sync_all().await.map_err(|e| e.to_string())?;
    drop(file);
    if size != release.bytes || format!("{:x}", hasher.finalize()) != release.sha256 {
        return Err(
            "Runtime integrity check failed. No executable was installed or started.".into(),
        );
    }
    if cancel.load(Ordering::Relaxed) {
        return Err("Installation cancelled before extraction".into());
    }
    progress(InstallProgress {
        phase: "Verified archive; extracting".into(),
        downloaded: size,
        total: size,
    });
    let extracted = staging.join("extracted");
    fs::create_dir(&extracted).map_err(|e| e.to_string())?;
    let input = fs::File::open(&archive).map_err(|e| e.to_string())?;
    let decoder = zstd::stream::read::Decoder::new(input).map_err(|e| e.to_string())?;
    extract_tar(decoder, &extracted, &cancel)?;
    if !extracted.join("bin/ollama").is_file() {
        return Err("Verified archive lacks runtime executable".into());
    }
    if cancel.load(Ordering::Relaxed) {
        return Err("Installation cancelled before publication; staging retained".into());
    }
    fs::write(extracted.join(".verified-sha256"), &release.sha256).map_err(|e| e.to_string())?;
    fs::create_dir_all(destination.parent().unwrap()).map_err(|e| e.to_string())?;
    fs::rename(&extracted, &destination).map_err(|e| e.to_string())?;
    fs::remove_file(archive).map_err(|e| e.to_string())?;
    fs::remove_dir(staging).map_err(|e| e.to_string())?;
    Ok(destination.join("bin/ollama"))
}
fn confined(path: &Path) -> Result<PathBuf, String> {
    let mut out = PathBuf::new();
    for c in path.components() {
        match c {
            Component::Normal(v) => out.push(v),
            Component::CurDir => {}
            _ => return Err("Unsafe archive path".into()),
        }
    }
    Ok(out)
}
/// Extract regular files/directories only. Links and devices are refused rather than trusted.
pub fn extract_tar(
    reader: impl Read,
    destination: &Path,
    cancel: &AtomicBool,
) -> Result<(), String> {
    let mut archive = tar::Archive::new(reader);
    let mut expanded = 0u64;
    let mut links: Vec<(PathBuf, PathBuf, bool)> = Vec::new();
    for entry in archive.entries().map_err(|e| e.to_string())? {
        if cancel.load(Ordering::Relaxed) {
            return Err("Extraction cancelled".into());
        }
        let mut entry = entry.map_err(|e| e.to_string())?;
        let path = confined(&entry.path().map_err(|e| e.to_string())?)?;
        if path.as_os_str().is_empty() {
            continue;
        }
        let target = destination.join(&path);
        let kind = entry.header().entry_type();
        if kind.is_symlink() || kind.is_hard_link() {
            let raw = entry
                .link_name()
                .map_err(|e| e.to_string())?
                .ok_or("Archive link lacks target")?
                .into_owned();
            let base = if kind.is_symlink() {
                path.parent().unwrap_or(Path::new(""))
            } else {
                Path::new("")
            };
            let linked = normalize_link(base, &raw)?;
            links.push((path, linked, kind.is_symlink()));
            continue;
        }
        if !kind.is_file() && !kind.is_dir() {
            return Err("Archive device/special entry refused".into());
        }
        let mut ancestor = target.parent();
        while let Some(p) = ancestor {
            if p == destination {
                break;
            }
            if p.is_symlink() {
                return Err("Archive parent is a symlink".into());
            }
            ancestor = p.parent();
        }
        if entry.header().entry_type().is_dir() {
            fs::create_dir_all(&target).map_err(|e| e.to_string())?;
            continue;
        }
        expanded = expanded
            .checked_add(entry.size())
            .ok_or("Archive size overflow")?;
        if expanded > 12_000_000_000 {
            return Err("Runtime archive expands beyond safety limit".into());
        }
        fs::create_dir_all(target.parent().ok_or("Missing parent")?).map_err(|e| e.to_string())?;
        let mut file = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&target)
            .map_err(|e| e.to_string())?;
        std::io::copy(&mut entry, &mut file).map_err(|e| e.to_string())?;
        file.flush().map_err(|e| e.to_string())?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            fs::set_permissions(
                &target,
                fs::Permissions::from_mode(entry.header().mode().unwrap_or(0o644) & 0o755),
            )
            .map_err(|e| e.to_string())?;
        }
    }
    // Resolve links only after regular files; never unpack through an archive-created symlink.
    let root = destination.canonicalize().map_err(|e| e.to_string())?;
    while !links.is_empty() {
        let before = links.len();
        let mut unresolved = Vec::new();
        for (path, linked, symlink) in links {
            let source = destination.join(&linked);
            let resolved = match source.canonicalize() {
                Ok(p) => p,
                Err(_) => {
                    unresolved.push((path, linked, symlink));
                    continue;
                }
            };
            if !resolved.starts_with(&root) {
                return Err("Archive link escapes destination".into());
            }
            let target = destination.join(&path);
            if target.symlink_metadata().is_ok() {
                return Err("Archive link would overwrite existing entry".into());
            }
            fs::create_dir_all(target.parent().ok_or("Missing link parent")?)
                .map_err(|e| e.to_string())?;
            if !target
                .parent()
                .unwrap()
                .canonicalize()
                .map_err(|e| e.to_string())?
                .starts_with(&root)
            {
                return Err("Archive link parent escapes destination".into());
            }
            // Hard links are copied to preserve portability; internal symlinks use canonical, confined targets.
            if symlink {
                #[cfg(unix)]
                std::os::unix::fs::symlink(
                    relative_link(path.parent().unwrap_or(Path::new("")), &linked),
                    &target,
                )
                .map_err(|e| e.to_string())?;
                #[cfg(not(unix))]
                return Err(
                    "Portable runtime archive links are unsupported on this platform".into(),
                );
            } else {
                let mut input = fs::File::open(&resolved).map_err(|e| e.to_string())?;
                let mut output = OpenOptions::new()
                    .write(true)
                    .create_new(true)
                    .open(&target)
                    .map_err(|e| e.to_string())?;
                std::io::copy(&mut input, &mut output).map_err(|e| e.to_string())?;
            }
        }
        if unresolved.len() == before {
            return Err("Archive contains unresolved/cyclic links".into());
        }
        links = unresolved;
    }
    Ok(())
}

fn normalize_link(base: &Path, link: &Path) -> Result<PathBuf, String> {
    let mut out = base.to_owned();
    for c in link.components() {
        match c {
            Component::Normal(v) => out.push(v),
            Component::CurDir => {}
            Component::ParentDir => {
                if !out.pop() {
                    return Err("Archive link escapes destination".into());
                }
            }
            _ => return Err("Absolute archive links are refused".into()),
        }
    }
    Ok(out)
}

fn relative_link(from: &Path, to: &Path) -> PathBuf {
    let a: Vec<_> = from.components().collect();
    let b: Vec<_> = to.components().collect();
    let shared = a.iter().zip(&b).take_while(|(x, y)| x == y).count();
    let mut p = PathBuf::new();
    for _ in shared..a.len() {
        p.push("..");
    }
    for c in &b[shared..] {
        p.push(c.as_os_str());
    }
    p
}

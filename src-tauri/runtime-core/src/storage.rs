use serde::{Deserialize, Serialize};
use std::{
    fs::{self, OpenOptions},
    io::Write,
    path::{Path, PathBuf},
};
use sysinfo::Disks;
#[derive(Clone, Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct StorageReport {
    pub path: PathBuf,
    pub exists: bool,
    pub mount: Option<PathBuf>,
    pub filesystem: Option<String>,
    pub total_bytes: u64,
    pub used_bytes: u64,
    pub free_bytes: u64,
    pub writable: bool,
    pub required_bytes: Option<u64>,
    pub sufficient: Option<bool>,
    pub warnings: Vec<String>,
}
fn ancestor(path: &Path) -> Result<PathBuf, String> {
    let mut p = path;
    while !p.exists() {
        p = p.parent().ok_or("No existing ancestor")?;
    }
    p.canonicalize().map_err(|e| e.to_string())
}
pub fn validate_location(path: &Path, repo: Option<&Path>) -> Result<(), String> {
    if !path.is_absolute()
        || path
            .components()
            .any(|c| matches!(c, std::path::Component::ParentDir))
    {
        return Err("Choose an absolute folder without parent traversal".into());
    }
    let base = ancestor(path)?;
    let resolved = base.join(
        path.strip_prefix(
            path.ancestors()
                .find(|p| p.exists())
                .ok_or("Missing parent")?,
        )
        .map_err(|e| e.to_string())?,
    );
    if resolved.parent().is_none() {
        return Err("Choose a dedicated folder, not a drive root".into());
    }
    if let Some(repo) = repo {
        let r = repo.canonicalize().map_err(|e| e.to_string())?;
        if resolved.starts_with(&r) || r.starts_with(&resolved) {
            return Err("Choose storage outside the source repository and its parents".into());
        }
    }
    Ok(())
}
/// Read-only inspection: never create directories or write probes here.
pub fn inspect(
    path: &Path,
    required: Option<u64>,
    repo: Option<&Path>,
) -> Result<StorageReport, String> {
    validate_location(path, repo)?;
    let base = ancestor(path)?;
    if !base.is_dir() {
        return Err("Storage location is not a directory".into());
    }
    let disks = Disks::new_with_refreshed_list();
    let disk = disks
        .list()
        .iter()
        .filter(|d| base.starts_with(d.mount_point()))
        .max_by_key(|d| d.mount_point().components().count());
    let free = fs2::available_space(&base).map_err(|e| e.to_string())?;
    let total = fs2::total_space(&base).map_err(|e| e.to_string())?;
    let mut writable = !fs::metadata(&base)
        .map_err(|e| e.to_string())?
        .permissions()
        .readonly();
    #[cfg(unix)]
    {
        use std::os::unix::ffi::OsStrExt;
        let c = std::ffi::CString::new(base.as_os_str().as_bytes()).map_err(|e| e.to_string())?;
        writable &= unsafe { libc::access(c.as_ptr(), libc::W_OK) } == 0;
    }
    let mut filesystem = disk.map(|d| d.file_system().to_string_lossy().into_owned());
    let mut mount = disk.map(|d| d.mount_point().to_owned());
    #[cfg(target_os = "linux")]
    if let Ok(info) = fs::read_to_string("/proc/self/mountinfo") {
        for line in info.lines() {
            let fields: Vec<_> = line.split_whitespace().collect();
            if let Some(separator) = fields.iter().position(|v| *v == "-") {
                if fields.len() > separator + 1 && fields.len() > 5 {
                    let candidate =
                        PathBuf::from(fields[4].replace("\\040", " ").replace("\\134", "\\"));
                    if base.starts_with(&candidate)
                        && mount.as_ref().map_or(true, |m| {
                            candidate.components().count() >= m.components().count()
                        })
                    {
                        mount = Some(candidate);
                        filesystem = Some(fields[separator + 1].into());
                    }
                }
            }
        }
    }
    let mut warnings = Vec::new();
    if filesystem
        .as_ref()
        .is_some_and(|s| s.contains("ntfs") || s.contains("fuse") || s.contains("exfat"))
    {
        warnings.push("This filesystem may restrict executable permissions, links or locking. Runtime executables stay in application data; models may use this drive.".into());
    }
    if !path.exists() {
        warnings.push("Folder does not exist. It will only be created after approval.".into());
    }
    Ok(StorageReport {
        path: path.to_owned(),
        exists: path.exists(),
        mount,
        filesystem,
        total_bytes: total,
        used_bytes: total.saturating_sub(free),
        free_bytes: free,
        writable,
        required_bytes: required,
        sufficient: required.map(|n| free >= n.saturating_add(100_000_000)),
        warnings,
    })
}
#[derive(Clone, Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct StorageLayout {
    pub root: PathBuf,
    pub models: PathBuf,
    pub downloads: PathBuf,
    pub imports: PathBuf,
    pub report: StorageReport,
}
/// Only invoke after explicit approval. Never adopts a nonempty foreign folder as owned.
pub fn prepare(base: &Path, repo: Option<&Path>) -> Result<StorageLayout, String> {
    let report = inspect(base, None, repo)?;
    if !report.writable {
        return Err("Folder is read-only".into());
    }
    let root = base.join("aether-data");
    if root.is_symlink() {
        return Err("Owned storage cannot be a symlink".into());
    }
    if root.exists() && !root.join(".aether-storage-v1.json").is_file() {
        return Err("An unrecognized aether-data folder exists. Choose another location; nothing was changed.".into());
    }
    if root.exists() {
        let marker: serde_json::Value = serde_json::from_slice(
            &fs::read(root.join(".aether-storage-v1.json")).map_err(|e| e.to_string())?,
        )
        .map_err(|e| e.to_string())?;
        if marker["owner"] != "aether" || marker["schemaVersion"] != 1 {
            return Err("Existing storage ownership is invalid; nothing was adopted".into());
        }
    }
    fs::create_dir_all(&root).map_err(|e| e.to_string())?;
    let canonical = root.canonicalize().map_err(|e| e.to_string())?;
    let probe = canonical.join(format!(".write-check-{}", std::process::id()));
    let mut file = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&probe)
        .map_err(|e| format!("Cannot write to selected folder: {e}"))?;
    file.write_all(b"aether write check")
        .map_err(|e| e.to_string())?;
    drop(file);
    fs::remove_file(&probe).map_err(|e| e.to_string())?;
    for name in ["models", "downloads", "imports"] {
        let p = canonical.join(name);
        if p.is_symlink() {
            return Err("Owned subfolders cannot be symlinks".into());
        }
        fs::create_dir_all(p).map_err(|e| e.to_string())?;
    }
    let marker = canonical.join(".aether-storage-v1.json");
    if !marker.exists() {
        OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(marker)
            .and_then(|mut f| f.write_all(br#"{"schemaVersion":1,"owner":"aether"}"#))
            .map_err(|e| e.to_string())?;
    }
    Ok(StorageLayout {
        models: canonical.join("models"),
        downloads: canonical.join("downloads"),
        imports: canonical.join("imports"),
        report: inspect(&canonical, None, repo)?,
        root: canonical,
    })
}
pub fn validate_owned(layout: &StorageLayout) -> Result<(), String> {
    let root = layout.root.canonicalize().map_err(|e| e.to_string())?;
    let marker: serde_json::Value = serde_json::from_slice(
        &fs::read(root.join(".aether-storage-v1.json")).map_err(|e| e.to_string())?,
    )
    .map_err(|e| e.to_string())?;
    if marker["owner"] != "aether" || marker["schemaVersion"] != 1 {
        return Err("Storage ownership marker is invalid".into());
    }
    for path in [&layout.models, &layout.downloads, &layout.imports] {
        if path.is_symlink()
            || path.canonicalize().map_err(|e| e.to_string())?.parent() != Some(root.as_path())
        {
            return Err("Owned folder escapes storage root".into());
        }
    }
    Ok(())
}
#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct StorageUsage {
    pub files: u64,
    pub apparent_bytes: u64,
    pub partial_files: Vec<PathBuf>,
    pub skipped_entries: u64,
    pub incomplete: bool,
}
/// Explicit, bounded, metadata-only diagnosis. Never follows links or labels blobs as unused.
pub fn usage(path: &Path) -> Result<StorageUsage, String> {
    let root = path.canonicalize().map_err(|e| e.to_string())?;
    if !root.is_dir() {
        return Err("Choose an existing storage directory".into());
    }
    let mut result = StorageUsage {
        files: 0,
        apparent_bytes: 0,
        partial_files: vec![],
        skipped_entries: 0,
        incomplete: false,
    };
    let mut stack = vec![root.clone()];
    let mut visited = 0;
    while let Some(dir) = stack.pop() {
        let entries = match fs::read_dir(dir) {
            Ok(v) => v,
            Err(_) => {
                result.skipped_entries += 1;
                continue;
            }
        };
        for entry in entries {
            visited += 1;
            if visited > 100_000 {
                result.incomplete = true;
                return Ok(result);
            }
            let entry = match entry {
                Ok(v) => v,
                Err(_) => {
                    result.skipped_entries += 1;
                    continue;
                }
            };
            let p = entry.path();
            let metadata = match p.symlink_metadata() {
                Ok(v) => v,
                Err(_) => {
                    result.skipped_entries += 1;
                    continue;
                }
            };
            if metadata.file_type().is_symlink() {
                result.skipped_entries += 1;
                continue;
            }
            if metadata.is_dir() {
                stack.push(p);
            } else if metadata.is_file() {
                result.files += 1;
                result.apparent_bytes = result.apparent_bytes.saturating_add(metadata.len());
                if p.extension().is_some_and(|e| e == "part") && result.partial_files.len() < 100 {
                    result
                        .partial_files
                        .push(p.strip_prefix(&root).unwrap_or(&p).to_owned());
                }
            }
        }
    }
    result.incomplete |= result.skipped_entries > 0;
    Ok(result)
}

use aether_runtime_core::{installer, runtime, storage};
use std::{
    io::Cursor,
    path::Path,
    sync::{atomic::AtomicBool, Arc},
};
#[test]
fn inspection_is_read_only_and_custom_storage_preserves_foreign_files() {
    let temp = tempfile::tempdir().unwrap();
    let existing = temp.path().join("existing");
    std::fs::create_dir(&existing).unwrap();
    std::fs::write(existing.join("user.gguf"), b"leave me alone").unwrap();
    let report = storage::inspect(&existing, Some(u64::MAX - 100_000_000), None).unwrap();
    assert!(!report.sufficient.unwrap());
    assert!(report.total_bytes > 0);
    assert!(report.free_bytes > 0);
    assert!(!existing.join("aether-data").exists());
    let absent = existing.join("approved-later");
    storage::inspect(&absent, None, None).unwrap();
    assert!(!absent.exists());
    let layout = storage::prepare(&existing, None).unwrap();
    storage::validate_owned(&layout).unwrap();
    assert_eq!(
        std::fs::read(existing.join("user.gguf")).unwrap(),
        b"leave me alone"
    );
    assert!(layout.models.exists());
    assert_eq!(storage::prepare(&existing, None).unwrap().root, layout.root);
}
#[test]
fn rejects_root_relative_traversal_source_and_foreign_owned_folders() {
    let temp = tempfile::tempdir().unwrap();
    let repo = temp.path().join("repo");
    std::fs::create_dir(&repo).unwrap();
    for path in [
        Path::new("/"),
        Path::new("relative"),
        Path::new("/tmp/../etc"),
    ] {
        assert!(storage::inspect(path, None, None).is_err());
    }
    assert!(storage::inspect(&repo, None, Some(&repo)).is_err());
    assert!(storage::inspect(temp.path(), None, Some(&repo)).is_err());
    std::fs::create_dir(temp.path().join("aether-data")).unwrap();
    assert!(storage::prepare(temp.path(), None).is_err());
}
#[cfg(unix)]
#[test]
fn rejects_unwritable_and_symlinked_owned_storage() {
    use std::os::unix::fs::{symlink, PermissionsExt};
    let temp = tempfile::tempdir().unwrap();
    let locked = temp.path().join("locked");
    std::fs::create_dir(&locked).unwrap();
    std::fs::set_permissions(&locked, std::fs::Permissions::from_mode(0o555)).unwrap();
    assert!(!storage::inspect(&locked, None, None).unwrap().writable);
    assert!(storage::prepare(&locked, None).is_err());
    std::fs::set_permissions(&locked, std::fs::Permissions::from_mode(0o755)).unwrap();
    symlink(&locked, temp.path().join("aether-data")).unwrap();
    assert!(storage::prepare(temp.path(), None).is_err());
}
fn archive(entries: Vec<(&str, &[u8], bool)>) -> Vec<u8> {
    let mut bytes = Vec::new();
    {
        let mut builder = tar::Builder::new(&mut bytes);
        for (path, data, link) in entries {
            let mut header = tar::Header::new_gnu();
            header.set_mode(0o755);
            if link {
                header.set_entry_type(tar::EntryType::Symlink);
                header.set_link_name("/etc/passwd").unwrap();
                header.set_size(0);
            } else {
                header.set_size(data.len() as u64);
            }
            header.set_cksum();
            builder
                .append_data(&mut header, path, if link { &[][..] } else { data })
                .unwrap();
        }
        builder.finish().unwrap();
    }
    bytes
}
#[test]
fn archive_extraction_creates_real_files_and_rejects_links_and_overwrites() {
    let temp = tempfile::tempdir().unwrap();
    let cancel = AtomicBool::new(false);
    let bytes = archive(vec![("bin/ollama", b"fixture executable", false)]);
    installer::extract_tar(Cursor::new(&bytes), temp.path(), &cancel).unwrap();
    assert_eq!(
        std::fs::read(temp.path().join("bin/ollama")).unwrap(),
        b"fixture executable"
    );
    assert!(installer::extract_tar(Cursor::new(bytes), temp.path(), &cancel).is_err());
    let evil = archive(vec![("evil", b"", true)]);
    assert!(installer::extract_tar(Cursor::new(evil), temp.path(), &cancel).is_err());
    let cancelled = AtomicBool::new(true);
    assert!(installer::extract_tar(
        Cursor::new(archive(vec![("cancelled", b"x", false)])),
        temp.path(),
        &cancelled
    )
    .is_err());
    assert!(!temp.path().join("cancelled").exists());
}
#[tokio::test]
async fn rejects_untrusted_installer_sources_without_network_or_directory_creation() {
    let temp = tempfile::tempdir().unwrap();
    let target = temp.path().join("not-created");
    let release = installer::Release {
        version: "test".into(),
        url: "https://example.com/runtime.tar.zst".into(),
        sha256: "a".repeat(64),
        bytes: 1,
    };
    assert!(
        installer::install(&release, &target, Arc::new(AtomicBool::new(false)), |_| {})
            .await
            .is_err()
    );
    assert!(!target.exists());
}
#[tokio::test]
async fn startup_failure_does_not_touch_external_storage() {
    let temp = tempfile::tempdir().unwrap();
    let library = temp.path().join("library");
    let layout = storage::prepare(&library, None).unwrap();
    let owned = temp.path().join("config");
    let result =
        runtime::ManagedRuntime::start(Path::new("/does-not-exist/ollama"), layout, &owned).await;
    assert!(result.is_err());
    assert!(!owned.exists());
}
// Explicitly opt in with AETHER_TEST_OLLAMA_BINARY. This never contacts/controls port 11434.
#[tokio::test]
#[ignore = "requires explicit existing Ollama executable; no runtime/model downloads"]
async fn isolated_actual_ollama_empty_library() {
    let binary =
        std::env::var_os("AETHER_TEST_OLLAMA_BINARY").expect("Set explicit test executable");
    let temp = tempfile::tempdir().unwrap();
    let layout = storage::prepare(&temp.path().join("models-test"), None).unwrap();
    let mut runtime = runtime::ManagedRuntime::start(
        Path::new(&binary),
        layout.clone(),
        &temp.path().join("app-test"),
    )
    .await
    .unwrap();
    assert!(!runtime.config.endpoint.ends_with(":11434"));
    let json: serde_json::Value = reqwest::get(format!("{}/api/tags", runtime.config.endpoint))
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(json["models"].as_array().unwrap().len(), 0);
    runtime.stop().await.unwrap();
    assert!(layout.models.exists());
}
#[cfg(unix)]
#[test]
fn confined_library_symlinks_survive_installation_relocation() {
    let temp = tempfile::tempdir().unwrap();
    let source = temp.path().join("staging");
    std::fs::create_dir(&source).unwrap();
    let mut bytes = Vec::new();
    {
        let mut builder = tar::Builder::new(&mut bytes);
        let mut file = tar::Header::new_gnu();
        file.set_size(3);
        file.set_mode(0o644);
        file.set_cksum();
        builder
            .append_data(&mut file, "lib/actual.so", &b"lib"[..])
            .unwrap();
        let mut link = tar::Header::new_gnu();
        link.set_size(0);
        link.set_mode(0o777);
        link.set_entry_type(tar::EntryType::Symlink);
        link.set_link_name("actual.so").unwrap();
        link.set_cksum();
        builder
            .append_data(&mut link, "lib/alias.so", &[][..])
            .unwrap();
        builder.finish().unwrap();
    }
    installer::extract_tar(Cursor::new(bytes), &source, &AtomicBool::new(false)).unwrap();
    let dest = temp.path().join("installed");
    std::fs::rename(source, &dest).unwrap();
    assert_eq!(std::fs::read(dest.join("lib/alias.so")).unwrap(), b"lib");
}
#[tokio::test]
async fn model_import_checks_hash_and_preserves_original_on_rejected_endpoint() {
    let temp = tempfile::tempdir().unwrap();
    let path = temp.path().join("source.gguf");
    let bytes = b"GGUF\x03\x00\x00\x00test-model-fixture";
    std::fs::write(&path, bytes).unwrap();
    let file = aether_runtime_core::imports::inspect(&path).await.unwrap();
    assert_eq!(file.size, bytes.len() as u64);
    assert!(file.digest.starts_with("sha256:"));
    assert!(aether_runtime_core::imports::register(
        &file,
        "https://remote.example.com",
        "new-model",
        ""
    )
    .await
    .is_err());
    assert_eq!(std::fs::read(&path).unwrap(), bytes);
    std::fs::write(temp.path().join("bad.gguf"), b"not a model").unwrap();
    assert!(
        aether_runtime_core::imports::inspect(&temp.path().join("bad.gguf"))
            .await
            .is_err()
    );
}
#[tokio::test]
#[ignore = "requires loopback socket permission; fixture only, no real model/runtime"]
async fn import_via_actual_http_fixture_preserves_original() {
    use tokio::{
        io::{AsyncReadExt, AsyncWriteExt},
        net::TcpListener,
    };
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let endpoint = format!("http://{}", listener.local_addr().unwrap());
    let server = tokio::spawn(async move {
        let mut paths = Vec::new();
        for _ in 0..3 {
            let (mut socket, _) = listener.accept().await.unwrap();
            let mut request = Vec::new();
            let mut buf = [0u8; 4096];
            let header_end = loop {
                let n = socket.read(&mut buf).await.unwrap();
                assert!(n > 0);
                request.extend_from_slice(&buf[..n]);
                if let Some(i) = request.windows(4).position(|w| w == b"\r\n\r\n") {
                    break i + 4;
                }
            };
            let header = String::from_utf8_lossy(&request[..header_end]).into_owned();
            let path = header
                .lines()
                .next()
                .unwrap()
                .split_whitespace()
                .nth(1)
                .unwrap()
                .to_owned();
            let length = header
                .lines()
                .find_map(|l| {
                    l.to_lowercase()
                        .strip_prefix("content-length:")
                        .and_then(|n| n.trim().parse::<usize>().ok())
                })
                .unwrap_or(0);
            while request.len() < header_end + length {
                let n = socket.read(&mut buf).await.unwrap();
                assert!(n > 0);
                request.extend_from_slice(&buf[..n]);
            }
            let body = if path == "/api/tags" {
                r#"{"models":[]}"#
            } else if path == "/api/create" {
                let data: serde_json::Value =
                    serde_json::from_slice(&request[header_end..header_end + length]).unwrap();
                assert_eq!(data["model"], "test-new-model");
                r#"{"status":"success"}"#
            } else {
                assert!(request[header_end..].starts_with(b"GGUF"));
                ""
            };
            paths.push(path);
            socket.write_all(format!("HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",body.len()).as_bytes()).await.unwrap();
        }
        paths
    });
    let temp = tempfile::tempdir().unwrap();
    let path = temp.path().join("original.gguf");
    let bytes = b"GGUF\x03\x00\x00\x00fixture-data";
    std::fs::write(&path, bytes).unwrap();
    let file = aether_runtime_core::imports::inspect(&path).await.unwrap();
    let result = aether_runtime_core::imports::register(
        &file,
        &endpoint,
        "test-new-model",
        "Test instructions",
    )
    .await
    .unwrap();
    assert_eq!(result["status"], "success");
    assert_eq!(std::fs::read(path).unwrap(), bytes);
    let calls = server.await.unwrap();
    assert_eq!(calls[0], "/api/tags");
    assert!(calls[1].starts_with("/api/blobs/sha256:"));
    assert_eq!(calls[2], "/api/create");
}
#[test]
fn diagnostics_report_real_sizes_without_deleting_partial_or_user_files() {
    let temp = tempfile::tempdir().unwrap();
    std::fs::write(temp.path().join("user.gguf"), b"GGUF1234").unwrap();
    std::fs::write(temp.path().join("download.part"), b"data").unwrap();
    let usage = storage::usage(temp.path()).unwrap();
    assert_eq!(usage.files, 2);
    assert_eq!(usage.apparent_bytes, 12);
    assert_eq!(usage.partial_files.len(), 1);
    assert!(temp.path().join("download.part").exists());
    assert!(!usage.incomplete);
}
#[tokio::test]
async fn cancelled_install_does_not_create_directories_or_start_requests() {
    let temp = tempfile::tempdir().unwrap();
    let target = temp.path().join("not-created");
    let release = installer::Release {
        version: "v1".into(),
        url: "https://github.com/ollama/ollama/releases/download/v1/runtime.tar.zst".into(),
        sha256: "a".repeat(64),
        bytes: 10,
    };
    let error = installer::install(&release, &target, Arc::new(AtomicBool::new(true)), |_| {})
        .await
        .unwrap_err();
    assert!(error.contains("cancelled"));
    assert!(!target.exists());
}
#[tokio::test]
#[ignore = "explicit network metadata test; no model/runtime archive downloads"]
async fn official_release_and_starter_metadata() {
    let release = installer::latest_release().await.unwrap();
    assert_eq!(release.sha256.len(), 64);
    assert!(release.bytes > 0);
    assert!(release
        .url
        .starts_with("https://github.com/ollama/ollama/releases/download/"));
    let models = aether_runtime_core::catalog::starter_models()
        .await
        .unwrap();
    assert!(!models.is_empty());
    assert!(models
        .iter()
        .all(|m| m.bytes > 0 && m.source.starts_with("https://ollama.com/library/")));
}

use crate::storage::{validate_owned, StorageLayout};
use serde::{Deserialize, Serialize};
use std::{
    path::{Path, PathBuf},
    process::Stdio,
    time::Duration,
};
use tokio::{
    net::TcpListener,
    process::{Child, Command},
};
#[derive(Clone, Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ManagedConfig {
    pub binary: PathBuf,
    pub layout: StorageLayout,
    pub endpoint: String,
}
pub struct ManagedRuntime {
    pub child: Child,
    pub config: ManagedConfig,
}
impl ManagedRuntime {
    pub async fn start(
        binary: &Path,
        layout: StorageLayout,
        app_data: &Path,
    ) -> Result<Self, String> {
        validate_owned(&layout)?;
        let binary = binary.canonicalize().map_err(|e| e.to_string())?;
        if !binary.is_file() {
            return Err("Runtime executable is missing".into());
        }
        let listener = TcpListener::bind("127.0.0.1:0")
            .await
            .map_err(|e| e.to_string())?;
        let port = listener.local_addr().map_err(|e| e.to_string())?.port();
        drop(listener);
        let endpoint = format!("http://127.0.0.1:{port}");
        let home = app_data.join("runtime-home");
        std::fs::create_dir_all(&home).map_err(|e| e.to_string())?;
        // Child-only isolation: never mutate the host environment, system services, or existing Ollama home.
        let log_path = app_data.join("runtime-start.log");
        let mut log_options = std::fs::OpenOptions::new();
        log_options.write(true).create(true).truncate(true);
        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt;
            log_options.mode(0o600);
        }
        let log = log_options.open(&log_path).map_err(|e| e.to_string())?;
        let mut command = Command::new(&binary);
        #[cfg(unix)]
        command.process_group(0);
        let child=command.arg("serve").env("HOME",&home).env("USERPROFILE",&home).env("OLLAMA_HOST",format!("127.0.0.1:{port}")).env("OLLAMA_MODELS",&layout.models).env("OLLAMA_NO_CLOUD","true").env("OLLAMA_NOPRUNE","true").env("OLLAMA_ORIGINS","http://tauri.localhost,https://tauri.localhost,http://127.0.0.1:3000,http://127.0.0.1:4173").stdin(Stdio::null()).env("OLLAMA_DEBUG_LOG_REQUESTS","false").stdout(Stdio::from(log.try_clone().map_err(|e|e.to_string())?)).stderr(Stdio::from(log)).kill_on_drop(true).spawn().map_err(|e|format!("Could not launch runtime: {e}. Check executable filesystem permissions."))?;
        let config = ManagedConfig {
            binary,
            layout,
            endpoint,
        };
        let mut runtime = Self { child, config };
        let client = reqwest::Client::builder()
            .no_proxy()
            .timeout(Duration::from_secs(2))
            .build()
            .map_err(|e| e.to_string())?;
        for _ in 0..100 {
            if let Some(status) = runtime.child.try_wait().map_err(|e| e.to_string())? {
                return Err(format!("Runtime exited before it was ready ({status}). No existing service was changed. Private startup diagnostics: {}",log_path.display()));
            }
            if let Ok(r) = client
                .get(format!("{}/api/version", runtime.config.endpoint))
                .send()
                .await
            {
                if r.status().is_success() {
                    if let Ok(v) = r.json::<serde_json::Value>().await {
                        if v["version"].is_string() {
                            return Ok(runtime);
                        }
                    }
                }
            }
            tokio::time::sleep(Duration::from_millis(150)).await;
        }
        let _ = runtime.child.kill().await;
        Err("Runtime did not become ready; only the Aether child was stopped".into())
    }
    pub async fn stop(&mut self) -> Result<(), String> {
        if self.child.try_wait().map_err(|e| e.to_string())?.is_none() {
            #[cfg(unix)]
            if let Some(pid) = self.child.id() {
                unsafe {
                    libc::kill(-(pid as i32), libc::SIGTERM);
                }
            }
            match tokio::time::timeout(Duration::from_secs(3), self.child.wait()).await {
                Ok(result) => {
                    result.map_err(|e| e.to_string())?;
                }
                Err(_) => {
                    self.child.kill().await.map_err(|e| e.to_string())?;
                }
            }
        }
        Ok(())
    }
}
#[derive(Clone, Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ExistingRuntime {
    pub binary: Option<PathBuf>,
    pub service_running: bool,
    pub endpoint: Option<String>,
    pub model_directory: Option<PathBuf>,
    pub configuration_source: String,
}
pub fn inspect_existing() -> ExistingRuntime {
    let binary = std::env::var_os("PATH")
        .and_then(|path| {
            std::env::split_paths(&path)
                .map(|p| {
                    p.join(if cfg!(windows) {
                        "ollama.exe"
                    } else {
                        "ollama"
                    })
                })
                .find(|p| p.is_file())
        })
        .and_then(|p| p.canonicalize().ok());
    let mut result=ExistingRuntime{binary,service_running:false,endpoint:None,model_directory:None,configuration_source:"Server APIs do not expose storage. Unknown unless a matching local process can be inspected.".into()};
    #[cfg(target_os = "linux")]
    if let Ok(output) = std::process::Command::new("systemctl")
        .args([
            "--user",
            "show",
            "ollama.service",
            "-p",
            "MainPID",
            "--value",
        ])
        .output()
    {
        if output.status.success() {
            if let Ok(pid) = String::from_utf8_lossy(&output.stdout)
                .trim()
                .parse::<u32>()
            {
                if pid > 0 {
                    let proc = PathBuf::from(format!("/proc/{pid}"));
                    if std::fs::read_link(proc.join("exe"))
                        .ok()
                        .and_then(|p| p.file_name().map(|n| n == "ollama"))
                        .unwrap_or(false)
                    {
                        if let Ok(env) = std::fs::read(proc.join("environ")) {
                            let pairs = env
                                .split(|c| *c == 0)
                                .filter_map(|b| std::str::from_utf8(b).ok())
                                .collect::<Vec<_>>();
                            result.model_directory = pairs
                                .iter()
                                .find_map(|v| v.strip_prefix("OLLAMA_MODELS=").map(PathBuf::from));
                            result.endpoint = pairs.iter().find_map(|v| {
                                v.strip_prefix("OLLAMA_HOST=").map(|v| {
                                    if v.starts_with("http") {
                                        v.into()
                                    } else {
                                        format!("http://{v}")
                                    }
                                })
                            });
                            result.service_running = true;
                            result.configuration_source="Read-only environment of the running user-service process; no service configuration changed.".into();
                        }
                    }
                }
            }
        }
    }
    result
}

impl Drop for ManagedRuntime {
    fn drop(&mut self) {
        #[cfg(unix)]
        if let Some(pid) = self.child.id() {
            unsafe {
                libc::kill(-(pid as i32), libc::SIGKILL);
            }
        }
    }
}

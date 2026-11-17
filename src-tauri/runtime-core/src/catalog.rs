use serde::{Deserialize, Serialize};
#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CatalogModel {
    pub name: String,
    pub bytes: u64,
    pub source: String,
}
pub async fn starter_models() -> Result<Vec<CatalogModel>, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(20))
        .build()
        .map_err(|e| e.to_string())?;
    let mut found = Vec::new();
    for (model, tag) in [("qwen3", "0.6b"), ("gemma3", "1b")] {
        let url = format!("https://registry.ollama.ai/v2/library/{model}/manifests/{tag}");
        let r = client.get(url).send().await.map_err(|e| e.to_string())?;
        if !r.status().is_success() {
            continue;
        }
        let manifest: serde_json::Value = r.json().await.map_err(|e| e.to_string())?;
        let layers = manifest["layers"]
            .as_array()
            .ok_or("Registry did not return model layers")?;
        let mut bytes = 0u64;
        for layer in layers {
            bytes = bytes
                .checked_add(layer["size"].as_u64().ok_or("Registry layer has no size")?)
                .ok_or("Model size overflow")?;
        }
        found.push(CatalogModel {
            name: format!("{model}:{tag}"),
            bytes,
            source: format!("https://ollama.com/library/{model}:{tag}"),
        });
    }
    if found.is_empty() {
        return Err(
            "No starter models could be verified. Retry or choose a model from the catalog.".into(),
        );
    }
    Ok(found)
}

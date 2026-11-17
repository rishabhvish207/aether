import type { Part } from "./domain";
export async function readAttachment(
  file: File,
  vision: boolean,
): Promise<Part> {
  if (file.size > 10 * 1024 * 1024)
    throw new Error("Attachment exceeds 10 MiB preview limit");
  if (/[\x00-\x1f]/.test(file.name)) throw new Error("Invalid filename");
  if (["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
    if (!vision)
      throw new Error("This model has not advertised vision support");
    const text = await new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.onerror = () => reject(new Error("Could not read image"));
      r.readAsDataURL(file);
    });
    return { type: "image", text, name: file.name, mime: file.type };
  }
  if (
    !/\.(txt|md|csv|json|xml|html|css|js|jsx|ts|tsx|py|rs|c|cpp|h|sh|yaml|yml|toml|log)$/i.test(
      file.name,
    )
  )
    throw new Error("Select a supported text/code file or PNG/JPEG/WebP image");
  const text = await file.text();
  if (text.includes("\0"))
    throw new Error("Binary file cannot be used as text");
  return { type: "file", name: file.name, mime: file.type, text };
}

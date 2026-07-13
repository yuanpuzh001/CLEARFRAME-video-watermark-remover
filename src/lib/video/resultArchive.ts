import { Zip, ZipPassThrough } from "fflate";

export interface ArchiveResult {
  name: string;
  blob: Blob;
}

function safeArchiveName(name: string, usedNames: Set<string>): string {
  const sanitized = name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, "-") || "video-clean.mp4";
  const extensionIndex = sanitized.lastIndexOf(".");
  const base = extensionIndex > 0 ? sanitized.slice(0, extensionIndex) : sanitized;
  const extension = extensionIndex > 0 ? sanitized.slice(extensionIndex) : "";
  let candidate = sanitized;
  let suffix = 2;

  while (usedNames.has(candidate.toLowerCase())) {
    candidate = `${base}-${suffix}${extension}`;
    suffix += 1;
  }
  usedNames.add(candidate.toLowerCase());
  return candidate;
}

async function writeBlob(entry: ZipPassThrough, blob: Blob): Promise<void> {
  const stream = (blob as Blob & { stream?: () => ReadableStream<Uint8Array> }).stream;
  if (typeof stream === "function") {
    const reader = stream.call(blob).getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      entry.push(value);
    }
  } else {
    const bytes = await new Promise<Uint8Array>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
      reader.onerror = () => reject(reader.error ?? new Error("无法读取处理结果"));
      reader.readAsArrayBuffer(blob);
    });
    entry.push(bytes);
  }
  entry.push(new Uint8Array(), true);
}

export function createResultArchive(results: ArchiveResult[]): Promise<Blob> {
  if (results.length === 0) return Promise.reject(new Error("没有可下载的处理结果"));

  return new Promise((resolve, reject) => {
    const chunks: Uint8Array[] = [];
    const usedNames = new Set<string>();
    let settled = false;
    const zip = new Zip((error, data, final) => {
      if (settled) return;
      if (error) {
        settled = true;
        reject(error);
        return;
      }
      chunks.push(data);
      if (final) {
        settled = true;
        resolve(new Blob(chunks, { type: "application/zip" }));
      }
    });

    void (async () => {
      try {
        for (const result of results) {
          const entry = new ZipPassThrough(safeArchiveName(result.name, usedNames));
          zip.add(entry);
          await writeBlob(entry, result.blob);
        }
        zip.end();
      } catch (reason) {
        zip.terminate();
        if (!settled) {
          settled = true;
          reject(reason);
        }
      }
    })();
  });
}

export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

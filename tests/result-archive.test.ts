import { strFromU8, unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { createResultArchive } from "../src/lib/video/resultArchive";

function readBlob(blob: Blob): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(blob);
  });
}

describe("createResultArchive", () => {
  it("stores every result and makes duplicate output names unique", async () => {
    const archive = await createResultArchive([
      { name: "room-clean.mp4", blob: new Blob(["first"]) },
      { name: "room-clean.mp4", blob: new Blob(["second"]) },
    ]);
    const files = unzipSync(await readBlob(archive));

    expect(Object.keys(files)).toEqual(["room-clean.mp4", "room-clean-2.mp4"]);
    expect(strFromU8(files["room-clean.mp4"])).toBe("first");
    expect(strFromU8(files["room-clean-2.mp4"])).toBe("second");
  });

  it("rejects an empty result list", async () => {
    await expect(createResultArchive([])).rejects.toThrow("没有可下载的处理结果");
  });
});

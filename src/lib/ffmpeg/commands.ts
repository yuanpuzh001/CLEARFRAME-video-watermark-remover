import type { NormalizedRegion } from "../../types/video";
import { regionToPixels } from "../video/region";

export function buildDelogoCommand(
  inputPath: string,
  outputPath: string,
  region: NormalizedRegion,
  videoWidth: number,
  videoHeight: number,
): string[] {
  const pixels = regionToPixels(region, videoWidth, videoHeight);
  const filter = `delogo=x=${pixels.x}:y=${pixels.y}:w=${pixels.width}:h=${pixels.height}`;
  return [
    "-i", inputPath,
    "-map", "0:v:0",
    "-map", "0:a?",
    "-vf", filter,
    "-c:v", "libx264",
    "-preset", "veryfast",
    "-crf", "20",
    "-pix_fmt", "yuv420p",
    "-c:a", "copy",
    "-movflags", "+faststart",
    outputPath,
  ];
}

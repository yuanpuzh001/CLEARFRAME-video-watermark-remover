import type { NormalizedRegion } from "../../types/video";

export const DEFAULT_REGION: NormalizedRegion = {
  x: 0.875,
  y: 0.79,
  width: 0.055,
  height: 0.09,
};

const MIN_REGION_SIZE = 0.02;

export function clampRegion(region: NormalizedRegion): NormalizedRegion {
  const width = Math.min(1, Math.max(MIN_REGION_SIZE, region.width));
  const height = Math.min(1, Math.max(MIN_REGION_SIZE, region.height));
  return {
    x: Math.min(1 - width, Math.max(0, region.x)),
    y: Math.min(1 - height, Math.max(0, region.y)),
    width,
    height,
  };
}

export interface PixelRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

function toEven(value: number): number {
  return Math.max(2, Math.round(value / 2) * 2);
}

export function regionToPixels(
  region: NormalizedRegion,
  videoWidth: number,
  videoHeight: number,
): PixelRegion {
  const safe = clampRegion(region);
  const width = Math.min(toEven(safe.width * videoWidth), videoWidth);
  const height = Math.min(toEven(safe.height * videoHeight), videoHeight);
  const x = Math.min(toEven(safe.x * videoWidth), Math.max(0, videoWidth - width));
  const y = Math.min(toEven(safe.y * videoHeight), Math.max(0, videoHeight - height));
  return { x, y, width, height };
}

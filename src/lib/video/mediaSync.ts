export interface SyncableMedia {
  currentTime: number;
  playbackRate: number;
  paused: boolean;
  play: () => Promise<void>;
  pause: () => void;
}

const TIME_TOLERANCE_SECONDS = 0.08;

export function syncMediaTime(source: SyncableMedia, target: SyncableMedia): void {
  if (!Number.isFinite(source.currentTime)) return;
  if (Math.abs(target.currentTime - source.currentTime) > TIME_TOLERANCE_SECONDS) {
    target.currentTime = source.currentTime;
  }
}

export function syncMediaPlay(source: SyncableMedia, target: SyncableMedia): void {
  syncMediaTime(source, target);
  target.playbackRate = source.playbackRate;
  if (target.paused) void target.play().catch(() => undefined);
}

export function syncMediaPause(target: SyncableMedia): void {
  if (!target.paused) target.pause();
}

export function syncMediaRate(source: SyncableMedia, target: SyncableMedia): void {
  target.playbackRate = source.playbackRate;
}

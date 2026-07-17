import { useEffect } from "react";

export const REFRESH_WARNING_MESSAGE = "刷新后素材将丢失，是否继续刷新？";

export function guardRefresh(event: BeforeUnloadEvent) {
  event.preventDefault();
  event.returnValue = REFRESH_WARNING_MESSAGE;
}

export function useRefreshGuard(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;

    window.addEventListener("beforeunload", guardRefresh);
    return () => window.removeEventListener("beforeunload", guardRefresh);
  }, [enabled]);
}

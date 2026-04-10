import { useEffect } from "react";
import { lookupCardsByNames } from "../../lib/card-api";

export function useCardCacheWarmer(names: string[]): void {
  useEffect(() => {
    if (!names.length) {
      return;
    }

    const controller = new AbortController();

    void lookupCardsByNames(names, controller.signal).catch(() => {
      // Best-effort cache warmup only.
    });

    return () => controller.abort();
  }, [names]);
}

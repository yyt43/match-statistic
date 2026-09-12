import { useEffect, useRef, useState } from 'react';
import { registerSW } from 'virtual:pwa-register';

export function usePwaUpdate() {
  const [needRefresh, setNeedRefresh] = useState(false);
  const [offlineReady, setOfflineReady] = useState(false);
  const updateRef = useRef<(reloadPage?: boolean) => Promise<void>>(async () => undefined);

  useEffect(() => {
    updateRef.current = registerSW({
      immediate: true,
      onNeedRefresh() {
        setNeedRefresh(true);
      },
      onOfflineReady() {
        setOfflineReady(true);
        window.setTimeout(() => setOfflineReady(false), 2600);
      },
    });
  }, []);

  return {
    needRefresh,
    offlineReady,
    updateNow: () => updateRef.current(true),
    dismissUpdate: () => setNeedRefresh(false),
  };
}

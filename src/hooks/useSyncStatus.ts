import { useEffect, useState } from "react";
import { getSyncStatus, subscribeSyncStatus, SyncStatusState } from "@/src/lib/syncStatus";

export function useSyncStatus(): SyncStatusState {
  const [state, setState] = useState<SyncStatusState>(getSyncStatus);

  useEffect(() => subscribeSyncStatus(setState), []);

  return state;
}

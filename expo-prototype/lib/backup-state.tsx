import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { normalizeBackup, readBackup, type StoredBackup } from "./backup";
import { loadSnapshot, saveSnapshot } from "./storage";

type BackupState =
  | { status: "loading" }
  | { status: "failed" }
  | { status: "ready"; data: StoredBackup };

type BackupSession = {
  state: BackupState;
  saving: boolean;
  save: (data: StoredBackup) => Promise<boolean>;
  update: (change: (current: StoredBackup) => StoredBackup) => Promise<boolean>;
  latest: () => StoredBackup | null;
};

const Context = createContext<BackupSession | null>(null);

export function BackupProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<BackupState>({ status: "loading" });
  const [saving, setSaving] = useState(false);
  const dataRef = useRef<StoredBackup | null>(null);
  const savedJson = useRef<string | null>(null);
  const queue = useRef(Promise.resolve());
  const pendingWrites = useRef(0);

  useEffect(() => {
    let active = true;
    loadSnapshot().then((json) => {
      const data = json === null ? normalizeBackup({ version: 3, habits: [], checkIns: [], reports: [] }) : readBackup(json);
      if (active) {
        dataRef.current = data;
        savedJson.current = JSON.stringify(data);
        setState({ status: "ready", data });
      }
    }).catch(() => {
      if (active) setState({ status: "failed" });
    });
    return () => { active = false; };
  }, []);

  const persistence = useMemo(() => {
    function update(change: (current: StoredBackup) => StoredBackup) {
      pendingWrites.current += 1;
      setSaving(true);
      const result = queue.current.then(async () => {
        const current = dataRef.current;
        if (!current) return false;
        const data = change(current);
        if (data === current) return true;
        const json = JSON.stringify(data);
        if (json === savedJson.current) return true;
        await saveSnapshot(json);
        savedJson.current = json;
        dataRef.current = data;
        setState({ status: "ready", data });
        return true;
      });
      queue.current = result.then(() => {}, () => {});
      return result.finally(() => {
        pendingWrites.current -= 1;
        if (!pendingWrites.current) setSaving(false);
      });
    }
    return {
      update, save: (data: StoredBackup) => update(() => data), latest: () => dataRef.current
    };
  }, []);

  return <Context.Provider value={{ state, saving, ...persistence }}>{children}</Context.Provider>;
}

export function useBackup(): BackupSession {
  const session = useContext(Context);
  if (!session) throw new Error("BackupProvider is required");
  return session;
}

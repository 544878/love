import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { normalizeBackup, readBackup, type StoredBackup } from "./backup";
import { exampleBackup } from "./sample";
import { loadSnapshot, saveSnapshot } from "./storage";

type BackupState =
  | { status: "loading" }
  | { status: "failed" }
  | { status: "ready"; data: StoredBackup };

type BackupSession = {
  state: BackupState;
  saving: boolean;
  save: (data: StoredBackup) => Promise<boolean>;
};

const Context = createContext<BackupSession | null>(null);

export function BackupProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<BackupState>({ status: "loading" });
  const [saving, setSaving] = useState(false);
  const writing = useRef(false);

  useEffect(() => {
    let active = true;
    loadSnapshot().then((json) => {
      const data = json === null ? normalizeBackup(exampleBackup()) : readBackup(json);
      if (active) setState({ status: "ready", data });
    }).catch(() => {
      if (active) setState({ status: "failed" });
    });
    return () => { active = false; };
  }, []);

  async function save(data: StoredBackup) {
    if (writing.current) return false;
    writing.current = true;
    setSaving(true);
    try {
      await saveSnapshot(JSON.stringify(data));
      setState({ status: "ready", data });
      return true;
    } finally {
      writing.current = false;
      setSaving(false);
    }
  }

  return <Context.Provider value={{ state, saving, save }}>{children}</Context.Provider>;
}

export function useBackup(): BackupSession {
  const session = useContext(Context);
  if (!session) throw new Error("BackupProvider is required");
  return session;
}

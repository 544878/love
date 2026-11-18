import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { AppState } from "react-native";
import { useBackup } from "./backup-state";
import type { StoredBackup } from "./backup";
import { allCare, dayInZone, mergeCompanion, type CareAction, type Progress } from "./companion";
import { canUseCompanion, cloudBase, CloudFailure, sessionSchema, signIn, syncCompanion, syncShared, type Session } from "./cloud";
import { loadPrivate, savePrivate } from "./private-settings";
import { queueShared, type SharedKey, type SharedRow } from "./shared-records";

const sessionKey = "lovelog-garden-session";
type RemoteStatus = "checking" | "available" | "adopted" | "pair-required" | "unsupported" | "offline" | "error";
type Garden = {
  session: Session | null;
  configured: boolean;
  status: RemoteStatus;
  syncing: boolean;
  progress: Progress | undefined;
  today: string;
  connect: typeof signIn;
  disconnect: () => Promise<void>;
  refresh: (adopt?: boolean) => Promise<void>;
  care: (action: CareAction) => Promise<"recorded" | "already" | "unavailable">;
  writeShared: (key: SharedKey, row: SharedRow, photo?: { id: string; dataUrl: string }) => Promise<boolean>;
};

const Context = createContext<Garden | null>(null);
function readProgress(data: StoredBackup | null, scope: Session | null): Progress | undefined {
  if (!scope || !Object.hasOwn(data?.companions ?? {}, scope.spaceId)) return;
  const entry = data?.companions?.[scope.spaceId];
  if (entry?.spaceId === scope.spaceId) return entry;
}

export function GardenProvider({ children }: { children: ReactNode }) {
  const { state, update, latest } = useBackup();
  const [session, setSession] = useState<Session | null>(null);
  const [status, setStatus] = useState<RemoteStatus>("checking");
  const [syncing, setSyncing] = useState(false);
  const [clock, setClock] = useState(() => new Date());
  const scope = useRef<Session | null>(null);
  const inFlight = useRef(false);
  const requestedAgain = useRef(false);
  const storing = useRef(Promise.resolve());
  const ready = state.status === "ready";

  const storeSession = useCallback((current: Session | null) => {
    scope.current = current;
    setSession(current);
    const result = storing.current.then(() => savePrivate(sessionKey, current ? JSON.stringify(current) : null));
    storing.current = result.catch(() => {});
    return result;
  }, []);

  useEffect(() => {
    let active = true;
    loadPrivate(sessionKey).then((value) => {
      if (!active || scope.current || !value) return;
      const result = sessionSchema.safeParse(JSON.parse(value));
      if (result.success && result.data.base === cloudBase) {
        scope.current = result.data;
        setSession(result.data);
      }
    }).catch(() => {});
    return () => { active = false; };
  }, []);

  const refresh: Garden["refresh"] = useCallback(async (adopt = false) => {
    const current = scope.current;
    const snapshot = latest();
    if (!current || !snapshot) return;
    if (inFlight.current) {
      requestedAgain.current = true;
      return;
    }
    inFlight.current = true;
    setSyncing(true);
    const active = () => scope.current?.token === current.token && scope.current.spaceId === current.spaceId;
    try {
      const [shared, capability] = await Promise.allSettled([syncShared(current, snapshot), canUseCompanion(current)]);
      if (!active()) return;
      if (shared.status === "fulfilled") await update((data) => active() ? shared.value(data) : data);
      if (capability.status === "rejected") throw capability.reason;
      if (!capability.value) {
        setStatus("unsupported");
        if (current.binding) await storeSession({ ...current, binding: undefined });
        return;
      }
      const operation = adopt
        ? { operation: "adopt", timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC" } as const
        : { operation: "state" } as const;
      let reply = await syncCompanion(current, operation);
      if (!active()) return;
      if (reply.status !== "adopted") {
        setStatus(reply.status);
        if (current.binding) await storeSession({ ...current, binding: undefined });
        return;
      }
      const local = readProgress(latest(), current);
      const authoritative = mergeCompanion(reply.companion, local);
      const today = dayInZone(authoritative.timeZone);
      const serverSlot = reply.slot;
      const pending = authoritative.pending.filter((record) => record.slot === serverSlot && record.day <= today);
      for (let from = 0; from < pending.length && active(); from += 32) {
        const result = await syncCompanion(current, {
          operation: "care", companionId: authoritative.id,
          records: pending.slice(from, from + 32).map(({ day, action }) => ({ day, action }))
        });
        if (result.status !== "adopted") {
          if (active()) {
            setStatus(result.status);
            await storeSession({ ...current, binding: undefined });
          }
          return;
        }
        reply = result;
      }
      if (!active()) return;
      const { companion, slot } = reply;
      await update((data) => {
        if (!active()) return data;
        const progress = mergeCompanion(companion, readProgress(data, current));
        return { ...data, companions: { ...data.companions, [current.spaceId]: progress } };
      });
      if (!active()) return;
      if (current.binding?.id !== companion.id || current.binding.slot !== slot) {
        await storeSession({ ...current, binding: { id: companion.id, slot } });
      }
      setStatus(shared.status === "fulfilled" ? "adopted" : "error");
    } catch (error) {
      if (!active()) return;
      if (error instanceof CloudFailure && error.kind === "authentication") {
        await storeSession(null).catch(() => {});
        setStatus("checking");
      } else {
        setStatus(error instanceof CloudFailure && error.kind === "network" ? "offline" : "error");
      }
    } finally {
      inFlight.current = false;
      setSyncing(false);
      if (requestedAgain.current) {
        requestedAgain.current = false;
        void refresh();
      }
    }
  }, [latest, storeSession, update]);

  useEffect(() => {
    if (!session || !ready) return;
    void refresh();
    const onActive = AppState.addEventListener("change", (next) => {
      if (next === "active") void refresh();
    });
    const timer = setInterval(() => {
      setClock(new Date());
      if (AppState.currentState === "active" || AppState.currentState === null) void refresh();
    }, 20_000);
    return () => { onActive.remove(); clearInterval(timer); };
  }, [session?.token, session?.spaceId, ready, refresh]);

  async function connect(username: string, password: string, spaceId: string, inviteCode: string) {
    const current = await signIn(username, password, spaceId, inviteCode);
    setStatus("checking");
    await storeSession(current);
    return current;
  }

  async function disconnect() {
    setStatus("checking");
    await storeSession(null);
  }

  async function care(action: CareAction): Promise<"recorded" | "already" | "unavailable"> {
    const current = scope.current;
    const binding = current?.binding;
    if (!current || !binding) return "unavailable";
    const outcome: { status: "recorded" | "already" | "unavailable" } = { status: "unavailable" };
    await update((data) => {
      const progress = readProgress(data, current);
      if (scope.current !== current || !progress || progress.id !== binding.id) return data;
      const day = dayInZone(progress.timeZone);
      if (day < progress.adoptedDay) return data;
      if (allCare(progress).some((record) => record.day === day && record.slot === binding.slot)) {
        outcome.status = "already";
        return data;
      }
      outcome.status = "recorded";
      return { ...data, companions: {
        ...data.companions, [current.spaceId]: {
          ...progress, pending: [...progress.pending, { day, slot: binding.slot, action }]
        }
      } };
    });
    if (outcome.status === "recorded") void refresh();
    return outcome.status;
  }

  async function writeShared(key: SharedKey, row: SharedRow, photo?: { id: string; dataUrl: string }) {
    const current = scope.current;
    const saved = await update((data) => {
      if (scope.current?.token !== current?.token || scope.current?.spaceId !== current?.spaceId) return data;
      return queueShared(data, key, row, current, photo ? { ...data.photos, [photo.id]: photo.dataUrl } : data.photos);
    });
    if (current) void refresh();
    return saved;
  }

  const progress = status === "pair-required" || status === "unsupported" || status === "available"
    ? undefined : readProgress(state.status === "ready" ? state.data : null, session);
  const today = progress ? dayInZone(progress.timeZone, clock) : "";
  return (
    <Context.Provider value={{
      session, configured: !!cloudBase, status, syncing, progress, today,
      connect, disconnect, refresh, care, writeShared
    }}>
      {children}
    </Context.Provider>
  );
}

export function useGarden(): Garden {
  const context = useContext(Context);
  if (!context) throw new Error("GardenProvider is required");
  return context;
}

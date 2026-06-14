import { Component, useEffect, useMemo, useRef, useState, type ChangeEvent, type ErrorInfo, type FormEvent, type ReactNode } from "react";
import { toPng } from "html-to-image";
import {
  Bell,
  CalendarClock,
  ChevronLeft,
  Cloud,
  CloudRain,
  HeartHandshake,
  MapPin,
  Plus,
  RefreshCw,
  Sparkles,
  Sun,
  Trash2,
  WandSparkles
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import { buildBadges, weeklyCompletion } from "./data";
import { calculateStreak, friendlyDate, localDate, monthCells, parseLocalDate, shiftDate, weekRange } from "./date";
import { elapsedTimerSeconds, finishStudyTimer, formatDuration, pauseStudyTimer, resumeStudyTimer, startStudyTimer, studyMinutesLabel, todayStudySeconds, totalStudySeconds } from "./study";
import { buildTodayStudySummary, localStudySummaryText, studySummarySourceHash, upsertDailyStudySummary } from "./study-summary";
import { getCloudState, loginCloud, logoutCloud, pullFromCloud, queueSyncJob, syncNow, syncToCloud } from "./.private/cloud";
import { askAgent, chunkText, createKnowledgeFile, embedKnowledgeFile, fallbackAgentAnswer, generateDailyStudySummary, qwenOcrImage, qwenTts, type AgentKind } from "./.private/ai";
import { mergeAutomationRefresh, notificationDate, refreshAutomations, rescheduleCachedNotifications } from "./automation";
import {
  clearPhotos,
  createBackup,
  deletePhoto,
  getPhoto,
  loadData,
  restoreBackup,
  removeStoredData,
  saveData,
  savePhoto
} from "./storage";
import type { AgentChatMessage, AgentConversation, AgentUiState, AppData, AutomationRule, AutomationTone, CheckIn, CoupleEventKind, CouplePost, DailyReport, FeedPriority, Habit, HabitIcon, HabitUnit, Mood, ProfileId, SharedCourse, TaskTemplate, TodoKind } from "./types";
import "katex/dist/katex.min.css";

type Page = "today" | "journal" | "study" | "coach" | "chat" | "moments" | "calendar" | "growth" | "couple" | "settings" | "automation";
type PaddleOCRClass = typeof import("@paddleocr/paddleocr-js")["PaddleOCR"];
type IconName =
  | HabitIcon
  | "home"
  | "journal"
  | "calendar"
  | "award"
  | "settings"
  | "bot"
  | "check"
  | "plus"
  | "close"
  | "arrow"
  | "camera"
  | "share"
  | "download"
  | "upload"
  | "trash"
  | "edit"
  | "lock"
  | "chevron-left"
  | "chevron-right";

type PhotoSlot = "breakfast" | "lunch" | "dinner" | "study" | "selfie";
type OcrEngine = Awaited<ReturnType<PaddleOCRClass["create"]>>;
const UI_PAGE_KEY = "lovelog.ui.page";
const UI_DATE_KEY = "lovelog.ui.date";

const moods: Mood[] = ["闪闪发光", "元气满满", "平静柔软", "有点疲惫", "需要抱抱"];
const moodFaces = ["bling", "hi", "soft", "zzz", "hug"];
const habitIcons: HabitIcon[] = ["run", "fitness", "beauty", "study", "heart", "sun"];
const units: HabitUnit[] = ["分钟", "次", "公里", "页"];

function Icon({ name, size = 22 }: { name: IconName; size?: number }) {
  const paths: Record<IconName, ReactNode> = {
    home: <><path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10v10h13V10M9.5 20v-6h5v6"/></>,
    journal: <><path d="M5 4.5A2.5 2.5 0 0 1 7.5 2H20v17H7.5A2.5 2.5 0 0 0 5 21.5z"/><path d="M5 4.5v17M9 7h7M9 11h6"/></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M8 3v4M16 3v4M3 10h18M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01"/></>,
    award: <><circle cx="12" cy="8" r="5"/><path d="m8.5 12-1 9 4.5-2 4.5 2-1-9M10 8l1.3 1.3L14 6.5"/></>,
    settings: <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-1.6v-.2h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z"/></>,
    bot: <><rect x="5" y="8" width="14" height="11" rx="4"/><path d="M12 4v4M9 13h.01M15 13h.01M9.5 17h5M7 8 5 5M17 8l2-3"/></>,
    run: <><circle cx="14" cy="4" r="2"/><path d="m7 21 3-6 2 2 1 4M5 12l4-4 4 2 3 4M10 8l-2 5M13 10l4-2"/></>,
    fitness: <><path d="M6 8v8M3 10v4M18 8v8M21 10v4M6 12h12"/></>,
    beauty: <><path d="M12 21c-3-3-6-5.3-6-9a6 6 0 0 1 12 0c0 3.7-3 6-6 9Z"/><path d="M9 11c1.5 1 4.5 1 6 0M10 7.5h.01M14 7.5h.01"/></>,
    study: <><path d="M4 4h6a2 2 0 0 1 2 2v15a2.5 2.5 0 0 0-2.5-2.5H4zM20 4h-6a2 2 0 0 0-2 2v15a2.5 2.5 0 0 1 2.5-2.5H20z"/></>,
    heart: <path d="M20.8 4.7a5.5 5.5 0 0 0-7.8 0L12 5.8l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1.1L12 21l7.8-7.4 1.1-1.1a5.5 5.5 0 0 0-.1-7.8Z"/>,
    sun: <><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></>,
    check: <path d="m5 12 4 4L19 6"/>,
    plus: <path d="M12 5v14M5 12h14"/>,
    close: <path d="m6 6 12 12M18 6 6 18"/>,
    arrow: <path d="m9 18 6-6-6-6"/>,
    camera: <><path d="M14.5 5 13 3h-2L9.5 5H5a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2Z"/><circle cx="12" cy="12.5" r="3.5"/></>,
    share: <><circle cx="18" cy="5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="19" r="2.5"/><path d="m8.2 10.8 7.6-4.5M8.2 13.2l7.6 4.5"/></>,
    download: <><path d="M12 3v12M7 10l5 5 5-5M4 21h16"/></>,
    upload: <><path d="M12 15V3M7 8l5-5 5 5M4 21h16"/></>,
    trash: <><path d="M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14M10 11v6M14 11v6"/></>,
    edit: <><path d="m4 16-1 5 5-1L19 9l-4-4Z"/><path d="m13.5 6.5 4 4"/></>,
    lock: <><rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></>,
    "chevron-left": <path d="m15 18-6-6 6-6"/>,
    "chevron-right": <path d="m9 18 6-6-6-6"/>
  };
  return (
    <svg className="icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths[name]}
    </svg>
  );
}

function uid(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

const SCHOOL_SLOTS = Array.from({ length: 12 }, (_, index) => {
  const startMinutes = 8 * 60 + index * 50;
  const endMinutes = startMinutes + 45;
  const format = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
  return { index, start: format(startMinutes), end: format(endMinutes) };
});

class MarkdownFallbackBoundary extends Component<{ content: string; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(_error: Error, _info: ErrorInfo) {
    // The visible fallback below preserves the AI response even if a plugin fails.
  }

  componentDidUpdate(previous: { content: string }) {
    if (previous.content !== this.props.content && this.state.failed) this.setState({ failed: false });
  }

  render() {
    return this.state.failed ? <p className="plain-ai-text">{this.props.content}</p> : this.props.children;
  }
}

function MarkdownBlock({ content }: { content: string }) {
  return (
    <MarkdownFallbackBoundary content={content}>
      <div className="markdown-body">
        <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>
          {content}
        </ReactMarkdown>
      </div>
    </MarkdownFallbackBoundary>
  );
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const image = new Image();
      image.onload = () => {
        const max = 1400;
        const scale = Math.min(1, max / Math.max(image.width, image.height));
        const canvas = document.createElement("canvas");
        canvas.width = image.width * scale;
        canvas.height = image.height * scale;
        canvas.getContext("2d")?.drawImage(image, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.82));
      };
      image.onerror = reject;
      image.src = String(reader.result);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

let paddleOcrPromise: Promise<OcrEngine> | undefined;

function getPaddleOcr(): Promise<OcrEngine> {
  paddleOcrPromise ??= import("@paddleocr/paddleocr-js").then(({ PaddleOCR }) =>
    PaddleOCR.create({
      lang: "en",
      ocrVersion: "PP-OCRv5",
      worker: true,
      ortOptions: {
        backend: "wasm",
        numThreads: 2,
        simd: true
      }
    })
  );
  return paddleOcrPromise;
}

async function recognizeEnglishText(file: File, settings?: AppData["settings"]): Promise<{ preview: string; text: string }> {
  const preview = await fileToDataUrl(file);
  if (settings?.qwenApiKey?.trim()) {
    try {
      return { preview, text: await qwenOcrImage(settings, preview) };
    } catch {
      // Keep the app usable offline or before the Qwen key/base URL is correct.
    }
  }
  const ocr = await getPaddleOcr();
  const [result] = await ocr.predict(file, {
    textDetLimitSideLen: 1280,
    textRecScoreThresh: 0.35
  });
  const text = result.items
    .filter((item) => item.text.trim())
    .sort((a, b) => {
      const ay = Math.min(...a.poly.map((point) => point[1]));
      const by = Math.min(...b.poly.map((point) => point[1]));
      if (Math.abs(ay - by) > 18) return ay - by;
      return Math.min(...a.poly.map((point) => point[0])) - Math.min(...b.poly.map((point) => point[0]));
    })
    .map((item) => item.text.trim())
    .join("\n");
  return { preview, text };
}

function App() {
  const [data, setData] = useState<AppData | null>(null);
  const [page, setPage] = useState<Page>(() => {
    const saved = typeof localStorage !== "undefined" ? localStorage.getItem(UI_PAGE_KEY) as Page | null : null;
    return saved && ["today", "journal", "study", "coach", "chat", "moments", "calendar", "growth", "couple", "settings", "automation"].includes(saved) ? saved : "today";
  });
  const [selectedDate, setSelectedDate] = useState(() => typeof localStorage !== "undefined" ? localStorage.getItem(UI_DATE_KEY) || localDate() : localDate());
  const [checkInHabit, setCheckInHabit] = useState<Habit | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [toast, setToast] = useState("");
  const [automationRefreshing, setAutomationRefreshing] = useState(false);
  const [reminderOpen, setReminderOpen] = useState(false);
  const [timerNow, setTimerNow] = useState(() => new Date());
  const dataRef = useRef(data);
  const refreshRunning = useRef(false);
  const automationDateRef = useRef(localDate());

  useEffect(() => {
    loadData().then((loaded) => {
      setData({
        ...loaded,
        syncState: {
          ...(loaded.syncState ?? getCloudState()),
          ...getCloudState(),
          spaceId: loaded.syncState?.spaceId ?? getCloudState().spaceId
        }
      });
    });
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setTimerNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    localStorage.setItem(UI_PAGE_KEY, page);
    localStorage.setItem(UI_DATE_KEY, selectedDate);
  }, [page, selectedDate]);

  useEffect(() => {
    if (!data) return;
    dataRef.current = data;
    void saveData(data);
  }, [data]);
  useEffect(() => {
    if (!data?.syncState?.enabled || !data.syncState.pendingJobs || data.syncState.status === "syncing") return;
    const timer = window.setTimeout(() => {
      const current = dataRef.current;
      if (!current?.syncState?.enabled || !current.syncState.pendingJobs) return;
      setData((existing) => existing ? { ...existing, syncState: { ...existing.syncState!, status: "syncing" } } : existing);
      syncNow(current).then(setData).catch((error) => {
        setData((existing) => existing ? {
          ...existing,
          syncState: {
            ...(existing.syncState ?? getCloudState()),
            status: "failed",
            lastError: error instanceof Error ? error.message : "阿里云同步失败",
            pendingJobs: Math.max(1, existing.syncState?.pendingJobs ?? 1)
          }
        } : existing);
      });
    }, 4500);
    return () => window.clearTimeout(timer);
  }, [data?.syncState?.enabled, data?.syncState?.pendingJobs, data?.syncState?.status]);

  useEffect(() => {
    if (!data?.syncState?.enabled) return;
    let pulling = false;
    const pullSharedUpdates = async () => {
      if (pulling || !navigator.onLine || !dataRef.current?.syncState?.enabled || dataRef.current.syncState.pendingJobs) return;
      pulling = true;
      try {
        const before = dataRef.current;
        const pulled = await pullFromCloud(before);
        if (before !== dataRef.current) return;
        const newOrders = pulled.feedWishes.length - before.feedWishes.length;
        const newMessages = pulled.coupleMessages.length - before.coupleMessages.length;
        if (newOrders > 0 || newMessages > 0) {
          const message = newOrders > 0 ? "收到新的投喂订单" : "互动区有新消息";
          setToast(message);
          if ("Notification" in window && Notification.permission === "granted") new Notification("LoveLog", { body: message });
        }
        setData(pulled);
      } catch {
        // Shared updates retry on the next interval; offline use remains unaffected.
      } finally {
        pulling = false;
      }
    };
    const timer = window.setInterval(pullSharedUpdates, 30_000);
    const onVisible = () => document.visibilityState === "visible" && void pullSharedUpdates();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [data?.syncState?.enabled]);
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 2400);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const updateData = (updater: (current: AppData) => AppData) => setData((current) => current ? updater(current) : current);

  function updateAgentUiState(patch: Partial<AgentUiState>) {
    updateData((current) => ({
      ...current,
      agentUiState: {
        agent: current.agentUiState?.agent ?? "english",
        chatDate: current.agentUiState?.chatDate || localDate(),
        activeConversationId: current.agentUiState?.activeConversationId ?? "",
        questionDraft: current.agentUiState?.questionDraft ?? "",
        imageTextDraft: current.agentUiState?.imageTextDraft ?? "",
        imagePreview: current.agentUiState?.imagePreview,
        ...patch
      }
    }));
  }

  function markForSync(updater: (current: AppData) => AppData) {
    updateData((current) => current.syncState?.enabled ? queueSyncJob(updater(current)) : updater(current));
  }

  function beginStudyTimer(title: string, note: string) {
    markForSync((current) => ({ ...current, activeStudyTimer: startStudyTimer(title, note, new Date(), current.settings.activeProfile ?? "ru") }));
  }

  function pauseTimer() {
    markForSync((current) => current.activeStudyTimer ? { ...current, activeStudyTimer: pauseStudyTimer(current.activeStudyTimer) } : current);
  }

  function resumeTimer() {
    markForSync((current) => current.activeStudyTimer ? { ...current, activeStudyTimer: resumeStudyTimer(current.activeStudyTimer) } : current);
  }

  function completeStudyTimer() {
    markForSync((current) => {
      if (!current.activeStudyTimer) return current;
      const session = finishStudyTimer(current.activeStudyTimer);
      return {
        ...current,
        activeStudyTimer: undefined,
        studySessions: [session, ...(current.studySessions ?? [])]
      };
    });
    setToast("本次学习已经记录到本地");
  }

  async function refreshDailyAutomations(force = false) {
    if (refreshRunning.current || !dataRef.current?.settings.onboarded) return;
    const today = localDate();
    const cached = dataRef.current.dailyBriefs.find((item) => item.date === today);
    if (!force && cached && Date.now() - new Date(cached.generatedAt).getTime() < 6 * 60 * 60 * 1000) {
      try {
        const scheduled = await rescheduleCachedNotifications(dataRef.current);
        setData((current) => current ? { ...current, automationRuns: scheduled.automationRuns, settings: { ...current.settings, notificationPermission: scheduled.settings.notificationPermission } } : current);
      } catch {
        // Cached content remains visible even when the platform cannot schedule.
      }
      return;
    }
    refreshRunning.current = true;
    setAutomationRefreshing(true);
    try {
      const result = await refreshAutomations(dataRef.current);
      setData((current) => {
        if (!current) return current;
        const merged = mergeAutomationRefresh(current, result.data);
        return current.syncState?.enabled ? queueSyncJob(merged) : merged;
      });
      if (result.warning) setToast(result.warning);
    } catch {
      setToast("今天的小自动化暂时没刷新，稍后再试试");
    } finally {
      refreshRunning.current = false;
      setAutomationRefreshing(false);
    }
  }

  useEffect(() => {
    if (!data?.settings.onboarded) return;
    void refreshDailyAutomations();
    const onVisible = () => {
      if (document.visibilityState === "visible") void refreshDailyAutomations();
    };
    const midnightWatcher = window.setInterval(() => {
      const currentDate = localDate();
      if (currentDate !== automationDateRef.current) {
        automationDateRef.current = currentDate;
        void refreshDailyAutomations(true);
      }
    }, 60_000);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(midnightWatcher);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [data?.settings.onboarded]);

  if (!data) {
    return <main className="onboarding"><p className="eyebrow">LOVELOG LOADING</p><h1>正在读取 LoveLog</h1><p className="onboarding-subtitle">本地记录正在醒来，请稍等一下。</p></main>;
  }

  if (!data.settings.onboarded) {
    return <Onboarding onStart={() => updateData((current) => ({ ...current, settings: { ...current.settings, onboarded: true } }))} />;
  }

  return (
    <div className={`app theme-${data.settings.theme}`}>
      <main className="app-shell">
        {page === "today" && (
          <TodayPage
            data={data}
            now={timerNow}
            selectedDate={selectedDate}
            setSelectedDate={setSelectedDate}
            onCheckIn={setCheckInHabit}
            onJournal={() => setPage("journal")}
            onAutomations={() => setReminderOpen(true)}
            onCalendar={() => setPage("calendar")}
            onGrowth={() => setPage("growth")}
            onStudy={() => setPage("study")}
            onInteraction={() => setPage("couple")}
            updateData={markForSync}
          />
        )}
        {page === "journal" && (
          <JournalPage
            data={data}
            date={selectedDate}
            updateData={markForSync}
            onSaved={() => setToast("今天的心意已经好好收下啦")}
            onShare={() => setShareOpen(true)}
          />
        )}
        {page === "study" && (
          <StudyPage
            data={data}
            updateData={markForSync}
            notify={setToast}
            now={timerNow}
            onOpenAi={() => setPage("coach")}
            onStartStudy={beginStudyTimer}
            onPauseStudy={pauseTimer}
            onResumeStudy={resumeTimer}
            onFinishStudy={completeStudyTimer}
          />
        )}
        {page === "coach" && (
          <CoachPage
            data={data}
            updateData={markForSync}
            notify={setToast}
            agentUiState={data.agentUiState}
            updateAgentUiState={updateAgentUiState}
          />
        )}
        {page === "calendar" && (
          <CalendarPage data={data} updateData={markForSync} notify={setToast} />
        )}
        {page === "growth" && <GrowthPage data={data} now={timerNow} updateData={markForSync} />}
        {page === "couple" && <CouplePage data={data} updateData={markForSync} onOpenChat={() => setPage("chat")} onOpenMoments={() => setPage("moments")} />}
        {page === "chat" && <ChatPage data={data} updateData={markForSync} notify={setToast} onBack={() => setPage("couple")} />}
        {page === "moments" && <MomentsPage data={data} updateData={markForSync} notify={setToast} onBack={() => setPage("couple")} />}
        {page === "settings" && <SettingsPage data={data} updateData={markForSync} notify={setToast} />}
        {page === "automation" && (
          <AutomationPage
            data={data}
            updateData={markForSync}
            onBack={() => setPage("today")}
            onRefresh={() => refreshDailyAutomations(true)}
            refreshing={automationRefreshing}
          />
        )}
      </main>
      {!["automation", "chat", "moments"].includes(page) && <nav className="bottom-nav" aria-label="主导航">
        {([
          ["today", "home", "今日"],
          ["couple", "heart", "互动"],
          ["study", "journal", "学习"],
          ["growth", "award", "成长"],
          ["settings", "settings", "设置"]
        ] as Array<[Page, IconName, string]>).map(([id, icon, label]) => (
          <button key={id} className={page === id ? "active" : ""} onClick={() => setPage(id)}>
            <Icon name={icon} size={21} /><span>{label}</span>
          </button>
        ))}
      </nav>}
      {checkInHabit && (
        <CheckInModal
          habit={checkInHabit}
          date={selectedDate}
          existing={data.checkIns.find((item) => item.habitId === checkInHabit.id && item.date === selectedDate)}
          onClose={() => setCheckInHabit(null)}
          onSave={(checkIn) => {
            markForSync((current) => ({
              ...current,
              checkIns: [...current.checkIns.filter((item) => !(item.habitId === checkIn.habitId && item.date === checkIn.date)), checkIn]
            }));
            setCheckInHabit(null);
            setToast("打卡成功，每一步都算数");
          }}
        />
      )}
      {shareOpen && (
        <ShareModal data={data} date={selectedDate} onClose={() => setShareOpen(false)} notify={setToast} />
      )}
      {reminderOpen && (
        <ReminderModal
          data={data}
          onClose={() => setReminderOpen(false)}
          onManage={() => { setReminderOpen(false); setPage("automation"); }}
          onRefresh={() => refreshDailyAutomations(true)}
          refreshing={automationRefreshing}
        />
      )}
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

function Onboarding({ onStart }: { onStart: () => void }) {
  return (
    <main className="onboarding">
      <div className="onboarding-art onboarding-art-new" aria-hidden="true" />
      <p className="eyebrow">LOVELOG</p>
      <h1>LoveLog</h1>
      <p className="onboarding-subtitle">学习、吃饭、变美、训练，<br />每天都收集一点点亮晶晶。</p>
      <div className="privacy-note">
        <span className="privacy-icon"><Icon name="lock" size={18} /></span>
        <div><strong>默认保存在当前设备</strong><p>只有主动登录共享空间后，双方记录才会同步。</p></div>
      </div>
      <button className="primary-button start-button" onClick={onStart}>开启娜娜的今日空间 <Icon name="arrow" /></button>
      <p className="tiny-note">目标：南京师范大学英语文学系 · 当前 98 斤</p>
    </main>
  );
}

function PageHeader({ eyebrow, title, action }: { eyebrow: string; title: string; action?: ReactNode }) {
  return <header className="page-header"><div><p>{eyebrow}</p><h1>{title}</h1></div>{action}</header>;
}

function ProfileAvatar({
  data,
  profile,
  className = ""
}: {
  data: AppData;
  profile: ProfileId;
  className?: string;
}) {
  const photoId = profile === "ru" ? data.settings.ownerAvatarPhotoId : data.settings.partnerAvatarPhotoId;
  const name = profile === "ru" ? data.settings.ownerName || "娜娜" : data.settings.partnerName || "陶陶";
  const [photo, setPhoto] = useState("");

  useEffect(() => {
    let active = true;
    if (!photoId) {
      setPhoto("");
      return;
    }
    void getPhoto(photoId).then((value) => {
      if (active) setPhoto(value ?? "");
    });
    return () => {
      active = false;
    };
  }, [photoId]);

  return (
    <span className={`profile-avatar profile-${profile} ${photo ? "has-photo" : ""} ${className}`.trim()}>
      {photo ? <img src={photo} alt={`${name}的头像`} /> : name.slice(0, 1)}
    </span>
  );
}

function WeatherGlyph({ code, size = 24 }: { code: number; size?: number }) {
  if (code === 0) return <Sun size={size} />;
  if (code >= 51) return <CloudRain size={size} />;
  return <Cloud size={size} />;
}

function ReminderModal({
  data,
  onClose,
  onManage,
  onRefresh,
  refreshing
}: {
  data: AppData;
  onClose: () => void;
  onManage: () => void;
  onRefresh: () => void;
  refreshing: boolean;
}) {
  const today = localDate();
  const brief = data.dailyBriefs.find((item) => item.date === today);
  const runs = data.automationRuns.filter((item) => item.date === today);
  const permission = data.settings.notificationPermission ?? "prompt";
  return (
    <Modal onClose={onClose}>
      <div className="reminder-popover">
        <div className="reminder-popover-title"><Bell size={20} /><div><small>TODAY</small><h2>今日提醒</h2></div></div>
        <section className="reminder-brief">
          <strong>{brief?.weather ? `${brief.weather.summary} ${brief.weather.temperatureMin}-${brief.weather.temperatureMax}℃` : "天气等待刷新"}</strong>
          <p>{brief?.companionMessage || "今天也慢慢来，认真完成一件小事就很好。"}</p>
        </section>
        <div className="reminder-run-list">
          {runs.map((run) => {
            const rule = data.automations.find((item) => item.id === run.ruleId);
            const passed = notificationDate(run.date, rule?.time || "00:00").getTime() <= Date.now();
            const state = permission === "denied" ? "通知权限未开启" : passed ? "时间已过" : run.status === "scheduled" ? "已安排" : "内容已生成";
            return <div key={run.id}><span>{rule?.time}</span><p><strong>{run.title}</strong><small>{state}</small></p></div>;
          })}
          {!runs.length && <p className="empty-inline">今天还没有提醒内容。</p>}
        </div>
        <div className="reminder-popover-actions">
          <button onClick={onRefresh} disabled={refreshing}>{refreshing ? "正在刷新" : "刷新今日"}</button>
          <button onClick={onManage}>管理提醒</button>
        </div>
      </div>
    </Modal>
  );
}

function StudyPage({
  data,
  updateData,
  notify,
  now,
  onOpenAi,
  onStartStudy,
  onPauseStudy,
  onResumeStudy,
  onFinishStudy
}: {
  data: AppData;
  updateData: (updater: (current: AppData) => AppData) => void;
  notify: (message: string) => void;
  now: Date;
  onOpenAi: () => void;
  onStartStudy: (title: string, note: string) => void;
  onPauseStudy: () => void;
  onResumeStudy: () => void;
  onFinishStudy: () => void;
}) {
  const profile = data.settings.activeProfile ?? "ru";
  const today = localDate();
  const [timerDraftOpen, setTimerDraftOpen] = useState(false);
  const [timerTitle, setTimerTitle] = useState("");
  const [timerNote, setTimerNote] = useState("");
  const [metricTitle, setMetricTitle] = useState("");
  const [metricCount, setMetricCount] = useState(0);
  const [metricMinutes, setMetricMinutes] = useState(0);
  const [newWords, setNewWords] = useState(0);
  const [reviewedWords, setReviewedWords] = useState(0);
  const [wordNote, setWordNote] = useState("");
  const [todoTitle, setTodoTitle] = useState("");
  const [templateDraft, setTemplateDraft] = useState<Partial<TaskTemplate> | null>(null);
  const [summaryBusy, setSummaryBusy] = useState(false);
  const failedSummaryHash = useRef("");
  const timer = data.activeStudyTimer;
  const templates = data.taskTemplates.filter((item) => item.owner === profile);
  const records = data.dailyTaskRecords.filter((item) => item.owner === profile && item.date === today);
  const summary = buildTodayStudySummary(data, today, profile);
  const summaryHash = studySummarySourceHash(data, today, profile);
  const savedSummary = data.dailyStudySummaries.find((item) => item.date === today && item.owner === profile);
  const wordRecords = data.wordLearningRecords.filter((item) => item.owner === profile);
  const weekDates = new Set(weekRange(today));
  const weekWords = wordRecords
    .filter((item) => weekDates.has(item.date))
    .reduce((totals, item) => ({ learned: totals.learned + item.newWords, reviewed: totals.reviewed + item.reviewedWords }), { learned: 0, reviewed: 0 });
  const todayWords = wordRecords
    .filter((item) => item.date === today)
    .reduce((totals, item) => ({ learned: totals.learned + item.newWords, reviewed: totals.reviewed + item.reviewedWords }), { learned: 0, reviewed: 0 });

  async function refreshStudySummary(force = false) {
    if (!data.settings.dailyStudySummaryEnabled || !summary.length || summaryBusy) return;
    if (!force && savedSummary?.sourceHash === summaryHash) return;
    setSummaryBusy(true);
    try {
      const text = data.settings.deepSeekApiKey?.trim()
        ? await generateDailyStudySummary(data.settings, today, summary)
        : localStudySummaryText(summary);
      const generatedAt = new Date().toISOString();
      updateData((current) => ({
        ...current,
        dailyStudySummaries: upsertDailyStudySummary(current.dailyStudySummaries, {
          id: savedSummary?.id ?? uid("study-summary"),
          owner: profile,
          date: today,
          text,
          source: data.settings.deepSeekApiKey?.trim() ? "deepseek" : "local",
          sourceHash: summaryHash,
          generatedAt
        })
      }));
      failedSummaryHash.current = "";
      if (force) notify(data.settings.deepSeekApiKey?.trim() ? "DeepSeek 学习小结已更新" : "已生成本地学习小结");
    } catch (error) {
      failedSummaryHash.current = summaryHash;
      const generatedAt = new Date().toISOString();
      updateData((current) => ({
        ...current,
        dailyStudySummaries: upsertDailyStudySummary(current.dailyStudySummaries, {
          id: savedSummary?.id ?? uid("study-summary"),
          owner: profile,
          date: today,
          text: localStudySummaryText(summary),
          source: "local",
          sourceHash: summaryHash,
          generatedAt
        })
      }));
      if (force) notify(error instanceof Error ? `${error.message}，已保留本地小结` : "DeepSeek 暂时不可用，已保留本地小结");
    } finally {
      setSummaryBusy(false);
    }
  }

  useEffect(() => {
    if (!data.settings.dailyStudySummaryEnabled || !summary.length || savedSummary?.sourceHash === summaryHash || failedSummaryHash.current === summaryHash) return;
    const timer = window.setTimeout(() => void refreshStudySummary(), 900);
    return () => window.clearTimeout(timer);
  }, [data.settings.dailyStudySummaryEnabled, data.settings.deepSeekApiKey, profile, savedSummary?.sourceHash, summaryHash]);

  function confirmTimer(event: FormEvent) {
    event.preventDefault();
    if (!timerTitle.trim()) return;
    onStartStudy(timerTitle.trim(), timerNote.trim());
    setTimerDraftOpen(false);
    setTimerTitle("");
    setTimerNote("");
  }

  function saveExercise(event: FormEvent) {
    event.preventDefault();
    if (!metricTitle.trim() || metricCount <= 0) return;
    updateData((current) => ({
      ...current,
      studyMetrics: [{
        id: uid("exercise"),
        date: today,
        kind: "exercise",
        title: metricTitle.trim(),
        count: metricCount,
        durationMinutes: metricMinutes,
        owner: profile,
        createdAt: new Date().toISOString()
      }, ...current.studyMetrics]
    }));
    setMetricTitle("");
    setMetricCount(0);
    setMetricMinutes(0);
    notify("做题记录已保存");
  }

  function saveWords(event: FormEvent) {
    event.preventDefault();
    if (newWords <= 0 && reviewedWords <= 0) return;
    updateData((current) => ({
      ...current,
      wordLearningRecords: [{
        id: uid("word-log"),
        date: today,
        newWords: Math.max(0, newWords),
        reviewedWords: Math.max(0, reviewedWords),
        note: wordNote.trim(),
        owner: profile,
        createdAt: new Date().toISOString()
      }, ...current.wordLearningRecords]
    }));
    setNewWords(0);
    setReviewedWords(0);
    setWordNote("");
    notify("单词学习记录已保存");
  }

  function addTodo(event: FormEvent) {
    event.preventDefault();
    if (!todoTitle.trim()) return;
    const at = new Date().toISOString();
    updateData((current) => ({
      ...current,
      todos: [{ id: uid("todo"), title: todoTitle.trim(), kind: "short", startDate: today, completedDates: [], createdAt: at, updatedAt: at }, ...current.todos]
    }));
    setTodoTitle("");
  }

  function createTodayRecord(template: TaskTemplate) {
    if (records.some((item) => item.templateId === template.id)) return;
    const at = new Date().toISOString();
    updateData((current) => ({
      ...current,
      dailyTaskRecords: [{
        id: uid("task-record"),
        templateId: template.id,
        owner: profile,
        date: today,
        title: template.title,
        group: template.group,
        unit: template.unit,
        target: template.target,
        value: 0,
        completed: false,
        note: "",
        createdAt: at,
        updatedAt: at
      }, ...current.dailyTaskRecords]
    }));
  }

  function toggleRecord(id: string) {
    updateData((current) => ({
      ...current,
      dailyTaskRecords: current.dailyTaskRecords.map((item) => item.id === id ? { ...item, completed: !item.completed, value: item.completed ? 0 : item.target, updatedAt: new Date().toISOString() } : item)
    }));
  }

  function addTemporaryTask() {
    const title = window.prompt("今天临时要做什么？")?.trim();
    if (!title) return;
    const at = new Date().toISOString();
    updateData((current) => ({
      ...current,
      dailyTaskRecords: [{
        id: uid("task-record"),
        owner: profile,
        date: today,
        title,
        group: "今日临时",
        unit: "次",
        target: 1,
        value: 0,
        completed: false,
        note: "",
        createdAt: at,
        updatedAt: at
      }, ...current.dailyTaskRecords]
    }));
  }

  function editRecord(id: string) {
    const current = records.find((item) => item.id === id);
    const title = window.prompt("修改任务名称", current?.title)?.trim();
    if (!title) return;
    updateData((dataNow) => ({ ...dataNow, dailyTaskRecords: dataNow.dailyTaskRecords.map((item) => item.id === id ? { ...item, title, updatedAt: new Date().toISOString() } : item) }));
  }

  function removeRecord(id: string) {
    if (!window.confirm("删除这条今日任务记录？")) return;
    updateData((current) => ({ ...current, dailyTaskRecords: current.dailyTaskRecords.filter((item) => item.id !== id) }));
  }

  function saveTemplate(event: FormEvent) {
    event.preventDefault();
    if (!templateDraft?.title?.trim()) return;
    const at = new Date().toISOString();
    const template: TaskTemplate = {
      id: uid("task-template"),
      owner: profile,
      title: templateDraft.title.trim(),
      group: templateDraft.group?.trim() || "日常",
      unit: templateDraft.unit?.trim() || "次",
      target: Number(templateDraft.target) || 1,
      days: templateDraft.days?.length ? templateDraft.days : [0, 1, 2, 3, 4, 5, 6],
      createdAt: at,
      updatedAt: at
    };
    updateData((current) => ({ ...current, taskTemplates: [template, ...current.taskTemplates] }));
    setTemplateDraft(null);
  }

  const todayTodos = data.todos.filter((item) => item.startDate <= today && (!item.endDate || item.endDate >= today));
  return (
    <div className="page study-page-v4">
      <PageHeader eyebrow="GROW A LITTLE EVERY DAY" title="元气学习屋" action={<button className="round-icon-button" onClick={onOpenAi}><WandSparkles size={18} /></button>} />
      <section className="study-welcome-card">
        <img className="study-welcome-art" src="/art/nana-ai-study.png" alt="" />
        <div>
          <span className="study-day-pill">{friendlyDate(today)}</span>
          <h2>今天也把知识，慢慢种进心里。</h2>
          <p>{profile === "ru" ? data.settings.ownerName : data.settings.partnerName}的本周学习记录正在发光。</p>
        </div>
        <div className="study-week-stats">
          <span><small>本周新学</small><strong>{weekWords.learned}</strong><i>词</i></span>
          <span><small>本周复习</small><strong>{weekWords.reviewed}</strong><i>词</i></span>
          <span><small>今日专注</small><strong>{Math.floor(todayStudySeconds(data, today, now) / 60)}</strong><i>分</i></span>
        </div>
      </section>

      <section className="study-v4-grid">
        <form className="study-panel word-learning-panel" onSubmit={saveWords}>
          <div className="study-panel-title">
            <span className="panel-icon mint">Aa</span>
            <div><small>VOCABULARY</small><h2>单词学习记录</h2></div>
            <span className="today-word-total">今日 {todayWords.learned + todayWords.reviewed} 词</span>
          </div>
          <div className="word-count-fields">
            <label><span>新学单词</span><input type="number" min="0" value={newWords || ""} onChange={(event) => setNewWords(Number(event.target.value))} placeholder="0" /><small>个</small></label>
            <label><span>复习单词</span><input type="number" min="0" value={reviewedWords || ""} onChange={(event) => setReviewedWords(Number(event.target.value))} placeholder="0" /><small>个</small></label>
          </div>
          <input className="soft-input" value={wordNote} onChange={(event) => setWordNote(event.target.value)} placeholder="今天背了哪一章，或有什么小发现？" />
          <button className="warm-action" type="submit" disabled={newWords <= 0 && reviewedWords <= 0}>收下这次进步</button>
          <div className="word-history">
            {wordRecords.slice(0, 4).map((item) => (
              <div key={item.id}><time>{item.date.slice(5).replace("-", ".")}</time><p><strong>+{item.newWords}</strong> 新学 <span>循环 {item.reviewedWords}</span></p><small>{item.note || "认真记下的一次单词练习"}</small></div>
            ))}
            {!wordRecords.length && <p className="empty-inline">第一条单词记录，会从这里开始。</p>}
          </div>
        </form>

        <article className="study-panel focus-panel">
          <div className="study-panel-title"><span className="panel-icon peach">45</span><div><small>FOCUS</small><h2>专注计时</h2></div><strong>{timer ? formatDuration(elapsedTimerSeconds(timer, now)) : "00:00"}</strong></div>
          {!timer && <button className="warm-action" onClick={() => setTimerDraftOpen(true)}>选择任务并开始</button>}
          {timer?.running && <div className="timer-actions"><button onClick={onPauseStudy}>暂停</button><button onClick={onFinishStudy}>结束并记录</button></div>}
          {timer && !timer.running && <div className="timer-actions"><button onClick={onResumeStudy}>继续</button><button onClick={onFinishStudy}>结束并记录</button></div>}
          {timer && <p className="active-focus-copy"><strong>{timer.title}</strong><small>{timer.note || "保持自己的节奏就很好"}</small></p>}
        </article>

        <form className="study-panel exercise-panel" onSubmit={saveExercise}>
          <div className="study-panel-title"><span className="panel-icon lavender">✓</span><div><small>EXERCISES</small><h2>做题记录</h2></div></div>
          <input className="soft-input" value={metricTitle} onChange={(event) => setMetricTitle(event.target.value)} placeholder="科目或题目类型" />
          <div className="two-field-row"><input className="soft-input" type="number" min="1" value={metricCount || ""} onChange={(event) => setMetricCount(Number(event.target.value))} placeholder="题数" /><input className="soft-input" type="number" min="0" value={metricMinutes || ""} onChange={(event) => setMetricMinutes(Number(event.target.value))} placeholder="分钟" /></div>
          <button className="warm-action" type="submit">保存做题记录</button>
        </form>

        <article className="study-panel todo-panel">
          <div className="study-panel-title"><span className="panel-icon sky">☼</span><div><small>TO DO</small><h2>今日待办</h2></div></div>
          <form className="inline-add" onSubmit={addTodo}><input className="soft-input" value={todoTitle} onChange={(event) => setTodoTitle(event.target.value)} placeholder="添加一个小目标" /><button><Plus size={15} /></button></form>
          {todayTodos.slice(0, 5).map((item) => <button className={`simple-check ${item.completedDates.includes(today) ? "done" : ""}`} key={item.id} onClick={() => updateData((current) => ({ ...current, todos: current.todos.map((todo) => todo.id === item.id ? { ...todo, completedDates: todo.completedDates.includes(today) ? todo.completedDates.filter((date) => date !== today) : [...todo.completedDates, today] } : todo) }))}><span>{item.completedDates.includes(today) ? "✓" : ""}</span>{item.title}</button>)}
        </article>

        <article className="study-panel task-log-panel">
          <div className="study-panel-title"><span className="panel-icon rose">☆</span><div><small>TASK LOG</small><h2>任务记录</h2></div><span className="task-heading-actions"><button onClick={addTemporaryTask}>今日临时</button><button onClick={() => setTemplateDraft({ title: "", group: "日常", unit: "次", target: 1, days: [0, 1, 2, 3, 4, 5, 6] })}>新模板</button></span></div>
          <div className="template-chips">{templates.filter((item) => item.days.includes(new Date().getDay())).map((item) => <button key={item.id} onClick={() => createTodayRecord(item)}>+ {item.title}</button>)}</div>
          {records.map((item) => <div key={item.id} className={`task-record-row ${item.completed ? "done" : ""}`}><button onClick={() => toggleRecord(item.id)}><span>{item.completed ? "✓" : ""}</span><p><strong>{item.title}</strong><small>{item.group} · {item.target} {item.unit}</small></p></button><span className="record-actions"><button onClick={() => editRecord(item.id)}>编辑</button><button onClick={() => removeRecord(item.id)}>删除</button></span></div>)}
          {!records.length && <p className="empty-inline">从模板添加，或为今天自由建立任务。</p>}
        </article>
      </section>
      <section className="auto-study-summary study-v4-summary">
        <div className="summary-card-top">
          <div className="section-heading"><div><p>DAILY NOTE</p><h2>今日学习小结</h2></div><span>{savedSummary?.source === "deepseek" ? "DeepSeek" : "本地兜底"}</span></div>
          <label className="summary-switch">
            <input
              type="checkbox"
              checked={data.settings.dailyStudySummaryEnabled ?? true}
              onChange={(event) => updateData((current) => ({ ...current, settings: { ...current.settings, dailyStudySummaryEnabled: event.target.checked } }))}
            />
            <i />
            <span>每日总结</span>
          </label>
        </div>
        {!data.settings.dailyStudySummaryEnabled
          ? <p>每日总结已关闭，学习记录仍会照常保存在本机。</p>
          : <p>{savedSummary?.text || (summary.length ? localStudySummaryText(summary) : "完成一次学习记录后，这里会替你整理今天的进步。")}</p>}
        {data.settings.dailyStudySummaryEnabled && summary.length > 0 && (
          <div className="summary-card-footer">
            <small>{savedSummary ? `${new Date(savedSummary.generatedAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })} 更新` : "等待生成"}</small>
            <button type="button" onClick={() => void refreshStudySummary(true)} disabled={summaryBusy}>{summaryBusy ? "整理中…" : "重新总结"}</button>
          </div>
        )}
      </section>
      {timerDraftOpen && <Modal onClose={() => setTimerDraftOpen(false)}><form className="timer-confirm-form" onSubmit={confirmTimer}><h2>确认本次专注</h2><p>关闭此窗口不会开始计时。</p><input autoFocus value={timerTitle} onChange={(event) => setTimerTitle(event.target.value)} placeholder="这次要做什么？" /><textarea value={timerNote} onChange={(event) => setTimerNote(event.target.value)} placeholder="完成目标或备注（可选）" /><div><button type="button" onClick={() => setTimerDraftOpen(false)}>取消</button><button type="submit" disabled={!timerTitle.trim()}>确认开始</button></div></form></Modal>}
      {templateDraft && <Modal onClose={() => setTemplateDraft(null)}><form className="timer-confirm-form" onSubmit={saveTemplate}><h2>每日任务模板</h2><input value={templateDraft.title || ""} onChange={(event) => setTemplateDraft((current) => ({ ...(current ?? {}), title: event.target.value }))} placeholder="任务名称" /><input value={templateDraft.group || ""} onChange={(event) => setTemplateDraft((current) => ({ ...(current ?? {}), group: event.target.value }))} placeholder="分组" /><div className="two-field-row"><input type="number" min="0.1" value={templateDraft.target || 1} onChange={(event) => setTemplateDraft((current) => ({ ...(current ?? {}), target: Number(event.target.value) }))} /><input value={templateDraft.unit || "次"} onChange={(event) => setTemplateDraft((current) => ({ ...(current ?? {}), unit: event.target.value }))} /></div><button type="submit">保存模板</button></form></Modal>}
    </div>
  );
}

function TodayPage({
  data,
  now,
  selectedDate,
  setSelectedDate,
  onCheckIn,
  onJournal,
  onAutomations,
  onCalendar,
  onGrowth,
  onStudy,
  onInteraction,
  updateData
}: {
  data: AppData;
  now: Date;
  selectedDate: string;
  setSelectedDate: (date: string) => void;
  onCheckIn: (habit: Habit) => void;
  onJournal: () => void;
  onAutomations: () => void;
  onCalendar: () => void;
  onGrowth: () => void;
  onStudy: () => void;
  onInteraction: () => void;
  updateData: (updater: (current: AppData) => AppData) => void;
}) {
  const [todoTitle, setTodoTitle] = useState("");
  const [todoKind, setTodoKind] = useState<TodoKind>("short");
  const today = localDate();
  const activeName = (data.settings.activeProfile ?? "ru") === "ru"
    ? data.settings.ownerName || "娜娜"
    : data.settings.partnerName || "陶陶";
  const isToday = selectedDate === today;
  const dateObject = parseLocalDate(selectedDate);
  const dayHabits = data.habits.filter((habit) => habit.days.includes(dateObject.getDay()));
  const visibleHabits = dayHabits.length ? dayHabits : data.habits;
  const checks = data.checkIns.filter((item) => item.date === selectedDate && item.completed);
  const completed = visibleHabits.filter((habit) => checks.some((item) => item.habitId === habit.id)).length;
  const progress = visibleHabits.length ? Math.round((completed / visibleHabits.length) * 100) : 0;
  const streak = calculateStreak(data.checkIns, data.reports, today);
  const week = weekRange(today);
  const brief = data.dailyBriefs.find((item) => item.date === today);
  const weatherUpdatedAt = brief?.weather ? new Date(brief.weather.fetchedAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" }) : "";
  const todaySeconds = todayStudySeconds(data, today, now);
  const totalSeconds = totalStudySeconds(data, now);
  const todayTodos = data.todos.filter((item) => item.startDate <= today && (!item.endDate || item.endDate >= today));

  function addTodo(event: FormEvent) {
    event.preventDefault();
    if (!todoTitle.trim()) return;
    const createdAt = new Date().toISOString();
    updateData((current) => ({
      ...current,
      todos: [{
        id: uid("todo"),
        title: todoTitle.trim(),
        kind: todoKind,
        startDate: today,
        completedDates: [],
        createdAt,
        updatedAt: createdAt
      }, ...current.todos]
    }));
    setTodoTitle("");
  }

  function toggleTodo(id: string) {
    updateData((current) => ({
      ...current,
      todos: current.todos.map((item) => item.id === id ? {
        ...item,
        completedDates: item.completedDates.includes(today) ? item.completedDates.filter((date) => date !== today) : [...item.completedDates, today],
        updatedAt: new Date().toISOString()
      } : item)
    }));
  }

  return (
    <div className="page today-page">
      <PageHeader
        eyebrow={friendlyDate(today)}
        title={`执子之手，与子偕老，欢迎回来，${activeName}`}
        action={<button className="automation-orb" onClick={onAutomations} title="今日提醒"><Bell size={18} /></button>}
      />
      <section className="daily-delight">
        <div className="weather-mini">
          <span className="delight-icon sunny">{brief?.weather ? <WeatherGlyph code={brief.weather.weatherCode} /> : <Cloud size={24} />}</span>
          <div>
            <small><MapPin size={11} /> {brief?.weather?.locationName || data.settings.weatherFallbackCity || "天气待刷新"}</small>
            <strong>{brief?.weather ? `${brief.weather.summary} ${brief.weather.temperatureMin}-${brief.weather.temperatureMax}℃` : "今天的天气还在路上"}</strong>
            <p>{brief?.weather && brief.weather.precipitationProbability >= 40 ? `降水概率 ${brief.weather.precipitationProbability}%，记得把伞带上。` : "出门前看一眼天空，舒服地开始今天。"}{weatherUpdatedAt ? ` · ${weatherUpdatedAt} 更新` : ""}</p>
          </div>
        </div>
      </section>
      <section className="hero-card">
        <img className="today-hero-art" src="/art/nana-today-study.png" alt="" />
        <div className="hero-copy">
          <h2>{progress === 100 ? "今天的小目标全部完成啦" : "把今天过得认真，也过得可爱"}</h2>
          <p>记录学习、生活和每一件值得开心的小事。</p>
        </div>
        <div className="streak-pill"><span>{streak}</span><small>连续记录<br />DAYS</small></div>
      </section>
      <section className="today-shortcuts">
        <button onClick={onAutomations}><Bell size={16} /><span><strong>今日提醒</strong><small>{data.automations.filter((item) => item.enabled).length} 项</small></span></button>
        <button onClick={onCalendar}><CalendarClock size={16} /><span><strong>公共日历</strong><small>纪念日与见面</small></span></button>
        <button onClick={onGrowth}><Sparkles size={16} /><span><strong>成长礼物</strong><small>徽章与记录</small></span></button>
      </section>
      <section className="week-strip">
        {week.map((date) => {
          const isSelected = selectedDate === date;
          const hasActivity = data.checkIns.some((item) => item.date === date && item.completed);
          return (
            <button key={date} className={`${isSelected ? "selected" : ""} ${hasActivity ? "has-activity" : ""}`} onClick={() => setSelectedDate(date)}>
              <span>{["一", "二", "三", "四", "五", "六", "日"][(parseLocalDate(date).getDay() + 6) % 7]}</span>
              <strong>{parseLocalDate(date).getDate()}</strong>
              <i />
            </button>
          );
        })}
      </section>
      <section className="study-summary-card">
        <div>
          <small>今日学习</small>
          <strong>{studyMinutesLabel(todaySeconds)}</strong>
        </div>
        <div>
          <small>累计学习</small>
          <strong>{studyMinutesLabel(totalSeconds)}</strong>
        </div>
        <span>{data.activeStudyTimer?.running ? "计时中" : data.activeStudyTimer ? "已暂停" : "本地记录"}</span>
      </section>
      <div className="section-heading">
        <div><p>TO DO</p><h2>待办清单</h2></div>
        <span>{todayTodos.filter((item) => item.completedDates.includes(today)).length}/{todayTodos.length}</span>
      </div>
      <form className="todo-quick-add" onSubmit={addTodo}>
        <input value={todoTitle} onChange={(event) => setTodoTitle(event.target.value)} placeholder="今天要完成什么？" />
        <select value={todoKind} onChange={(event) => setTodoKind(event.target.value as TodoKind)}>
          <option value="short">短期</option>
          <option value="long">长期</option>
        </select>
        <button type="submit"><Plus size={16} /></button>
      </form>
      <section className="todo-list">
        {todayTodos.slice(0, 5).map((item) => (
          <button key={item.id} className={item.completedDates.includes(today) ? "done" : ""} onClick={() => toggleTodo(item.id)}>
            <span>{item.completedDates.includes(today) ? "✓" : ""}</span>
            <strong>{item.title}</strong>
            <small>{item.kind === "long" ? "长期" : "今日"}</small>
          </button>
        ))}
        {!todayTodos.length && <p className="empty-inline">今天还没有待办，留一点轻松也很好。</p>}
      </section>
      <div className="section-heading">
        <div><p>{isToday ? "RU'S TASKS" : friendlyDate(selectedDate)}</p><h2>{isToday ? "今日任务卡" : "这一天的任务"}</h2></div>
        <span>{completed}/{visibleHabits.length} 完成</span>
      </div>
      <div className="progress-line"><i style={{ width: `${progress}%` }} /></div>
      <section className="habit-grid">
        {visibleHabits.map((habit) => {
          const check = checks.find((item) => item.habitId === habit.id);
          return (
            <button className={`habit-card ${check ? "done" : ""}`} key={habit.id} onClick={() => onCheckIn(habit)}>
              <span className="habit-icon" style={{ backgroundColor: `${habit.color}20`, color: habit.color }}><Icon name={habit.icon} /></span>
              <span className="habit-card-copy"><strong>{habit.name}</strong><small>{check ? `${check.value} ${habit.unit}${check.note ? ` · ${check.note}` : ""}` : `目标 ${habit.target} ${habit.unit}`}</small></span>
              <span className="check-circle">{check ? <Icon name="check" size={17} /> : <Icon name="plus" size={17} />}</span>
            </button>
          );
        })}
      </section>
      <button className="journal-prompt" onClick={onJournal}>
        <span className="journal-flower">✦</span>
        <span><small>LEARN FOR LOVE AND LIFE</small><strong>{data.reports.some((item) => item.date === selectedDate) ? "查看今日记录" : "记录今天完成了什么"}</strong></span>
        <Icon name="arrow" />
      </button>
    </div>
  );
}

function CheckInModal({
  habit,
  date,
  existing,
  onClose,
  onSave
}: {
  habit: Habit;
  date: string;
  existing?: CheckIn;
  onClose: () => void;
  onSave: (checkIn: CheckIn) => void;
}) {
  const [value, setValue] = useState(existing?.value ?? habit.target);
  const [note, setNote] = useState(existing?.note ?? "");
  return (
    <Modal onClose={onClose}>
      <div className="modal-handle" />
      <div className="modal-title-row">
        <span className="habit-icon large" style={{ backgroundColor: `${habit.color}20`, color: habit.color }}><Icon name={habit.icon} size={28} /></span>
        <div><p>{friendlyDate(date)}</p><h2>{habit.name}</h2></div>
      </div>
      <label className="field-label">今天完成了多少</label>
      <div className="number-field">
        <button onClick={() => setValue(Math.max(0, Number((value - 1).toFixed(1))))}>−</button>
        <input type="number" min="0" step={habit.unit === "公里" ? "0.1" : "1"} value={value} onChange={(event) => setValue(Number(event.target.value))} />
        <span>{habit.unit}</span>
        <button onClick={() => setValue(Number((value + 1).toFixed(1)))}>＋</button>
      </div>
      <label className="field-label" htmlFor="check-note">留一句话给今天</label>
      <textarea id="check-note" className="soft-input" value={note} maxLength={80} onChange={(event) => setNote(event.target.value)} placeholder="比如：风很舒服，跑完心情也亮了" />
      <button className="primary-button" onClick={() => onSave({
        id: existing?.id ?? uid("check"),
        habitId: habit.id,
        date,
        value,
        note: note.trim(),
        completed: true,
        updatedAt: new Date().toISOString()
      })}>收下今天的努力 <Icon name="check" /></button>
    </Modal>
  );
}

function Modal({ children, onClose, wide = false }: { children: ReactNode; onClose: () => void; wide?: boolean }) {
  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className={`modal-sheet ${wide ? "wide" : ""}`}>
        <button className="modal-close" onClick={onClose} aria-label="关闭"><Icon name="close" /></button>
        {children}
      </section>
    </div>
  );
}

function PhotoUpload({
  slot,
  label,
  hint,
  photoId,
  onChange
}: {
  slot: PhotoSlot;
  label: string;
  hint: string;
  photoId?: string;
  onChange: (slot: PhotoSlot, id?: string) => void;
}) {
  const [photo, setPhoto] = useState<string>();
  const [saving, setSaving] = useState(false);

  useEffect(() => { getPhoto(photoId).then(setPhoto); }, [photoId]);

  async function handlePhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setSaving(true);
    try {
      const image = await fileToDataUrl(file);
      const id = photoId ?? uid(`photo-${slot}`);
      await savePhoto(id, image);
      setPhoto(image);
      onChange(slot, id);
    } finally {
      setSaving(false);
      event.target.value = "";
    }
  }

  return (
    <label className={`mini-photo ${photo ? "has-photo" : ""}`}>
      {photo ? (
        <>
          <img src={photo} alt={label} />
          <button
            type="button"
            onClick={async (event) => {
              event.preventDefault();
              await deletePhoto(photoId);
              setPhoto(undefined);
              onChange(slot, undefined);
            }}
          >
            移除
          </button>
        </>
      ) : (
        <>
          <Icon name="camera" size={20} />
          <strong>{label}</strong>
          <small>{saving ? "照片收纳中…" : hint}</small>
        </>
      )}
      <input type="file" accept="image/*" onChange={handlePhoto} disabled={saving} />
    </label>
  );
}

function JournalPage({
  data,
  date,
  updateData,
  onSaved,
  onShare
}: {
  data: AppData;
  date: string;
  updateData: (updater: (current: AppData) => AppData) => void;
  onSaved: () => void;
  onShare: () => void;
}) {
  const existing = data.reports.find((item) => item.date === date);
  const [mood, setMood] = useState<Mood>(existing?.mood ?? "元气满满");
  const [studyMinutes, setStudyMinutes] = useState(existing?.studyMinutes ?? Math.floor(todayStudySeconds(data, date) / 60));
  const [weightJin, setWeightJin] = useState(existing?.weightJin ?? data.settings.currentWeightJin);
  const [breakfast, setBreakfast] = useState(existing?.breakfast ?? "");
  const [lunch, setLunch] = useState(existing?.lunch ?? "");
  const [dinner, setDinner] = useState(existing?.dinner ?? "");
  const [studyFocus, setStudyFocus] = useState(existing?.studyFocus ?? "英语词汇、阅读、写作");
  const [lifeNote, setLifeNote] = useState(existing?.lifeNote ?? "");
  const [message, setMessage] = useState(existing?.message ?? "");
  const [photoIds, setPhotoIds] = useState<DailyReport["photoIds"]>(existing?.photoIds ?? (existing?.photoId ? { selfie: existing.photoId } : {}));

  useEffect(() => {
    const report = data.reports.find((item) => item.date === date);
    setMood(report?.mood ?? "元气满满");
    setStudyMinutes(report?.studyMinutes ?? Math.floor(todayStudySeconds(data, date) / 60));
    setWeightJin(report?.weightJin ?? data.settings.currentWeightJin);
    setBreakfast(report?.breakfast ?? "");
    setLunch(report?.lunch ?? "");
    setDinner(report?.dinner ?? "");
    setStudyFocus(report?.studyFocus ?? "英语词汇、阅读、写作");
    setLifeNote(report?.lifeNote ?? "");
    setMessage(report?.message ?? "");
    setPhotoIds(report?.photoIds ?? (report?.photoId ? { selfie: report.photoId } : {}));
  }, [date, data.reports, data.checkIns, data.settings.currentWeightJin]);

  const checks = data.checkIns.filter((item) => item.date === date && item.completed);

  function updatePhoto(slot: PhotoSlot, id?: string) {
    setPhotoIds((current) => ({ ...current, [slot]: id }));
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    const cleanPhotoIds = Object.fromEntries(Object.entries(photoIds ?? {}).filter(([, value]) => value)) as DailyReport["photoIds"];
    const report: DailyReport = {
      id: existing?.id ?? uid("report"),
      date,
      mood,
      studyMinutes,
      weightJin,
      breakfast: breakfast.trim(),
      lunch: lunch.trim(),
      dinner: dinner.trim(),
      studyFocus: studyFocus.trim(),
      lifeNote: lifeNote.trim(),
      message: message.trim(),
      photoId: cleanPhotoIds?.selfie,
      photoIds: cleanPhotoIds,
      submittedAt: new Date().toISOString()
    };
    updateData((current) => ({
      ...current,
      reports: [...current.reports.filter((item) => item.date !== date), report],
      settings: { ...current.settings, currentWeightJin: weightJin }
    }));
    onSaved();
  }

  return (
    <div className="page journal-page nana-journal">
      <PageHeader eyebrow="DAILY MEMORY" title="今天也被认真记住了" action={<span className="date-chip">{friendlyDate(date).split(" ")[0]}</span>} />
      <p className="page-intro cute-intro">留下一点真实的完成、一点生活气息，也留下一点爱。</p>
      <form onSubmit={submit}>
        <section className="form-card study-focus-card">
          <div className="form-section-title"><span>01</span><div><small>LEARN FOR LOVE AND LIFE</small><h3>今天完成了什么</h3></div></div>
          <p className="study-auto-time">学习页已记录 {studyMinutes} 分钟，日报会自动带入。</p>
          <label className="field-label">客观写下今天完成的学习</label>
          <input className="soft-input single" value={studyFocus} maxLength={120} onChange={(event) => setStudyFocus(event.target.value)} placeholder="比如：背了 80 个单词，完成阅读两篇，整理法语动词笔记" />
        </section>
        <section className="form-card">
          <div className="form-section-title"><span>02</span><div><small>CUTE CHECK</small><h3>状态小记录</h3></div></div>
          <div className="mood-row">
            {moods.map((item, index) => <button type="button" key={item} className={mood === item ? "selected" : ""} onClick={() => setMood(item)}><strong>{moodFaces[index]}</strong><span>{item}</span></button>)}
          </div>
          <label className="study-field"><span>今日体重</span><span><input type="number" min="0" step="0.1" value={weightJin} onChange={(event) => setWeightJin(Number(event.target.value))} /> 斤</span></label>
        </section>
        <section className="form-card">
          <div className="form-section-title"><span>03</span><div><small>MEALS & PHOTOS</small><h3>三餐和照片墙</h3></div></div>
          <div className="meal-grid">
            <label><span>早餐</span><input value={breakfast} onChange={(event) => setBreakfast(event.target.value)} placeholder="牛奶+鸡蛋+面包?" /></label>
            <label><span>午餐</span><input value={lunch} onChange={(event) => setLunch(event.target.value)} placeholder="今天吃饱饱了吗" /></label>
            <label><span>晚餐</span><input value={dinner} onChange={(event) => setDinner(event.target.value)} placeholder="训练后补充蛋白质" /></label>
          </div>
          <div className="photo-grid">
            <PhotoUpload slot="breakfast" label="早餐照" hint="咔嚓早餐" photoId={photoIds?.breakfast} onChange={updatePhoto} />
            <PhotoUpload slot="lunch" label="午餐照" hint="午餐也要拍" photoId={photoIds?.lunch} onChange={updatePhoto} />
            <PhotoUpload slot="dinner" label="晚餐照" hint="晚餐打卡" photoId={photoIds?.dinner} onChange={updatePhoto} />
            <PhotoUpload slot="study" label="学习照" hint="书桌/笔记" photoId={photoIds?.study} onChange={updatePhoto} />
            <PhotoUpload slot="selfie" label={`给${data.settings.companionAlias || "陶陶"}的美美照片`} hint="今天也要被好好看见" photoId={photoIds?.selfie} onChange={updatePhoto} />
          </div>
        </section>
        <section className="form-card">
          <div className="form-section-title"><span>04</span><div><small>PROGRESS</small><h3>今天完成了什么？</h3></div></div>
          {checks.length ? (
            <div className="completed-list">
              {checks.map((check) => {
                const habit = data.habits.find((item) => item.id === check.habitId);
                return habit && <div key={check.id}><span style={{ color: habit.color }}><Icon name={habit.icon} /></span><strong>{habit.name}</strong><small>{check.value} {habit.unit}</small><Icon name="check" size={16} /></div>;
              })}
            </div>
          ) : <p className="empty-inline">还没点打卡也没关系，洳先从一个小任务开始。</p>}
        </section>
        <div className="journal-actions">
          <button className="primary-button" type="submit">保存今日记录 <Icon name="check" /></button>
          {existing && <button className="secondary-button" type="button" onClick={onShare}><Icon name="share" /> 生成可爱分享卡</button>}
        </div>
      </form>
    </div>
  );
}

function CoachPage({
  data,
  updateData,
  notify,
  agentUiState,
  updateAgentUiState
}: {
  data: AppData;
  updateData: (updater: (current: AppData) => AppData) => void;
  notify: (message: string) => void;
  agentUiState?: AgentUiState;
  updateAgentUiState: (patch: Partial<AgentUiState>) => void;
}) {
  const agent = agentUiState?.agent ?? "english";
  const question = agentUiState?.questionDraft ?? "";
  const imageText = agentUiState?.imageTextDraft ?? "";
  const imagePreview = agentUiState?.imagePreview;
  const chatDate = agentUiState?.chatDate || localDate();
  const activeConversationId = agentUiState?.activeConversationId ?? "";
  const setAgent = (value: AgentKind) => updateAgentUiState({ agent: value });
  const setQuestion = (value: string | ((current: string) => string)) => updateAgentUiState({ questionDraft: typeof value === "function" ? value(question) : value });
  const setImageText = (value: string) => updateAgentUiState({ imageTextDraft: value });
  const setImagePreview = (value?: string) => updateAgentUiState({ imagePreview: value });
  const setChatDate = (value: string) => updateAgentUiState({ chatDate: value });
  const setActiveConversationId = (value: string) => updateAgentUiState({ activeConversationId: value });
  const [ocrBusy, setOcrBusy] = useState(false);
  const [asking, setAsking] = useState(false);
  const [libraryBusy, setLibraryBusy] = useState(false);
  const [editingKnowledgeId, setEditingKnowledgeId] = useState<string | null>(null);
  const [knowledgeDraft, setKnowledgeDraft] = useState("");

  const agentMeta = {
    english: { label: "英语导师", eyebrow: "ENGLISH", title: "英语阅读与表达导师" },
    food: { label: "法语老师", eyebrow: "FRANÇAIS", title: "法语入门与练习老师" },
    planner: { label: "生活助手", eyebrow: "LIFE", title: "学习与生活整理助手" }
  } satisfies Record<AgentKind, { label: string; eyebrow: string; title: string }>;

  const quickQuestions = useMemo<Record<AgentKind, string[]>>(() => ({
    english: [
      "请用 close reading 分析这段文本",
      "帮我拆解长难句并给自然译文",
      "补充这篇作品的文学背景和主题",
      "给我设计一组阅读能力训练题"
    ],
    food: [
      "按今天状态安排三餐，避开我不想吃的",
      "帮我设计高蛋白但不焦虑的一天",
      "根据最近不想吃的食物给替代方案",
      "晚餐想清淡一点，怎么搭配更均衡"
    ],
    planner: [
      "今天想学 5 小时法语，先帮我设计第一轮",
      "我刚学完一轮，帮我根据反馈调整下一轮",
      "今天精力一般，帮我做低压力计划",
      "把大任务拆成几个可选择的番茄钟"
    ]
  }), []);

  const chatDates = useMemo(() => {
    const dates = new Set([localDate(), ...(data.agentConversations ?? []).map((item) => item.date)]);
    return [...dates].sort((a, b) => b.localeCompare(a)).slice(0, 14);
  }, [data.agentConversations]);
  const conversations = useMemo(() => (data.agentConversations ?? [])
    .filter((item) => item.date === chatDate && item.agent === agent)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)), [data.agentConversations, chatDate, agent]);
  const activeConversation = conversations.find((item) => item.id === activeConversationId) ?? conversations[0];

  useEffect(() => {
    if (!conversations.length) {
      if (activeConversationId) setActiveConversationId("");
      return;
    }
    if (!conversations.some((item) => item.id === activeConversationId)) setActiveConversationId(conversations[0].id);
  }, [activeConversationId, conversations]);

  function createConversation(title = "新对话"): AgentConversation {
    const createdAt = new Date().toISOString();
    return {
      id: uid("agent-chat"),
      date: chatDate,
      title,
      agent,
      messages: [],
      createdAt,
      updatedAt: createdAt
    };
  }

  function startNewConversation() {
    const conversation = createConversation(`${agentMeta[agent].label}新对话`);
    updateData((current) => ({ ...current, agentConversations: [conversation, ...(current.agentConversations ?? [])] }));
    setActiveConversationId(conversation.id);
  }

  const welcomeMessage: AgentChatMessage = {
    id: `welcome-${agent}`,
    role: "assistant",
    agent,
    text: agent === "english"
      ? "### 英语文学导师已上线\n\n可以上传英文题目、文本截图或文件。我会更重视 close reading、术语解释、文学背景和阅读能力训练。"
      : agent === "food"
        ? "### 饮食助手在这里\n\n告诉我今天想吃什么、不想吃什么，我会避开雷区，尽量让三餐舒服又均衡。"
        : "### 计划助手准备好啦\n\n先做一轮，不把一天塞满。你告诉我目标和精力，我帮你拆成可调整的专注块。",
    createdAt: new Date().toISOString()
  };

  async function recognizeImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setOcrBusy(true);
    try {
      const { preview, text } = await recognizeEnglishText(file, data.settings);
      setImagePreview(preview);
      setImageText(text);
      setQuestion((current) => current || (agent === "english" ? "请讲解图片里的英文内容，重点说翻译、句法和文学理解。" : "请结合图片内容给出建议。"));
      notify(data.settings.qwenApiKey ? "千问已读懂图片" : "图片文字已识别");
    } catch {
      notify("图片识别失败，可以检查 Qwen Key 或换一张更清晰的图");
    } finally {
      setOcrBusy(false);
      event.target.value = "";
    }
  }

  async function readFileContext(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!data.settings.agentFileUpload) {
      notify("请先在设置里开启 Agent 上传文件能力");
      event.target.value = "";
      return;
    }
    setLibraryBusy(true);
    try {
      const text = await file.text();
      const libraryFile = createKnowledgeFile(file.name, file.type || "text/plain", file.size, text.slice(0, 160000));
      const enriched = await embedKnowledgeFile(data.settings, libraryFile).catch(() => libraryFile);
      updateData((current) => ({ ...current, knowledgeFiles: [enriched, ...(current.knowledgeFiles ?? [])] }));
      notify(data.settings.qwenApiKey ? "文件已存入本地知识库，并尝试建立 Qwen 向量索引" : "文件已存入本地知识库，将使用关键词检索");
    } catch {
      notify("文件读取失败，先试试 txt、md、csv 或 json 文件");
    } finally {
      setLibraryBusy(false);
      event.target.value = "";
    }
  }

  async function saveKnowledgeEdit(fileId: string) {
    const file = data.knowledgeFiles.find((item) => item.id === fileId);
    if (!file) return;
    setLibraryBusy(true);
    try {
      const updated = {
        ...file,
        content: knowledgeDraft.slice(0, 240000),
        chunks: chunkText(knowledgeDraft.slice(0, 240000))
      };
      const enriched = await embedKnowledgeFile(data.settings, updated).catch(() => updated);
      updateData((current) => ({
        ...current,
        knowledgeFiles: current.knowledgeFiles.map((item) => item.id === fileId ? enriched : item)
      }));
      setEditingKnowledgeId(null);
      setKnowledgeDraft("");
      notify("知识库文件已更新");
    } finally {
      setLibraryBusy(false);
    }
  }

  async function rebuildKnowledgeIndex(fileId: string) {
    const file = data.knowledgeFiles.find((item) => item.id === fileId);
    if (!file) return;
    setLibraryBusy(true);
    try {
      const rebuilt = { ...file, chunks: chunkText(file.content) };
      const enriched = await embedKnowledgeFile(data.settings, rebuilt).catch(() => rebuilt);
      updateData((current) => ({
        ...current,
        knowledgeFiles: current.knowledgeFiles.map((item) => item.id === fileId ? enriched : item)
      }));
      notify(data.settings.qwenApiKey ? "已重新建立 Qwen 向量索引" : "已重新切块，当前使用关键词检索");
    } finally {
      setLibraryBusy(false);
    }
  }

  function deleteKnowledgeFile(fileId: string) {
    const file = data.knowledgeFiles.find((item) => item.id === fileId);
    if (!file || !window.confirm(`从本地知识库移除“${file.name}”？这不会删除电脑上的原文件。`)) return;
    updateData((current) => ({ ...current, knowledgeFiles: current.knowledgeFiles.filter((item) => item.id !== fileId) }));
    if (editingKnowledgeId === fileId) setEditingKnowledgeId(null);
    notify("已从本地知识库移除");
  }

  async function speakText(text: string) {
    if (!data.settings.voiceOutput || !text.trim()) return;
    if (data.settings.qwenApiKey?.trim()) {
      try {
        const audioUrl = await qwenTts(data.settings, text.replace(/[#*_`>\-|]/g, "").slice(0, 900));
        await new Audio(audioUrl).play();
        return;
      } catch {
        // Use browser speech as the local fallback.
      }
    }
    if ("speechSynthesis" in window) {
      const utterance = new SpeechSynthesisUtterance(text.replace(/[#*_`>\-|]/g, "").slice(0, 700));
      utterance.lang = "zh-CN";
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(utterance);
    }
  }

  async function submit(event?: FormEvent) {
    event?.preventDefault();
    const cleanQuestion = question.trim();
    if (!cleanQuestion && !imageText.trim() && !data.knowledgeFiles.length) {
      notify("先给智能体一个问题或上传材料吧");
      return;
    }
    const userText = [cleanQuestion, imageText ? `图片内容：\n${imageText}` : "", data.knowledgeFiles.length ? `已参考 ${data.knowledgeFiles.length} 份本地学习材料` : ""].filter(Boolean).join("\n\n");
    const conversation = activeConversation ?? createConversation((cleanQuestion || "材料分析").slice(0, 22));
    const conversationHistory = conversation.messages;
    const userMessage: AgentChatMessage = {
      id: uid("agent-msg"),
      role: "user",
      agent,
      text: userText,
      createdAt: new Date().toISOString()
    };
    const title = conversation.messages.length ? conversation.title : (cleanQuestion || "材料分析").slice(0, 22);
    const appendMessage = (message: AgentChatMessage) => {
      updateData((current) => {
        const exists = (current.agentConversations ?? []).some((item) => item.id === conversation.id);
        const nextConversation: AgentConversation = {
          ...conversation,
          title,
          messages: exists ? [] : (message.id === userMessage.id ? [userMessage] : [userMessage, message]),
          updatedAt: message.createdAt
        };
        return {
          ...current,
          agentConversations: exists
            ? current.agentConversations.map((item) => item.id === conversation.id ? {
                ...item,
                title,
                messages: [...item.messages, message],
                updatedAt: message.createdAt
              } : item)
            : [nextConversation, ...(current.agentConversations ?? [])]
        };
      });
    };
    setActiveConversationId(conversation.id);
    setAsking(true);
    appendMessage(userMessage);
    try {
      const answer = await askAgent(data.settings, { agent, input: cleanQuestion, imageText, imageDataUrl: data.settings.aiProvider === "qwen" ? imagePreview : undefined, knowledgeFiles: data.knowledgeFiles, history: conversationHistory });
      const assistantMessage: AgentChatMessage = {
        id: uid("agent-msg"),
        role: "assistant",
        agent,
        text: answer.text,
        reasoningContent: answer.reasoningContent,
        provider: data.settings.aiProvider ?? "deepseek",
        model: data.settings.aiProvider === "qwen" ? (imagePreview ? data.settings.qwenVisionModel : data.settings.qwenChatModel) : data.settings.deepSeekModel,
        createdAt: new Date().toISOString()
      };
      appendMessage(assistantMessage);
      void speakText(answer.text);
      setQuestion("");
    } catch (error) {
      const answer = fallbackAgentAnswer(data.settings, { agent, input: cleanQuestion, imageText, knowledgeFiles: data.knowledgeFiles });
      appendMessage({
        id: uid("agent-msg"),
        role: "assistant",
        agent,
        text: answer,
        createdAt: new Date().toISOString()
      });
      void speakText(answer);
      notify(error instanceof Error ? error.message : "DeepSeek 暂时没连上，先给你本地版建议");
    } finally {
      setAsking(false);
    }
  }

  const visibleMessages = activeConversation?.messages.length ? activeConversation.messages : [welcomeMessage];
  const summaryDate = localDate();
  const todayAutoSummary = buildTodayStudySummary(data, summaryDate, data.settings.activeProfile ?? "ru");

  return (
    <div className="page coach-page agent-page">
      <PageHeader eyebrow={agentMeta[agent].eyebrow} title={agentMeta[agent].title} action={<span className="ai-header-mark" aria-hidden="true"><Sparkles size={20} /></span>} />
      <section className="provider-switch" aria-label="AI 服务">
        {(["deepseek", "qwen"] as const).map((provider) => <button key={provider} className={(data.settings.aiProvider ?? "deepseek") === provider ? "active" : ""} onClick={() => updateData((current) => ({ ...current, settings: { ...current.settings, aiProvider: provider } }))}>{provider === "deepseek" ? "DeepSeek" : "千问"}</button>)}
      </section>
      <section className="agent-tabs">
        {(Object.keys(agentMeta) as AgentKind[]).map((item) => (
          <button key={item} className={agent === item ? "active" : ""} onClick={() => setAgent(item)}>{agentMeta[item].label}</button>
        ))}
      </section>
      <section className="conversation-panel">
        <div className="conversation-toolbar">
          <select value={chatDate} onChange={(event) => setChatDate(event.target.value)}>
            {chatDates.map((date) => <option key={date} value={date}>{date === localDate() ? "今天" : date}</option>)}
          </select>
          <button type="button" onClick={startNewConversation}><Plus size={15} /> 新对话</button>
        </div>
        <div className="conversation-list">
          {conversations.map((item) => (
            <button key={item.id} className={activeConversation?.id === item.id ? "active" : ""} onClick={() => setActiveConversationId(item.id)}>
              <strong>{item.title || "未命名对话"}</strong>
              <small>{item.messages.length} 条 · {new Date(item.updatedAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}</small>
            </button>
          ))}
          {!conversations.length && <span>今天这个智能体还没有对话</span>}
        </div>
      </section>
      <section className="coach-hero">
        <span><Icon name={agent === "food" ? "heart" : agent === "planner" ? "calendar" : "bot"} size={27} /></span>
        <div>
          <h2>{agent === "english" ? "阅读、翻译、写作与文本细读" : agent === "food" ? "从发音、词汇到简单对话慢慢学" : "整理今天，也照顾好生活里的小事"}</h2>
          <p>把问题、图片或学习材料交给老师，技术设置收进设置页，不打扰学习。</p>
        </div>
      </section>
      <section className="auto-study-summary">
        <div className="section-heading"><div><p>AUTO SUMMARY</p><h2>今日自动总结</h2></div><span>本地生成</span></div>
        {todayAutoSummary.length ? <p>今日完成了：{todayAutoSummary.join("；")}。</p> : <p>今天的番茄钟、单词、做题和待办记录会自动汇总在这里。</p>}
      </section>
      <section className="coach-chat">
        {visibleMessages.map((message, index) => (
          <div key={`${message.role}-${index}`} className={`coach-bubble ${message.role}`}>
            <small>{message.role === "assistant" ? agentMeta[agent].label : data.settings.ownerName}</small>
            {message.role === "assistant" && message.reasoningContent && (
              <details className="reasoning-box">
                <summary>思考过程</summary>
                <p>{message.reasoningContent}</p>
              </details>
            )}
            <MarkdownBlock content={message.text} />
          </div>
        ))}
        {asking && <div className="coach-bubble assistant"><small>{agentMeta[agent].label}</small><MarkdownBlock content="正在组织更合适的回答……" /></div>}
      </section>
      <section className="coach-tools">
        {(data.settings.aiProvider ?? "deepseek") === "qwen" && <div className="agent-action-bar">
          <label>
            <Icon name="camera" /><span>{ocrBusy ? "识别中" : "拍照"}</span>
            <input type="file" accept="image/*" onChange={recognizeImage} disabled={ocrBusy} />
          </label>
          <label>
            <Icon name="upload" /><span>{libraryBusy ? "入库" : "文件"}</span>
            <input type="file" accept=".txt,.md,.csv,.json,.ts,.tsx,.js,.jsx,.css,.html,.py,.java,.kt,.gradle,.xml,.yml,.yaml" onChange={readFileContext} disabled={libraryBusy} />
          </label>
          <button type="button" onClick={() => speakText(visibleMessages.at(-1)?.text ?? "")} disabled={!data.settings.voiceOutput}><Icon name="share" /><span>朗读</span></button>
        </div>}
        <div className="knowledge-strip">
          <span>本地文件库 {data.knowledgeFiles.length} 个</span>
          <small>{data.settings.qwenApiKey ? "千问智能整理" : "本地材料整理"}</small>
        </div>
        {!!data.knowledgeFiles.length && (
          <div className="knowledge-library">
            {data.knowledgeFiles.map((file) => (
              <article key={file.id}>
                <div className="knowledge-file-head">
                  <input
                    value={file.name}
                    onChange={(event) => updateData((current) => ({
                      ...current,
                      knowledgeFiles: current.knowledgeFiles.map((item) => item.id === file.id ? { ...item, name: event.target.value } : item)
                    }))}
                    aria-label="知识库文件名"
                  />
                  <small>{file.chunks.length} 段</small>
                </div>
                {editingKnowledgeId === file.id ? (
                  <>
                    <textarea className="soft-input knowledge-editor" value={knowledgeDraft} onChange={(event) => setKnowledgeDraft(event.target.value)} />
                    <div className="knowledge-actions">
                      <button type="button" onClick={() => saveKnowledgeEdit(file.id)} disabled={libraryBusy}>保存</button>
                      <button type="button" onClick={() => setEditingKnowledgeId(null)}>取消</button>
                    </div>
                  </>
                ) : (
                  <p>{file.content.slice(0, 95)}{file.content.length > 95 ? "…" : ""}</p>
                )}
                <div className="knowledge-actions">
                  <button type="button" onClick={() => { setEditingKnowledgeId(file.id); setKnowledgeDraft(file.content); }}>编辑</button>
                  <button type="button" onClick={() => rebuildKnowledgeIndex(file.id)} disabled={libraryBusy}>重建索引</button>
                  <button type="button" className="danger-mini" onClick={() => deleteKnowledgeFile(file.id)}><Trash2 size={13} /> 移除</button>
                </div>
              </article>
            ))}
          </div>
        )}
        {imagePreview && <img className="ocr-preview" src={imagePreview} alt="待识别图片" />}
        {imageText && <textarea className="soft-input ocr-text" value={imageText} onChange={(event) => setImageText(event.target.value)} />}
        <div className="quick-questions">
          {quickQuestions[agent].map((item) => <button type="button" key={item} onClick={() => setQuestion(item)}>{item}</button>)}
        </div>
        <form onSubmit={submit} className="coach-form">
          <textarea className="soft-input" value={question} onChange={(event) => setQuestion(event.target.value)} placeholder={agent === "food" ? "比如：今天不想吃鸡胸和西兰花，帮我安排三餐。" : agent === "planner" ? "比如：今天想学法语 5 小时，但不想被安排得太满。" : "比如：帮我分析这段诗歌的意象、叙事声音和时代背景。"} />
          <button className="primary-button" type="submit" disabled={asking || ocrBusy}><Icon name="bot" /> 发送给{agentMeta[agent].label}</button>
        </form>
      </section>
    </div>
  );
}

function CouplePage({
  data,
  updateData,
  onOpenChat,
  onOpenMoments
}: {
  data: AppData;
  updateData: (updater: (current: AppData) => AppData) => void;
  onOpenChat: () => void;
  onOpenMoments: () => void;
}) {
  const today = localDate();
  const [chatText, setChatText] = useState("");
  const [feedText, setFeedText] = useState("");
  const [feedNote, setFeedNote] = useState("");
  const [feedPriority, setFeedPriority] = useState<FeedPriority>("want");
  const currentWeek = weekRange(today)[0];
  const [selectedWeek, setSelectedWeek] = useState(currentWeek);
  const [course, setCourse] = useState({
    title: "",
    weekday: Math.max(1, new Date().getDay()),
    slotIndex: 0,
    owner: data.settings.activeProfile ?? "ru" as ProfileId,
    location: "",
    note: "",
    color: "#ef9c83"
  });
  const [eventKind, setEventKind] = useState<CoupleEventKind>("call");
  const [eventTitle, setEventTitle] = useState("");
  const [eventDate, setEventDate] = useState(today);
  const [eventStart, setEventStart] = useState("");
  const [eventEnd, setEventEnd] = useState("");
  const [eventNote, setEventNote] = useState("");
  const author = (data.settings.activeProfile ?? "ru") === "ru" ? data.settings.ownerName || "娜娜" : data.settings.partnerName || "陶陶";
  const brief = data.dailyBriefs.find((item) => item.date === today);
  const weekdayNames = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
  const eventNames: Record<CoupleEventKind, string> = {
    game: "王者荣耀",
    call: "打电话",
    meet: "见面",
    anniversary: "纪念日",
    date: "约会",
    custom: "其他"
  };

  function submitChat(event: FormEvent) {
    event.preventDefault();
    if (!chatText.trim()) return;
    updateData((current) => ({
      ...current,
      coupleMessages: [...current.coupleMessages, {
        id: uid("chat"),
        author,
        text: chatText.trim(),
        createdAt: new Date().toISOString()
      }]
    }));
    setChatText("");
  }

  function submitFeed(event: FormEvent) {
    event.preventDefault();
    if (!feedText.trim()) return;
    const now = new Date().toISOString();
    updateData((current) => ({
      ...current,
      feedWishes: [{
        id: uid("feed"),
        author,
        craving: feedText.trim(),
        note: feedNote.trim(),
        priority: feedPriority,
        date: today,
        fulfilled: false,
        status: "requested",
        createdAt: now,
        updatedAt: now
      }, ...(current.feedWishes ?? [])]
    }));
    setFeedText("");
    setFeedNote("");
  }

  function toggleFeed(id: string) {
    updateData((current) => ({
      ...current,
      feedWishes: (current.feedWishes ?? []).map((item) => {
        if (item.id !== id) return item;
        const status = item.status === "requested" || !item.status ? "accepted" : item.status === "accepted" ? "delivered" : "requested";
        return { ...item, fulfilled: status === "delivered", status, updatedAt: new Date().toISOString() };
      })
    }));
  }

  function submitCourse(event: FormEvent) {
    event.preventDefault();
    if (!course.title.trim()) return;
    const slot = SCHOOL_SLOTS[course.slotIndex] ?? SCHOOL_SLOTS[0];
    updateData((current) => ({
      ...current,
      sharedCourses: [...(current.sharedCourses ?? []), {
        id: uid("course"),
        title: course.title.trim(),
        weekday: course.weekday,
        startTime: slot.start,
        endTime: slot.end,
        location: course.location.trim(),
        note: course.note.trim(),
        color: course.owner === "ru" ? "#ef9c83" : "#7ca7a1",
        owner: course.owner,
        weekStart: selectedWeek,
        slotIndex: course.slotIndex,
        createdAt: new Date().toISOString()
      }]
    }));
    setCourse((current) => ({ ...current, title: "", location: "", note: "" }));
  }

  function copyPreviousWeek() {
    const previousWeek = shiftDate(selectedWeek, -7);
    const previous = data.sharedCourses.filter((item) => item.weekStart === previousWeek);
    if (!previous.length) return;
    const now = new Date().toISOString();
    updateData((current) => ({
      ...current,
      sharedCourses: [
        ...current.sharedCourses,
        ...previous.map((item) => ({
          ...item,
          id: uid("course"),
          weekStart: selectedWeek,
          createdAt: now
        }))
      ]
    }));
  }

  function removeCourse(id: string) {
    if (!window.confirm("从这一周课表中移除这条安排？")) return;
    updateData((current) => ({ ...current, sharedCourses: current.sharedCourses.filter((item) => item.id !== id) }));
  }

  function submitEvent(event: FormEvent) {
    event.preventDefault();
    const title = eventTitle.trim() || eventNames[eventKind];
    const now = new Date().toISOString();
    updateData((current) => ({
      ...current,
      coupleEvents: [{
        id: uid("couple-event"),
        kind: eventKind,
        title,
        date: eventDate,
        startTime: eventStart || undefined,
        endTime: eventEnd || undefined,
        note: eventNote.trim(),
        author,
        createdAt: now,
        updatedAt: now
      }, ...(current.coupleEvents ?? [])]
    }));
    setEventTitle("");
    setEventNote("");
    setEventStart("");
    setEventEnd("");
  }

  const todayPosts = (data.couplePosts ?? []).filter((item) => item.date === today).length;
  const latestPost = data.couplePosts[0];
  const openFeeds = (data.feedWishes ?? []).filter((item) => !item.fulfilled).length;
  const nextEvents = (data.coupleEvents ?? []).filter((item) => item.date >= today).sort((a, b) => `${a.date}${a.startTime ?? ""}`.localeCompare(`${b.date}${b.startTime ?? ""}`)).slice(0, 6);
  const scheduleWeekdays = [1, 2, 3, 4, 5, 6, 0];
  const archivedWeeks = [...new Set(data.sharedCourses.map((item) => item.weekStart).filter((item): item is string => Boolean(item)))].sort().reverse();
  const selectedCourses = data.sharedCourses.filter((item) => selectedWeek === "legacy" ? !item.weekStart : item.weekStart === selectedWeek);
  const selectedWeekEnd = selectedWeek === "legacy" ? "" : shiftDate(selectedWeek, 6);
  const previousWeekHasCourses = data.sharedCourses.some((item) => item.weekStart === shiftDate(selectedWeek === "legacy" ? currentWeek : selectedWeek, -7));

  return (
    <div className="page couple-page">
      <PageHeader eyebrow="OUR SPACE" title="我们的共享频道" />
      <section className="couple-art-hero">
        <img src="/art/nana-couple-space.png" alt="" />
        <div><small>ONLY FOR US</small><strong>一起记录，也一起期待。</strong><span>课表、消息、见面与每一件小事</span></div>
      </section>
      <button className="open-chat-card" onClick={onOpenChat}><span className="avatar-pair"><ProfileAvatar data={data} profile="ru" /><ProfileAvatar data={data} profile="taotao" /></span><p><strong>进入我们的聊天</strong><small>像微信一样，发文字、图片和小表情</small></p><Icon name="arrow" /></button>
      <button className="open-moments-card" onClick={onOpenMoments}>
        <span className="moments-entry-icon"><Icon name="camera" size={20} /></span>
        <span className="moments-entry-copy">
          <strong>我们的朋友圈</strong>
          <small>{latestPost ? `${latestPost.author}：${latestPost.text || (latestPost.photoIds?.length ? `[${latestPost.photoIds.length} 张图片]` : "分享了一条动态")}` : "点击进入，只属于两个人的时间线"}</small>
        </span>
        <span className="moments-entry-count">{data.couplePosts.length || ""}</span>
        <Icon name="arrow" />
      </button>
      <section className="public-whisper">
        <HeartHandshake size={26} aria-hidden="true" />
        <div><small>{data.settings.companionAlias || "陶陶"} TODAY</small><p>{brief?.companionMessage || "今天也想认真听你说一点小事。"}</p></div>
      </section>
      <section className="couple-overview">
        <div><small>今日动态</small><strong>{todayPosts}</strong></div>
        <div><small>待投喂</small><strong>{openFeeds}</strong></div>
        <div><small>共同事件</small><strong>{data.coupleEvents.length}</strong></div>
      </section>

      <section className="couple-section chat-zone">
        <div className="section-heading"><div><p>CHAT</p><h2>我们的聊天区</h2></div><span>离线可写</span></div>
        <div className="chat-list">
          {data.coupleMessages.slice(-12).map((message) => (
            <div key={message.id} className={message.author === author ? "mine" : ""}><strong>{message.author}</strong><p>{message.text}</p><small>{new Date(message.createdAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}</small></div>
          ))}
          {!data.coupleMessages.length && <p className="empty-inline">这里像一个只属于你们的小聊天窗。</p>}
        </div>
        <form className="chat-composer" onSubmit={submitChat}><input value={chatText} onChange={(event) => setChatText(event.target.value)} placeholder="写一句小碎碎念" /><button type="submit">发送</button></form>
      </section>

      <section className="couple-section">
        <div className="section-heading"><div><p>FEED ME</p><h2>投喂指南</h2></div><span>{openFeeds} 个愿望</span></div>
        <form className="couple-form" onSubmit={submitFeed}>
          <input value={feedText} onChange={(event) => setFeedText(event.target.value)} placeholder="我现在想吃什么" />
          <input value={feedNote} onChange={(event) => setFeedNote(event.target.value)} placeholder="口味/忌口/地点，比如 少辣、想喝热的" />
          <select value={feedPriority} onChange={(event) => setFeedPriority(event.target.value as FeedPriority)}>
            <option value="want">想吃</option>
            <option value="urgent">现在就想</option>
            <option value="normal">随缘</option>
          </select>
          <button type="submit" disabled={!feedText.trim()}>告诉她</button>
        </form>
        <div className="feed-wish-list">
          {(data.feedWishes ?? []).slice(0, 8).map((wish) => (
            <button key={wish.id} className={wish.fulfilled ? "fulfilled" : ""} onClick={() => toggleFeed(wish.id)}>
              <span>{wish.priority === "urgent" ? "现在就想" : wish.priority === "want" ? "想吃" : "随缘"}</span>
              <strong>{wish.craving}</strong>
              <small>{wish.author} · {wish.note || "没有备注"} · {wish.status === "accepted" ? "已接单" : wish.status === "delivered" ? "已送达" : "等待接单"}</small>
            </button>
          ))}
        </div>
      </section>

      <section className="school-schedule-section">
        <div className="schedule-board-header">
          <div><p>WEEKLY CAMPUS</p><h2>我们的校园课表</h2><small>每节 45 分钟，课间休息 5 分钟</small></div>
          <div className="schedule-legend"><span className="ru">娜娜</span><span className="taotao">陶陶</span></div>
        </div>
        <div className="week-switcher">
          <button onClick={() => setSelectedWeek((value) => shiftDate(value === "legacy" ? currentWeek : value, -7))}>上一周</button>
          <select value={selectedWeek} onChange={(event) => setSelectedWeek(event.target.value)}>
            <option value={currentWeek}>本周 · {currentWeek.slice(5)} 至 {shiftDate(currentWeek, 6).slice(5)}</option>
            {selectedWeek !== "legacy" && selectedWeek !== currentWeek && !archivedWeeks.includes(selectedWeek) && <option value={selectedWeek}>{selectedWeek.slice(5)} 至 {shiftDate(selectedWeek, 6).slice(5)}</option>}
            {archivedWeeks.filter((week) => week !== currentWeek).map((week) => <option key={week} value={week}>{week.slice(5)} 至 {shiftDate(week, 6).slice(5)}</option>)}
            {data.sharedCourses.some((item) => !item.weekStart) && <option value="legacy">旧版课表（只读归档）</option>}
          </select>
          <button onClick={() => setSelectedWeek((value) => shiftDate(value === "legacy" ? currentWeek : value, 7))}>下一周</button>
        </div>
        <div className="schedule-week-note">
          <span>{selectedWeek === "legacy" ? "迁移前保存的安排" : `${selectedWeek} 至 ${selectedWeekEnd}`}</span>
          {selectedWeek !== "legacy" && <button onClick={copyPreviousWeek} disabled={!previousWeekHasCourses || selectedCourses.length > 0}>沿用上周</button>}
        </div>
        {selectedWeek !== "legacy" && (
          <form className="school-course-form" onSubmit={submitCourse}>
            <label className="course-owner-field"><span>这是谁的任务</span><select value={course.owner} onChange={(event) => setCourse((current) => ({ ...current, owner: event.target.value as ProfileId }))}><option value="ru">{data.settings.ownerName || "娜娜"}</option><option value="taotao">{data.settings.partnerName || "陶陶"}</option></select></label>
            <label><span>星期</span><select value={course.weekday} onChange={(event) => setCourse((current) => ({ ...current, weekday: Number(event.target.value) }))}>{scheduleWeekdays.map((day) => <option key={day} value={day}>{weekdayNames[day]}</option>)}</select></label>
            <label><span>节次</span><select value={course.slotIndex} onChange={(event) => setCourse((current) => ({ ...current, slotIndex: Number(event.target.value) }))}>{SCHOOL_SLOTS.map((slot) => <option key={slot.index} value={slot.index}>第 {slot.index + 1} 节 · {slot.start}-{slot.end}</option>)}</select></label>
            <label className="course-title-field"><span>课程或任务</span><input value={course.title} onChange={(event) => setCourse((current) => ({ ...current, title: event.target.value }))} placeholder="例如：英语精读 / 健身 / 写作业" /></label>
            <label><span>地点</span><input value={course.location} onChange={(event) => setCourse((current) => ({ ...current, location: event.target.value }))} placeholder="教室或地点" /></label>
            <label><span>备注</span><input value={course.note} onChange={(event) => setCourse((current) => ({ ...current, note: event.target.value }))} placeholder="本节目标" /></label>
            <button type="submit" disabled={!course.title.trim()}>写进这一周</button>
          </form>
        )}
        <div className="school-timetable-scroll">
          <div className="school-timetable">
            <div className="timetable-corner timetable-corner-left"><strong>时间</strong><small>45 + 5</small></div>
            {scheduleWeekdays.map((day) => <div className={`timetable-day ${day === 3 ? "midweek-guide" : ""}`} key={day}><strong>{weekdayNames[day]}</strong><small>{selectedWeek === "legacy" ? "" : shiftDate(selectedWeek, scheduleWeekdays.indexOf(day)).slice(5)}</small>{day === 3 && <em>时间对照</em>}</div>)}
            <div className="timetable-corner timetable-corner-right"><strong>时间</strong><small>向右也能对齐</small></div>
            {SCHOOL_SLOTS.map((slot) => (
              <div className="timetable-row" key={slot.index}>
                <div className="timetable-time timetable-time-left"><strong>{slot.index + 1}</strong><span>{slot.start}<br />{slot.end}</span></div>
                {scheduleWeekdays.map((day) => {
                  const items = selectedCourses.filter((item) => item.weekday === day && (item.slotIndex ?? SCHOOL_SLOTS.findIndex((slotItem) => slotItem.start === item.startTime)) === slot.index);
                  return <div className={`timetable-cell ${day === 3 ? "midweek-guide" : ""}`} key={day}>{day === 3 && <span className="midweek-time">{slot.index + 1} · {slot.start}</span>}{items.map((item) => {
                    const owner = item.owner ?? "ru";
                    return <article className={`course-note owner-${owner}`} key={item.id}><span>{owner === "ru" ? "娜娜" : "陶陶"}</span><strong>{item.title}</strong><small>{item.location || item.note || "本节任务"}</small>{selectedWeek !== "legacy" && <button onClick={() => removeCourse(item.id)} aria-label={`移除${item.title}`}>×</button>}</article>;
                  })}</div>;
                })}
                <div className="timetable-time timetable-time-right"><strong>{slot.index + 1}</strong><span>{slot.start}<br />{slot.end}</span></div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="couple-section">
        <div className="section-heading"><div><p>TIME TOGETHER</p><h2>娱乐与纪念</h2></div></div>
        <form className="couple-form event-form" onSubmit={submitEvent}>
          <select value={eventKind} onChange={(event) => setEventKind(event.target.value as CoupleEventKind)}>
            {(Object.keys(eventNames) as CoupleEventKind[]).map((key) => <option key={key} value={key}>{eventNames[key]}</option>)}
          </select>
          <input value={eventTitle} onChange={(event) => setEventTitle(event.target.value)} placeholder="标题，可留空用类型名" />
          <input type="date" value={eventDate} onChange={(event) => setEventDate(event.target.value)} />
          <input type="time" value={eventStart} onChange={(event) => setEventStart(event.target.value)} />
          <input type="time" value={eventEnd} onChange={(event) => setEventEnd(event.target.value)} />
          <input value={eventNote} onChange={(event) => setEventNote(event.target.value)} placeholder="备注，比如 几点打王者/通话多久/见面地点" />
          <button type="submit">记录</button>
        </form>
        <div className="event-list">
          {nextEvents.map((item) => (
            <div key={item.id}><span>{eventNames[item.kind]}</span><strong>{item.title}</strong><small>{item.date}{item.startTime ? ` · ${item.startTime}${item.endTime ? `-${item.endTime}` : ""}` : ""} · {item.note || "属于我们的一件事"}</small></div>
          ))}
          {!nextEvents.length && <p className="empty-inline">还没有未来安排，可以先加一个纪念日、见面或打电话时间。</p>}
        </div>
      </section>
    </div>
  );
}

type PendingMomentPhoto = {
  id: string;
  preview: string;
};

function MomentPhoto({
  src,
  onOpen
}: {
  src?: string;
  onOpen: () => void;
}) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return <div className="moment-photo-fallback"><Icon name="camera" size={18} /><span>图片暂不可用</span></div>;
  }
  return <button type="button" className="moment-photo" onClick={onOpen}><img src={src} alt="朋友圈图片" onError={() => setFailed(true)} /></button>;
}

function MomentPhotoGrid({
  photoIds,
  photos,
  onOpen
}: {
  photoIds: string[];
  photos: Record<string, string>;
  onOpen: (src: string) => void;
}) {
  if (!photoIds.length) return null;
  return (
    <div className={`moment-photo-grid count-${photoIds.length}`}>
      {photoIds.map((photoId) => (
        <MomentPhoto key={photoId} src={photos[photoId]} onOpen={() => photos[photoId] && onOpen(photos[photoId])} />
      ))}
    </div>
  );
}

function MomentPublisher({
  author,
  profile,
  notify,
  onClose,
  onPublish
}: {
  author: string;
  profile: ProfileId;
  notify: (message: string) => void;
  onClose: () => void;
  onPublish: (post: CouplePost) => void;
}) {
  const [text, setText] = useState("");
  const [photos, setPhotos] = useState<PendingMomentPhoto[]>([]);
  const [publishing, setPublishing] = useState(false);

  async function selectPhotos(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (!files.length) return;
    const available = Math.max(0, 9 - photos.length);
    if (!available) {
      notify("一条朋友圈最多选择 9 张图片");
      return;
    }
    if (files.length > available) notify(`最多还能选择 ${available} 张图片`);
    try {
      const selected = await Promise.all(files.slice(0, available).map(async (file) => ({
        id: uid("moment-draft"),
        preview: await fileToDataUrl(file)
      })));
      setPhotos((current) => [...current, ...selected].slice(0, 9));
    } catch {
      notify("有图片读取失败，请换一张再试");
    }
  }

  async function publish(event: FormEvent) {
    event.preventDefault();
    if ((!text.trim() && !photos.length) || publishing) return;
    setPublishing(true);
    try {
      const photoIds = await Promise.all(photos.map(async (photo) => {
        const photoId = uid("moment-photo");
        await savePhoto(photoId, photo.preview);
        return photoId;
      }));
      const createdAt = new Date().toISOString();
      onPublish({
        id: uid("couple-post"),
        author,
        authorProfile: profile,
        text: text.trim(),
        photoIds,
        likes: [],
        comments: [],
        date: localDate(),
        createdAt
      });
    } catch {
      notify("朋友圈发布失败，请稍后再试");
      setPublishing(false);
    }
  }

  return (
    <div className="moment-publisher">
      <header className="moment-publisher-header">
        <button type="button" onClick={onClose}>取消</button>
        <strong>发表朋友圈</strong>
        <button type="submit" form="moment-publish-form" disabled={publishing || (!text.trim() && !photos.length)}>{publishing ? "发布中" : "发表"}</button>
      </header>
      <form id="moment-publish-form" className="moment-publish-form" onSubmit={publish}>
        <textarea autoFocus value={text} onChange={(event) => setText(event.target.value)} placeholder="这一刻的想法..." maxLength={2000} />
        <div className="moment-draft-grid">
          {photos.map((photo, index) => (
            <div key={photo.id}>
              <img src={photo.preview} alt={`待发布图片 ${index + 1}`} />
              <button type="button" onClick={() => setPhotos((current) => current.filter((item) => item.id !== photo.id))}><Icon name="close" size={13} /></button>
            </div>
          ))}
          {photos.length < 9 && (
            <label className="moment-photo-picker">
              <Icon name="camera" size={24} />
              <span>{photos.length}/9</span>
              <input type="file" accept="image/*" multiple onChange={selectPhotos} />
            </label>
          )}
        </div>
        <div className="moment-publish-meta"><span>谁可以看</span><strong>仅我们两个人</strong></div>
      </form>
    </div>
  );
}

function MomentsPage({
  data,
  updateData,
  notify,
  onBack
}: {
  data: AppData;
  updateData: (updater: (current: AppData) => AppData) => void;
  notify: (message: string) => void;
  onBack: () => void;
}) {
  const profile = data.settings.activeProfile ?? "ru";
  const author = profile === "ru" ? data.settings.ownerName || "娜娜" : data.settings.partnerName || "陶陶";
  const [publisherOpen, setPublisherOpen] = useState(false);
  const [commentingPostId, setCommentingPostId] = useState("");
  const [commentText, setCommentText] = useState("");
  const [photos, setPhotos] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState("");
  const photoKey = data.couplePosts.flatMap((post) => post.photoIds ?? []).join("|");

  useEffect(() => {
    const ids = [...new Set(data.couplePosts.flatMap((post) => post.photoIds ?? []))];
    let active = true;
    Promise.all(ids.map(async (id) => [id, await getPhoto(id)] as const)).then((entries) => {
      if (!active) return;
      setPhotos(Object.fromEntries(entries.filter((entry): entry is readonly [string, string] => Boolean(entry[1]))));
    });
    return () => {
      active = false;
    };
  }, [photoKey]);

  function publish(post: CouplePost) {
    updateData((current) => ({ ...current, couplePosts: [post, ...current.couplePosts] }));
    setPublisherOpen(false);
    notify("朋友圈已发布");
  }

  function toggleLike(postId: string) {
    updateData((current) => ({
      ...current,
      couplePosts: current.couplePosts.map((post) => {
        if (post.id !== postId) return post;
        const likes = post.likes ?? [];
        return { ...post, likes: likes.includes(profile) ? likes.filter((item) => item !== profile) : [...likes, profile] };
      })
    }));
  }

  function beginComment(postId: string) {
    setCommentingPostId((current) => current === postId ? "" : postId);
    setCommentText("");
  }

  function submitComment(event: FormEvent, postId: string) {
    event.preventDefault();
    if (!commentText.trim()) return;
    const comment = {
      id: uid("moment-comment"),
      authorProfile: profile,
      author,
      text: commentText.trim(),
      createdAt: new Date().toISOString()
    };
    updateData((current) => ({
      ...current,
      couplePosts: current.couplePosts.map((post) => post.id === postId
        ? { ...post, comments: [...(post.comments ?? []), comment] }
        : post)
    }));
    setCommentText("");
    setCommentingPostId("");
  }

  function profileLabel(value: ProfileId) {
    return value === "ru" ? data.settings.ownerName || "娜娜" : data.settings.partnerName || "陶陶";
  }

  function postProfile(post: CouplePost): ProfileId {
    if (post.authorProfile) return post.authorProfile;
    return post.author === (data.settings.partnerName || "陶陶") ? "taotao" : "ru";
  }

  return (
    <div className="moments-page">
      <header className="moments-header">
        <button onClick={onBack} aria-label="返回互动区"><ChevronLeft size={23} /></button>
        <strong>朋友圈</strong>
        <button onClick={() => setPublisherOpen(true)} aria-label="发表朋友圈"><Icon name="camera" size={22} /></button>
      </header>
      <div className="moments-scroll">
        <section className="moments-cover">
          <div className="moments-cover-shade" />
          <div className="moments-cover-profile">
            <div><span className="moments-cover-name">{data.settings.ownerName || "娜娜"} & {data.settings.partnerName || "陶陶"}</span><small>只属于我们两个人的朋友圈</small></div>
            <span className="moments-cover-avatar"><ProfileAvatar data={data} profile="ru" /><ProfileAvatar data={data} profile="taotao" /></span>
          </div>
        </section>
        <main className="moments-feed">
          {data.couplePosts.map((post) => {
            const ownerProfile = postProfile(post);
            const liked = (post.likes ?? []).includes(profile);
            const likeNames = (post.likes ?? []).map(profileLabel);
            const comments = post.comments ?? [];
            return (
              <article key={post.id} className="moment-item">
                <ProfileAvatar data={data} profile={ownerProfile} className="moment-avatar" />
                <div className="moment-body">
                  <strong className="moment-author">{post.author}</strong>
                  {post.text && <p className="moment-text">{post.text}</p>}
                  <MomentPhotoGrid photoIds={post.photoIds ?? []} photos={photos} onOpen={setPreview} />
                  {post.mood && <span className="moment-mood">#{post.mood}</span>}
                  <div className="moment-meta">
                    <time>{new Date(post.createdAt).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}</time>
                    <div className="moment-actions">
                      <button className={liked ? "liked" : ""} onClick={() => toggleLike(post.id)}>♡ <span>{liked ? "取消" : "赞"}</span></button>
                      <button onClick={() => beginComment(post.id)}>•• <span>评论</span></button>
                    </div>
                  </div>
                  {(likeNames.length > 0 || comments.length > 0) && (
                    <div className="moment-social">
                      {likeNames.length > 0 && <p className="moment-likes">♡ {likeNames.join("，")}</p>}
                      {comments.map((comment) => <p key={comment.id} className="moment-comment"><strong>{comment.author}：</strong>{comment.text}</p>)}
                    </div>
                  )}
                  {commentingPostId === post.id && (
                    <form className="moment-comment-form" onSubmit={(event) => submitComment(event, post.id)}>
                      <input autoFocus value={commentText} onChange={(event) => setCommentText(event.target.value)} placeholder={`回复 ${post.author}`} maxLength={300} />
                      <button type="submit" disabled={!commentText.trim()}>发送</button>
                    </form>
                  )}
                </div>
              </article>
            );
          })}
          {!data.couplePosts.length && <div className="moments-empty"><Icon name="camera" size={30} /><strong>还没有朋友圈</strong><p>点右上角相机，分享第一条只属于你们的动态。</p></div>}
        </main>
      </div>
      {publisherOpen && <MomentPublisher author={author} profile={profile} notify={notify} onClose={() => setPublisherOpen(false)} onPublish={publish} />}
      {preview && <button className="moment-image-preview" onClick={() => setPreview("")}><img src={preview} alt="朋友圈图片预览" /><span><Icon name="close" size={20} /></span></button>}
    </div>
  );
}

function ChatPage({
  data,
  updateData,
  notify,
  onBack
}: {
  data: AppData;
  updateData: (updater: (current: AppData) => AppData) => void;
  notify: (message: string) => void;
  onBack: () => void;
}) {
  const profile = data.settings.activeProfile ?? "ru";
  const author = profile === "ru" ? data.settings.ownerName || "娜娜" : data.settings.partnerName || "陶陶";
  const other = profile === "ru" ? data.settings.partnerName || "陶陶" : data.settings.ownerName || "娜娜";
  const [text, setText] = useState("");
  const [photos, setPhotos] = useState<Record<string, string>>({});
  const listRef = useRef<HTMLDivElement>(null);
  const messages = data.coupleMessages;

  useEffect(() => {
    Promise.all(messages.filter((item) => item.photoId).map(async (item) => [item.id, await getPhoto(item.photoId)] as const))
      .then((entries) => setPhotos(entries.reduce<Record<string, string>>((result, [id, value]) => {
        if (value) result[id] = value;
        return result;
      }, {})));
  }, [messages]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length, photos]);

  function sendText(event: FormEvent) {
    event.preventDefault();
    if (!text.trim()) return;
    updateData((current) => ({
      ...current,
      coupleMessages: [...current.coupleMessages, {
        id: uid("chat"),
        author,
        text: text.trim(),
        type: "text",
        status: current.syncState?.enabled ? "sending" : "synced",
        createdAt: new Date().toISOString()
      }]
    }));
    setText("");
  }

  async function sendImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await fileToDataUrl(file);
      const photoId = uid("chat-photo");
      await savePhoto(photoId, dataUrl);
      const messageId = uid("chat");
      setPhotos((current) => ({ ...current, [messageId]: dataUrl }));
      updateData((current) => ({
        ...current,
        coupleMessages: [...current.coupleMessages, {
          id: messageId,
          author,
          text: "图片",
          type: "image",
          photoId,
          status: current.syncState?.enabled ? "sending" : "synced",
          createdAt: new Date().toISOString()
        }]
      }));
    } catch {
      notify("图片发送失败，请换一张再试");
    } finally {
      event.target.value = "";
    }
  }

  function retry(id: string) {
    updateData((current) => ({ ...current, coupleMessages: current.coupleMessages.map((item) => item.id === id ? { ...item, status: current.syncState?.enabled ? "sending" : "synced" } : item) }));
  }

  return (
    <div className="chat-page-v3">
      <header className="wechat-header"><button onClick={onBack}><ChevronLeft size={20} /></button><div><strong>{other}</strong><small>共享空间</small></div><span>•••</span></header>
      <div className="wechat-messages" ref={listRef}>
        {messages.map((message, index) => {
          const mine = message.author === author;
          const previous = messages[index - 1];
          const showTime = !previous || new Date(message.createdAt).getTime() - new Date(previous.createdAt).getTime() > 5 * 60 * 1000;
          return (
            <div key={message.id} className="wechat-message-block">
              {showTime && <time>{new Date(message.createdAt).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}</time>}
              <div className={`wechat-row ${mine ? "mine" : ""}`}>
                <ProfileAvatar data={data} profile={mine ? profile : profile === "ru" ? "taotao" : "ru"} className="wechat-avatar" />
                <div className={`wechat-bubble ${message.type === "image" ? "image" : ""}`}>
                  {message.type === "image" && photos[message.id] ? <img src={photos[message.id]} alt="聊天图片" /> : <p>{message.text}</p>}
                </div>
                {mine && <button className={`message-status ${message.status || "synced"}`} onClick={() => message.status === "failed" && retry(message.id)}>{message.status === "sending" ? "发送中" : message.status === "failed" ? "重试" : "✓"}</button>}
              </div>
            </div>
          );
        })}
        {!messages.length && <p className="chat-empty">从一句“今天怎么样”开始吧。</p>}
      </div>
      <footer className="wechat-composer">
        <label className="chat-image-button"><Icon name="camera" size={20} /><input type="file" accept="image/*" onChange={sendImage} /></label>
        <form onSubmit={sendText}><input value={text} onChange={(event) => setText(event.target.value)} placeholder="发消息" /><button type="button" onClick={() => setText((current) => `${current}♡`)}>☺</button><button type="submit">发送</button></form>
      </footer>
    </div>
  );
}

function MemoryPhotos({ ids = [] }: { ids?: string[] }) {
  const [photos, setPhotos] = useState<string[]>([]);
  useEffect(() => {
    Promise.all(ids.map((id) => getPhoto(id))).then((items) => setPhotos(items.filter((item): item is string => Boolean(item))));
  }, [ids.join("|")]);
  if (!photos.length) return null;
  return <div className="memory-photo-grid">{photos.map((photo, index) => <img key={`${index}-${photo.slice(-12)}`} src={photo} alt="共同回忆" />)}</div>;
}

function CalendarPage({ data, updateData, notify }: { data: AppData; updateData: (updater: (current: AppData) => AppData) => void; notify: (message: string) => void }) {
  const now = new Date();
  const [cursor, setCursor] = useState(new Date(now.getFullYear(), now.getMonth(), 1));
  const [selectedDate, setSelectedDate] = useState(localDate());
  const [editorOpen, setEditorOpen] = useState(false);
  const [eventKind, setEventKind] = useState<CoupleEventKind>("anniversary");
  const [editingEventId, setEditingEventId] = useState("");
  const [eventTitle, setEventTitle] = useState("");
  const [eventNote, setEventNote] = useState("");
  const [memoryEventId, setMemoryEventId] = useState("");
  const [memoryText, setMemoryText] = useState("");
  const cells = monthCells(cursor.getFullYear(), cursor.getMonth());
  const records = new Set(data.checkIns.filter((item) => item.completed).map((item) => item.date));
  const reports = new Set(data.reports.map((item) => item.date));
  const coupleDates = new Set(data.coupleEvents.map((item) => item.date));
  const dayEvents = data.coupleEvents.filter((item) => item.date === selectedDate).sort((a, b) => (a.startTime || "").localeCompare(b.startTime || ""));
  const author = (data.settings.activeProfile ?? "ru") === "ru" ? data.settings.ownerName || "娜娜" : data.settings.partnerName || "陶陶";

  function saveEvent(event: FormEvent) {
    event.preventDefault();
    if (!eventTitle.trim()) return;
    const at = new Date().toISOString();
    updateData((current) => ({
      ...current,
      coupleEvents: editingEventId
        ? current.coupleEvents.map((item) => item.id === editingEventId ? { ...item, kind: eventKind, title: eventTitle.trim(), date: selectedDate, note: eventNote.trim(), updatedAt: at } : item)
        : [{ id: uid("event"), kind: eventKind, title: eventTitle.trim(), date: selectedDate, note: eventNote.trim(), author, createdAt: at, updatedAt: at }, ...current.coupleEvents]
    }));
    setEventTitle("");
    setEventNote("");
    setEditingEventId("");
    setEditorOpen(false);
  }

  async function addMemoryPhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file || !memoryEventId) return;
    try {
      const photoId = uid("memory-photo");
      await savePhoto(photoId, await fileToDataUrl(file));
      updateData((current) => ({ ...current, coupleEvents: current.coupleEvents.map((item) => item.id === memoryEventId ? { ...item, memoryPhotoIds: [...(item.memoryPhotoIds ?? []), photoId], memoryUpdatedAt: new Date().toISOString(), updatedAt: new Date().toISOString() } : item) }));
      notify("共同回忆照片已加入");
    } finally {
      event.target.value = "";
    }
  }

  function saveMemory(event: FormEvent) {
    event.preventDefault();
    if (!memoryEventId || !memoryText.trim()) return;
    updateData((current) => ({ ...current, coupleEvents: current.coupleEvents.map((item) => item.id === memoryEventId ? { ...item, memoryText: memoryText.trim(), memoryUpdatedAt: new Date().toISOString(), updatedAt: new Date().toISOString() } : item) }));
    setMemoryText("");
    setMemoryEventId("");
  }
  return (
    <div className="page calendar-page">
      <PageHeader eyebrow="OUR CALENDAR" title="公共日历" action={<button className="round-icon-button" onClick={() => setEditorOpen(true)}><Plus size={18} /></button>} />
      <section className="calendar-card">
        <div className="month-nav">
          <button onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}><Icon name="chevron-left" /></button>
          <div><small>{cursor.getFullYear()}</small><strong>{cursor.getMonth() + 1} 月</strong></div>
          <button onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}><Icon name="chevron-right" /></button>
        </div>
        <div className="weekdays">{["一", "二", "三", "四", "五", "六", "日"].map((day) => <span key={day}>{day}</span>)}</div>
        <div className="calendar-grid">
          {cells.map((date, index) => date ? (
            <button key={date} className={`${date === selectedDate ? "selected" : ""} ${date === localDate() ? "today" : ""} ${reports.has(date) ? "reported" : records.has(date) ? "active" : ""} ${coupleDates.has(date) ? "love-date" : ""}`} onClick={() => setSelectedDate(date)}>
              <span>{parseLocalDate(date).getDate()}</span>{(reports.has(date) || coupleDates.has(date)) && <i>{coupleDates.has(date) ? "♥" : "✦"}</i>}
            </button>
          ) : <span key={`empty-${index}`} />)}
        </div>
        <div className="calendar-legend"><span><i className="dot active" />有记录</span><span><i className="dot reported" />日报</span><span><i className="dot love" />纪念/见面</span></div>
      </section>
      <section className="calendar-day-detail">
        <div className="section-heading"><div><p>{selectedDate}</p><h2>这一天的共同安排</h2></div><button onClick={() => setEditorOpen(true)}>新增</button></div>
        {dayEvents.map((item) => <article key={item.id}><span>{item.kind === "anniversary" ? "纪念日" : item.kind === "meet" ? "见面" : item.kind === "date" ? "约会" : "事项"}</span><h3>{item.title}</h3><p>{item.note || "属于我们的一件事"}</p><small>{item.author || "双方"}创建</small>{item.memoryText && <blockquote>我们做了：{item.memoryText}</blockquote>}<MemoryPhotos ids={item.memoryPhotoIds} /><button onClick={() => { setMemoryEventId(item.id); setMemoryText(item.memoryText || ""); }}>补充共同回忆</button><button onClick={() => { setEditingEventId(item.id); setEventKind(item.kind); setEventTitle(item.title); setEventNote(item.note); setEditorOpen(true); }}>编辑事项</button></article>)}
        {!dayEvents.length && <p className="empty-inline">这一天还没有共同安排。</p>}
      </section>
      <section className="memory-list">
        <div className="section-heading"><div><p>MEMORIES</p><h2>这个月的心意</h2></div></div>
        {data.reports.filter((report) => {
          const date = parseLocalDate(report.date);
          return date.getFullYear() === cursor.getFullYear() && date.getMonth() === cursor.getMonth();
        }).sort((a, b) => b.date.localeCompare(a.date)).map((report) => (
          <button key={report.id} onClick={() => setSelectedDate(report.date)}>
            <span className="memory-date"><strong>{parseLocalDate(report.date).getDate()}</strong><small>{cursor.getMonth() + 1}月</small></span>
            <span><strong>{report.mood}</strong><small>{report.lifeNote || "这一天被认真地记住了"}</small></span>
            <Icon name="arrow" />
          </button>
        ))}
        {!data.reports.some((report) => parseLocalDate(report.date).getMonth() === cursor.getMonth() && parseLocalDate(report.date).getFullYear() === cursor.getFullYear()) && (
          <div className="empty-state"><span>✦</span><h3>这个月还在等待故事</h3><p>完成一份日报，它就会在这里开花。</p></div>
        )}
      </section>
      <section className="memory-list anniversary-timeline">
        <div className="section-heading"><div><p>OUR YEARS</p><h2>纪念日时间线</h2></div></div>
        {data.coupleEvents.filter((item) => item.kind === "anniversary" && item.memoryText).sort((a, b) => b.date.localeCompare(a.date)).map((item) => (
          <button key={item.id} onClick={() => setSelectedDate(item.date)}>
            <span className="memory-date"><strong>{parseLocalDate(item.date).getDate()}</strong><small>{parseLocalDate(item.date).getFullYear()}</small></span>
            <span><strong>{item.title}</strong><small>{item.memoryText}</small></span>
            <Icon name="arrow" />
          </button>
        ))}
      </section>
      {editorOpen && <Modal onClose={() => { setEditorOpen(false); setEditingEventId(""); }}><form className="timer-confirm-form" onSubmit={saveEvent}><h2>{editingEventId ? "编辑共同事项" : "新增共同事项"}</h2><select value={eventKind} onChange={(event) => setEventKind(event.target.value as CoupleEventKind)}><option value="anniversary">纪念日</option><option value="meet">见面</option><option value="date">约会</option><option value="call">通话</option><option value="custom">其他</option></select><input type="date" value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)} /><input value={eventTitle} onChange={(event) => setEventTitle(event.target.value)} placeholder="事项标题" /><textarea value={eventNote} onChange={(event) => setEventNote(event.target.value)} placeholder="时间、地点或想说的话" /><button type="submit">保存到公共日历</button></form></Modal>}
      {memoryEventId && <Modal onClose={() => setMemoryEventId("")}><form className="timer-confirm-form" onSubmit={saveMemory}><h2>这一天我们做了什么</h2><textarea value={memoryText} onChange={(event) => setMemoryText(event.target.value)} placeholder="一起去了哪里、做了什么、有什么值得记住" /><label className="memory-photo-add"><Icon name="camera" /> 添加回忆照片<input type="file" accept="image/*" onChange={addMemoryPhoto} /></label><button type="submit">保存共同回忆</button></form></Modal>}
    </div>
  );
}

function GrowthPage({ data, now, updateData }: { data: AppData; now: Date; updateData: (updater: (current: AppData) => AppData) => void }) {
  const profile = data.settings.activeProfile ?? "ru";
  const [giftOpen, setGiftOpen] = useState(false);
  const [giftName, setGiftName] = useState("");
  const [giftDescription, setGiftDescription] = useState("");
  const [giftReward, setGiftReward] = useState("");
  const [giftTarget, setGiftTarget] = useState(1);
  const badges = buildBadges(data);
  const streak = calculateStreak(data.checkIns, data.reports);
  const activeDays = new Set(data.checkIns.filter((item) => item.completed).map((item) => item.date)).size;
  const minutes = Math.floor(totalStudySeconds(data, now) / 60);
  const todayMinutes = Math.floor(todayStudySeconds(data, localDate(), now) / 60);
  const recentSessions = (data.studySessions ?? []).slice(0, 5);
  /*
  const oldMinutes = data.checkIns.reduce((sum, item) => {
    const habit = data.habits.find((candidate) => candidate.id === item.habitId);
    return sum + (item.completed && habit?.unit === "分钟" ? item.value : 0);
  }, 0);
  */
  const weekly = weeklyCompletion(data, localDate());
  function saveGift(event: FormEvent) {
    event.preventDefault();
    if (!giftName.trim()) return;
    const at = new Date().toISOString();
    updateData((current) => ({ ...current, customBadgeGifts: [{ id: uid("badge-gift"), giver: profile, receiver: profile === "ru" ? "taotao" : "ru", name: giftName.trim(), description: giftDescription.trim(), target: giftTarget, progress: 0, gift: giftReward.trim(), completed: false, claimed: false, createdAt: at, updatedAt: at }, ...current.customBadgeGifts] }));
    setGiftName(""); setGiftDescription(""); setGiftReward(""); setGiftOpen(false);
  }
  return (
    <div className="page growth-page">
      <PageHeader eyebrow="A LITTLE BETTER" title="看见自己的成长" />
      <section className="growth-hero">
        <div className="growth-ring" style={{ "--progress": `${weekly * 3.6}deg` } as React.CSSProperties}><div><strong>{weekly}%</strong><span>本周完成</span></div></div>
        <div><p>THIS WEEK</p><h2>{weekly >= 80 ? "这一周，闪闪发光" : "每一点坚持都在发生"}</h2><span>不和别人比较，只看见自己的脚步。</span></div>
      </section>
      <section className="stat-grid">
        <div><small>连续成长</small><strong>{streak}<span> 天</span></strong><p>最长的路，从今天继续</p></div>
        <div><small>累计专注</small><strong>{minutes}<span> 分钟</span></strong><p>时间会记得每次认真</p></div>
        <div><small>有记录的日子</small><strong>{activeDays}<span> 天</span></strong><p>生活正在一点点丰盈</p></div>
      </section>
      <div className="section-heading"><div><p>OUR GIFTS</p><h2>成长徽章与礼物</h2></div><button onClick={() => setGiftOpen(true)}>送一枚</button></div>
      <section className="custom-gift-list">
        {data.customBadgeGifts.map((item) => {
          const receiving = item.receiver === profile;
          return <article key={item.id} className={item.completed ? "completed" : ""}><span className="gift-medal">★</span><div><small>{item.giver === "ru" ? "娜娜" : "陶陶"}送给{item.receiver === "ru" ? "娜娜" : "陶陶"}</small><h3>{item.name}</h3><p>{item.description || "完成约定后点亮"}</p><strong>礼物：{item.gift || "一个认真准备的惊喜"}</strong></div><div className="gift-actions">{!item.completed && receiving && <button onClick={() => updateData((current) => ({ ...current, customBadgeGifts: current.customBadgeGifts.map((gift) => gift.id === item.id ? { ...gift, progress: gift.target, completed: true, updatedAt: new Date().toISOString() } : gift) }))}>标记完成</button>}{item.completed && receiving && !item.claimed && <button onClick={() => updateData((current) => ({ ...current, customBadgeGifts: current.customBadgeGifts.map((gift) => gift.id === item.id ? { ...gift, claimed: true, updatedAt: new Date().toISOString() } : gift) }))}>领取礼物</button>}<small>{item.claimed ? "已领取" : item.completed ? "待领取" : `${item.progress}/${item.target}`}</small></div></article>;
        })}
        {!data.customBadgeGifts.length && <p className="empty-inline">给对方定制一枚只属于你们的勋章吧。</p>}
      </section>
      <div className="section-heading"><div><p>SYSTEM BADGES</p><h2>自动成长徽章</h2></div><span>{badges.filter((item) => item.unlocked).length}/{badges.length} 点亮</span></div>
      {!!recentSessions.length && (
        <section className="recent-study-card">
          <div className="section-heading"><div><p>STUDY LOG</p><h2>最近学习会话</h2></div><span>今日 {todayMinutes} 分钟</span></div>
          {recentSessions.map((session) => (
            <div key={session.id}><strong>{session.title}</strong><span>{session.date} · {formatDuration(session.durationSeconds)}</span><small>{session.note || "已记录到本地"}</small></div>
          ))}
        </section>
      )}
      <section className="badge-list">
        {badges.map((badge) => (
          <div key={badge.id} className={badge.unlocked ? "unlocked" : ""}>
            <span className="badge-symbol">{badge.icon === "flower" ? "✿" : badge.icon === "star" ? "★" : badge.icon === "seed" ? "◇" : badge.icon === "bloom" ? "❀" : badge.icon === "chat" ? "☏" : badge.icon === "book" ? "▣" : badge.icon === "meal" ? "◌" : badge.icon === "timer" ? "◷" : "✦"}</span>
            <span className="badge-copy"><strong>{badge.name}</strong><small>{badge.description}</small><i><b style={{ width: `${(badge.progress / badge.target) * 100}%` }} /></i></span>
            <span className="badge-count">{badge.unlocked ? "已点亮" : `${badge.progress}/${badge.target}`}</span>
          </div>
        ))}
      </section>
      {giftOpen && <Modal onClose={() => setGiftOpen(false)}><form className="timer-confirm-form" onSubmit={saveGift}><h2>送给{profile === "ru" ? "陶陶" : "娜娜"}一枚勋章</h2><input value={giftName} onChange={(event) => setGiftName(event.target.value)} placeholder="勋章名称" /><textarea value={giftDescription} onChange={(event) => setGiftDescription(event.target.value)} placeholder="完成条件或想说的话" /><input type="number" min="1" value={giftTarget} onChange={(event) => setGiftTarget(Number(event.target.value))} placeholder="目标次数" /><input value={giftReward} onChange={(event) => setGiftReward(event.target.value)} placeholder="完成后的礼物" /><button type="submit">送出勋章</button></form></Modal>}
    </div>
  );
}

function AutomationPage({
  data,
  updateData,
  onBack,
  onRefresh,
  refreshing
}: {
  data: AppData;
  updateData: (updater: (current: AppData) => AppData) => void;
  onBack: () => void;
  onRefresh: () => void;
  refreshing: boolean;
}) {
  const [editing, setEditing] = useState<AutomationRule | "new" | null>(null);
  const today = localDate();
  const todayBrief = data.dailyBriefs.find((item) => item.date === today);
  const nextRuns = data.automationRuns
    .filter((item) => item.date >= today)
    .sort((a, b) => `${a.date} ${data.automations.find((rule) => rule.id === a.ruleId)?.time ?? ""}`.localeCompare(`${b.date} ${data.automations.find((rule) => rule.id === b.ruleId)?.time ?? ""}`))
    .slice(0, 5);

  return (
    <div className="page automation-page">
      <PageHeader
        eyebrow="TODAY REMINDERS"
        title="今日提醒"
        action={<button className="round-icon-button" onClick={onBack} title="返回今日"><ChevronLeft size={20} /></button>}
      />
      <section className="automation-summary">
        <div className="automation-summary-icon"><WandSparkles size={28} /></div>
        <div>
          <small>未来 7 天已缓存</small>
          <h2>{data.automations.filter((item) => item.enabled).length} 条提醒正在陪伴今天</h2>
          <p>{todayBrief ? `今日寄语由${todayBrief.source === "deepseek" ? " DeepSeek" : "本地温柔文案"}生成。` : "打开应用后会刷新天气、寄语和通知。"}</p>
        </div>
        <button onClick={onRefresh} disabled={refreshing} title="立即刷新"><RefreshCw size={18} className={refreshing ? "spin" : ""} /></button>
      </section>

      <div className="section-heading automation-heading">
        <div><p>MY REMINDERS</p><h2>提醒清单</h2></div>
        <button className="compact-command" onClick={() => setEditing("new")}><Plus size={16} /> 新建</button>
      </div>
      <section className="automation-list">
        {data.automations.map((rule) => {
          const icon = rule.kind === "weather" ? <Sun /> : rule.kind === "companion" ? <HeartHandshake /> : rule.kind === "food" ? <Sparkles /> : <CalendarClock />;
          return (
            <article key={rule.id} className={`automation-card kind-${rule.kind} ${rule.enabled ? "" : "disabled"}`}>
              <button className="automation-card-main" onClick={() => setEditing(rule)}>
                <span className="automation-kind-icon">{icon}</span>
                <span>
                  <strong>{rule.title}</strong>
                  <small>{rule.time} · {rule.days.length === 7 ? "每天" : `每周 ${rule.days.length} 天`} · {rule.tone}</small>
                  <p>{rule.prompt}</p>
                </span>
              </button>
              <label className="cute-switch" title={rule.enabled ? "关闭" : "开启"}>
                <input
                  type="checkbox"
                  checked={rule.enabled}
                  onChange={(event) => updateData((current) => ({
                    ...current,
                    automations: current.automations.map((item) => item.id === rule.id ? { ...item, enabled: event.target.checked } : item)
                  }))}
                  onClick={() => window.setTimeout(onRefresh, 0)}
                />
                <i />
              </label>
            </article>
          );
        })}
      </section>

      <div className="section-heading automation-heading">
        <div><p>NEXT UP</p><h2>接下来会送达</h2></div>
      </div>
      <section className="upcoming-list">
        {nextRuns.map((run) => {
          const rule = data.automations.find((item) => item.id === run.ruleId);
          return (
            <div key={run.id}>
              <span><Bell size={16} /></span>
              <p><strong>{run.title}</strong><small>{run.date} · {rule?.time} · {run.status === "scheduled" ? "已排好通知" : "内容已缓存"}</small></p>
            </div>
          );
        })}
        {!nextRuns.length && <p className="automation-empty">还没有排好的提醒，点一下右上角刷新吧。</p>}
      </section>

      <section className="automation-location">
        <MapPin size={18} />
        <div><strong>天气位置</strong><span>优先设备定位，失败时使用“{data.settings.weatherFallbackCity || "天津"}”。</span></div>
      </section>

      {editing && (
        <AutomationEditor
          rule={editing === "new" ? undefined : editing}
          onClose={() => setEditing(null)}
          onSave={(rule) => {
            updateData((current) => ({
              ...current,
              automations: [...current.automations.filter((item) => item.id !== rule.id), rule]
            }));
            setEditing(null);
            window.setTimeout(onRefresh, 0);
          }}
          onDelete={editing === "new" ? undefined : () => {
            updateData((current) => ({
              ...current,
              automations: current.automations.filter((item) => item.id !== editing.id),
              automationRuns: current.automationRuns.filter((item) => item.ruleId !== editing.id)
            }));
            setEditing(null);
            window.setTimeout(onRefresh, 0);
          }}
        />
      )}
    </div>
  );
}

function AutomationEditor({
  rule,
  onClose,
  onSave,
  onDelete
}: {
  rule?: AutomationRule;
  onClose: () => void;
  onSave: (rule: AutomationRule) => void;
  onDelete?: () => void;
}) {
  const [title, setTitle] = useState(rule?.title ?? "娜娜的小提醒");
  const [prompt, setPrompt] = useState(rule?.prompt ?? "写一句简短、温柔、可执行的提醒。");
  const [time, setTime] = useState(rule?.time ?? "09:00");
  const [days, setDays] = useState(rule?.days ?? [0, 1, 2, 3, 4, 5, 6]);
  const [tone, setTone] = useState<AutomationTone>(rule?.tone ?? "温柔");
  const [webSearch, setWebSearch] = useState(rule?.webSearch ?? false);
  const [notify, setNotify] = useState(rule?.notify ?? true);
  const dayNames = ["日", "一", "二", "三", "四", "五", "六"];

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!title.trim() || !prompt.trim() || !days.length) return;
    onSave({
      id: rule?.id ?? uid("automation"),
      kind: rule?.kind ?? "custom",
      enabled: rule?.enabled ?? true,
      title: title.trim(),
      prompt: prompt.trim(),
      time,
      days,
      tone,
      webSearch,
      notify,
      createdAt: rule?.createdAt ?? new Date().toISOString()
    });
  }

  return (
    <Modal onClose={onClose}>
      <div className="modal-handle" />
      <div className="automation-editor-title"><span><WandSparkles size={21} /></span><div><small>REMINDER</small><h2>{rule ? "编辑提醒" : "新建提醒"}</h2></div></div>
      <form className="automation-editor" onSubmit={submit}>
        <label>标题<input value={title} maxLength={24} onChange={(event) => setTitle(event.target.value)} /></label>
        <label>它每天要做什么<textarea value={prompt} maxLength={240} onChange={(event) => setPrompt(event.target.value)} /></label>
        <div className="automation-editor-grid">
          <label>送达时间<input type="time" value={time} onChange={(event) => setTime(event.target.value)} /></label>
          <label>语气<select value={tone} onChange={(event) => setTone(event.target.value as AutomationTone)}>{(["励志", "幽默", "安慰", "温柔"] as const).map((item) => <option key={item}>{item}</option>)}</select></label>
        </div>
        <span className="automation-field-label">重复星期</span>
        <div className="automation-days">
          {dayNames.map((name, index) => <button type="button" key={name} className={days.includes(index) ? "selected" : ""} onClick={() => setDays((current) => current.includes(index) ? current.filter((day) => day !== index) : [...current, index])}>{name}</button>)}
        </div>
        <div className="automation-options">
          <label><input type="checkbox" checked={webSearch} onChange={(event) => setWebSearch(event.target.checked)} /> 联网找一点新鲜素材</label>
          <label><input type="checkbox" checked={notify} onChange={(event) => setNotify(event.target.checked)} /> 生成系统通知</label>
        </div>
        <button className="primary-button" type="submit">保存提醒 <Sparkles size={17} /></button>
        {onDelete && <button className="automation-delete" type="button" onClick={onDelete}><Trash2 size={16} /> 删除这条自动化</button>}
      </form>
    </Modal>
  );
}

function SettingsPage({
  data,
  updateData,
  notify
}: {
  data: AppData;
  updateData: (updater: (current: AppData) => AppData) => void;
  notify: (message: string) => void;
}) {
  const [editing, setEditing] = useState<Habit | "new" | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [cloudUsername, setCloudUsername] = useState("");
  const [cloudPassword, setCloudPassword] = useState("");
  const [cloudSpace, setCloudSpace] = useState(data.syncState?.spaceId ?? "");
  const [cloudJoinMode, setCloudJoinMode] = useState<"create" | "join">("create");
  const [cloudInviteCode, setCloudInviteCode] = useState("");
  const [cloudBusy, setCloudBusy] = useState(false);
  const importRef = useRef<HTMLInputElement>(null);

  async function signInCloud() {
    if (cloudJoinMode === "join" && (!cloudSpace.trim() || !cloudInviteCode.trim())) {
      notify("加入共享空间需要填写空间 ID 和邀请码");
      return;
    }
    setCloudBusy(true);
    try {
      const state = await loginCloud(cloudUsername, cloudPassword, cloudSpace, "member", cloudJoinMode === "join" ? cloudInviteCode : undefined);
      updateData((current) => ({ ...current, syncState: state }));
      notify("阿里云同步服务已登录");
    } catch (error) {
      notify(error instanceof Error ? error.message : "阿里云同步服务登录失败");
    } finally {
      setCloudBusy(false);
      setCloudPassword("");
    }
  }

  async function signOutCloud() {
    const state = await logoutCloud();
    updateData((current) => ({ ...current, syncState: state }));
    notify("已退出阿里云同步服务");
  }

  async function pushCloud() {
    setCloudBusy(true);
    try {
      const synced = await syncToCloud(data);
      updateData(() => synced);
      notify(synced.syncState?.status === "synced" ? "已同步到阿里云" : synced.syncState?.lastError || "同步未完成");
    } finally {
      setCloudBusy(false);
    }
  }

  async function pullCloud() {
    setCloudBusy(true);
    try {
      const pulled = await pullFromCloud(data);
      updateData(() => pulled);
      notify("已从阿里云拉取最新记录");
    } catch (error) {
      notify(error instanceof Error ? error.message : "拉取云端数据失败");
    } finally {
      setCloudBusy(false);
    }
  }

  async function exportBackup() {
    const backup = await createBackup(data);
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `成长手账备份-${localDate()}.json`;
    link.click();
    URL.revokeObjectURL(link.href);
    notify("备份已经下载完成");
  }

  async function importBackup(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const restored = await restoreBackup(JSON.parse(await file.text()));
      updateData(() => restored);
      notify("记录与照片已经完整恢复");
    } catch (error) {
      notify(error instanceof Error ? error.message : "备份恢复失败");
    }
    event.target.value = "";
  }

  async function updateAvatar(profile: ProfileId, event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await fileToDataUrl(file);
      const photoId = uid(`avatar-${profile}`);
      await savePhoto(photoId, dataUrl);
      updateData((current) => ({
        ...current,
        settings: {
          ...current.settings,
          ...(profile === "ru" ? { ownerAvatarPhotoId: photoId } : { partnerAvatarPhotoId: photoId })
        }
      }));
      notify("头像已经更新");
    } catch {
      notify("头像更新失败，请换一张图片再试");
    } finally {
      event.target.value = "";
    }
  }

  async function clearAll() {
    await clearPhotos();
    await removeStoredData();
    const fresh = await loadData();
    updateData(() => ({ ...fresh, settings: { ...fresh.settings, onboarded: true } }));
    setConfirmClear(false);
    notify("本机记录已全部清空");
  }

  return (
    <div className="page settings-page">
      <section className="settings-section cloud-sync-section">
        <div className="settings-title"><div><p>ALIYUN CLOUD</p><h2>云同步</h2></div><span className={`sync-pill ${data.syncState?.status ?? "signed-out"}`}>{data.syncState?.configured ? (data.syncState?.status ?? "idle") : "未配置"}</span></div>
        <div className="cloud-sync-card">
          <p>本地 IndexedDB 仍是主存储；阿里云服务器负责账号、共享空间、同步与备份。未配置或未登录时，应用照常离线使用。</p>
          {!data.syncState?.currentUser ? (
            <div className="cloud-login-grid">
              <input value={cloudUsername} onChange={(event) => setCloudUsername(event.target.value)} placeholder="用户名（首次登录自动注册）" />
              <input type="password" value={cloudPassword} onChange={(event) => setCloudPassword(event.target.value)} placeholder="密码（至少 8 位）" />
              <input value={cloudSpace} onChange={(event) => setCloudSpace(event.target.value)} placeholder="共享空间 ID（3-64 位）" />
              <select value={cloudJoinMode} onChange={(event) => setCloudJoinMode(event.target.value as "create" | "join")}>
                <option value="create">创建共享空间</option>
                <option value="join">使用邀请码加入</option>
              </select>
              {cloudJoinMode === "join" && <input value={cloudInviteCode} onChange={(event) => setCloudInviteCode(event.target.value)} placeholder="共享空间邀请码" />}
              <button type="button" onClick={signInCloud} disabled={cloudBusy || !cloudUsername.trim() || !cloudPassword || (cloudJoinMode === "join" && (!cloudSpace.trim() || !cloudInviteCode.trim()))}>登录</button>
            </div>
          ) : (
            <div className="cloud-account">
              <strong>{data.syncState.currentUser}</strong>
              <small>空间：{data.syncState.spaceId || "默认空间"} · 平等成员 · 待同步 {data.syncState.pendingJobs ?? 0}</small>
              {data.syncState.inviteCode && <small>邀请码：{data.syncState.inviteCode}</small>}
              <div className="cloud-actions">
                <button type="button" onClick={pushCloud} disabled={cloudBusy}>上传本机</button>
                <button type="button" onClick={pullCloud} disabled={cloudBusy}>拉取云端</button>
                <button type="button" onClick={signOutCloud} disabled={cloudBusy}>退出</button>
              </div>
            </div>
          )}
          {data.syncState?.lastError && <small className="sync-error">{data.syncState.lastError}</small>}
        </div>
      </section>
      <PageHeader eyebrow="YOUR LITTLE GARDEN" title="设置" />
      <section className="settings-section profile-switch-card">
        <div className="settings-title"><div><p>WHO IS USING</p><h2>当前空间</h2></div></div>
        <div className="provider-switch">
          <button className={(data.settings.activeProfile ?? "ru") === "ru" ? "active" : ""} onClick={() => updateData((current) => ({ ...current, settings: { ...current.settings, activeProfile: "ru" } }))}>娜娜的空间</button>
          <button className={data.settings.activeProfile === "taotao" ? "active" : ""} onClick={() => updateData((current) => ({ ...current, settings: { ...current.settings, activeProfile: "taotao" } }))}>陶陶的空间</button>
        </div>
        <p>双方拥有相同的共享权限，首页与个人任务按当前使用者展示。</p>
      </section>
      <section className="settings-section avatar-settings-card">
        <div className="settings-title"><div><p>OUR AVATARS</p><h2>聊天与朋友圈头像</h2></div></div>
        <div className="avatar-settings-grid">
          {(["ru", "taotao"] as ProfileId[]).map((profile) => (
            <label key={profile} className="avatar-picker">
              <ProfileAvatar data={data} profile={profile} />
              <span><strong>{profile === "ru" ? data.settings.ownerName || "娜娜" : data.settings.partnerName || "陶陶"}</strong><small>点击选择新头像</small></span>
              <Icon name="camera" size={18} />
              <input type="file" accept="image/*" onChange={(event) => void updateAvatar(profile, event)} />
            </label>
          ))}
        </div>
        <p>头像会用于聊天、朋友圈和互动入口，并随完整备份保存。</p>
      </section>
      <section className="settings-section">
        <div className="settings-title"><div><p>NANA PROFILE</p><h2>娜娜的专属信息</h2></div></div>
        <div className="profile-grid">
          <label><span>姓名</span><input value={data.settings.ownerName} onChange={(event) => updateData((current) => ({ ...current, settings: { ...current.settings, ownerName: event.target.value } }))} /></label>
          <label><span>当前体重</span><input type="number" step="0.1" value={data.settings.currentWeightJin} onChange={(event) => updateData((current) => ({ ...current, settings: { ...current.settings, currentWeightJin: Number(event.target.value) } }))} /><i>斤</i></label>
          <label><span>目标院校</span><input value={data.settings.targetSchool} onChange={(event) => updateData((current) => ({ ...current, settings: { ...current.settings, targetSchool: event.target.value } }))} /></label>
          <label><span>目标方向</span><input value={data.settings.targetMajor} onChange={(event) => updateData((current) => ({ ...current, settings: { ...current.settings, targetMajor: event.target.value } }))} /></label>
          <label><span>天气备用城市</span><input value={data.settings.weatherFallbackCity ?? "天津"} onChange={(event) => updateData((current) => ({ ...current, settings: { ...current.settings, weatherFallbackCity: event.target.value } }))} /></label>
        </div>
      </section>
      <section className="settings-section">
        <div className="settings-title"><div><p>AI STUDY</p><h2>AI 学习助手</h2></div></div>
        <div className="provider-switch">
          <button className={(data.settings.aiProvider ?? "deepseek") === "deepseek" ? "active" : ""} onClick={() => updateData((current) => ({ ...current, settings: { ...current.settings, aiProvider: "deepseek" } }))}>DeepSeek</button>
          <button className={data.settings.aiProvider === "qwen" ? "active" : ""} onClick={() => updateData((current) => ({ ...current, settings: { ...current.settings, aiProvider: "qwen" } }))}>千问</button>
        </div>
        <label className="api-key-box">
          <span>DeepSeek API Key</span>
          <input
            type="password"
            value={data.settings.deepSeekApiKey ?? ""}
            onChange={(event) => updateData((current) => ({ ...current, settings: { ...current.settings, deepSeekApiKey: event.target.value } }))}
            placeholder="不填写也能用内置计划"
          />
          <small>Key 只保存在当前设备。填入后，AI 智能体和每日陶陶寄语会调用 DeepSeek。</small>
        </label>
        <label className="api-key-box">
          <span>千问 API Key</span>
          <input type="password" value={data.settings.qwenApiKey ?? ""} onChange={(event) => updateData((current) => ({ ...current, settings: { ...current.settings, qwenApiKey: event.target.value } }))} placeholder="千问支持识图和文件处理" />
        </label>
        <details className="advanced-ai-settings">
          <summary>高级设置</summary>
        <div className="ai-settings-grid">
          <label className="api-key-box">
            <span>DeepSeek Base URL</span>
            <input value={data.settings.deepSeekBaseUrl ?? ""} onChange={(event) => updateData((current) => ({ ...current, settings: { ...current.settings, deepSeekBaseUrl: event.target.value } }))} />
          </label>
          <label className="api-key-box">
            <span>DeepSeek 模型</span>
            <input value={data.settings.deepSeekModel ?? "deepseek-v4-pro"} onChange={(event) => updateData((current) => ({ ...current, settings: { ...current.settings, deepSeekModel: event.target.value } }))} />
          </label>
          <label className="api-key-box">
            <span>DeepSeek 温度（非思考模式）</span>
            <input type="number" min="0" max="1.5" step="0.05" value={data.settings.deepSeekTemperature ?? 0.55} onChange={(event) => updateData((current) => ({ ...current, settings: { ...current.settings, deepSeekTemperature: Number(event.target.value) } }))} />
          </label>
          <label className="api-key-box">
            <span>最大输出 Tokens</span>
            <input type="number" min="2048" max="384000" step="1024" value={data.settings.deepSeekMaxOutputTokens ?? 65536} onChange={(event) => updateData((current) => ({ ...current, settings: { ...current.settings, deepSeekMaxOutputTokens: Number(event.target.value) } }))} />
          </label>
          <label className="api-key-box">
            <span>上下文字符预算</span>
            <input type="number" min="20000" max="1000000" step="10000" value={data.settings.agentContextLimitChars ?? 800000} onChange={(event) => updateData((current) => ({ ...current, settings: { ...current.settings, agentContextLimitChars: Number(event.target.value) } }))} />
          </label>
          <label className="api-key-box">
            <span>Serper API Key</span>
            <input type="password" value={data.settings.serperApiKey ?? ""} onChange={(event) => updateData((current) => ({ ...current, settings: { ...current.settings, serperApiKey: event.target.value } }))} placeholder="用于联网搜索" />
          </label>
          <label className="api-key-box">
            <span>Serper Endpoint</span>
            <input value={data.settings.serperEndpoint ?? "https://google.serper.dev/search"} onChange={(event) => updateData((current) => ({ ...current, settings: { ...current.settings, serperEndpoint: event.target.value } }))} />
          </label>
          <label className="api-key-box">
            <span>Qwen OCR API Key</span>
            <input type="password" value={data.settings.qwenApiKey ?? ""} onChange={(event) => updateData((current) => ({ ...current, settings: { ...current.settings, qwenApiKey: event.target.value } }))} placeholder="用于 qwen-vl-ocr 识图" />
          </label>
          <label className="api-key-box">
            <span>Qwen Base URL</span>
            <input value={data.settings.qwenBaseUrl ?? ""} onChange={(event) => updateData((current) => ({ ...current, settings: { ...current.settings, qwenBaseUrl: event.target.value } }))} />
          </label>
          <label className="api-key-box">
            <span>千问文字模型</span>
            <input value={data.settings.qwenChatModel ?? "qwen-max"} onChange={(event) => updateData((current) => ({ ...current, settings: { ...current.settings, qwenChatModel: event.target.value } }))} />
          </label>
          <label className="api-key-box">
            <span>千问视觉模型</span>
            <input value={data.settings.qwenVisionModel ?? "qwen-vl-max"} onChange={(event) => updateData((current) => ({ ...current, settings: { ...current.settings, qwenVisionModel: event.target.value } }))} />
          </label>
          <label className="api-key-box">
            <span>Qwen OCR 模型</span>
            <input value={data.settings.qwenOcrModel ?? "qwen-vl-ocr"} onChange={(event) => updateData((current) => ({ ...current, settings: { ...current.settings, qwenOcrModel: event.target.value } }))} />
          </label>
          <label className="api-key-box">
            <span>Qwen RAG 向量模型</span>
            <input value={data.settings.qwenEmbeddingModel ?? "text-embedding-v4"} onChange={(event) => updateData((current) => ({ ...current, settings: { ...current.settings, qwenEmbeddingModel: event.target.value } }))} />
          </label>
          <label className="api-key-box">
            <span>Qwen 向量维度</span>
            <input type="number" min="64" max="2048" step="64" value={data.settings.qwenEmbeddingDimensions ?? 256} onChange={(event) => updateData((current) => ({ ...current, settings: { ...current.settings, qwenEmbeddingDimensions: Number(event.target.value) } }))} />
          </label>
          <label className="api-key-box">
            <span>Qwen Rerank Endpoint</span>
            <input value={data.settings.qwenRerankEndpoint ?? ""} onChange={(event) => updateData((current) => ({ ...current, settings: { ...current.settings, qwenRerankEndpoint: event.target.value } }))} />
          </label>
          <label className="api-key-box">
            <span>Qwen Rerank 模型</span>
            <input value={data.settings.qwenRerankModel ?? "qwen3-rerank"} onChange={(event) => updateData((current) => ({ ...current, settings: { ...current.settings, qwenRerankModel: event.target.value } }))} />
          </label>
          <label className="api-key-box">
            <span>Qwen TTS Endpoint</span>
            <input value={data.settings.qwenTtsEndpoint ?? ""} onChange={(event) => updateData((current) => ({ ...current, settings: { ...current.settings, qwenTtsEndpoint: event.target.value } }))} />
          </label>
          <label className="api-key-box">
            <span>Qwen TTS 模型</span>
            <input value={data.settings.qwenTtsModel ?? "qwen3-tts-flash"} onChange={(event) => updateData((current) => ({ ...current, settings: { ...current.settings, qwenTtsModel: event.target.value } }))} />
          </label>
          <label className="api-key-box">
            <span>Qwen TTS 音色</span>
            <input value={data.settings.qwenTtsVoice ?? "Cherry"} onChange={(event) => updateData((current) => ({ ...current, settings: { ...current.settings, qwenTtsVoice: event.target.value } }))} />
          </label>
          <label className="api-key-box">
            <span>Agent 思考程度</span>
            <select value={data.settings.agentThinking ?? "deep"} onChange={(event) => updateData((current) => ({ ...current, settings: { ...current.settings, agentThinking: event.target.value as AppData["settings"]["agentThinking"] } }))}>
              <option value="light">轻量</option>
              <option value="balanced">均衡</option>
              <option value="deep">深入</option>
            </select>
          </label>
        </div>
        <div className="toggle-row">
          <label><input type="checkbox" checked={data.settings.agentWebSearch ?? false} onChange={(event) => updateData((current) => ({ ...current, settings: { ...current.settings, agentWebSearch: event.target.checked } }))} /> 联网搜索偏好</label>
          <label><input type="checkbox" checked={data.settings.agentFileUpload ?? false} onChange={(event) => updateData((current) => ({ ...current, settings: { ...current.settings, agentFileUpload: event.target.checked } }))} /> 上传文件上下文</label>
          <label><input type="checkbox" checked={data.settings.qwenRerankEnabled ?? true} onChange={(event) => updateData((current) => ({ ...current, settings: { ...current.settings, qwenRerankEnabled: event.target.checked } }))} /> Qwen 重排检索</label>
          <label><input type="checkbox" checked={data.settings.voiceOutput ?? true} onChange={(event) => updateData((current) => ({ ...current, settings: { ...current.settings, voiceOutput: event.target.checked } }))} /> 语音输出</label>
        </div>
        </details>
      </section>
      <section className="settings-section">
        <div className="settings-title"><div><p>FOOD MEMORY</p><h2>饮食助手记忆</h2></div></div>
        <label className="api-key-box">
          <span>长期不喜欢/需要规避</span>
          <textarea value={data.settings.foodAvoids ?? ""} onChange={(event) => updateData((current) => ({ ...current, settings: { ...current.settings, foodAvoids: event.target.value } }))} placeholder="例如：不喜欢香菜、最近少吃辣、避免太油" />
        </label>
        <label className="api-key-box">
          <span>最近不想吃</span>
          <textarea value={data.settings.foodRecentDislikes ?? ""} onChange={(event) => updateData((current) => ({ ...current, settings: { ...current.settings, foodRecentDislikes: event.target.value } }))} placeholder="例如：这周不想吃鸡胸、西兰花、燕麦" />
        </label>
      </section>
      <section className="settings-section">
        <div className="settings-title"><div><p>TAOTAO</p><h2>陪伴者信息</h2></div></div>
        <div className="profile-grid">
          <label><span>陪伴者姓名</span><input value={data.settings.partnerName} onChange={(event) => updateData((current) => ({ ...current, settings: { ...current.settings, partnerName: event.target.value } }))} /></label>
          <label><span>昵称</span><input value={data.settings.companionAlias ?? "陶陶"} onChange={(event) => updateData((current) => ({ ...current, settings: { ...current.settings, companionAlias: event.target.value } }))} /></label>
        </div>
      </section>
      <section className="settings-section">
        <div className="settings-title"><div><p>LEGACY HABITS</p><h2>旧任务兼容</h2></div><button onClick={() => setEditing("new")}><Icon name="plus" size={18} /> 新增</button></div>
        <div className="habit-settings-list">
          {data.habits.map((habit) => (
            <button key={habit.id} onClick={() => setEditing(habit)}>
              <span className="habit-icon" style={{ color: habit.color, background: `${habit.color}20` }}><Icon name={habit.icon} /></span>
              <span><strong>{habit.name}</strong><small>目标 {habit.target} {habit.unit} · 每周 {habit.days.length} 天</small></span>
              <Icon name="edit" size={18} />
            </button>
          ))}
        </div>
      </section>
      <section className="settings-section">
        <div className="settings-title"><div><p>COLOR MOOD</p><h2>花园色彩</h2></div></div>
        <div className="theme-picker">
          {([["rose", "玫瑰奶油"], ["peach", "暖杏日光"], ["sage", "鼠尾草绿"]] as const).map(([theme, name]) => (
            <button key={theme} className={`${theme} ${data.settings.theme === theme ? "selected" : ""}`} onClick={() => updateData((current) => ({ ...current, settings: { ...current.settings, theme } }))}><i /><span>{name}</span>{data.settings.theme === theme && <Icon name="check" size={16} />}</button>
          ))}
        </div>
      </section>
      <section className="settings-section">
        <div className="settings-title"><div><p>KEEP IT SAFE</p><h2>数据备份</h2></div></div>
        <button className="settings-row" onClick={exportBackup}><span><Icon name="download" /></span><span><strong>导出完整备份</strong><small>包含记录、设置与本机照片</small></span><Icon name="arrow" /></button>
        <button className="settings-row" onClick={() => importRef.current?.click()}><span><Icon name="upload" /></span><span><strong>从备份恢复</strong><small>将使用备份内容替换当前记录</small></span><Icon name="arrow" /></button>
        <input ref={importRef} hidden type="file" accept="application/json" onChange={importBackup} />
      </section>
      <section className="settings-section">
        <div className="settings-title"><div><p>PRIVACY</p><h2>隐私与数据</h2></div></div>
        <div className="privacy-box"><Icon name="lock" /><p><strong>密钥只保存在当前设备</strong><span>共享记录仅在登录云同步后上传；AI Key 不进入云同步或导出备份。</span></p></div>
        <button className="danger-row" onClick={() => setConfirmClear(true)}><Icon name="trash" /> 清空本机全部记录</button>
      </section>
      <footer className="app-footer"><span>花开有期</span><p>愿每一次记录，都让你更喜欢今天的自己。</p><small>VERSION 0.1 · LOCAL FIRST</small></footer>
      {editing && (
        <HabitEditor
          habit={editing === "new" ? undefined : editing}
          onClose={() => setEditing(null)}
          onSave={(habit) => {
            updateData((current) => ({ ...current, habits: [...current.habits.filter((item) => item.id !== habit.id), habit] }));
            setEditing(null);
            notify("小目标已经更新");
          }}
          onDelete={editing === "new" ? undefined : () => {
            if (!window.confirm(`将删除目标“${editing.name}”。已有打卡记录会保留，但不再显示目标信息。确认删除吗？`)) return;
            updateData((current) => ({ ...current, habits: current.habits.filter((item) => item.id !== editing.id) }));
            setEditing(null);
            notify("目标已删除");
          }}
        />
      )}
      {confirmClear && (
        <Modal onClose={() => setConfirmClear(false)}>
          <div className="confirm-content"><span className="warning-icon"><Icon name="trash" /></span><h2>确认清空全部数据？</h2><p>将删除以下本机内容：</p><ul><li>{data.checkIns.length} 条打卡记录</li><li>{data.reports.length} 份成长日报</li><li>所有日报照片</li><li>自定义目标与主题设置</li></ul><strong>此操作无法撤销，请先导出备份。</strong></div>
          <div className="confirm-actions"><button className="secondary-button" onClick={() => setConfirmClear(false)}>再想想</button><button className="danger-button" onClick={clearAll}>确认全部清空</button></div>
        </Modal>
      )}
    </div>
  );
}

function HabitEditor({
  habit,
  onClose,
  onSave,
  onDelete
}: {
  habit?: Habit;
  onClose: () => void;
  onSave: (habit: Habit) => void;
  onDelete?: () => void;
}) {
  const [name, setName] = useState(habit?.name ?? "");
  const [icon, setIcon] = useState<HabitIcon>(habit?.icon ?? "heart");
  const [unit, setUnit] = useState<HabitUnit>(habit?.unit ?? "分钟");
  const [target, setTarget] = useState(habit?.target ?? 30);
  const [days, setDays] = useState(habit?.days ?? [1, 2, 3, 4, 5]);
  const color = habit?.color ?? "#d9828d";
  function submit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim() || !days.length || target <= 0) return;
    onSave({ id: habit?.id ?? uid("habit"), name: name.trim(), icon, unit, target, days, color, createdAt: habit?.createdAt ?? new Date().toISOString() });
  }
  return (
    <Modal onClose={onClose}>
      <div className="modal-handle" />
      <h2 className="editor-title">{habit ? "编辑小目标" : "种下一个新目标"}</h2>
      <form className="habit-editor" onSubmit={submit}>
        <label className="field-label">目标名称<input className="soft-input single" value={name} maxLength={12} onChange={(event) => setName(event.target.value)} placeholder="例如：早睡、阅读、喝水" /></label>
        <label className="field-label">选择图标</label>
        <div className="icon-picker">{habitIcons.map((item) => <button type="button" key={item} className={icon === item ? "selected" : ""} onClick={() => setIcon(item)}><Icon name={item} /></button>)}</div>
        <div className="editor-two-cols">
          <label className="field-label">目标数值<input className="soft-input single" type="number" min="0.1" step="0.1" value={target} onChange={(event) => setTarget(Number(event.target.value))} /></label>
          <label className="field-label">计量单位<select className="soft-input single" value={unit} onChange={(event) => setUnit(event.target.value as HabitUnit)}>{units.map((item) => <option key={item}>{item}</option>)}</select></label>
        </div>
        <label className="field-label">每周哪几天</label>
        <div className="day-picker">{["日", "一", "二", "三", "四", "五", "六"].map((label, index) => <button type="button" className={days.includes(index) ? "selected" : ""} key={label} onClick={() => setDays((current) => current.includes(index) ? current.filter((day) => day !== index) : [...current, index])}>{label}</button>)}</div>
        <button className="primary-button" type="submit" disabled={!name.trim() || !days.length}>保存目标 <Icon name="check" /></button>
        {onDelete && <button className="text-button danger" type="button" onClick={onDelete}>删除这个目标</button>}
      </form>
    </Modal>
  );
}

function ShareModal({ data, date, onClose, notify }: { data: AppData; date: string; onClose: () => void; notify: (message: string) => void }) {
  const cardRef = useRef<HTMLDivElement>(null);
  const report = data.reports.find((item) => item.date === date);
  const checks = data.checkIns.filter((item) => item.date === date && item.completed);
  const [photos, setPhotos] = useState<Partial<Record<PhotoSlot, string>>>({});
  const [working, setWorking] = useState(false);
  useEffect(() => {
    const ids = report?.photoIds ?? (report?.photoId ? { selfie: report.photoId } : {});
    Promise.all((Object.entries(ids) as Array<[PhotoSlot, string | undefined]>).map(async ([slot, id]) => [slot, await getPhoto(id)] as const))
      .then((entries) => setPhotos(Object.fromEntries(entries.filter(([, value]) => value)) as Partial<Record<PhotoSlot, string>>));
  }, [report?.photoId, report?.photoIds]);

  async function makeImage(share: boolean) {
    if (!cardRef.current || !report) return;
    setWorking(true);
    try {
      const url = await toPng(cardRef.current, { pixelRatio: 2, cacheBust: true, backgroundColor: "#fffaf6" });
      const blob = await (await fetch(url)).blob();
      const file = new File([blob], `洳今日记录-${date}.png`, { type: "image/png" });
      if (share && navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ title: "洳今日记录", text: "今天也被认真记录了。", files: [file] });
      } else {
        const link = document.createElement("a");
        link.href = url;
        link.download = file.name;
        link.click();
        notify(share ? "当前浏览器不支持直接分享，图片已下载" : "可爱报告图已经下载");
      }
    } catch (error) {
      if ((error as Error).name !== "AbortError") notify("图片生成失败，请稍后再试");
    } finally {
      setWorking(false);
    }
  }

  if (!report) return null;
  return (
    <Modal onClose={onClose} wide>
      <div className="share-header"><div><p>SHARE TODAY</p><h2>把今天分享给陪伴者</h2></div></div>
      <div className="share-scroll">
        <div className="report-card nana-report-card" ref={cardRef}>
          <div className="report-card-top"><span>洳的今日记录</span><small>RU DAILY</small></div>
          <div className="report-date"><span>{parseLocalDate(date).getDate()}</span><div><strong>{parseLocalDate(date).getMonth() + 1} 月</strong><small>{friendlyDate(date).split(" ")[1]}</small></div></div>
          <h1>今天也在<br />认真生活</h1>
          <p className="report-mood">心情 · {report.mood}　体重 · {report.weightJin ?? data.settings.currentWeightJin}斤</p>
          {Object.keys(photos).length > 0 && (
            <div className="report-photo-collage">
              {(Object.entries(photos) as Array<[PhotoSlot, string]>).slice(0, 5).map(([slot, url]) => <img key={slot} src={url} alt="" />)}
            </div>
          )}
          <div className="report-meals">
            <span>早餐：{report.breakfast || "待补充"}</span>
            <span>午餐：{report.lunch || "待补充"}</span>
            <span>晚餐：{report.dinner || "待补充"}</span>
          </div>
          <div className="report-checks">
            {checks.map((check) => {
              const habit = data.habits.find((item) => item.id === check.habitId);
              return habit && <span key={check.id}><Icon name={habit.icon} size={17} /> {habit.name} · {check.value}{habit.unit}</span>;
            })}
            {report.studyMinutes > 0 && <span><Icon name="study" size={17} /> 学习 · {report.studyMinutes}分钟</span>}
          </div>
          {report.lifeNote && <blockquote>“{report.lifeNote}”</blockquote>}
          {report.message && <div className="report-message"><small>TO {data.settings.partnerName.toUpperCase()}</small><p>{report.message}</p></div>}
          <div className="report-footer"><span>目标：{data.settings.targetSchool}{data.settings.targetMajor}</span><i>✦</i></div>
        </div>
      </div>
      <div className="share-actions"><button className="secondary-button" disabled={working} onClick={() => makeImage(false)}><Icon name="download" /> 保存图片</button><button className="primary-button" disabled={working} onClick={() => makeImage(true)}><Icon name="share" /> {working ? "正在生成…" : "发给 TA 夸夸"}</button></div>
    </Modal>
  );
}

export default App;

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
import { calculateStreak, friendlyDate, localDate, monthCells, parseLocalDate, weekRange } from "./date";
import { elapsedTimerSeconds, finishStudyTimer, formatDuration, pauseStudyTimer, resumeStudyTimer, startStudyTimer, studyMinutesLabel, todayStudySeconds, totalStudySeconds } from "./study";
import { getCloudState, loginCloud, logoutCloud, pullFromCloud, queueSyncJob, syncNow, syncToCloud } from "./.private/cloud";
import { askAgent, chunkText, createKnowledgeFile, embedKnowledgeFile, fallbackAgentAnswer, qwenOcrImage, qwenTts, type AgentKind } from "./.private/ai";
import { refreshAutomations } from "./automation";
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
import type { AgentChatMessage, AgentConversation, AgentUiState, AppData, AutomationRule, AutomationTone, CheckIn, CoupleEventKind, DailyReport, FeedPriority, Habit, HabitIcon, HabitUnit, Mood, SharedCourse } from "./types";
import "katex/dist/katex.min.css";

type Page = "today" | "journal" | "coach" | "calendar" | "growth" | "couple" | "settings" | "automation";
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
  const [page, setPage] = useState<Page>("today");
  const [selectedDate, setSelectedDate] = useState(localDate());
  const [checkInHabit, setCheckInHabit] = useState<Habit | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [toast, setToast] = useState("");
  const [automationRefreshing, setAutomationRefreshing] = useState(false);
  const [timerNow, setTimerNow] = useState(() => new Date());
  const dataRef = useRef(data);
  const refreshRunning = useRef(false);

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
            lastError: error instanceof Error ? error.message : "LeanCloud 同步失败",
            pendingJobs: Math.max(1, existing.syncState?.pendingJobs ?? 1)
          }
        } : existing);
      });
    }, 4500);
    return () => window.clearTimeout(timer);
  }, [data?.syncState?.enabled, data?.syncState?.pendingJobs, data?.syncState?.status]);
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
    markForSync((current) => ({ ...current, activeStudyTimer: startStudyTimer(title, note) }));
  }

  function pauseTimer() {
    markForSync((current) => current.activeStudyTimer ? { ...current, activeStudyTimer: pauseStudyTimer(current.activeStudyTimer) } : current);
  }

  function resumeTimer() {
    markForSync((current) => current.activeStudyTimer ? { ...current, activeStudyTimer: resumeStudyTimer(current.activeStudyTimer) } : current);
  }

  function updateTimerMeta(patch: { title?: string; note?: string }) {
    updateData((current) => current.activeStudyTimer ? {
      ...current,
      activeStudyTimer: { ...current.activeStudyTimer, ...patch, updatedAt: new Date().toISOString() }
    } : current);
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
    if (!force && cached && Date.now() - new Date(cached.generatedAt).getTime() < 6 * 60 * 60 * 1000) return;
    refreshRunning.current = true;
    setAutomationRefreshing(true);
    try {
      const result = await refreshAutomations(dataRef.current);
      setData((current) => current?.syncState?.enabled ? queueSyncJob(result.data) : result.data);
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
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
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
            onAutomations={() => setPage("automation")}
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
        {page === "coach" && (
          <CoachPage
            data={data}
            updateData={markForSync}
            notify={setToast}
            now={timerNow}
            agentUiState={data.agentUiState}
            updateAgentUiState={updateAgentUiState}
            onStartStudy={beginStudyTimer}
            onPauseStudy={pauseTimer}
            onResumeStudy={resumeTimer}
            onFinishStudy={completeStudyTimer}
            onUpdateStudyTimer={updateTimerMeta}
          />
        )}
        {page === "calendar" && (
          <CalendarPage data={data} onOpenDate={(date) => { setSelectedDate(date); setPage("journal"); }} />
        )}
        {page === "growth" && <GrowthPage data={data} now={timerNow} />}
        {page === "couple" && <CouplePage data={data} updateData={markForSync} />}
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
      {page !== "automation" && <nav className="bottom-nav" aria-label="主导航">
        {([
          ["today", "home", "今日"],
          ["journal", "journal", "日报"],
          ["coach", "bot", "AI"],
          ["calendar", "calendar", "日历"],
          ["growth", "award", "成长"],
          ["couple", "heart", "恋爱"],
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
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

function Onboarding({ onStart }: { onStart: () => void }) {
  return (
    <main className="onboarding">
      <div className="onboarding-art">
        <span className="petal petal-one" /><span className="petal petal-two" /><span className="petal petal-three" />
        <div className="flower-mark"><span /><span /><span /><span /><i /></div>
      </div>
      <p className="eyebrow">LOVELOG</p>
      <h1>LoveLog</h1>
      <p className="onboarding-subtitle">学习、吃饭、变美、训练，<br />每天都收集一点点亮晶晶。</p>
      <div className="privacy-note">
        <span className="privacy-icon"><Icon name="lock" size={18} /></span>
        <div><strong>只属于你的私密花园</strong><p>所有记录与照片只保存在这台设备，不会上传网络。</p></div>
      </div>
      <button className="primary-button start-button" onClick={onStart}>开启娜娜今日份可爱 <Icon name="arrow" /></button>
      <p className="tiny-note">目标：南京师范大学英语文学系 · 当前 98 斤</p>
    </main>
  );
}

function PageHeader({ eyebrow, title, action }: { eyebrow: string; title: string; action?: ReactNode }) {
  return <header className="page-header"><div><p>{eyebrow}</p><h1>{title}</h1></div>{action}</header>;
}

function WeatherGlyph({ code, size = 24 }: { code: number; size?: number }) {
  if (code === 0) return <Sun size={size} />;
  if (code >= 51) return <CloudRain size={size} />;
  return <Cloud size={size} />;
}

function TodayPage({
  data,
  now,
  selectedDate,
  setSelectedDate,
  onCheckIn,
  onJournal,
  onAutomations
}: {
  data: AppData;
  now: Date;
  selectedDate: string;
  setSelectedDate: (date: string) => void;
  onCheckIn: (habit: Habit) => void;
  onJournal: () => void;
  onAutomations: () => void;
}) {
  const today = localDate();
  const isToday = selectedDate === today;
  const dateObject = parseLocalDate(selectedDate);
  const dayHabits = data.habits.filter((habit) => habit.days.includes(dateObject.getDay()));
  const visibleHabits = dayHabits.length ? dayHabits : data.habits;
  const checks = data.checkIns.filter((item) => item.date === selectedDate && item.completed);
  const completed = visibleHabits.filter((habit) => checks.some((item) => item.habitId === habit.id)).length;
  const progress = visibleHabits.length ? Math.round((completed / visibleHabits.length) * 100) : 0;
  const streak = calculateStreak(data.checkIns, data.reports, today);
  const hour = new Date().getHours();
  const greeting = hour < 11 ? "早上好" : hour < 18 ? "下午好" : "晚上好";
  const week = weekRange(today);
  const brief = data.dailyBriefs.find((item) => item.date === today);
  const weatherUpdatedAt = brief?.weather ? new Date(brief.weather.fetchedAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" }) : "";
  const todaySeconds = todayStudySeconds(data, today, now);
  const totalSeconds = totalStudySeconds(data, now);

  return (
    <div className="page today-page">
      <PageHeader
        eyebrow={friendlyDate(today)}
        title={`${greeting}，${data.settings.ownerName}`}
        action={<button className="automation-orb" onClick={onAutomations} title="每日自动化"><Sparkles size={20} /></button>}
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
        <div className="taotao-note">
          <span className="delight-icon heart"><HeartHandshake size={24} /></span>
          <div>
            <small>{data.settings.companionAlias || "陶陶"} TODAY</small>
            <p>{brief?.companionMessage || "今天先不用很厉害，认真完成一件小事，就值得夸夸。"}</p>
          </div>
        </div>
      </section>
      <section className="hero-card">
        <div className="hero-copy">
          <p className="quote-mark">“</p>
          <h2>{progress === 100 ? "娜娜今日任务全糖完成!" : "娜娜，先把学习主线点亮!"}</h2>
          <p>英美文学备考是主线，变美塑形和美脸护理是可爱支线。</p>
        </div>
        <div className="streak-pill"><span>{streak}</span><small>连续成长<br />DAYS</small></div>
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
        <div><p>{isToday ? "NANA QUESTS" : friendlyDate(selectedDate)}</p><h2>{isToday ? "今日任务卡" : "这一天的任务"}</h2></div>
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
        <span><small>睡前收集</small><strong>{data.reports.some((item) => item.date === selectedDate) ? "看看娜娜今日报告" : "写一份娜娜今日报告"}</strong></span>
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
  const studyCheck = data.checkIns.find((item) => item.date === date && item.habitId === "study" && item.completed);
  const [mood, setMood] = useState<Mood>(existing?.mood ?? "元气满满");
  const [studyMinutes, setStudyMinutes] = useState(existing?.studyMinutes ?? studyCheck?.value ?? 180);
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
    setStudyMinutes(report?.studyMinutes ?? data.checkIns.find((item) => item.date === date && item.habitId === "study")?.value ?? 180);
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
      <PageHeader eyebrow="NANA DAILY" title="娜娜今日报告!" action={<span className="date-chip">{friendlyDate(date).split(" ")[0]}</span>} />
      <p className="page-intro cute-intro">今天也要把学习、吃饭、变美和可爱自拍统统装进小盒子里。</p>
      <form onSubmit={submit}>
        <section className="form-card study-focus-card">
          <div className="form-section-title"><span>01</span><div><small>STUDY FIRST</small><h3>英美文学冲刺台</h3></div></div>
          <div className="study-target-badge">目标：{data.settings.targetSchool}{data.settings.targetMajor}</div>
          <label className="study-field big"><span>今日学习时长</span><span><input type="number" min="0" value={studyMinutes} onChange={(event) => setStudyMinutes(Number(event.target.value))} /> 分钟</span></label>
          <label className="field-label">今天重点攻克什么？</label>
          <input className="soft-input single" value={studyFocus} maxLength={80} onChange={(event) => setStudyFocus(event.target.value)} placeholder="比如：专四词汇、阅读长难句、英语写作模板" />
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
          ) : <p className="empty-inline">还没点打卡也没关系，娜娜先从一个小任务开始。</p>}
        </section>
        <section className="form-card">
          <div className="form-section-title"><span>05</span><div><small>LITTLE DIARY</small><h3>今天的小碎碎念</h3></div></div>
          <textarea className="lined-input" value={lifeNote} maxLength={500} onChange={(event) => setLifeNote(event.target.value)} placeholder={"今天文学阅读卡在哪里？变美塑形做了哪一组？\n苹果肌按摩、美白护理、开心小事都可以写在这里。"} />
        </section>
        <section className="form-card">
          <div className="form-section-title"><span>06</span><div><small>WHISPER</small><h3>每天想对{data.settings.companionAlias || "陶陶"}说的话</h3></div></div>
          <textarea className="soft-input message-input" value={message} maxLength={300} onChange={(event) => setMessage(event.target.value)} placeholder={`比如：${data.settings.companionAlias || "陶陶"}，今天有乖乖学习，快夸我!`} />
        </section>
        <div className="journal-actions">
          <button className="primary-button" type="submit">保存娜娜今日报告 <Icon name="check" /></button>
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
  now,
  agentUiState,
  updateAgentUiState,
  onStartStudy,
  onPauseStudy,
  onResumeStudy,
  onFinishStudy,
  onUpdateStudyTimer
}: {
  data: AppData;
  updateData: (updater: (current: AppData) => AppData) => void;
  notify: (message: string) => void;
  now: Date;
  agentUiState?: AgentUiState;
  updateAgentUiState: (patch: Partial<AgentUiState>) => void;
  onStartStudy: (title: string, note: string) => void;
  onPauseStudy: () => void;
  onResumeStudy: () => void;
  onFinishStudy: () => void;
  onUpdateStudyTimer: (patch: { title?: string; note?: string }) => void;
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
  const activeStudyTimer = data.activeStudyTimer;
  const timerSeconds = elapsedTimerSeconds(activeStudyTimer, now);
  const timerRunning = false;
  const setTimerSeconds = (_updater: (current: number) => number) => {};
  const setTimerRunning = (_value: boolean) => {};
  const timerMinutes = Math.max(1, Math.floor(timerSeconds / 60));
  const setTimerMinutes = (_value: number) => {};
  const minutesLeft = timerMinutes;
  const secondsLeft = String(timerSeconds % 60).padStart(2, "0");

  useEffect(() => {
    if (!timerRunning) return;
    const timer = window.setInterval(() => {
      setTimerSeconds((current) => {
        if (current <= 1) {
          window.clearInterval(timer);
          setTimerRunning(false);
          notify("本轮番茄钟结束，记录一下实际完成了什么吧");
          return 0;
        }
        return current - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [timerRunning, notify]);

  const agentMeta = {
    english: { label: "英语导师", eyebrow: "LITERATURE", title: "英美文学与阅读导师" },
    food: { label: "饮食助手", eyebrow: "FOOD AGENT", title: "饮食搭配助手" },
    planner: { label: "计划助手", eyebrow: "POMODORO", title: "计划与番茄钟助手" }
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
      notify(data.settings.qwenApiKey ? "Qwen OCR 已完成识别" : "本地 OCR 已完成识别");
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
    const userText = [cleanQuestion, imageText ? `OCR 文本：\n${imageText}` : "", data.knowledgeFiles.length ? `本地文件库：${data.knowledgeFiles.length} 个文件可检索` : ""].filter(Boolean).join("\n\n");
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
      const answer = await askAgent(data.settings, { agent, input: cleanQuestion, imageText, knowledgeFiles: data.knowledgeFiles, history: conversationHistory });
      const assistantMessage: AgentChatMessage = {
        id: uid("agent-msg"),
        role: "assistant",
        agent,
        text: answer.text,
        reasoningContent: answer.reasoningContent,
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

  function startTimer() {
    onStartStudy(activeStudyTimer?.title || "英语文学学习", activeStudyTimer?.note || "");
  }

  const visibleMessages = activeConversation?.messages.length ? activeConversation.messages : [welcomeMessage];
  const timerDisplay = formatDuration(timerSeconds);
  const recentSessions = (data.studySessions ?? []).slice(0, 4);

  return (
    <div className="page coach-page agent-page">
      <PageHeader eyebrow={agentMeta[agent].eyebrow} title={agentMeta[agent].title} action={<span className="date-chip">Qwen OCR + DeepSeek</span>} />
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
          <h2>{agent === "english" ? "更专业的文学阅读、翻译和文本细读" : agent === "food" ? "记录不想吃的，给出更舒服的均衡搭配" : "先做一轮，再根据实际反馈调整下一轮"}</h2>
          <p>Qwen OCR 用于识图，DeepSeek 负责 Agent 推理。思考程度、联网偏好和文件上下文开关都在设置里调整。</p>
        </div>
      </section>
      <section className="agent-flow-strip">
        <span>流程</span>
        <i>本地会话</i>
        <i>{data.settings.agentWebSearch && data.settings.serperApiKey ? "Serper 搜索" : "搜索关闭"}</i>
        <i>{data.settings.qwenApiKey ? (data.settings.qwenRerankEnabled ? "Qwen 向量 + 重排" : "Qwen 向量") : "关键词 RAG"}</i>
        <i>{data.settings.agentThinking === "light" ? "可调温度" : "保留思考"}</i>
      </section>
      {agent === "planner" && (
        <section className="timer-card study-timer-card">
          <div className="timer-readout"><small>FOCUS TIMER</small><strong>{timerDisplay}</strong><span>{activeStudyTimer?.running ? "正向计时中" : activeStudyTimer ? "已暂停" : "准备开始"}</span></div>
          <label><span>本次标题</span><input value={activeStudyTimer?.title ?? "英语文学学习"} onChange={(event) => activeStudyTimer && onUpdateStudyTimer({ title: event.target.value })} disabled={!activeStudyTimer} /></label>
          <label><span>备注</span><input value={activeStudyTimer?.note ?? ""} onChange={(event) => activeStudyTimer && onUpdateStudyTimer({ note: event.target.value })} disabled={!activeStudyTimer} placeholder="本轮目标/完成内容" /></label>
          <div className="timer-actions">
            {!activeStudyTimer && <button type="button" onClick={startTimer}>开始计时</button>}
            {activeStudyTimer?.running && <button type="button" onClick={onPauseStudy}>暂停</button>}
            {activeStudyTimer && !activeStudyTimer.running && <button type="button" onClick={onResumeStudy}>继续</button>}
            {activeStudyTimer && <button type="button" className="timer-finish" onClick={onFinishStudy}>结束并记录</button>}
          </div>
          {!!recentSessions.length && (
            <div className="study-session-list">
              {recentSessions.map((session) => (
                <span key={session.id}><strong>{session.title}</strong><small>{session.date} · {formatDuration(session.durationSeconds)}</small></span>
              ))}
            </div>
          )}
        </section>
      )}
      {false && agent === "planner" && (
        <section className="timer-card">
          <div><small>FOCUS TIMER</small><strong>{timerSeconds ? `${minutesLeft}:${secondsLeft}` : `${timerMinutes}:00`}</strong></div>
          <label><span>本轮分钟</span><input type="number" min="5" max="90" value={timerMinutes} onChange={(event) => setTimerMinutes(Number(event.target.value))} /></label>
          <button type="button" onClick={timerRunning ? () => setTimerRunning(false) : startTimer}>{timerRunning ? "暂停" : "开始本轮"}</button>
        </section>
      )}
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
        <div className="agent-action-bar">
          <label>
            <Icon name="camera" /><span>{ocrBusy ? "OCR" : "拍照"}</span>
            <input type="file" accept="image/*" onChange={recognizeImage} disabled={ocrBusy} />
          </label>
          <label>
            <Icon name="upload" /><span>{libraryBusy ? "入库" : "文件"}</span>
            <input type="file" accept=".txt,.md,.csv,.json,.ts,.tsx,.js,.jsx,.css,.html,.py,.java,.kt,.gradle,.xml,.yml,.yaml" onChange={readFileContext} disabled={libraryBusy} />
          </label>
          <button type="button" onClick={() => speakText(visibleMessages.at(-1)?.text ?? "")} disabled={!data.settings.voiceOutput}><Icon name="share" /><span>朗读</span></button>
        </div>
        <div className="knowledge-strip">
          <span>本地文件库 {data.knowledgeFiles.length} 个</span>
          <small>{data.settings.qwenApiKey ? (data.settings.qwenRerankEnabled ? "Qwen RAG + Rerank" : "Qwen RAG") : "关键词 RAG"}</small>
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

function CouplePage({ data, updateData }: { data: AppData; updateData: (updater: (current: AppData) => AppData) => void }) {
  const today = localDate();
  const [postText, setPostText] = useState("");
  const [postMood, setPostMood] = useState("");
  const [feedText, setFeedText] = useState("");
  const [feedNote, setFeedNote] = useState("");
  const [feedPriority, setFeedPriority] = useState<FeedPriority>("want");
  const [course, setCourse] = useState<Omit<SharedCourse, "id" | "createdAt">>({
    title: "",
    weekday: new Date().getDay(),
    startTime: "08:00",
    endTime: "09:40",
    location: "",
    note: "",
    color: "#7b8bf2"
  });
  const [eventKind, setEventKind] = useState<CoupleEventKind>("call");
  const [eventTitle, setEventTitle] = useState("");
  const [eventDate, setEventDate] = useState(today);
  const [eventStart, setEventStart] = useState("");
  const [eventEnd, setEventEnd] = useState("");
  const [eventNote, setEventNote] = useState("");
  const author = data.settings.ownerName || "我";
  const weekdayNames = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
  const eventNames: Record<CoupleEventKind, string> = {
    game: "王者荣耀",
    call: "打电话",
    meet: "见面",
    anniversary: "纪念日",
    date: "约会",
    custom: "其他"
  };

  function submitPost(event: FormEvent) {
    event.preventDefault();
    if (!postText.trim()) return;
    updateData((current) => ({
      ...current,
      couplePosts: [{
        id: uid("couple-post"),
        author,
        text: postText.trim(),
        mood: postMood.trim(),
        date: today,
        createdAt: new Date().toISOString()
      }, ...(current.couplePosts ?? [])]
    }));
    setPostText("");
    setPostMood("");
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
      feedWishes: (current.feedWishes ?? []).map((item) => item.id === id ? { ...item, fulfilled: !item.fulfilled, updatedAt: new Date().toISOString() } : item)
    }));
  }

  function submitCourse(event: FormEvent) {
    event.preventDefault();
    if (!course.title.trim()) return;
    updateData((current) => ({
      ...current,
      sharedCourses: [...(current.sharedCourses ?? []), {
        ...course,
        id: uid("course"),
        title: course.title.trim(),
        location: course.location.trim(),
        note: course.note.trim(),
        createdAt: new Date().toISOString()
      }]
    }));
    setCourse((current) => ({ ...current, title: "", location: "", note: "" }));
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
  const openFeeds = (data.feedWishes ?? []).filter((item) => !item.fulfilled).length;
  const nextEvents = (data.coupleEvents ?? []).filter((item) => item.date >= today).sort((a, b) => `${a.date}${a.startTime ?? ""}`.localeCompare(`${b.date}${b.startTime ?? ""}`)).slice(0, 6);
  const coursesByDay = [...(data.sharedCourses ?? [])].sort((a, b) => a.weekday - b.weekday || a.startTime.localeCompare(b.startTime));

  return (
    <div className="page couple-page">
      <PageHeader eyebrow="OUR SPACE" title="我们的共享频道" />
      <section className="couple-overview">
        <div><small>今日动态</small><strong>{todayPosts}</strong></div>
        <div><small>待投喂</small><strong>{openFeeds}</strong></div>
        <div><small>共同事件</small><strong>{data.coupleEvents.length}</strong></div>
      </section>

      <section className="couple-section">
        <div className="section-heading"><div><p>MOMENTS</p><h2>双方朋友圈</h2></div></div>
        <form className="couple-form" onSubmit={submitPost}>
          <input value={postMood} onChange={(event) => setPostMood(event.target.value)} placeholder="心情/标签，比如 想你、开心、累了" />
          <textarea value={postText} onChange={(event) => setPostText(event.target.value)} placeholder="写一条对方也能看见的今日动态" />
          <button type="submit" disabled={!postText.trim()}>发布动态</button>
        </form>
        <div className="couple-feed-list">
          {(data.couplePosts ?? []).slice(0, 8).map((post) => (
            <article key={post.id}><strong>{post.author}</strong><p>{post.text}</p><small>{post.mood || "日常"} · {new Date(post.createdAt).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}</small></article>
          ))}
          {!data.couplePosts.length && <p className="empty-inline">还没有动态，先发一条今天的小心情。</p>}
        </div>
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
              <small>{wish.author} · {wish.note || "没有备注"} · {wish.fulfilled ? "已投喂" : "待投喂"}</small>
            </button>
          ))}
        </div>
      </section>

      <section className="couple-section">
        <div className="section-heading"><div><p>SCHEDULE</p><h2>共同课表</h2></div></div>
        <form className="couple-form course-form" onSubmit={submitCourse}>
          <input value={course.title} onChange={(event) => setCourse((current) => ({ ...current, title: event.target.value }))} placeholder="课程/安排名称" />
          <select value={course.weekday} onChange={(event) => setCourse((current) => ({ ...current, weekday: Number(event.target.value) }))}>
            {weekdayNames.map((label, index) => <option key={label} value={index}>{label}</option>)}
          </select>
          <input type="time" value={course.startTime} onChange={(event) => setCourse((current) => ({ ...current, startTime: event.target.value }))} />
          <input type="time" value={course.endTime} onChange={(event) => setCourse((current) => ({ ...current, endTime: event.target.value }))} />
          <input value={course.location} onChange={(event) => setCourse((current) => ({ ...current, location: event.target.value }))} placeholder="地点" />
          <input value={course.note} onChange={(event) => setCourse((current) => ({ ...current, note: event.target.value }))} placeholder="备注" />
          <button type="submit" disabled={!course.title.trim()}>加入课表</button>
        </form>
        <div className="course-list">
          {coursesByDay.map((item) => (
            <div key={item.id} style={{ borderLeftColor: item.color }}><strong>{weekdayNames[item.weekday]} {item.startTime}-{item.endTime}</strong><span>{item.title}</span><small>{item.location || "未填写地点"} · {item.note || "共同安排"}</small></div>
          ))}
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

function CalendarPage({ data, onOpenDate }: { data: AppData; onOpenDate: (date: string) => void }) {
  const now = new Date();
  const [cursor, setCursor] = useState(new Date(now.getFullYear(), now.getMonth(), 1));
  const cells = monthCells(cursor.getFullYear(), cursor.getMonth());
  const records = new Set(data.checkIns.filter((item) => item.completed).map((item) => item.date));
  const reports = new Set(data.reports.map((item) => item.date));
  return (
    <div className="page calendar-page">
      <PageHeader eyebrow="GROWTH CALENDAR" title="成长日历" />
      <section className="calendar-card">
        <div className="month-nav">
          <button onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}><Icon name="chevron-left" /></button>
          <div><small>{cursor.getFullYear()}</small><strong>{cursor.getMonth() + 1} 月</strong></div>
          <button onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}><Icon name="chevron-right" /></button>
        </div>
        <div className="weekdays">{["一", "二", "三", "四", "五", "六", "日"].map((day) => <span key={day}>{day}</span>)}</div>
        <div className="calendar-grid">
          {cells.map((date, index) => date ? (
            <button key={date} className={`${date === localDate() ? "today" : ""} ${reports.has(date) ? "reported" : records.has(date) ? "active" : ""}`} onClick={() => onOpenDate(date)}>
              <span>{parseLocalDate(date).getDate()}</span>{reports.has(date) && <i>✦</i>}
            </button>
          ) : <span key={`empty-${index}`} />)}
        </div>
        <div className="calendar-legend"><span><i className="dot active" />有打卡</span><span><i className="dot reported" />完整日报</span></div>
      </section>
      <section className="memory-list">
        <div className="section-heading"><div><p>MEMORIES</p><h2>这个月的心意</h2></div></div>
        {data.reports.filter((report) => {
          const date = parseLocalDate(report.date);
          return date.getFullYear() === cursor.getFullYear() && date.getMonth() === cursor.getMonth();
        }).sort((a, b) => b.date.localeCompare(a.date)).map((report) => (
          <button key={report.id} onClick={() => onOpenDate(report.date)}>
            <span className="memory-date"><strong>{parseLocalDate(report.date).getDate()}</strong><small>{cursor.getMonth() + 1}月</small></span>
            <span><strong>{report.mood}</strong><small>{report.lifeNote || "这一天被认真地记住了"}</small></span>
            <Icon name="arrow" />
          </button>
        ))}
        {!data.reports.some((report) => parseLocalDate(report.date).getMonth() === cursor.getMonth() && parseLocalDate(report.date).getFullYear() === cursor.getFullYear()) && (
          <div className="empty-state"><span>✦</span><h3>这个月还在等待故事</h3><p>完成一份日报，它就会在这里开花。</p></div>
        )}
      </section>
    </div>
  );
}

function GrowthPage({ data, now }: { data: AppData; now: Date }) {
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
      <div className="section-heading"><div><p>MY BADGES</p><h2>成长徽章</h2></div><span>{badges.filter((item) => item.unlocked).length}/{badges.length} 点亮</span></div>
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
        eyebrow="NANA AUTOMATIONS"
        title="每天自动送达一点可爱"
        action={<button className="round-icon-button" onClick={onBack} title="返回今日"><ChevronLeft size={20} /></button>}
      />
      <section className="automation-summary">
        <div className="automation-summary-icon"><WandSparkles size={28} /></div>
        <div>
          <small>未来 7 天已缓存</small>
          <h2>{data.automations.filter((item) => item.enabled).length} 个小助手正在值班</h2>
          <p>{todayBrief ? `今日寄语由${todayBrief.source === "deepseek" ? " DeepSeek V4 Pro" : "本地温柔文案"}生成。` : "打开应用后会刷新天气、寄语和通知。"}</p>
        </div>
        <button onClick={onRefresh} disabled={refreshing} title="立即刷新"><RefreshCw size={18} className={refreshing ? "spin" : ""} /></button>
      </section>

      <div className="section-heading automation-heading">
        <div><p>MY AUTOMATIONS</p><h2>自动化清单</h2></div>
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
          }}
          onDelete={editing === "new" ? undefined : () => {
            updateData((current) => ({
              ...current,
              automations: current.automations.filter((item) => item.id !== editing.id),
              automationRuns: current.automationRuns.filter((item) => item.ruleId !== editing.id)
            }));
            setEditing(null);
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
      <div className="automation-editor-title"><span><WandSparkles size={21} /></span><div><small>AUTOMATION</small><h2>{rule ? "编辑小助手" : "新建小助手"}</h2></div></div>
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
        <button className="primary-button" type="submit">保存自动化 <Sparkles size={17} /></button>
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
  const [cloudRole, setCloudRole] = useState<"owner" | "supervisor">(data.syncState?.role ?? "owner");
  const [cloudBusy, setCloudBusy] = useState(false);
  const importRef = useRef<HTMLInputElement>(null);

  async function signInCloud() {
    setCloudBusy(true);
    try {
      const state = await loginCloud(cloudUsername, cloudPassword, cloudSpace, cloudRole);
      updateData((current) => ({ ...current, syncState: state }));
      notify("LeanCloud 已登录");
    } catch (error) {
      notify(error instanceof Error ? error.message : "LeanCloud 登录失败");
    } finally {
      setCloudBusy(false);
      setCloudPassword("");
    }
  }

  async function signOutCloud() {
    const state = await logoutCloud();
    updateData((current) => ({ ...current, syncState: state }));
    notify("已退出 LeanCloud");
  }

  async function pushCloud() {
    setCloudBusy(true);
    try {
      const synced = await syncToCloud(data);
      updateData(() => synced);
      notify(synced.syncState?.status === "synced" ? "已同步到 LeanCloud" : synced.syncState?.lastError || "同步未完成");
    } finally {
      setCloudBusy(false);
    }
  }

  async function pullCloud() {
    setCloudBusy(true);
    try {
      const pulled = await pullFromCloud(data);
      updateData(() => pulled);
      notify("已从 LeanCloud 拉取最新记录");
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
        <div className="settings-title"><div><p>LEAN CLOUD</p><h2>云同步</h2></div><span className={`sync-pill ${data.syncState?.status ?? "signed-out"}`}>{data.syncState?.configured ? (data.syncState?.status ?? "idle") : "未配置"}</span></div>
        <div className="cloud-sync-card">
          <p>本地 IndexedDB 仍是主存储；LeanCloud 只负责你和对象之间的同步与备份。未配置或未登录时，应用照常离线使用。</p>
          {!data.syncState?.currentUser ? (
            <div className="cloud-login-grid">
              <input value={cloudUsername} onChange={(event) => setCloudUsername(event.target.value)} placeholder="LeanCloud 用户名/邮箱" />
              <input type="password" value={cloudPassword} onChange={(event) => setCloudPassword(event.target.value)} placeholder="密码" />
              <input value={cloudSpace} onChange={(event) => setCloudSpace(event.target.value)} placeholder="共享空间 ID（可选）" />
              <select value={cloudRole} onChange={(event) => setCloudRole(event.target.value as "owner" | "supervisor")}>
                <option value="owner">Owner / 她的主账号</option>
                <option value="supervisor">Supervisor / 监督者</option>
              </select>
              <button type="button" onClick={signInCloud} disabled={cloudBusy || !cloudUsername.trim() || !cloudPassword}>登录</button>
            </div>
          ) : (
            <div className="cloud-account">
              <strong>{data.syncState.currentUser}</strong>
              <small>空间：{data.syncState.spaceId || "默认空间"} · role: {data.syncState.role ?? "owner"} · 待同步 {data.syncState.pendingJobs ?? 0}</small>
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
      <section className="settings-section">
        <div className="settings-title"><div><p>NANA PROFILE</p><h2>娜娜专属信息</h2></div></div>
        <div className="profile-grid">
          <label><span>姓名</span><input value={data.settings.ownerName} onChange={(event) => updateData((current) => ({ ...current, settings: { ...current.settings, ownerName: event.target.value } }))} /></label>
          <label><span>当前体重</span><input type="number" step="0.1" value={data.settings.currentWeightJin} onChange={(event) => updateData((current) => ({ ...current, settings: { ...current.settings, currentWeightJin: Number(event.target.value) } }))} /><i>斤</i></label>
          <label><span>目标院校</span><input value={data.settings.targetSchool} onChange={(event) => updateData((current) => ({ ...current, settings: { ...current.settings, targetSchool: event.target.value } }))} /></label>
          <label><span>目标方向</span><input value={data.settings.targetMajor} onChange={(event) => updateData((current) => ({ ...current, settings: { ...current.settings, targetMajor: event.target.value } }))} /></label>
          <label><span>天气备用城市</span><input value={data.settings.weatherFallbackCity ?? "天津"} onChange={(event) => updateData((current) => ({ ...current, settings: { ...current.settings, weatherFallbackCity: event.target.value } }))} /></label>
        </div>
      </section>
      <section className="settings-section">
        <div className="settings-title"><div><p>AI STUDY</p><h2>DeepSeek 学习助手</h2></div></div>
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
        <div className="settings-title"><div><p>DAILY HABITS</p><h2>娜娜的小任务</h2></div><button onClick={() => setEditing("new")}><Icon name="plus" size={18} /> 新增</button></div>
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
        <div className="privacy-box"><Icon name="lock" /><p><strong>记录只存储在当前浏览器</strong><span>我们没有服务器，也不会读取或上传你的文字和照片。</span></p></div>
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
      const file = new File([blob], `娜娜今日报告-${date}.png`, { type: "image/png" });
      if (share && navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ title: "娜娜今日报告", text: "娜娜今天也有乖乖升级。", files: [file] });
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
          <div className="report-card-top"><span>娜娜今日报告!</span><small>NANA DAILY</small></div>
          <div className="report-date"><span>{parseLocalDate(date).getDate()}</span><div><strong>{parseLocalDate(date).getMonth() + 1} 月</strong><small>{friendlyDate(date).split(" ")[1]}</small></div></div>
          <h1>今日份娜娜<br />可爱升级中!</h1>
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

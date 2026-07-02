export type HabitIcon = "run" | "fitness" | "beauty" | "study" | "heart" | "sun";
export type HabitUnit = "分钟" | "次" | "公里" | "页";
export type Mood = "闪闪发光" | "元气满满" | "平静柔软" | "有点疲惫" | "需要抱抱";
export type AutomationKind = "weather" | "companion" | "food" | "study" | "custom";
export type AutomationTone = "励志" | "幽默" | "安慰" | "温柔";

export interface Habit {
  id: string;
  name: string;
  icon: HabitIcon;
  color: string;
  unit: HabitUnit;
  target: number;
  days: number[];
  createdAt: string;
}

export interface CheckIn {
  id: string;
  habitId: string;
  date: string;
  value: number;
  note: string;
  completed: boolean;
  updatedAt: string;
}

export interface DailyReport {
  id: string;
  date: string;
  mood: Mood;
  studyMinutes: number;
  weightJin?: number;
  breakfast?: string;
  lunch?: string;
  dinner?: string;
  studyFocus?: string;
  lifeNote: string;
  message: string;
  photoId?: string;
  photoIds?: {
    breakfast?: string;
    lunch?: string;
    dinner?: string;
    study?: string;
    selfie?: string;
  };
  submittedAt: string;
}

export interface Badge {
  id: string;
  name: string;
  description: string;
  icon: string;
  unlocked: boolean;
  progress: number;
  target: number;
}

export interface AppSettings {
  onboarded: boolean;
  ownerName: string;
  partnerName: string;
  companionAlias: string;
  theme: "rose" | "peach" | "sage";
  currentWeightJin: number;
  targetSchool: string;
  targetMajor: string;
  deepSeekApiKey?: string;
  deepSeekBaseUrl?: string;
  deepSeekModel?: string;
  deepSeekTemperature?: number;
  deepSeekMaxOutputTokens?: number;
  agentContextLimitChars?: number;
  agentThinking?: "light" | "balanced" | "deep";
  agentWebSearch?: boolean;
  agentFileUpload?: boolean;
  serperApiKey?: string;
  serperEndpoint?: string;
  qwenApiKey?: string;
  qwenBaseUrl?: string;
  qwenOcrModel?: string;
  qwenEmbeddingModel?: string;
  qwenEmbeddingDimensions?: number;
  qwenRerankEndpoint?: string;
  qwenRerankModel?: string;
  qwenRerankEnabled?: boolean;
  qwenTtsEndpoint?: string;
  qwenTtsModel?: string;
  qwenTtsVoice?: string;
  voiceOutput?: boolean;
  foodAvoids?: string;
  foodRecentDislikes?: string;
  weatherFallbackCity?: string;
  lastLatitude?: number;
  lastLongitude?: number;
  lastLocationName?: string;
  notificationPermission?: "prompt" | "granted" | "denied";
  activeProfile?: "ru" | "taotao";
  aiProvider?: "deepseek" | "qwen";
  qwenChatModel?: string;
  qwenVisionModel?: string;
  ownerAvatarPhotoId?: string;
  partnerAvatarPhotoId?: string;
  dailyStudySummaryEnabled?: boolean;
}

export interface KnowledgeChunk {
  id: string;
  text: string;
  embedding?: number[];
}

export interface KnowledgeFile {
  id: string;
  name: string;
  type: string;
  size: number;
  uploadedAt: string;
  content: string;
  chunks: KnowledgeChunk[];
}

export interface AgentChatMessage {
  id: string;
  role: "user" | "assistant";
  agent: "english" | "food" | "planner";
  text: string;
  reasoningContent?: string;
  provider?: "deepseek" | "qwen";
  model?: string;
  createdAt: string;
}

export interface AgentConversation {
  id: string;
  date: string;
  title: string;
  agent: "english" | "food" | "planner";
  messages: AgentChatMessage[];
  createdAt: string;
  updatedAt: string;
}

export interface AutomationRule {
  id: string;
  kind: AutomationKind;
  enabled: boolean;
  title: string;
  prompt: string;
  time: string;
  days: number[];
  tone: AutomationTone;
  webSearch: boolean;
  notify: boolean;
  createdAt: string;
}

export interface AutomationRun {
  id: string;
  ruleId: string;
  date: string;
  title: string;
  body: string;
  status: "generated" | "scheduled" | "failed";
  generatedAt: string;
}

export interface WeatherSnapshot {
  date: string;
  latitude: number;
  longitude: number;
  locationName: string;
  weatherCode: number;
  summary: string;
  temperatureMin: number;
  temperatureMax: number;
  precipitationProbability: number;
  fetchedAt: string;
}

export interface DailyBrief {
  date: string;
  weather?: WeatherSnapshot;
  companionMessage: string;
  tone: AutomationTone;
  generatedAt: string;
  source: "deepseek" | "fallback";
}

export type StudySessionSource = "timer" | "manual" | "migration";
export type SyncStatus = "local" | "syncing" | "synced" | "failed";
export type AgentKind = "english" | "food" | "planner";

export interface StudySession {
  id: string;
  date: string;
  title: string;
  note: string;
  startedAt: string;
  endedAt: string;
  durationSeconds: number;
  source: StudySessionSource;
  syncStatus?: SyncStatus;
  owner?: "ru" | "taotao";
}

export interface ActiveStudyTimer {
  id: string;
  title: string;
  note: string;
  startedAt: string;
  accumulatedSeconds: number;
  running: boolean;
  updatedAt: string;
  owner?: "ru" | "taotao";
}

export interface AgentUiState {
  agent: AgentKind;
  chatDate: string;
  activeConversationId: string;
  questionDraft: string;
  imageTextDraft: string;
  imagePreview?: string;
}

export type TodoKind = "long" | "short";

export interface TodoItem {
  id: string;
  title: string;
  kind: TodoKind;
  startDate: string;
  endDate?: string;
  completedDates: string[];
  createdAt: string;
  updatedAt: string;
}

export interface CoupleChatMessage {
  id: string;
  author: string;
  text: string;
  type?: "text" | "image";
  photoId?: string;
  status?: "sending" | "synced" | "failed";
  createdAt: string;
}

export type CoupleGameKind = "qa" | "turtle";

export interface CoupleGameCard {
  id: string;
  kind: CoupleGameKind;
  prompt: string;
  answer: string;
  author: string;
  revealed: boolean;
  createdAt: string;
}

export interface StudyMetric {
  id: string;
  date: string;
  kind: "words" | "exercise";
  title: string;
  count: number;
  durationMinutes: number;
  createdAt: string;
  owner?: "ru" | "taotao";
}

export interface WordLearningRecord {
  id: string;
  date: string;
  newWords: number;
  reviewedWords: number;
  note: string;
  owner: "ru" | "taotao";
  createdAt: string;
}

export interface SyncState {
  enabled: boolean;
  configured: boolean;
  status: "idle" | "syncing" | "synced" | "failed" | "offline" | "signed-out";
  role?: "member" | "owner" | "supervisor";
  currentUser?: string;
  spaceId?: string;
  inviteCode?: string;
  schemaVersion?: 3;
  lastPulledAtByClass?: Record<string, string>;
  lastSyncedAt?: string;
  lastPulledAt?: string;
  lastError?: string;
  pendingJobs: number;
}

export interface CloudOutboxItem {
  id: string;
  className: string;
  recordId: string;
  payload: unknown;
  deletedAtIso?: string;
  queuedAt: string;
}

export type CoupleEventKind = "game" | "call" | "meet" | "anniversary" | "date" | "custom";
export type FeedPriority = "normal" | "want" | "urgent";
export type ProfileId = "ru" | "taotao";

export interface CouplePostComment {
  id: string;
  authorProfile: ProfileId;
  author: string;
  text: string;
  createdAt: string;
}

export interface CouplePost {
  id: string;
  author: string;
  authorProfile?: ProfileId;
  text: string;
  mood?: string;
  photoIds?: string[];
  likes?: ProfileId[];
  comments?: CouplePostComment[];
  date: string;
  createdAt: string;
}

export interface SharedCourse {
  id: string;
  title: string;
  weekday: number;
  startTime: string;
  endTime: string;
  location: string;
  note: string;
  color: string;
  owner?: ProfileId;
  weekStart?: string;
  slotIndex?: number;
  createdAt: string;
}

export interface FeedWish {
  id: string;
  author: string;
  craving: string;
  note: string;
  priority: FeedPriority;
  date: string;
  fulfilled: boolean;
  status?: "requested" | "accepted" | "delivered";
  createdAt: string;
  updatedAt: string;
}

export interface CoupleEvent {
  id: string;
  kind: CoupleEventKind;
  title: string;
  date: string;
  startTime?: string;
  endTime?: string;
  note: string;
  author?: string;
  memoryText?: string;
  memoryPhotoIds?: string[];
  memoryUpdatedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface TaskTemplate {
  id: string;
  owner: "ru" | "taotao";
  title: string;
  group: string;
  unit: string;
  target: number;
  days: number[];
  createdAt: string;
  updatedAt: string;
}

export interface DailyTaskRecord {
  id: string;
  templateId?: string;
  owner: "ru" | "taotao";
  date: string;
  title: string;
  group: string;
  unit: string;
  target: number;
  value: number;
  completed: boolean;
  note: string;
  createdAt: string;
  updatedAt: string;
}

export interface DailyStudySummary {
  id: string;
  owner: "ru" | "taotao";
  date: string;
  text: string;
  source: "deepseek" | "local";
  sourceHash: string;
  generatedAt: string;
}

export interface CustomBadgeGift {
  id: string;
  giver: "ru" | "taotao";
  receiver: "ru" | "taotao";
  name: string;
  description: string;
  target: number;
  progress: number;
  gift: string;
  completed: boolean;
  claimed: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AppData {
  version: 3;
  habits: Habit[];
  checkIns: CheckIn[];
  reports: DailyReport[];
  knowledgeFiles: KnowledgeFile[];
  agentConversations: AgentConversation[];
  automations: AutomationRule[];
  automationRuns: AutomationRun[];
  dailyBriefs: DailyBrief[];
  studySessions: StudySession[];
  activeStudyTimer?: ActiveStudyTimer;
  agentUiState?: AgentUiState;
  syncState?: SyncState;
  cloudOutbox?: CloudOutboxItem[];
  couplePosts: CouplePost[];
  sharedCourses: SharedCourse[];
  feedWishes: FeedWish[];
  coupleEvents: CoupleEvent[];
  todos: TodoItem[];
  coupleMessages: CoupleChatMessage[];
  coupleGames: CoupleGameCard[];
  studyMetrics: StudyMetric[];
  wordLearningRecords: WordLearningRecord[];
  taskTemplates: TaskTemplate[];
  dailyTaskRecords: DailyTaskRecord[];
  dailyStudySummaries: DailyStudySummary[];
  customBadgeGifts: CustomBadgeGift[];
  settings: AppSettings;
}

export interface BackupData extends AppData {
  exportedAt: string;
  photos: Record<string, string>;
}

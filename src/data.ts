import type { AppData, AutomationRule, Badge, Habit } from "./types";
import { calculateStreak, completedDates, weekRange } from "./date";
import { totalStudySeconds } from "./study";

const now = new Date().toISOString();

export const defaultAutomations: AutomationRule[] = [
  {
    id: "daily-weather",
    kind: "weather",
    enabled: true,
    title: "今日天气小贴士",
    prompt: "根据天气给出穿衣、带伞和出行提示。",
    time: "07:30",
    days: [0, 1, 2, 3, 4, 5, 6],
    tone: "温柔",
    webSearch: false,
    notify: true,
    createdAt: now
  },
  {
    id: "taotao-message",
    kind: "companion",
    enabled: true,
    title: "陶陶今天想说",
    prompt: "写一句来自陶陶的寄语，励志、幽默、安慰和温柔轮换，不说教。",
    time: "08:00",
    days: [0, 1, 2, 3, 4, 5, 6],
    tone: "温柔",
    webSearch: true,
    notify: true,
    createdAt: now
  },
  {
    id: "gentle-meal",
    kind: "food",
    enabled: true,
    title: "好好吃饭提醒",
    prompt: "温柔提醒她按时吃饭，搭配主食、蛋白质和蔬果。",
    time: "12:00",
    days: [0, 1, 2, 3, 4, 5, 6],
    tone: "温柔",
    webSearch: false,
    notify: true,
    createdAt: now
  },
  {
    id: "study-review",
    kind: "study",
    enabled: true,
    title: "今日轻复盘",
    prompt: "提醒她记录实际完成了什么，不评价效率，也不把明天排满。",
    time: "20:30",
    days: [0, 1, 2, 3, 4, 5, 6],
    tone: "安慰",
    webSearch: false,
    notify: true,
    createdAt: now
  }
];

export const defaultHabits: Habit[] = [
  { id: "study", name: "英美文学备考", icon: "study", color: "#7b8bf2", unit: "分钟", target: 180, days: [0, 1, 2, 3, 4, 5, 6], createdAt: now },
  { id: "fitness", name: "变美塑形", icon: "fitness", color: "#ff8a7a", unit: "分钟", target: 40, days: [1, 3, 5, 6], createdAt: now },
  { id: "beauty", name: "美脸美白护理", icon: "beauty", color: "#f39ac5", unit: "分钟", target: 20, days: [0, 1, 2, 3, 4, 5, 6], createdAt: now },
  { id: "run", name: "轻体能跑走", icon: "run", color: "#65c6a4", unit: "公里", target: 2, days: [2, 4, 0], createdAt: now }
];

export const initialData: AppData = {
  version: 2,
  habits: defaultHabits,
  checkIns: [],
  reports: [],
  knowledgeFiles: [],
  agentConversations: [],
  automations: defaultAutomations,
  automationRuns: [],
  dailyBriefs: [],
  studySessions: [],
  agentUiState: {
    agent: "english",
    chatDate: "",
    activeConversationId: "",
    questionDraft: "",
    imageTextDraft: ""
  },
  syncState: {
    enabled: false,
    configured: false,
    status: "signed-out",
    pendingJobs: 0
  },
  couplePosts: [],
  sharedCourses: [],
  feedWishes: [],
  coupleEvents: [],
  settings: {
    onboarded: false,
    ownerName: "张洳娜",
    partnerName: "程韵陶",
    companionAlias: "陶陶",
    theme: "rose",
    currentWeightJin: 98,
    targetSchool: "南京师范大学",
    targetMajor: "英语文学系",
    deepSeekApiKey: "",
    deepSeekBaseUrl: "https://api.deepseek.com",
    deepSeekModel: "deepseek-v4-pro",
    deepSeekTemperature: 0.55,
    deepSeekMaxOutputTokens: 65536,
    agentContextLimitChars: 800000,
    agentThinking: "deep",
    agentWebSearch: true,
    agentFileUpload: true,
    serperApiKey: "",
    serperEndpoint: "https://google.serper.dev/search",
    qwenApiKey: "",
    qwenBaseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    qwenOcrModel: "qwen-vl-ocr",
    qwenEmbeddingModel: "text-embedding-v4",
    qwenEmbeddingDimensions: 256,
    qwenRerankEndpoint: "https://dashscope.aliyuncs.com/compatible-api/v1/reranks",
    qwenRerankModel: "qwen3-rerank",
    qwenRerankEnabled: true,
    qwenTtsEndpoint: "https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation",
    qwenTtsModel: "qwen3-tts-flash",
    qwenTtsVoice: "Cherry",
    voiceOutput: true,
    foodAvoids: "",
    foodRecentDislikes: "",
    weatherFallbackCity: "天津",
    notificationPermission: "prompt"
  }
};

export function buildBadges(data: AppData): Badge[] {
  const streak = calculateStreak(data.checkIns, data.reports);
  const totalMinutes = Math.floor(totalStudySeconds(data) / 60);
  /*
  const totalMinutes = data.checkIns.filter((item) => item.completed).reduce((sum, item) => {
    const habit = data.habits.find((candidate) => candidate.id === item.habitId);
    return sum + (habit?.unit === "分钟" ? item.value : 0);
  }, 0);
  */
  const activeDays = completedDates(data.checkIns, data.reports).size;
  const reports = data.reports.length;
  const chatTurns = (data.agentConversations ?? []).reduce((sum, item) => sum + item.messages.filter((message) => message.role === "user").length, 0);
  const knowledgeFiles = data.knowledgeFiles?.length ?? 0;
  const foodReports = data.reports.filter((report) => report.breakfast || report.lunch || report.dinner).length;
  const plannerChats = (data.agentConversations ?? []).filter((item) => item.agent === "planner" && item.messages.length > 0).length;
  const values = [
    ["first", "娜娜启动!", "完成第一份可爱日报", "flower", reports, 1],
    ["streak-3", "小猫爪坚持", "连续打卡 3 天", "sparkle", streak, 3],
    ["streak-7", "一周亮晶晶", "连续认真 7 天", "star", streak, 7],
    ["minutes-300", "学习能量豆", "累计学习/训练 300 分钟", "seed", totalMinutes, 300],
    ["days-30", "南师小花园", "留下 30 个完整成长日", "bloom", activeDays, 30],
    ["chat-10", "AI 伙伴熟悉啦", "和智能体完成 10 轮有效对话", "chat", chatTurns, 10],
    ["library-3", "知识库小书架", "上传 3 份本地学习材料", "book", knowledgeFiles, 3],
    ["food-7", "好好吃饭星", "记录 7 天饮食线索", "meal", foodReports, 7],
    ["planner-5", "番茄钟指挥官", "开启 5 个计划助手会话", "timer", plannerChats, 5]
  ] as const;
  return values.map(([id, name, description, icon, progress, target]) => ({
    id,
    name,
    description,
    icon,
    progress: Math.min(progress, target),
    target,
    unlocked: progress >= target
  }));
}

export function weeklyCompletion(data: AppData, today: string): number {
  const week = new Set(weekRange(today));
  const scheduled = data.habits.flatMap((habit) =>
    [...week].filter((date) => habit.days.includes(new Date(`${date}T12:00:00`).getDay())).map((date) => `${date}:${habit.id}`)
  );
  if (!scheduled.length) return 0;
  const done = new Set(data.checkIns.filter((item) => item.completed).map((item) => `${item.date}:${item.habitId}`));
  return Math.round((scheduled.filter((key) => done.has(key)).length / scheduled.length) * 100);
}

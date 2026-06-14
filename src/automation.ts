import { Capacitor } from "@capacitor/core";
import { Geolocation } from "@capacitor/geolocation";
import { LocalNotifications } from "@capacitor/local-notifications";
import { deepSeekText, searchWeb } from "./.private/ai";
import { localDate, parseLocalDate, shiftDate } from "./date";
import type {
  AppData,
  AppSettings,
  AutomationRule,
  AutomationRun,
  AutomationTone,
  DailyBrief,
  WeatherSnapshot
} from "./types";

const tones: AutomationTone[] = ["励志", "幽默", "安慰", "温柔"];

export function stripMarkdown(value: string): string {
  return value
    .replace(/```[\s\S]*?```/g, (block) => block.replace(/```[\w-]*\n?/g, ""))
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^>\s?/gm, "")
    .replace(/[*_~`]/g, "")
    .replace(/^\s*[-+]\s+/gm, "· ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function truncateText(value: string, maxLength = 120): string {
  const clean = stripMarkdown(value).replace(/\s*\n\s*/g, " ");
  return clean.length > maxLength ? `${clean.slice(0, maxLength - 1)}…` : clean;
}

export function weatherSummary(code: number): string {
  if (code === 0) return "晴朗";
  if (code <= 3) return "多云";
  if (code <= 48) return "有雾";
  if (code <= 57) return "细雨";
  if (code <= 67) return "有雨";
  if (code <= 77) return "有雪";
  if (code <= 82) return "阵雨";
  if (code <= 86) return "阵雪";
  return "雷雨";
}

export function nextAutomationDates(today = localDate(), count = 7): string[] {
  return Array.from({ length: count }, (_, index) => shiftDate(today, index));
}

export function notificationDate(date: string, time: string): Date {
  const value = parseLocalDate(date);
  const [hours, minutes] = time.split(":").map(Number);
  value.setHours(hours || 0, minutes || 0, 0, 0);
  return value;
}

export function fallbackCompanionMessage(date: string, tone: AutomationTone, alias = "陶陶"): string {
  const messages: Record<AutomationTone, string[]> = {
    励志: [
      "今天不用一下子变得很厉害，认真完成眼前这一小步，就已经在靠近想去的地方。",
      "允许进度慢一点，但别把自己的认真看轻。你正在做的事，会悄悄长出结果。"
    ],
    幽默: [
      "今日任务：先把最小的一件事做掉，然后理直气壮地奖励自己一口好吃的。",
      "脑子偶尔转圈很正常，先喝口水再继续，CPU 也需要温柔散热。"
    ],
    安慰: [
      "如果今天有点累，就把标准调低一点。休息不是退步，是在替明天保存力气。",
      "没完成的事情不会定义你。先照顾好此刻的自己，剩下的我们慢慢来。"
    ],
    温柔: [
      "今天也请好好吃饭、慢慢呼吸。你不需要表现得完美，也值得被认真喜欢。",
      "愿今天有一件很小的好事落在你身上，也愿你看见自己已经做得很好。"
    ]
  };
  const pool = messages[tone];
  const index = parseLocalDate(date).getDate() % pool.length;
  return `${pool[index]} — ${alias}`;
}

function notificationId(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) - hash + value.charCodeAt(index)) | 0;
  }
  return Math.abs(hash) % 2_000_000_000 || 1;
}

async function geocodeCity(city: string): Promise<{ latitude: number; longitude: number; name: string } | undefined> {
  if (!city.trim()) return undefined;
  const response = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city.trim())}&count=1&language=zh&format=json`);
  if (!response.ok) return undefined;
  const result = await response.json() as { results?: Array<{ latitude: number; longitude: number; name: string; admin1?: string }> };
  const place = result.results?.[0];
  return place ? { latitude: place.latitude, longitude: place.longitude, name: [place.name, place.admin1].filter(Boolean).join(" · ") } : undefined;
}

async function resolveLocation(settings: AppSettings): Promise<{ latitude: number; longitude: number; name: string; fromDevice: boolean }> {
  try {
    let permission = await Geolocation.checkPermissions();
    if (permission.location === "prompt" || permission.coarseLocation === "prompt") {
      permission = await Geolocation.requestPermissions();
    }
    if (permission.location === "granted" || permission.coarseLocation === "granted") {
      const position = await Geolocation.getCurrentPosition({ enableHighAccuracy: false, timeout: 9000, maximumAge: 30 * 60 * 1000 });
      return {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        name: "当前位置",
        fromDevice: true
      };
    }
  } catch {
    // Continue with the last known position or the configured fallback city.
  }

  if (typeof settings.lastLatitude === "number" && typeof settings.lastLongitude === "number") {
    return {
      latitude: settings.lastLatitude,
      longitude: settings.lastLongitude,
      name: settings.lastLocationName || "上次位置",
      fromDevice: false
    };
  }

  const fallback = await geocodeCity(settings.weatherFallbackCity || "天津");
  if (fallback) return { ...fallback, fromDevice: false };
  throw new Error("暂时无法获取天气位置，请在设置中填写备用城市");
}

async function fetchWeather(
  latitude: number,
  longitude: number,
  locationName: string,
  dates: string[]
): Promise<WeatherSnapshot[]> {
  const params = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
    daily: "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max",
    timezone: "auto",
    forecast_days: String(dates.length)
  });
  const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`);
  if (!response.ok) throw new Error("天气服务暂时不可用");
  const result = await response.json() as {
    daily?: {
      time: string[];
      weather_code: number[];
      temperature_2m_max: number[];
      temperature_2m_min: number[];
      precipitation_probability_max: number[];
    };
  };
  if (!result.daily) throw new Error("天气数据为空");
  return result.daily.time.map((date, index) => ({
    date,
    latitude,
    longitude,
    locationName,
    weatherCode: result.daily!.weather_code[index],
    summary: weatherSummary(result.daily!.weather_code[index]),
    temperatureMin: Math.round(result.daily!.temperature_2m_min[index]),
    temperatureMax: Math.round(result.daily!.temperature_2m_max[index]),
    precipitationProbability: Math.round(result.daily!.precipitation_probability_max[index] ?? 0),
    fetchedAt: new Date().toISOString()
  }));
}

function parseMessageBatch(value: string, dates: string[]): Record<string, string> {
  const clean = value.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  try {
    const parsed = JSON.parse(clean) as Array<{ date?: string; message?: string }>;
    return Object.fromEntries(parsed.filter((item) => item.date && item.message).map((item) => [item.date!, truncateText(item.message!, 150)]));
  } catch {
    const lines = stripMarkdown(value).split("\n").map((line) => line.replace(/^\d+[.)、]\s*/, "").trim()).filter(Boolean);
    return Object.fromEntries(dates.map((date, index) => [date, lines[index] || ""]));
  }
}

async function generateCompanionMessages(
  settings: AppSettings,
  dates: string[],
  weather: WeatherSnapshot[]
): Promise<{ messages: Record<string, string>; source: "deepseek" | "fallback" }> {
  const fallback = Object.fromEntries(dates.map((date, index) => [date, fallbackCompanionMessage(date, tones[index % tones.length], settings.companionAlias || "陶陶")]));
  if (!settings.deepSeekApiKey?.trim()) return { messages: fallback, source: "fallback" };

  const searchContext = settings.agentWebSearch
    ? await searchWeb(settings, "未来一周 中国 时令 生活 天气 学习 温柔提醒").catch(() => "")
    : "";
  const weatherContext = weather.map((item) => `${item.date} ${item.summary} ${item.temperatureMin}-${item.temperatureMax}℃ 降水${item.precipitationProbability}%`).join("\n");
  try {
    const answer = await deepSeekText(
      settings,
      "你是陶陶，给正在准备英语文学学习的洳写每日短寄语。只输出严格 JSON 数组，不用 Markdown。每条 35-70 个汉字，不说教、不制造焦虑、不重复。",
      [
        `日期：${dates.join(", ")}`,
        `语气依次轮换：${dates.map((_, index) => tones[index % tones.length]).join(", ")}`,
        `天气：\n${weatherContext || "暂无"}`,
        searchContext ? `联网素材，只可提炼不可照抄：\n${searchContext}` : "",
        '格式：[{"date":"YYYY-MM-DD","message":"纯文本"}]'
      ].filter(Boolean).join("\n\n"),
      1400
    );
    return { messages: { ...fallback, ...parseMessageBatch(answer, dates) }, source: "deepseek" };
  } catch {
    return { messages: fallback, source: "fallback" };
  }
}

function ruleBody(rule: AutomationRule, date: string, brief: DailyBrief, settings: AppSettings): string {
  if (rule.kind === "weather" && brief.weather) {
    const item = brief.weather;
    const rain = item.precipitationProbability >= 40 ? `，降水概率 ${item.precipitationProbability}%，记得带伞` : "";
    return `${item.locationName}今天${item.summary}，${item.temperatureMin}-${item.temperatureMax}℃${rain}。`;
  }
  if (rule.kind === "companion") return brief.companionMessage;
  if (rule.kind === "food") {
    const avoid = settings.foodRecentDislikes?.trim();
    return truncateText(`到饭点啦。今天也要有主食、蛋白质和蔬果${avoid ? `，顺便避开最近不想吃的 ${avoid}` : ""}。`, 120);
  }
  if (rule.kind === "study") return "今天实际完成了什么？写下一件就好。没有完成计划也没关系，记录真实进度比排满时间更重要。";
  return truncateText(rule.prompt || rule.title, 120);
}

async function scheduleNotifications(rules: AutomationRule[], runs: AutomationRun[]): Promise<"granted" | "denied" | "prompt"> {
  if (!Capacitor.isNativePlatform()) return "prompt";
  const permission = await LocalNotifications.requestPermissions();
  if (permission.display !== "granted") return permission.display === "denied" ? "denied" : "prompt";

  if (Capacitor.getPlatform() === "android") {
    await LocalNotifications.createChannel({
      id: "nana-daily",
      name: "LoveLog 每日提醒",
      description: "天气、陶陶寄语和每日温柔提醒",
      importance: 3,
      visibility: 1,
      vibration: true
    });
  }

  const pending = await LocalNotifications.getPending();
  const owned = pending.notifications.filter((item) => item.extra?.source === "nana-automation");
  if (owned.length) await LocalNotifications.cancel({ notifications: owned.map((item) => ({ id: item.id })) });

  const now = Date.now();
  const notifications = runs.flatMap((run) => {
    const rule = rules.find((item) => item.id === run.ruleId);
    if (!rule?.enabled || !rule.notify) return [];
    const at = notificationDate(run.date, rule.time);
    if (at.getTime() <= now) return [];
    return [{
      id: notificationId(`${run.ruleId}:${run.date}`),
      title: truncateText(run.title, 40),
      body: truncateText(run.body, 120),
      schedule: { at },
      channelId: "nana-daily",
      extra: { source: "nana-automation", ruleId: run.ruleId, date: run.date }
    }];
  });
  if (notifications.length) await LocalNotifications.schedule({ notifications });
  return "granted";
}

export async function rescheduleCachedNotifications(data: AppData): Promise<AppData> {
  const today = localDate();
  const futureRuns = data.automationRuns.filter((item) => item.date >= today);
  const permission = await scheduleNotifications(data.automations, futureRuns);
  return {
    ...data,
    automationRuns: data.automationRuns.map((item) => futureRuns.some((run) => run.id === item.id)
      ? { ...item, status: permission === "granted" ? "scheduled" as const : "generated" as const }
      : item),
    settings: { ...data.settings, notificationPermission: permission }
  };
}

export async function refreshAutomations(data: AppData): Promise<{ data: AppData; warning?: string }> {
  const today = localDate();
  const dates = nextAutomationDates(today);
  let location: Awaited<ReturnType<typeof resolveLocation>> | undefined;
  let weather: WeatherSnapshot[] = [];
  let warning: string | undefined;

  try {
    location = await resolveLocation(data.settings);
    weather = await fetchWeather(location.latitude, location.longitude, location.name, dates);
  } catch (error) {
    warning = error instanceof Error ? error.message : "天气暂时没有刷新";
    weather = data.dailyBriefs
      .map((item) => item.weather)
      .filter((item): item is WeatherSnapshot => item !== undefined)
      .filter((item) => dates.includes(item.date));
  }

  const generated = await generateCompanionMessages(data.settings, dates, weather);
  const weatherByDate = new Map(weather.map((item) => [item.date, item]));
  const briefs: DailyBrief[] = dates.map((date, index) => ({
    date,
    weather: weatherByDate.get(date),
    companionMessage: generated.messages[date] || fallbackCompanionMessage(date, tones[index % tones.length], data.settings.companionAlias || "陶陶"),
    tone: tones[index % tones.length],
    generatedAt: new Date().toISOString(),
    source: generated.source
  }));
  const briefByDate = new Map(briefs.map((item) => [item.date, item]));
  const runs: AutomationRun[] = data.automations.flatMap((rule) =>
    dates
      .filter((date) => rule.enabled && rule.days.includes(parseLocalDate(date).getDay()))
      .map((date) => {
        const brief = briefByDate.get(date)!;
        return {
          id: `${rule.id}:${date}`,
          ruleId: rule.id,
          date,
          title: rule.title,
          body: ruleBody(rule, date, brief, data.settings),
          status: "generated" as const,
          generatedAt: new Date().toISOString()
        };
      })
  );

  let notificationPermission = data.settings.notificationPermission ?? "prompt";
  try {
    notificationPermission = await scheduleNotifications(data.automations, runs);
    if (notificationPermission === "granted") runs.forEach((run) => { run.status = "scheduled"; });
  } catch {
    warning ??= "通知暂时没有排好，但今日内容已经保存";
  }

  return {
    warning,
    data: {
      ...data,
      dailyBriefs: [...data.dailyBriefs.filter((item) => item.date < today && item.date >= shiftDate(today, -30)), ...briefs],
      automationRuns: [...data.automationRuns.filter((item) => item.date < today && item.date >= shiftDate(today, -30)), ...runs],
      settings: {
        ...data.settings,
        notificationPermission,
        ...(location?.fromDevice ? {
          lastLatitude: location.latitude,
          lastLongitude: location.longitude,
          lastLocationName: location.name
        } : {})
      }
    }
  };
}

export function mergeAutomationRefresh(current: AppData, refreshed: AppData): AppData {
  return {
    ...current,
    dailyBriefs: refreshed.dailyBriefs,
    automationRuns: refreshed.automationRuns,
    settings: { ...current.settings, ...refreshed.settings }
  };
}

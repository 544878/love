import { Capacitor, CapacitorHttp } from "@capacitor/core";
import type { AgentChatMessage, AppSettings, KnowledgeChunk, KnowledgeFile } from "../types";

export type AgentKind = "english" | "food" | "planner";

export interface AgentRequest {
  agent: AgentKind;
  input: string;
  imageText?: string;
  context?: string;
  knowledgeFiles?: KnowledgeFile[];
  history?: AgentChatMessage[];
}

type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string | Array<{ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }>;
  reasoning_content?: string;
};

export interface AgentAnswer {
  text: string;
  reasoningContent?: string;
}

type ApiErrorBody = {
  error?: {
    message?: string;
  };
  message?: string;
};

type DeepSeekResult = {
  choices?: Array<{
    finish_reason?: string;
    message?: {
      content?: string;
      reasoning_content?: string;
    };
  }>;
};

function apiErrorMessage(data: unknown): string {
  if (typeof data === "string") {
    try {
      return apiErrorMessage(JSON.parse(data));
    } catch {
      return data.slice(0, 240);
    }
  }
  if (!data || typeof data !== "object") return "";
  const body = data as ApiErrorBody;
  return body.error?.message?.trim() || body.message?.trim() || "";
}

function readDeepSeekContent(result: DeepSeekResult): string {
  const choice = result.choices?.[0];
  const content = choice?.message?.content?.trim();
  if (content) return content;
  if (choice?.finish_reason === "length") {
    throw new Error("DeepSeek 思考内容达到输出上限，未生成最终回答，请重试");
  }
  throw new Error("DeepSeek 没有返回最终回答");
}

function readDeepSeekAnswer(result: DeepSeekResult): AgentAnswer {
  const choice = result.choices?.[0];
  return {
    text: readDeepSeekContent(result),
    reasoningContent: choice?.message?.reasoning_content?.trim() || undefined
  };
}

async function postJson<T>(
  url: string,
  headers: Record<string, string>,
  body: unknown,
  serviceName: string
): Promise<T> {
  if (Capacitor.isNativePlatform()) {
    const response = await CapacitorHttp.post({
      url,
      headers,
      data: body,
      responseType: "json",
      connectTimeout: 20_000,
      readTimeout: 120_000
    });
    if (response.status < 200 || response.status >= 300) {
      const detail = apiErrorMessage(response.data);
      throw new Error(`${serviceName} 调用失败（${response.status}）${detail ? `：${detail}` : ""}`);
    }
    return response.data as T;
  }

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body)
    });
  } catch {
    throw new Error(`${serviceName} 网络请求失败，请检查网络或跨域代理`);
  }

  const text = await response.text();
  let data: unknown = {};
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }
  if (!response.ok) {
    const detail = apiErrorMessage(data);
    throw new Error(`${serviceName} 调用失败（${response.status}）${detail ? `：${detail}` : ""}`);
  }
  return data as T;
}

const thinkingHints = {
  light: "先给结论，再给不超过三条关键理由，避免长篇推演。",
  balanced: "给出清晰结构、必要理由和可执行建议，保持适度深度。",
  deep: "允许更深入分析：先界定问题，再分层推理，补充背景、术语和反例。"
};

function uid(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function chunkText(text: string, maxLength = 900): KnowledgeChunk[] {
  const normalized = text.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  if (!normalized) return [];
  const paragraphs = normalized.split(/\n\s*\n/);
  const chunks: string[] = [];
  let current = "";
  for (const paragraph of paragraphs) {
    if ((current + "\n\n" + paragraph).trim().length > maxLength && current) {
      chunks.push(current.trim());
      current = paragraph;
    } else {
      current = [current, paragraph].filter(Boolean).join("\n\n");
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks.flatMap((chunk) => {
    if (chunk.length <= maxLength * 1.35) return [{ id: uid("chunk"), text: chunk }];
    return Array.from({ length: Math.ceil(chunk.length / maxLength) }, (_, index) => ({
      id: uid("chunk"),
      text: chunk.slice(index * maxLength, (index + 1) * maxLength)
    }));
  });
}

export function createKnowledgeFile(name: string, type: string, size: number, content: string): KnowledgeFile {
  return {
    id: uid("file"),
    name,
    type,
    size,
    uploadedAt: new Date().toISOString(),
    content,
    chunks: chunkText(content)
  };
}

async function embedTexts(settings: AppSettings, texts: string[]): Promise<number[][]> {
  const apiKey = settings.qwenApiKey?.trim();
  if (!apiKey || !texts.length) return [];
  const baseUrl = (settings.qwenBaseUrl || "https://dashscope.aliyuncs.com/compatible-mode/v1").replace(/\/+$/, "");
  const result = await postJson<{ data?: Array<{ embedding?: number[] }> }>(
    `${baseUrl}/embeddings`,
    {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    {
      model: settings.qwenEmbeddingModel || "text-embedding-v4",
      input: texts,
      dimensions: settings.qwenEmbeddingDimensions ?? 256
    },
    "Qwen Embedding"
  );
  return result.data?.map((item) => item.embedding ?? []) ?? [];
}

async function rerankTexts(settings: AppSettings, query: string, documents: string[], topN: number): Promise<Array<{ index: number; score: number }>> {
  const apiKey = settings.qwenApiKey?.trim();
  if (!apiKey || !settings.qwenRerankEnabled || !documents.length) return [];
  const result = await postJson<{
    results?: Array<{ index?: number; relevance_score?: number; score?: number }>;
    output?: {
      results?: Array<{ index?: number; relevance_score?: number; score?: number }>;
    };
  }>(
    settings.qwenRerankEndpoint || "https://dashscope.aliyuncs.com/compatible-api/v1/reranks",
    {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    {
      model: settings.qwenRerankModel || "qwen3-rerank",
      query: query.slice(0, 6000),
      documents: documents.map((item) => item.slice(0, 12000)),
      top_n: Math.max(1, topN),
      return_documents: false,
      instruct: "Given a student question, retrieve relevant local study passages that answer or support the question."
    },
    "Qwen Rerank"
  );
  return (result.results ?? result.output?.results ?? [])
    .filter((item): item is { index: number; relevance_score?: number; score?: number } => typeof item.index === "number" && (typeof item.relevance_score === "number" || typeof item.score === "number"))
    .map((item) => ({ index: item.index, score: item.relevance_score ?? item.score ?? 0 }));
}

export async function embedKnowledgeFile(settings: AppSettings, file: KnowledgeFile): Promise<KnowledgeFile> {
  if (!settings.qwenApiKey?.trim() || !file.chunks.length) return file;
  const embeddings = await embedTexts(settings, file.chunks.map((chunk) => chunk.text));
  return {
    ...file,
    chunks: file.chunks.map((chunk, index) => ({ ...chunk, embedding: embeddings[index] }))
  };
}

function cosine(a: number[], b: number[]): number {
  const length = Math.min(a.length, b.length);
  let dot = 0;
  let a2 = 0;
  let b2 = 0;
  for (let index = 0; index < length; index += 1) {
    dot += a[index] * b[index];
    a2 += a[index] ** 2;
    b2 += b[index] ** 2;
  }
  return a2 && b2 ? dot / (Math.sqrt(a2) * Math.sqrt(b2)) : 0;
}

function lexicalScore(query: string, text: string): number {
  const tokens = query.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((token) => token.length > 1);
  if (!tokens.length) return 0;
  const haystack = text.toLowerCase();
  return tokens.reduce((score, token) => score + (haystack.includes(token) ? 1 : 0), 0) / tokens.length;
}

export async function retrieveKnowledge(settings: AppSettings, files: KnowledgeFile[] = [], query: string, limit = 5): Promise<string> {
  const chunks = files.flatMap((file) => file.chunks.map((chunk) => ({ file, chunk })));
  if (!chunks.length || !query.trim()) return "";
  let scored = chunks.map((item) => ({ ...item, score: lexicalScore(query, item.chunk.text) }));

  if (settings.qwenApiKey?.trim() && chunks.some((item) => item.chunk.embedding?.length)) {
    try {
      const [queryEmbedding] = await embedTexts(settings, [query]);
      if (queryEmbedding?.length) {
        scored = chunks.map((item) => ({
          ...item,
          score: item.chunk.embedding?.length ? cosine(queryEmbedding, item.chunk.embedding) : lexicalScore(query, item.chunk.text) * 0.2
        }));
      }
    } catch {
      // Fall back to lexical retrieval when embedding is unavailable.
    }
  }

  let candidates = scored
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(limit, 18));

  if (settings.qwenApiKey?.trim() && settings.qwenRerankEnabled && candidates.length > 1) {
    try {
      const reranked = await rerankTexts(settings, query, candidates.map((item) => item.chunk.text), limit);
      if (reranked.length) {
        candidates = reranked.map((item) => ({ ...candidates[item.index], score: item.score })).filter((item) => item.chunk);
      }
    } catch {
      // Keep the embedding/keyword order when rerank is unavailable.
    }
  }

  return candidates
    .slice(0, limit)
    .map((item, index) => `[#${index + 1} ${item.file.name}]\n${item.chunk.text}`)
    .join("\n\n---\n\n");
}

export async function searchWeb(settings: AppSettings, query: string): Promise<string> {
  const apiKey = settings.serperApiKey?.trim();
  if (!apiKey || !settings.agentWebSearch || !query.trim()) return "";
  const result = await postJson<{
    answerBox?: { title?: string; answer?: string; snippet?: string; link?: string };
    knowledgeGraph?: { title?: string; description?: string; attributes?: Record<string, string> };
    organic?: Array<{ title?: string; link?: string; snippet?: string }>;
    news?: Array<{ title?: string; link?: string; snippet?: string; date?: string; source?: string }>;
  }>(
    settings.serperEndpoint || "https://google.serper.dev/search",
    {
      "Content-Type": "application/json",
      "X-API-KEY": apiKey
    },
    { q: query, gl: "cn", hl: "zh-cn", num: 5 },
    "Serper"
  );
  const blocks: string[] = [];
  if (result.answerBox) {
    blocks.push(`直接答案：${result.answerBox.title ?? ""}\n${result.answerBox.answer ?? result.answerBox.snippet ?? ""}\n${result.answerBox.link ?? ""}`.trim());
  }
  if (result.knowledgeGraph) {
    const attributes = Object.entries(result.knowledgeGraph.attributes ?? {}).slice(0, 5).map(([key, value]) => `${key}: ${value}`).join("\n");
    blocks.push(`知识面板：${result.knowledgeGraph.title ?? ""}\n${result.knowledgeGraph.description ?? ""}${attributes ? `\n${attributes}` : ""}`.trim());
  }
  blocks.push(...(result.organic ?? [])
    .slice(0, 6)
    .map((item, index) => `网页 ${index + 1}. ${item.title ?? "Untitled"}\n${item.snippet ?? ""}\n${item.link ?? ""}`));
  blocks.push(...(result.news ?? [])
    .slice(0, 3)
    .map((item, index) => `新闻 ${index + 1}. ${item.title ?? "Untitled"}\n${item.source ?? ""} ${item.date ?? ""}\n${item.snippet ?? ""}\n${item.link ?? ""}`));
  return blocks.filter(Boolean)
    .join("\n\n");
}

export function aiCapabilities(settings: AppSettings): string {
  return [
    `思考程度：${settings.agentThinking ?? "balanced"}`,
    `联网搜索：${settings.agentWebSearch && settings.serperApiKey?.trim() ? "已开启，将使用 Serper 搜索" : "关闭或未配置 Serper Key"}`,
    `上传文件：${settings.agentFileUpload ? "用户已开启，当前可接收 OCR/文件摘要文本作为上下文" : "关闭"}`
  ].join("\n");
}

export function agentSystemPrompt(settings: AppSettings, agent: AgentKind): string {
  const base = [
    `学生：${settings.ownerName}`,
    `陪伴者：${settings.partnerName || "程韵陶"}，昵称：${settings.companionAlias || "陶陶"}`,
    `目标：${settings.targetSchool}${settings.targetMajor}`,
    thinkingHints[settings.agentThinking ?? "balanced"],
    aiCapabilities(settings),
    "请输出兼容 react-markdown 的 Markdown：使用普通标题、列表、粗体和表格；不要输出 HTML；数学内容用标准 LaTeX。"
  ].join("\n");

  const prompts: Record<AgentKind, string> = {
    english: [
      base,
      "你是专业的英美文学与英语阅读导师。语气应稳、准、专业，可以使用文学术语，但每个术语都要让学生能理解。",
      "重点能力：细读 close reading、叙事视角、意象、修辞、主题、时代语境、翻译与长难句拆解。",
      "回答结构优先：文本要点 -> 语言/句法 -> 文学解读 -> 可迁移阅读方法 -> 练习。"
    ].join("\n"),
    food: [
      base,
      "你是营养均衡的饮食智能助手。目标不是节食，而是让她吃得稳定、舒服、有蛋白质、有蔬果、有主食。",
      `长期规避/不喜欢：${settings.foodAvoids || "暂无"}`,
      `最近不想吃：${settings.foodRecentDislikes || "暂无"}`,
      "制定建议时必须规避不喜欢和最近不想吃的食物，并说明替代食材。不要制造焦虑，不要给医疗诊断。"
    ].join("\n"),
    planner: [
      base,
      "你是学习计划与番茄钟助手。不要把时间排满，不要机械地写“某科多少分钟”。",
      "先把总时长拆成 25-45 分钟的可选择专注块，中间安排缓冲。每轮结束后让学生输入实际完成内容，再调整下一轮。",
      "回答必须包含：本轮建议、开始前准备、结束后复盘问题、下一轮如何根据反馈调整。"
    ].join("\n")
  };

  return prompts[agent];
}

export function fallbackAgentAnswer(settings: AppSettings, request: AgentRequest): string {
  if (request.agent === "food") {
    return [
      "### 今日饮食建议",
      "",
      `已避开：${settings.foodAvoids || "暂无明确忌口"}；最近不想吃：${settings.foodRecentDislikes || "暂无记录"}。`,
      "",
      "- 早餐：主食 + 蛋白质 + 一点水果，例如全麦面包/燕麦、鸡蛋或牛奶、香蕉/苹果。",
      "- 午餐：米饭或面条 + 优质蛋白 + 两种蔬菜，口味尽量清爽。",
      "- 晚餐：不要过度压低碳水，选易消化组合，例如杂粮饭、鱼/鸡胸/豆腐、绿叶菜。",
      "",
      "如果今天有特别不想吃的东西，把它记下来，我下次会自动规避。"
    ].join("\n");
  }

  if (request.agent === "planner") {
    return [
      "### 先做一轮，不把今天塞满",
      "",
      "- 本轮：30 分钟进入状态，只完成一个最小任务。",
      "- 准备：打开材料、写下本轮目标、手机放远。",
      "- 结束后告诉我：实际学了什么、卡在哪里、精力 1-5 分。",
      "- 下一轮我会根据反馈调整难度，而不是提前把 5 小时全部排死。"
    ].join("\n");
  }

  const material = request.imageText ? `\n\n### OCR 文本\n${request.imageText}` : "";
  return [
    "### 本地版英语导师提示",
    "",
    "还没有配置 DeepSeek Key，所以先给你一个可执行的阅读框架：",
    "",
    "1. 先圈出关键词、反复出现的意象和情绪转折。",
    "2. 再拆句法：主句、从句、插入语、修饰成分分别承担什么功能。",
    "3. 如果是文学文本，重点看叙事视角、象征、语气、时代背景和人物关系。",
    "4. 最后用自己的话复述主旨，并整理 2 个可迁移表达。",
    request.input ? `\n你的问题：${request.input}` : "",
    material
  ].filter(Boolean).join("\n");
}

function buildHistoryMessages(history: AgentChatMessage[] = [], limitChars = 800000): ChatMessage[] {
  const messages: ChatMessage[] = [];
  let used = 0;
  for (const item of [...history].reverse()) {
    const content = item.text.slice(0, 120000);
    const reasoning = item.reasoningContent?.slice(0, 120000);
    const cost = content.length + (reasoning?.length ?? 0);
    if (used + cost > limitChars) break;
    used += cost;
    messages.unshift({
      role: item.role,
      content,
      ...(item.role === "assistant" && reasoning ? { reasoning_content: reasoning } : {})
    });
  }
  return messages;
}

export async function askAgent(settings: AppSettings, request: AgentRequest): Promise<AgentAnswer> {
  const apiKey = settings.deepSeekApiKey?.trim();
  if (!apiKey) return { text: fallbackAgentAnswer(settings, request) };

  const baseUrl = (settings.deepSeekBaseUrl || "https://api.deepseek.com").replace(/\/+$/, "");
  const query = [request.input, request.imageText].filter(Boolean).join("\n").slice(0, 4000);
  const [knowledgeContext, searchContext] = await Promise.all([
    retrieveKnowledge(settings, request.knowledgeFiles, query, 8),
    searchWeb(settings, query).catch(() => "")
  ]);
  const thinkingEnabled = settings.agentThinking !== "light";
  const temperature = Math.min(1.5, Math.max(0, settings.deepSeekTemperature ?? (request.agent === "english" ? 0.45 : 0.58)));
  const maxTokens = Math.min(384000, Math.max(2048, settings.deepSeekMaxOutputTokens ?? (thinkingEnabled ? 65536 : 4096)));
  const historyMessages = buildHistoryMessages(request.history, settings.agentContextLimitChars ?? 800000);
  const result = await postJson<DeepSeekResult>(
    `${baseUrl}/chat/completions`,
    {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    {
      model: settings.deepSeekModel || "deepseek-v4-pro",
      thinking: { type: thinkingEnabled ? "enabled" : "disabled" },
      ...(thinkingEnabled
        ? { reasoning_effort: settings.agentThinking === "deep" ? "max" : "high" }
        : { temperature }),
      messages: [
        { role: "system", content: agentSystemPrompt(settings, request.agent) },
        ...historyMessages,
        {
          role: "user",
          content: [
            request.context ? `上下文：\n${request.context}` : "",
            knowledgeContext ? `本地文件库 RAG 命中片段：\n${knowledgeContext}` : "",
            searchContext ? `Serper 联网搜索结果：\n${searchContext}` : "",
            request.imageText ? `OCR/文件文本：\n${request.imageText}` : "",
            request.input ? `用户问题：\n${request.input}` : ""
          ].filter(Boolean).join("\n\n")
        }
      ] satisfies ChatMessage[],
      max_tokens: maxTokens
    },
    "DeepSeek"
  );
  return readDeepSeekAnswer(result);
}

export async function deepSeekText(
  settings: AppSettings,
  system: string,
  user: string,
  maxTokens = 1200
): Promise<string> {
  const apiKey = settings.deepSeekApiKey?.trim();
  if (!apiKey) throw new Error("尚未配置 DeepSeek API Key");
  const baseUrl = (settings.deepSeekBaseUrl || "https://api.deepseek.com").replace(/\/+$/, "");
  const result = await postJson<DeepSeekResult>(
    `${baseUrl}/chat/completions`,
    {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    {
      model: settings.deepSeekModel || "deepseek-v4-pro",
      thinking: { type: "enabled" },
      reasoning_effort: "max",
      messages: [
        { role: "system", content: system },
        { role: "user", content: user }
      ],
      max_tokens: Math.max(maxTokens, 16_384)
    },
    "DeepSeek"
  );
  return readDeepSeekContent(result);
}

export async function qwenOcrImage(settings: AppSettings, dataUrl: string): Promise<string> {
  const apiKey = settings.qwenApiKey?.trim();
  if (!apiKey) throw new Error("尚未配置 Qwen OCR API Key");

  const baseUrl = (settings.qwenBaseUrl || "https://dashscope.aliyuncs.com/compatible-mode/v1").replace(/\/+$/, "");
  const result = await postJson<{ choices?: Array<{ message?: { content?: string } }> }>(
    `${baseUrl}/chat/completions`,
    {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    {
      model: settings.qwenOcrModel || "qwen-vl-ocr",
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "请对图片做 OCR。保留英文原文、换行顺序、题号和可见标点；不要解释，只输出识别文本。" },
            { type: "image_url", image_url: { url: dataUrl } }
          ]
        }
      ] satisfies ChatMessage[],
      temperature: 0
    },
    "Qwen OCR"
  );
  return result.choices?.[0]?.message?.content?.trim() ?? "";
}

export async function qwenTts(settings: AppSettings, text: string): Promise<string> {
  const apiKey = settings.qwenApiKey?.trim();
  if (!apiKey) throw new Error("尚未配置 Qwen API Key");
  const result = await postJson<{
    output?: {
      audio?: { url?: string };
      choices?: Array<{ message?: { audio?: { url?: string } } }>;
    };
  }>(
    settings.qwenTtsEndpoint || "https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation",
    {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    {
      model: settings.qwenTtsModel || "qwen3-tts-flash",
      input: {
        text: text.slice(0, 1200),
        voice: settings.qwenTtsVoice || "Cherry"
      }
    },
    "Qwen TTS"
  );
  const audioUrl = result.output?.audio?.url ?? result.output?.choices?.[0]?.message?.audio?.url;
  if (!audioUrl) throw new Error("Qwen TTS 没有返回音频地址");
  return audioUrl;
}

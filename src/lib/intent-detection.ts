/**
 * 意图监控逻辑（第一阶段·自发性逻辑排雷）
 * 在每一轮分身/用户发言后，对近期讨论进行意图扫描，判断是否应触发刘看山「吹哨介入」。
 *
 * 维度 A（事实争议）：对客观数据产生严重分歧
 * 维度 B（逻辑死锁）：进入复读机模式，不再产出新观点
 * 维度 C（硬核死角）：有人提出无法绕过的致命风险
 * 维度 D（强制兜底）：对话轮数 ≥ 4 轮，强制吹哨
 */

import { minimaxChat, isMinimaxConfigured } from "@/lib/minimax";

/** 单条讨论消息（用于扫描） */
export interface IntentScanMessage {
  senderLabel: string;
  content: string;
  kind: string;
}

/** 轮数阈值：达到后强制吹哨（维度 D） */
export const ROUND_THRESHOLD = 4;

/** 维度标识 */
export type IntentDimension = "A" | "B" | "C" | "D";

export interface DimensionResult {
  triggered: boolean;
  summary?: string;
}

export interface IntentScanResult {
  /** 是否应吹哨（任一维度触发或轮数达标） */
  shouldTrigger: boolean;
  /** 触发的维度列表 */
  triggeredBy: IntentDimension[];
  /** 各维度详情（仅触发的有值） */
  dimensions: {
    A?: DimensionResult;
    B?: DimensionResult;
    C?: DimensionResult;
    D?: DimensionResult;
  };
  /** 当前对话轮数（human+agent 消息条数） */
  roundCount: number;
  /** 刘看山吹哨话术建议（LLM 生成） */
  suggestedScript?: string;
  /** 建议的实证关键词（3 个，用于知乎检索） */
  suggestedKeywords?: string[];
}

/** 可选：发起人需求与目标，用于让 LLM 基于「需求+讨论」提炼实证关键词 */
export interface IntentScanContext {
  projectTitle?: string;
  projectGoal?: string;
}

/**
 * 对讨论记录做意图扫描。
 * @param messages 近期消息（建议仅 spontaneous 阶段的 human/agent，按时间正序）
 * @param roundCount 对话轮数（human+agent 条数），若未传则用 messages 长度
 * @param context 可选：发起人需求与目标，用于基于「需求+讨论」提炼知乎检索关键词
 */
export async function runIntentScan(
  messages: IntentScanMessage[],
  roundCount?: number,
  context?: IntentScanContext
): Promise<IntentScanResult> {
  const count = roundCount ?? messages.length;
  const triggeredBy: IntentDimension[] = [];
  const dimensions: IntentScanResult["dimensions"] = {};

  // 维度 D：强制兜底
  if (count >= ROUND_THRESHOLD) {
    triggeredBy.push("D");
    dimensions.D = { triggered: true, summary: `对话已达 ${count} 轮，触发强制吹哨` };
  }

  // 无有效讨论内容时，仅 D 可能触发
  const humanOrAgent = messages.filter((m) => m.kind === "human" || m.kind === "agent");
  if (humanOrAgent.length === 0) {
    return {
      shouldTrigger: triggeredBy.length > 0,
      triggeredBy,
      dimensions,
      roundCount: count,
    };
  }

  const discussionText = humanOrAgent
    .map((m) => `【${m.senderLabel}】${m.content}`)
    .join("\n\n");

  const titleBlock =
    context?.projectTitle || context?.projectGoal
      ? `发起人需求：${context.projectTitle ?? "（未填）"}\n目标：${context.projectGoal ?? "（未填）"}\n\n`
      : "";

  // 维度 A/B/C：用 LLM 判断
  if (isMinimaxConfigured()) {
    const systemPrompt = `你是一个需求评审意图分析助手。根据一段讨论内容，判断以下三个维度是否被触发。只输出一个 JSON 对象，不要 markdown 代码块，不要其他说明。

输出格式（严格遵循）：
{
  "dimensionA_factDispute": { "triggered": true或false, "summary": "若触发，一句话说明：是否对客观数据（如市场占有率、技术可行性）产生严重分歧" },
  "dimensionB_logicDeadlock": { "triggered": true或false, "summary": "若触发，一句话说明：是否进入复读、不再产出新观点" },
  "dimensionC_criticalRisk": { "triggered": true或false, "summary": "若触发，一句话说明：是否有人提出无法绕过的致命风险" },
  "suggestedScript": "若任一维度触发，写一句刘看山吹哨话术，例如：停！关于「高并发」的技术可行性大家吵得最凶，我来调取知乎实锤。否则为空字符串",
  "suggestedKeywords": ["关键词1", "关键词2", "关键词3"]
}

suggestedKeywords 必须严格基于「发起人需求、目标」与「上述讨论」中的分歧、焦点、疑点提炼，用于后续在知乎检索验证；不要使用与本次讨论无关的通用词（如情绪递进、行为引导、触发条件、需求抽象、用户场景等）。`;

    const userPrompt = `${titleBlock}讨论内容：\n\n${discussionText}\n\n请输出上述 JSON。`;

    try {
      const result = await minimaxChat(
        [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        { temperature: 0.3, max_tokens: 800 }
      );

      let jsonStr = result.content.trim();
      const codeBlock = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (codeBlock) jsonStr = codeBlock[1].trim();

      const parsed = JSON.parse(jsonStr) as {
        dimensionA_factDispute?: { triggered?: boolean; summary?: string };
        dimensionB_logicDeadlock?: { triggered?: boolean; summary?: string };
        dimensionC_criticalRisk?: { triggered?: boolean; summary?: string };
        suggestedScript?: string;
        suggestedKeywords?: string[];
      };

      if (parsed.dimensionA_factDispute?.triggered) {
        triggeredBy.push("A");
        dimensions.A = {
          triggered: true,
          summary: parsed.dimensionA_factDispute.summary,
        };
      }
      if (parsed.dimensionB_logicDeadlock?.triggered) {
        triggeredBy.push("B");
        dimensions.B = {
          triggered: true,
          summary: parsed.dimensionB_logicDeadlock.summary,
        };
      }
      if (parsed.dimensionC_criticalRisk?.triggered) {
        triggeredBy.push("C");
        dimensions.C = {
          triggered: true,
          summary: parsed.dimensionC_criticalRisk.summary,
        };
      }

      return {
        shouldTrigger: triggeredBy.length > 0,
        triggeredBy,
        dimensions,
        roundCount: count,
        suggestedScript: parsed.suggestedScript?.trim() || undefined,
        suggestedKeywords: Array.isArray(parsed.suggestedKeywords)
          ? parsed.suggestedKeywords.filter((x): x is string => typeof x === "string").slice(0, 5)
          : undefined,
      };
    } catch (e) {
      console.error("[intent-detection] LLM error:", e);
      // LLM 失败时仅依赖维度 D
      return {
        shouldTrigger: triggeredBy.length > 0,
        triggeredBy,
        dimensions,
        roundCount: count,
      };
    }
  }

  return {
    shouldTrigger: triggeredBy.length > 0,
    triggeredBy,
    dimensions,
    roundCount: count,
  };
}

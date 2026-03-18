# MiniMax 对接说明（与 Second Me 配合）

## 为什么需要 MiniMax？

根据 **Second Me 需求文档**：

- **Second Me** 提供：OAuth 登录、用户信息、以及 **Agent 的 chat 接口**（代表用户的 AI 分身对话）。
- **额外 LLM 能力**（如做总结、判断、生成内容等）需要**自己接入** Claude / Gemini / OpenAI / **MiniMax** 等 API，比赛不提供这部分资源。

本项目的 **PRD** 中：

- A2A 辩论、刘看山总结 等由 **MiniMax** 提供（赛事 $30 代金券，高 TPS）。
- 流程：`B->>LLM: 开启 A2A 辩论` → `B->>LLM: 汇总日志, 以刘看山语气生成结构化执行方案`。

因此：**Second Me = 登录 + 用户/分身；MiniMax = 辩论与总结的文本模型**，二者配合使用。

---

## 一、获取 MiniMax 密钥

1. **注册/登录**  
   [MiniMax 开放平台](https://platform.minimax.io)

2. **创建 API Key**  
   - 路径：**账户管理 > 接口密钥**（[直达](https://platform.minimax.io/user-center/basic-information/interface-key)）  
   - 选择 **Coding Plan**（仅文本）或 **Pay-as-you-go**（多模态）  
   - 创建后复制 **API Key**（只显示一次，请妥善保存）

3. **赛事代金券（可选）**  
   - 每队可申领 **$30 MiniMax 代金券**  
   - 申领：在 [reconnect-hackathon.com/minimax](https://reconnect-hackathon.com/minimax) 填写申领表  
   - 发放后在 [平台代金券页](https://platform.minimax.io/user-center/payment/voucher) 查收

---

## 二、项目内配置

在项目根目录 `.env.local` 中增加（不要提交到 Git）：

```bash
# MiniMax 文本模型（A2A 辩论、刘看山总结）
MINIMAX_API_KEY=你的_API_Key
```

可选：

```bash
# 默认 https://api.minimax.io，一般不用改
# MINIMAX_BASE_URL=https://api.minimax.io
```

---

## 三、代码里怎么用

已封装 `src/lib/minimax.ts`：

- **`minimaxChat(messages, options)`**：非流式对话，返回 `{ content, usage?, finish_reason? }`  
- **`isMinimaxConfigured()`**：是否已配置 API Key，可用于功能开关  

示例（在 API Route 或 Server Action 中）：

```ts
import { minimaxChat, isMinimaxConfigured } from "@/lib/minimax";

if (!isMinimaxConfigured()) {
  return NextResponse.json({ code: 400, message: "未配置 MiniMax" }, { status: 400 });
}

const result = await minimaxChat(
  [
    { role: "system", content: "你是刘看山，负责总结辩论并输出落地方案。" },
    { role: "user", content: "请根据以下讨论总结..." },
  ],
  { model: "MiniMax-M2.5", temperature: 0.7, max_tokens: 2048 }
);

console.log(result.content);
```

后续在「讨论记录」生成、「刘看山·总结报告」等接口中，直接调用 `minimaxChat` 即可。

---

## 四、与 Second Me 的分工

| 能力           | 提供方    | 说明 |
|----------------|-----------|------|
| 登录、用户信息 | Second Me | OAuth + `/api/user/info` 等 |
| Agent 分身对话 | Second Me | 代表用户的 AI 对话（若需可调 Second Me API） |
| 辩论内容生成   | MiniMax   | 本仓库 `minimaxChat` |
| 刘看山总结     | MiniMax   | 本仓库 `minimaxChat` |

密钥务必放在环境变量中，不要写进代码或提交到仓库。

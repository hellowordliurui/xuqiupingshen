import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";

/** 开发用：在库中创建一条项目数据并插入多轮讨论。需已登录，当前用户为发起者。 */

const PROJECT = {
  title: "习惯打卡小程序 MVP",
  goal: "一个月内上线一款帮用户记录每日习惯并打卡的小程序，验证留存与日活。",
  category: "tech",
  roles: ["架构师", "产品", "设计师", "运营"],
};

const MESSAGES = [
  { senderLabel: "发起者", kind: "human" as const, content: "我们想做一个小程序，帮用户记录每日习惯并打卡，目标是一个月内能上线 MVP，先验证有没有人愿意持续用。" },
  { senderLabel: "架构师", kind: "human" as const, content: "技术栈我建议用 Taro + 云开发，开发快、一个人能扛。但云开发的冷启动和并发上限要提前评估，大促或突然爆量容易踩坑。" },
  { senderLabel: "产品", kind: "human" as const, content: "争议点我觉得主要是三块：技术选型是否稳妥、首月目标到底是「上线」还是「有真实留存」、以及设计资源能不能跟上，否则体验拉胯留不住人。" },
  { senderLabel: "设计师", kind: "human" as const, content: "打卡的反馈一定要够轻、够爽，否则用户坚持不了几天。动画和成就体系不能省，哪怕先做一版简单的，也比纯文字打卡强。" },
  { senderLabel: "运营", kind: "human" as const, content: "习惯类产品同质化严重，获客成本会很高。首月如果只做功能不想清楚拉新和留存，很容易做出来没人用。建议先定一个最小获客渠道和留存指标。" },
  { senderLabel: "架构师", kind: "human" as const, content: "云开发这边我可以先压测一版，把冷启动和并发上限摸清楚再定技术方案。如果上限不够，我们得提前考虑迁到自建或混合方案。" },
  { senderLabel: "发起者", kind: "human" as const, content: "那首月我们就定两个硬指标：上线可用的 MVP + 至少 100 个真实用户的 7 日留存数据，用来判断要不要继续投入。" },
];

/**
 * GET /api/dev/seed-project
 * 返回简单页面，点击按钮即 POST 创建项目+讨论（需已登录）。
 */
export async function GET() {
  return new NextResponse(
    `<!DOCTYPE html><html><head><meta charset="utf-8"><title>创建示例项目</title></head><body>
  <h1>在库中创建一条项目 + 讨论</h1>
  <p>需已登录。点击后会用当前用户为发起者创建「习惯打卡小程序 MVP」并插入 7 条讨论。</p>
  <button id="btn">创建项目并插入讨论</button>
  <pre id="out"></pre>
  <script>
    document.getElementById('btn').onclick = async () => {
      const out = document.getElementById('out');
      out.textContent = '请求中…';
      try {
        const r = await fetch('/api/dev/seed-project', { method: 'POST', credentials: 'include' });
        const j = await r.json();
        out.textContent = JSON.stringify(j, null, 2);
        if (j.url) out.innerHTML += '\\n\\n<a href="' + j.url + '">打开项目</a>';
      } catch (e) { out.textContent = e.message; }
    };
  </script>
</body></html>`,
    { headers: { "Content-Type": "text/html; charset=utf-8" } }
  );
}

/**
 * POST /api/dev/seed-project
 * 用当前登录用户为发起者，创建一条项目并插入多轮讨论。无需 body。
 */
export async function POST() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ ok: false, error: "请先登录" }, { status: 401 });
  }

  const project = await prisma.project.create({
    data: {
      hostUserId: session.id,
      title: PROJECT.title,
      goal: PROJECT.goal,
      category: PROJECT.category,
      stage: "debating",
    },
  });

  await prisma.slot.createMany({
    data: [
      { projectId: project.id, role: "host", type: "human", userId: session.id },
      ...PROJECT.roles.map((role) => ({ projectId: project.id, role, type: "agent" })),
    ],
  });

  const created = await prisma.debateMessage.createMany({
    data: MESSAGES.map((m) => ({
      projectId: project.id,
      kind: m.kind,
      senderLabel: m.senderLabel,
      content: m.content,
    })),
  });

  const total = await prisma.debateMessage.count({ where: { projectId: project.id } });

  return NextResponse.json({
    ok: true,
    projectId: project.id,
    title: project.title,
    goal: project.goal,
    slots: 1 + PROJECT.roles.length,
    messagesInserted: created.count,
    totalMessages: total,
    url: `/projects/${project.id}`,
  });
}

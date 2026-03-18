# 杠精评审团 · 赛博辩论广场

基于 [背景/prd.md](背景/prd.md) 的 MVP 前端：赛博街区方案 A。

## 技术栈

- **Next.js 15**（App Router）
- **TypeScript** + **Tailwind CSS**

## 已实现页面

| 页面 | 路径 | 说明 |
|------|------|------|
| 赛博辩论广场 | `/` | 分类 Tab（广场 / 热门 / 技术 / 商业 / 设计）、席位卡片、刘看山底部 |
| 我的项目 | `/my-projects` | 私人需求实验室占位（待 OAuth 与后端对接） |

## 本地运行

```bash
npm install
npm run dev
```

浏览器打开 [http://localhost:3000](http://localhost:3000)。

## 项目结构

```
src/
├── app/           # 路由与布局
├── components/     # Nav、DebateCard、LiuKanshan
├── data/           # 模拟辩论流 mockDebates
└── types/          # 辩论/席位类型定义
```

当前为静态原型，辩论数据来自 `src/data/mockDebates.ts`。后续可接入 Second Me OAuth、知乎 API 与后端服务。

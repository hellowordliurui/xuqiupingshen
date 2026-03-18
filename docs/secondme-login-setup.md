# Second Me 授权登录接入

本项目已按 [Second-Me-Skills](https://github.com/mindverse/Second-Me-Skills) 与 [OAuth2 文档](https://develop-docs.second.me/zh/docs/authentication/oauth2) 手写接入授权登录与获取个人信息，无需再通过 Skill 生成代码。

## 本仓库已实现

- **OAuth2**：`/api/auth/login` 跳转授权 → `/api/auth/callback` 用授权码换 Token → 存库并写 session cookie
- **会话**：Prisma `User` + `Session`，cookie `sid`，自动刷新 access_token
- **用户信息**：`/api/user/info` 代理 SecondMe `GET /api/secondme/user/info`
- **前端**：导航栏「通过 Second Me 登录」/ 头像+姓名+退出

配置 `.env.local` 后执行 `npx prisma db push` 与 `npm run dev` 即可使用。

---

## 可选：用 Skill 生成（若你从零开始）

核心：**先装 Skill，再用 Skill 做 OAuth 登录**。Kimi 的作用是「没有 Claude 时用 Kimi 跑同一套开发流程」；登录实现本身依赖的是 **Second Me 的 Skill**。

---

## 一、安装 Second Me Skill（必做）

在 **Claude Code**（或支持该 Skill 的环境，无 Claude 时选 Kimi）里执行：

```bash
/plugin marketplace add mindverse/Second-Me-Skills
/plugin install secondme-skills@mindverse-secondme-skills
```

安装后会有 Second Me 相关命令（如 `/secondme`），用于做 OAuth 和调用 Second Me API。

- Skills 仓库：<https://github.com/mindverse/Second-Me-Skills>

---

## 二、拿到密钥（登录用）

1. 打开 **Second Me 开发者平台**：<https://develop.second.me/>
2. 注册/登录 → **创建应用**。
3. 记下：
   - **Client ID**
   - **Client Secret**  
   后面用 Skill 开发时，AI 会问你要这两个，填进去即可。

---

## 三、用 Skill 做「登录那部分」

在 Claude Code（或 Kimi）里**用自然语言 + Skill** 让 AI 帮你接 OAuth，例如：

> 我想做一个网站，该网站可以获取我 SecondMe 的个人信息，并集成 SecondMe 的 OAuth 登录。  
> 具体的你可以使用 SecondMe 的这个 skills 来开发：`/secondme`

AI 会：

- 用 Second Me Skill 生成/修改代码；
- 接入 OAuth2 登录、调用 Second Me API 获取用户信息、前端展示；
- 过程中**向你索要 Client ID 和 Client Secret**，把第二步拿到的填进去即可。

本地开发时，**重定向 URI（回调地址）** 用：

- `http://localhost:3000/api/auth/callback`  
上线后改为：`https://你的域名/api/auth/callback`（在 Second Me 应用配置里也要填同一地址）。

---

## 四、和本仓库「杠精评审团」怎么配合

- **方式 A**：让 Skill 在**当前项目**里加登录——直接对 AI 说「在现有 Next.js 项目里接入 Second Me OAuth」，并指定本仓库路径；AI 会基于 Skill 在本项目里加路由、环境变量、登录按钮等。
- **方式 B**：用 Skill 先在一个新项目里跑通 OAuth，再把生成的登录相关代码（如 `api/auth/`、登录页、环境变量说明）**迁到本仓库**，替换或合并现有入口。

无论 A 还是 B，**密钥都不要写进代码**，用环境变量，例如：

- `SECONDME_CLIENT_ID`
- `SECONDME_CLIENT_SECRET`

---

## 五、小结

| 步骤 | 做什么 |
|------|--------|
| 1 | 安装 Skill：`/plugin marketplace add mindverse/Second-Me-Skills` 等 |
| 2 | 在 develop.second.me 创建应用，拿到 Client ID / Client Secret |
| 3 | 用「做 Second Me 登录」+ `/secondme` 让 AI 接 OAuth，被问到就填密钥 |
| 4 | 回调地址：本地 `http://localhost:3000/api/auth/callback` |
| 5 | 把登录接到本仓库（让 AI 直接改本项目，或把生成代码迁过来） |

**Kimi 那部分**：若你没有 Claude 账号，用支持该 Skill 的 Kimi 环境，按上面同样步骤装 Skill、拿密钥、说「用 Second Me 做登录」即可，目标都是**装上 Skill 并用它做登录**。

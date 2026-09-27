# NekoCircle

**中文** · [日本語](README.ja.md) · [English](README.en.md)

通过 FxTwitter、Yahoo 日本实时搜索和 Bing 的公开数据生成推特互动圈。支持中文、日文、英文，基础生成无需登录或 API Key。

## 功能

- 回复、引用、提及与转推统一评分，结合互动方向、时间衰减和双向交流。
- 按稳定账号 ID 合并改名前后的账号，避免跨数据源重复计算同一回复。
- MD3 风格界面、头像回退、查找高亮与放大、完整用户名及标签层级设置。
- 自定义颜色、人数、布局、分数、用户名、水印和圈子 ID；支持显示全部已采集用户。
- PNG 下载、公开分享链接、圈子 ID 查询及分享预览图。
- 可选长期保存与临时数据清理；后台提供统计、参数、公告、反馈和数据导入/导出。
- 将已授权长期保存的圈子备份到 GitHub；设置历史统计基数补回丢失的累计数量。
- “今日”按 UTC+8 零点计算；网页底部显示构建版本。
- Windows / 宝塔双版本更新与回滚；Linux 进程守护。

## 快速开始

建议使用 Node.js 22 或 24 和 npm，在项目根目录执行：

```powershell
npm ci
Copy-Item .env.example .env.local
```

编辑 `.env.local`，将 `JWT_SECRET` 改为随机长字符串。已有配置请保留，不要覆盖。

开发模式：

```powershell
npm run dev -- -p 3001
```

访问 [http://localhost:3001/zh](http://localhost:3001/zh)、`/ja` 或 `/en`。

生产模式，每一步成功后再执行下一步：

```powershell
npm ci
npm run build
npm start -- -H 127.0.0.1 -p 3001
```

宝塔 / Nginx 在域名的 80/443 端口接收请求，代理到 `http://127.0.0.1:3001`。数据库和配置需要持久保存，不要用新源码覆盖运行中的 `.next`。

## 配置与数据

| 配置 | 用途 |
| --- | --- |
| `JWT_SECRET` | 管理员会话签名；各版本保持一致 |
| `DB_PATH` | SQLite 路径；默认 `data/circle.db` |
| `SITE_URL` | 分享及预览图的公开网址，如 `https://circle.example.com` |
| `HTTPS_PROXY` | 可选 HTTP / SOCKS 出网代理 |
| `YAHOO_PROXY` | 可选 Yahoo 专用代理或中继 |
| `BUILD_VERSION` | 可选构建版本号；Git 部署自动取提交号，ZIP 部署使用构建时间 |

首次访问 `/admin/login` 时设置管理员密码，无预设密码，以 bcrypt 哈希保存。恢复原数据库也会保留原密码。

GitHub 备份在后台参数设置中填写仓库所有者、仓库、已存在的分支、文件路径和令牌。令牌需要目标仓库的 Contents 读写权限，界面不会返回明文。备份只含已授权长期保存的圈子，不含临时圈子、管理员密码或配置令牌。解压 `.json.gz` 后，可通过后台导入恢复。

累计生成数和独立用户数可设置历史基数；今日和趋势仍按实际记录计算。历史用户名丢失后，独立用户基数无法自动排除后来再次出现的老用户。

## 不停服更新与守护

见 [Windows / 宝塔双版本部署指南](docs/windows-rolling-update.md)。工具在新目录构建并检查候选版本，平滑重载 Nginx，保留旧程序用于回滚。新旧程序共用现有数据库，静态资源同时保留。初次使用需登记当前版本和代理配置。

Linux 构建后运行 `bash serve.sh`。守护使用 `/api/health/live`，连续三次检查失败才重启；部署使用 `/api/health/ready`，额外检查数据库。

常用环境变量：`NEKOCIRCLE_PORT`（3000）、`NEKOCIRCLE_BIND`（127.0.0.1）、`NEKOCIRCLE_STARTUP_GRACE_SECONDS`（60）、`NEKOCIRCLE_CHECK_INTERVAL_SECONDS`（20）、`NEKOCIRCLE_HEALTH_ATTEMPTS`（3）、`NEKOCIRCLE_SHUTDOWN_GRACE_SECONDS`（15）。

## 评分与数据限制

类型权重：回复 `1`、引用 `0.8`、提及 `0.6`、转推 `0.4`。方向系数：入站 `1.5`、出站 `0.5`。时间权重：0–2 天 `1`，3–5 天 `0.95`，超过 5 天后连续指数衰减。

```text
total = inbound × 1.5 + outbound × 0.5
balance = 2 × min(inbound, outbound) / (inbound + outbound)
score = ln(1 + total) × (0.75 + 0.25 × balance)
```

无互动时 balance 为 0。圈子按加权分排序，互动次数单独保留。Bing 在主要来源数据较少时作为兜底；单个来源失败时使用其他可用数据。

公开搜索不保证完整覆盖。Yahoo 通常覆盖最近约 30 天，私密、已删除或未索引的推文无法获取；头像及外部服务的可用性也会影响结果。

## 开发

```powershell
npm test
npm run build
```

构建包括 lint 和 TypeScript 检查。技术栈：Next.js 15、React 19、TypeScript、Tailwind CSS 4、SQLite、Canvas、`@vercel/og`。

`app/`：页面与 API；`components/`：圈图与交互；`lib/`：数据源、合并、评分、数据库与备份；`messages/`：三语翻译；`scripts/`：部署；`tests/`：回归测试；`data/`：默认数据库目录。

## 许可证与致谢

[AGPL-3.0-or-later](LICENSE)。灵感来自 [maebahesioru/nareaitter](https://github.com/maebahesioru/nareaitter)。

# NekoCircle

通过 Yahoo 日本实时搜索获取公开 @提及数据，以同心圆图谱展示过去 30 天内与你互动最频繁的用户的 Web 应用。免费、无需登录、无需 API Key。

## 功能

- **Yahoo 搜索**：实时搜索过去 30 天内的公开 @提及 数据
- **Mention 统计**：按提及次数排名展示互动圈
- **可视化图谱**：Canvas 渲染同心圆轨道，自动布局，真实头像
- **一键下载**：导出高清 PNG，带 NekoCircle 水印和圈子 ID
- **分享功能**：分享到 X，或通过 8 位短 ID 分享圈子链接
- **自定义样式**：背景色 / 渐变模式、节点大小、显示人数（10~50）、标签 / 分数 / 排名徽章开关
- **公告系统**：管理员可发布 / 编辑 / 删除公告，支持 info / warning / success 三类与置顶
- **管理后台**：`/admin` 路由，JWT 登录保护，公告 CRUD
- **查找自我**：在互动圈中搜索自己或他人
- **统计页面**：Yahoo 搜索生成次数、活跃用户等数据
- **OG 图片**：分享链接自动生成预览图
- **上游扩展玩法**：关系树、AI 诊断提示词与娱乐性账号估值
- **代理回退**：支持 `YAHOO_PROXY` 中继地址及标准 HTTP / SOCKS 代理

## 技术栈

| 层级 | 技术 |
|------|------|
| 框架 | Next.js 15（App Router） |
| 语言 | TypeScript |
| 样式 | Tailwind CSS 4 |
| 数据库 | SQLite（better-sqlite3） |
| 认证 | JWT（jose）+ bcryptjs（仅管理员） |
| 绘图 | HTML5 Canvas API |
| OG 图片 | @vercel/og |
| 数据源 | Yahoo 日本实时搜索 |

## 目录结构

```
neko-circle/
├── app/
│   ├── page.tsx                 # 首页（搜索 + Demo 圈 + 公告）
│   ├── yahoo/[username]/        # Yahoo 搜索结果页
│   ├── circle/[id]/             # 圈子详情页（短 ID 访问）
│   ├── stats/                   # 数据统计页
│   ├── admin/                   # 管理后台（登录 + 公告管理）
│   └── api/                     # yahoo-mentions / circle / announcements / auth / og 等
├── components/
│   ├── CircleChart.tsx          # 互动圈 Canvas 渲染
│   ├── DemoCircle.tsx           # 首页动画 Canvas
│   ├── StylePanel.tsx           # 样式自定义面板
│   └── FindYourself.tsx         # 查找自我
├── lib/                         # yahoo 获取 / 转换 / db / auth / 导出 / 头像代理
├── types/                       # circle / yahoo-realtime 类型定义
├── middleware.ts                # 管理后台路由 JWT 保护
├── data/circle.db               # SQLite（自动创建）
└── .env.local                   # JWT_SECRET / HTTPS_PROXY
```

## 备注

- 计分仅统计 @提及次数，不区分互动方向，不含时间衰减
- Yahoo 仅索引过去约 30 天的公开推文，私密账号或已删推文无法获取
- 头像通过代理加载（白名单 `pbs.twimg.com` / `abs.twimg.com`），需配置 `HTTPS_PROXY`
- 管理员默认密码 `admin123`，生产环境务必修改 `JWT_SECRET` 与管理员密码
- `data/circle.db` 需持久化挂载，否则重启数据丢失
- 许可证：AGPL-3.0-or-later
- 项目基于 [maebahesioru/nareaitter](https://github.com/maebahesioru/nareaitter)，并持续选择性同步适合 NekoCircle 架构的上游功能

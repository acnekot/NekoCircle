# NekoCircle 🐱

> 发现你的 X 互动圈 — 通过 Yahoo 搜索免费生成互动圈图谱

**NekoCircle** 是一个基于 Next.js 15 构建的 Web 应用，通过 Yahoo 日本实时搜索获取公开 Mention 数据，以同心圆图谱的形式展示过去 30 天内与你互动最频繁的用户。免费、无需登录、无需 API Key。

---

## ✨ 功能特性

### 核心功能
- 🔎 **Yahoo 搜索** — 通过 Yahoo 日本实时搜索获取过去 30 天内的公开 @提及 数据
- 📊 **Mention 统计** — 按提及次数排名，快速了解谁在近期频繁提及你
- 🎨 **可视化图谱** — Canvas 渲染同心圆轨道，自动布局，真实头像
- 💾 **一键下载** — 导出高清 PNG 图片，带 NekoCircle 水印和圈子 ID
- 🔗 **分享功能** — 支持分享到 X，或通过 8 位短 ID 分享圈子链接

### 自定义样式
- 背景颜色 / 渐变模式（纯色 / 径向 / 线性）
- 节点大小（小 / 中 / 大）
- 显示人数（10 ~ 50）
- 用户名标签 / 互动分数 / 排名徽章 开关

### 公告系统
- 📢 管理员可发布/编辑/删除公告
- 支持 info / warning / success 三种类型
- 支持置顶和显示/隐藏控制
- 首页自动展示活跃公告，用户可关闭

### 管理后台 (`/admin`)
- 📢 公告管理（新建 / 编辑 / 删除 / 置顶 / 显示隐藏）
- 🔐 管理员 JWT 登录保护

### 其他
- 🔍 **查找自我** — 在互动圈中搜索自己或他人，查看排名
- 📊 **统计页面** — 查看 Yahoo 搜索生成次数、活跃用户等数据
- 🖼 **OG 图片** — 分享链接时自动生成预览图

---

## 🛠 技术栈

| 层级 | 技术 |
|------|------|
| 框架 | Next.js 15 (App Router) |
| 语言 | TypeScript |
| 样式 | Tailwind CSS 4 |
| 数据库 | SQLite (better-sqlite3) |
| 认证 | JWT (jose) + bcryptjs（仅管理员）|
| 绘图 | HTML5 Canvas API |
| 数据源 | Yahoo 日本实时搜索 |

---

## 🚀 快速开始

### 环境要求

- **Node.js** >= 18.x（推荐 20.x）
- **npm** >= 9.x
- 操作系统：Windows / macOS / Linux 均可

### 1. 克隆项目

```bash
git clone https://github.com/acnekot/NekoCircle.git
cd NekoCircle
```

### 2. 安装依赖

```bash
npm install
```

> 如果安装 `better-sqlite3` 时报错，请确保系统已安装 C++ 编译工具：
> - **Ubuntu/Debian**: `sudo apt install build-essential python3`
> - **macOS**: `xcode-select --install`
> - **Windows**: 安装 [windows-build-tools](https://www.npmjs.com/package/windows-build-tools) 或使用 Visual Studio Build Tools

### 3. 配置环境变量

在项目根目录创建 `.env.local` 文件：

```env
# 管理员 JWT 签名密钥（生产环境请替换为随机长字符串）
JWT_SECRET=your-secret-key-change-in-production

# 可选：HTTP/SOCKS 代理（访问 X 头像等外部资源时使用）
HTTPS_PROXY=socks5h://127.0.0.1:7897
```

### 4. 启动开发服务器

```bash
npm run dev
```

启动后访问 [http://localhost:3000](http://localhost:3000)

### 5. 构建生产版本

```bash
npm run build
npm run start
```

---

## ⚙️ 首次使用

### 生成互动圈

1. 访问首页，输入 X 用户名（@ 可加可不加）
2. 点击「Yahoo 免费分析」按钮
3. 等待 10~30 秒，Yahoo 搜索完成后即可查看互动圈
4. 可自定义样式、下载图片、分享到 X

### 管理员配置（可选）

1. 访问 `/admin/login`，使用默认密码 `admin123` 登录
2. **生产环境请立即修改管理员密码**
3. 在管理后台可管理首页公告

---

## 📁 项目结构

```
NekoCircle/
├── app/
│   ├── page.tsx                # 首页（搜索框 + Demo 圈 + 使用说明 + 公告）
│   ├── layout.tsx              # 全局布局
│   ├── globals.css             # 全局样式
│   ├── yahoo/[username]/       # Yahoo 搜索结果页
│   ├── circle/[id]/            # 圈子详情页（通过短 ID 访问）
│   ├── stats/                  # 数据统计页
│   ├── admin/
│   │   ├── login/              # 管理员登录
│   │   └── page.tsx            # 公告管理
│   └── api/
│       ├── yahoo-mentions/     # Yahoo 搜索接口
│       ├── circle/[id]/        # 圈子查看接口
│       ├── announcements/      # 公开公告接口
│       ├── image-proxy/        # 头像代理
│       ├── og/circle/          # OG 图片生成
│       ├── auth/               # 管理员认证
│       ├── admin/announcements/ # 管理员公告 CRUD
│       ├── generation-stats/   # 生成次数统计
│       └── stats/              # 统计数据接口
├── components/
│   ├── CircleChart.tsx         # 互动圈 Canvas 渲染组件
│   ├── DemoCircle.tsx          # 首页展示动画 Canvas
│   ├── StylePanel.tsx          # 样式自定义面板
│   ├── FindYourself.tsx        # 查找自我组件
│   └── AnnouncementBanner.tsx  # 公告横幅组件
├── lib/
│   ├── yahoo-realtime-fetch.ts # Yahoo 搜索数据获取
│   ├── yahoo-to-circle.ts     # Yahoo 数据转换为圈子格式
│   ├── circle-convert.ts      # 分析结果类型 + 转换工具
│   ├── db.ts                   # SQLite 数据库操作
│   ├── auth.ts                 # 管理员 JWT 工具
│   ├── style.ts                # 样式配置
│   ├── export-image.tsx        # 图片导出
│   ├── x-profile-image.ts     # X 头像解析
│   └── yahoo-client-cache.ts  # 客户端缓存
├── types/
│   ├── circle.ts               # 互动圈类型定义
│   └── yahoo-realtime.ts       # Yahoo 数据类型
├── middleware.ts                # 管理后台路由保护
├── data/
│   └── circle.db               # SQLite 数据库（自动创建）
├── .env.local                  # 环境变量（需自行创建）
├── package.json
├── tsconfig.json
├── next.config.ts
└── postcss.config.mjs
```

---

## 📊 计分规则

| 维度 | 说明 |
|------|------|
| @提及 (Mention) | 唯一计分维度，按提及次数直接排名 |
| 时间范围 | 仅统计过去 30 天内的公开推文 |
| 数据来源 | Yahoo 日本实时搜索，免费无需 API Key |

> 仅统计 @提及 次数，不区分互动方向，不含时间衰减。适合快速了解谁在近期频繁提及你。

---

## 🔌 API 接口

### Yahoo 搜索接口

```http
GET /api/yahoo-mentions?screenName=acnekot&buildCircle=1
```

无需登录，直接返回互动数据 + 圈子用户列表。

### 圈子查看接口

```http
GET /api/circle/{id}
```

通过 8 位短 ID 获取已生成的圈子数据。

### 公告接口

```http
GET /api/announcements
```

获取当前活跃的公告列表。

---

## 🔒 安全说明

- 管理员路由 (`/admin/*`, `/api/admin/*`) 由 `middleware.ts` 通过 JWT 验证保护
- 管理员 Cookie：`neko_admin`（7 天有效期）
- **生产环境请务必修改 `JWT_SECRET` 和管理员默认密码**
- 头像代理仅允许白名单域名（`pbs.twimg.com`、`abs.twimg.com`）

---

## 🌐 部署指南

### 使用 PM2

```bash
npm run build
pm2 start npm --name "neko-circle" -- start
```

### 使用 Docker

```dockerfile
FROM node:20-alpine
RUN apk add --no-cache python3 make g++
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build
EXPOSE 3000
CMD ["npm", "start"]
```

```bash
docker build -t neko-circle .
docker run -d -p 3000:3000 \
  -e JWT_SECRET=your-production-secret \
  -v ./data:/app/data \
  neko-circle
```

### 反向代理（Nginx）

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

> **重要**：`data/` 目录下的 `circle.db` 需要持久化挂载，否则重启后数据丢失。

---

## ❓ 常见问题

**Q: 安装 `better-sqlite3` 失败？**
A: 这个库需要 C++ 编译环境。Ubuntu 执行 `sudo apt install build-essential python3`，macOS 执行 `xcode-select --install`。

**Q: 头像加载不出来？**
A: X 头像需要通过代理加载，在 `.env.local` 中配置 `HTTPS_PROXY`。偶尔因网络波动失败属于正常现象。

**Q: 为什么只有 30 天的数据？**
A: Yahoo 实时搜索只索引过去约 30 天的推文，更早的数据无法获取。

**Q: 搜索结果不准确怎么办？**
A: Yahoo 搜索依赖公开推文索引，如果目标账号是私密账号或推文被删除，可能导致数据不完整。

**Q: 为什么有些用户没出现在结果中？**
A: 仅统计 @提及，不包含回复、引用和转推。如果互动主要通过回复进行，可能不会被统计到。

**Q: 结果会保存吗？**
A: 会。生成的圈子会保存并分配 8 位短 ID，可以通过 ID 随时查看。

**Q: 数据库文件在哪？**
A: 在 `data/circle.db`，首次启动时自动创建。

---

## 🙏 致谢

- [nareaitter](https://github.com/maebahesioru/nareaitter) — Yahoo 搜索互动圈的灵感来源
- [Next.js](https://nextjs.org) — React 全栈框架
- [Tailwind CSS](https://tailwindcss.com) — 样式框架
- [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) — SQLite 驱动

---

## 📄 License

MIT License

---

<p align="center">Made with ❤️ by <strong>好奇猫a</strong></p>

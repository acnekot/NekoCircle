# NekoCircle 🐱

> 生成你的 X (Twitter) 互动圈图谱 — 可视化你最亲密的互动用户

**NekoCircle** 是一个基于 Next.js 15 构建的全栈 Web 应用，通过分析 X (Twitter) 账号的最近推文互动，以同心圆图谱的形式展示互动最频繁的用户。支持用户注册登录、订阅管理、历史记录查看，以及高度自定义的图片导出。

**作者：好奇猫a**

---

## ✨ 功能特性

### 核心功能
- 📊 **互动分析** — 抓取最近 75 条推文，识别 Reply / Quote / Mention / Retweet 四类互动，并按主动/被动方向汇总
- ⚖️ **权重评分** — 按亲密度权重（Reply×10、Quote×8、Mention×5、Retweet×3）并叠加时间衰减，排序取 Top N
- 🎨 **可视化图谱** — Canvas 渲染同心圆轨道，自动布局，真实头像
- 💾 **一键下载** — 导出高清 PNG 图片，带 NekoCircle 水印

### 双数据源
- **twitterapi.io 模式** — 深度分析，需要登录和 API Key，精度高
- **Yahoo 搜索模式** — 免费、无需登录，通过 Yahoo 日本实时搜索获取公开 Mention 数据（过去 30 天）

### 自定义样式
- 背景颜色 / 渐变模式（纯色 / 径向 / 线性）
- 节点大小（小 / 中 / 大）
- 显示人数（10 ~ 50）
- 用户名标签 / 互动分数 / 排名徽章 开关

### 用户系统
- 🔐 JWT Cookie 登录（30 天持久化）
- 📋 历史记录查看（订阅用户）
- 🚫 未登录 / 未订阅用户无法使用 Twitter API 模式生成

### 管理后台 (`/admin`)
- API Key 配置（支持多 Key 轮换）
- 互动权重自定义
- 订阅开关 & 订阅文案配置
- 用户管理（激活 / 取消订阅）
- 缓存管理 & TTL 配置
- 测试模式（Mock 数据，不消耗 API）
- 📊 数据统计页面（用户数、Credits、请求数、生成数）

---

## 🛠 技术栈

| 层级 | 技术 |
|------|------|
| 框架 | Next.js 15 (App Router) |
| 语言 | TypeScript |
| 样式 | Tailwind CSS 4 |
| 数据库 | SQLite (better-sqlite3) |
| 认证 | JWT (jose) + bcryptjs |
| 绘图 | HTML5 Canvas API |
| API | [twitterapi.io](https://docs.twitterapi.io) / Yahoo 实时搜索 |

---

## 🚀 快速开始

### 环境要求

- **Node.js** >= 18.x（推荐 20.x）
- **npm** >= 9.x
- 操作系统：Windows / macOS / Linux 均可
- 可选：[twitterapi.io](https://twitterapi.io) API Key（仅 Twitter 模式需要；Yahoo 模式免费无需 Key）

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
# JWT 签名密钥（生产环境请替换为随机长字符串）
JWT_SECRET=your-secret-key-change-in-production

# 可选：HTTP/SOCKS 代理（访问 Twitter 头像等外部资源时使用）
HTTPS_PROXY=socks5h://127.0.0.1:7897
```

> **说明：**
> - `JWT_SECRET`：用于用户登录 Token 签名，**生产环境务必修改为随机强密码**
> - `HTTPS_PROXY`：如果你在国内使用，访问 Twitter 头像需要代理；如果不需要代理可以不配置

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

## ⚙️ 首次使用配置

### 第一步：创建管理员账号

1. 访问 `/admin/login`
2. 首次访问会显示注册表单，创建管理员账号

### 第二步：配置 Twitter API Key（可选）

1. 登录管理后台 `/admin`
2. 在「基本配置」中填入 [twitterapi.io](https://twitterapi.io) 的 API Key
3. 支持配置多个 Key，系统会自动轮换

> 如果只使用 Yahoo 搜索模式（免费），可以跳过此步骤

### 第三步：注册普通用户

1. 访问 `/login` 注册用户账号
2. 在管理后台「用户管理」中为该用户开启订阅权限（仅 Twitter 模式需要）

### 第四步：开始使用

- **Yahoo 模式**（推荐新手）：在首页选择「Yahoo 搜索」，输入用户名直接生成，无需登录
- **Twitter 模式**：登录后选择「twitterapi.io」，输入用户名开始分析

---

## 📁 项目结构

```
NekoCircle/
├── app/
│   ├── page.tsx                # 首页（输入框 + Demo 圈 + 使用说明）
│   ├── layout.tsx              # 全局布局
│   ├── globals.css             # 全局样式
│   ├── login/                  # 用户登录 / 注册
│   ├── my/                     # 用户历史记录
│   ├── result/[id]/            # Twitter 模式分析结果页
│   ├── yahoo/[username]/       # Yahoo 模式结果页
│   ├── stats/                  # 数据统计页
│   ├── admin/                  # 管理后台
│   │   ├── login/              # 管理员登录
│   │   └── ...                 # 设置 / 用户管理 / 缓存
│   └── api/
│       ├── analyze/            # 核心分析接口（SSE 流式进度）
│       ├── yahoo-mentions/     # Yahoo 搜索接口
│       ├── avatar/             # 头像代理
│       ├── image-proxy/        # 图片代理
│       ├── auth/               # 管理员认证
│       ├── user/               # 用户注册 / 登录 / 信息
│       ├── admin/              # 后台管理接口
│       ├── results/            # 分析结果读取
│       ├── integrations/       # 对外集成 API
│       └── stats/              # 统计数据接口
├── components/
│   ├── CircleChart.tsx         # 互动圈 Canvas 渲染组件
│   ├── DemoCircle.tsx          # 首页展示动画 Canvas
│   ├── StylePanel.tsx          # 样式自定义面板
│   └── YahooCircleCanvas.tsx   # Yahoo 模式专用 Canvas
├── lib/
│   ├── analyze.ts              # 互动分析逻辑
│   ├── twitter.ts              # Twitter API 封装
│   ├── yahoo-realtime-fetch.ts # Yahoo 搜索数据获取
│   ├── yahoo-to-circle.ts     # Yahoo 数据转换
│   ├── db.ts                   # SQLite 数据库操作
│   ├── auth.ts                 # JWT / bcrypt 工具
│   ├── style.ts                # 样式配置
│   ├── scoring.ts              # 评分权重
│   ├── mock.ts                 # 测试数据
│   └── ...                     # 其他工具模块
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

## ⚖️ 互动权重说明

| 类型 | 基础权重 | 说明 |
|------|----------|------|
| Reply | ×10 | 直接回复推文，最强的基础交流信号 |
| Quote | ×8 | 带观点的引用转发，属于深度互动 |
| Mention | ×5 | 主动 @ 对方，代表显式话题连接 |
| Retweet | ×3 | 普通扩散行为，成本最低 |

**得分公式：**

```
总分 = 主动互动得分 × 0.6 + 被动互动得分 × 0.4
```

每次互动都会乘以时间衰减因子 `e^(-λt)`，越近期的互动权重越高。

---

## 🔌 API 接口说明

### 分析接口（Twitter 模式）

```http
POST /api/analyze
Content-Type: application/json

{ "username": "acnekot", "topCount": 50 }
```

需要有效的 `neko_user` Cookie（已订阅用户）。返回 `{ id }` 后通过 SSE 获取进度：

```http
GET /api/analyze?id=<analysisId>
```

### Yahoo 搜索接口

```http
GET /api/yahoo-mentions?screenName=acnekot&buildCircle=1
```

无需登录，直接返回互动数据。

### 对外集成接口

```http
GET /api/integrations/circle?username=acnekot&showUsernames=1
Authorization: Bearer <EXTERNAL_API_TOKEN>
```

返回生成好的互动圈 PNG 图片。

---

## 🔒 安全说明

- 管理员路由 (`/admin/*`) 由 `middleware.ts` 通过 JWT 验证保护
- 两套 Cookie：`neko_session`（管理员，7天）和 `neko_user`（用户，30天）
- **生产环境请务必修改 `JWT_SECRET`**
- API Key 存储在 SQLite 数据库中，不写入代码
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

**Q: Yahoo 模式和 Twitter 模式有什么区别？**
A: Yahoo 模式免费、无需登录，但只能获取过去 30 天的公开 Mention 数据。Twitter 模式需要 API Key，能获取 Reply / Quote / Mention / Retweet 四类完整互动数据。

**Q: 生成失败怎么办？**
A: 可能是 API 额度暂时耗尽或目标账号受限。等待几分钟后重试，或在管理后台检查 API 配置。

**Q: 支持分析私密账号吗？**
A: 不支持。只能分析公开账号。

**Q: 数据库文件在哪？**
A: 在 `data/circle.db`，首次启动时自动创建。

---

## 📊 数据统计

访问 `/stats` 查看：
- 注册用户数 / 订阅用户数
- 成功生成图片数 / 总发起次数
- API 总请求次数
- Credits 消耗 / 缓存节省
- 近 7 天趋势图
- 最活跃用户排行

---

## 🙏 致谢

- [nareaitter](https://github.com/maebahesioru/nareaitter) — Yahoo 搜索互动圈的灵感来源，Twitter 风馴れ合いサークルアプリケーション
- [twitterapi.io](https://twitterapi.io) — Twitter 数据 API
- [Next.js](https://nextjs.org) — React 全栈框架
- [Tailwind CSS](https://tailwindcss.com) — 样式框架
- [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) — SQLite 驱动

---

## 📄 License

MIT License

---

<p align="center">Made with ❤️ by <strong>好奇猫a</strong></p>

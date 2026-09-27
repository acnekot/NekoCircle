# Windows / 宝塔不停服更新

生产版采用两个目录、两个端口交替运行。旧版本处理已有请求，新版本构建、启动并通过检查后，Nginx 平滑切换新请求。脚本不会停止旧进程。

Node.js 需支持 `--env-file`（建议 Node 22 或 24）。服务器无需 Git，可以每次下载源码 ZIP 到一个**新的目录**。

## 一次性登记当前版本

假设当前程序在 `C:\nekocircle\NekoCircle-main`，监听 `127.0.0.1:3001`。
在包含本脚本的新源码目录中运行：

```powershell
node scripts/deploy.mjs init --state C:\nekocircle\deployment --release C:\nekocircle\NekoCircle-main --port 3001 --db C:\nekocircle\NekoCircle-main\data\circle.db
```

`--db` 必须是旧程序**正在使用的数据库文件**。新旧程序共享该文件，切换时不复制数据库，否则会漏掉更新期间产生的数据。路径输错会直接报错，不会新建空数据库。

脚本默认复用旧目录的 `.env.local`；也可用 `--env C:\nekocircle\shared\.env.local` 指定配置文件。保持 JWT_SECRET 相同可让管理员会话继续有效。请保留数据库和配置所在目录，不要用新 ZIP 覆盖它。

## 准备新版本

将新 ZIP 解压到新目录，例如 `C:\nekocircle\releases\20260928`：

```powershell
node scripts/deploy.mjs prepare --state C:\nekocircle\deployment --release C:\nekocircle\releases\20260928 --port 3002
```

脚本依次安装锁定依赖、构建、后台启动 `127.0.0.1:3002`、检查应用和数据库，并将静态资源追加到共享目录。构建失败或就绪检查失败不会切换流量。启动日志在 `C:\nekocircle\deployment\logs`。

已自行完成 `npm ci` 和生产构建时，可追加 `--skip-build`。不要在正在运行或保留供回滚的目录里重新构建，也不要复用正在监听的端口。候选版本先仅开放回环地址，无需公网放行 3002。

## 切换宝塔 Nginx

找到当前站点中**专门的反向代理 location 配置文件**，一般位于：

```text
C:\BtSoft\nginx\conf\proxy\circle.catsuki.cc\你的代理配置.conf
```

它应包含 `location /` 和 `proxy_pass http://127.0.0.1:3001;`。脚本会管理此文件中的 location 配置，原有的自定义 location 规则需先移到其他 include 文件。不要传包含 `server {}` 的主站点配置文件。

这个文件必须被站点配置 include。站点的 SSL、80/443、ACME 验证等继续由宝塔管理。若其他 include 已定义 `/_next/static/`，先在宝塔中去掉重复规则；脚本的 `nginx -t` 会在重载前拦截冲突。

```powershell
node scripts/deploy.mjs switch --state C:\nekocircle\deployment --port 3002 --proxy-file C:\BtSoft\nginx\conf\proxy\circle.catsuki.cc\你的代理配置.conf --nginx C:\BtSoft\nginx\nginx.exe --prefix C:\BtSoft\nginx --verify-url https://circle.catsuki.cc
```

脚本验证候选版本，测试 Nginx 配置，执行 `reload`，再通过公网域名验证实际命中的版本。公网验证失败会恢复原配置并再次重载。此命令不会操作其他站点，也不会重启 Nginx。

共享 `/_next/static/` 目录保留新旧文件，避免已打开页面的旧 CSS/JS 在切换后 404。动态页面仍可能因版本变化需要刷新一次；含不兼容数据库迁移的更新不适合直接共享数据库滚动发布，应单独安排迁移。

首次部署的旧版可能尚无就绪接口，回滚时使用旧版 `/api/health/live`。之后的版本使用 `/api/health/ready`，同时检查数据库与版本标识；进程看门狗继续使用 `/api/health/live`。

## 回滚

旧程序仍在运行时，可立即切回：

```powershell
node scripts/deploy.mjs rollback --state C:\nekocircle\deployment --proxy-file C:\BtSoft\nginx\conf\proxy\circle.catsuki.cc\你的代理配置.conf --nginx C:\BtSoft\nginx\nginx.exe --prefix C:\BtSoft\nginx --verify-url https://circle.catsuki.cc
```

回滚只切换程序版本，数据库继续使用同一文件；不会回滚期间已产生的圈子数据。

## 后续更新与旧进程回收

```powershell
node scripts/deploy.mjs status --state C:\nekocircle\deployment
```

确认新版本正常、旧请求已结束后，再在旧终端停止旧服务；脚本启动的版本 PID 可以在 `status` 输出中查看。请核对 PID、端口及目录后再停止对应进程。保留旧程序时会多占用一份运行内存，构建还需额外内存。

旧端口停止监听后，移除该端口的保留记录，之后即可用它部署下一版：

```powershell
node scripts/deploy.mjs retire --state C:\nekocircle\deployment --port 3001
```

`retire` 会拒绝当前活跃端口或仍在监听的端口。移除回滚记录后，不能再一键回滚到那个版本。静态文件不会被自动清理，可在无需支持旧页面时另行归档。

脚本启动的程序不会自动随系统重启，也不替代 Windows 服务管理器；日常守护仍需由现有服务管理方式负责。若脚本因断电等异常退出留下 `deployment.lock`，先确认没有部署命令运行，再删除该锁文件。

参考：[Nginx Windows reload](https://nginx.org/en/docs/windows.html)、[Next.js 15 self-hosting](https://nextjs.org/docs/15/app/guides/self-hosting)。

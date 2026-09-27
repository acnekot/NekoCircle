# NekoCircle

[中文](README.md) · **日本語** · [English](README.en.md)

FxTwitter、Yahoo! JAPAN リアルタイム検索、Bing の公開データから Twitter 交流サークルを生成します。中国語・日本語・英語に対応し、基本の生成にはログインや API キーは不要です。

## 機能

- 返信・引用・メンション・リポストを統合し、方向、時間減衰、双方向の交流でスコアを計算。
- 固定アカウント ID で改名前後のアカウントを統合し、ソース間で同じ返信の重複集計を防止。
- MD3 スタイル、アバターのフォールバック、検索ハイライトと拡大、ユーザー名の完全表示とラベルの重なり順設定。
- 色、人数、レイアウト、スコア、ユーザー名、透かし、サークル ID を調整。取得した全ユーザーの表示にも対応。
- PNG ダウンロード、公開共有リンク、保存サークルの検索、共有プレビュー画像。
- 任意の長期保存と一時データ削除。管理画面で統計、設定、お知らせ、フィードバック、データ入出力を管理。
- 長期保存に同意したサークルの GitHub バックアップと、失われた累計を補う基準値。
- 「今日」は UTC+8 の午前 0 時から集計。ページ下部にビルド番号を表示。
- Windows / 宝塔での二つのバージョンによる更新とロールバック、Linux 用プロセス監視。

## 起動方法

Node.js 22 または 24 と npm を推奨します。プロジェクトのルートで実行します。

```powershell
npm ci
Copy-Item .env.example .env.local
```

`.env.local` の `JWT_SECRET` を長いランダムな値に変更します。既存の設定は上書きせず保持してください。

開発モード：

```powershell
npm run dev -- -p 3001
```

[http://localhost:3001/ja](http://localhost:3001/ja)、`/zh`、`/en` にアクセスします。

本番モードでは、前の手順が成功してから次を実行します。

```powershell
npm ci
npm run build
npm start -- -H 127.0.0.1 -p 3001
```

宝塔 / Nginx でドメインの 80/443 ポートを受け、`http://127.0.0.1:3001` に転送します。データベースと設定を永続保存し、稼働中の `.next` は上書きしないでください。

## 設定とデータ

| 設定 | 用途 |
| --- | --- |
| `JWT_SECRET` | 管理者セッションの署名。バージョン間で同じ値を使用 |
| `DB_PATH` | SQLite パス。既定値は `data/circle.db` |
| `SITE_URL` | 共有・プレビュー用の公開 URL。例：`https://circle.example.com` |
| `HTTPS_PROXY` | 任意の HTTP / SOCKS 通信プロキシ |
| `YAHOO_PROXY` | 任意の Yahoo 専用プロキシまたは中継 |
| `BUILD_VERSION` | 任意のビルド番号。未設定時は Git コミット、ZIP 配置ではビルド日時 |

初回に `/admin/login` で管理者パスワードを設定します。既定のパスワードはなく、bcrypt ハッシュで保存します。既存データベースの復元で以前のパスワードも引き継がれます。

管理画面で GitHub の所有者、リポジトリ、既存ブランチ、保存先、トークンを設定します。トークンには対象リポジトリの Contents 読み書き権限が必要で、平文を画面に返しません。バックアップには長期保存に同意したサークルのみを含み、一時サークル、管理者パスワード、設定トークンは含みません。`.json.gz` を解凍し、管理画面からインポートして復元できます。

累計生成数とユニークユーザー数に過去の基準値を設定できます。今日と推移グラフは実際の記録で集計します。過去のユーザー名を失った場合、後から戻った既存ユーザーをユニークユーザー基準値から自動除外することはできません。

## 停止せずに更新・監視

[Windows / 宝塔の更新ガイド](docs/windows-rolling-update.md)（中国語）を参照してください。別ディレクトリで新バージョンをビルド・確認し、Nginx を再読み込みします。旧プロセスはロールバック用に保持し、既存データベースと新旧の静的ファイルを共有します。初回は既存バージョンとプロキシ設定の登録が必要です。

Linux はビルド後に `bash serve.sh` で起動します。監視は `/api/health/live` が 3 回失敗した場合のみ再起動します。配置時の `/api/health/ready` はデータベースへのアクセスも確認します。

主な監視設定：`NEKOCIRCLE_PORT`（3000）、`NEKOCIRCLE_BIND`（127.0.0.1）、`NEKOCIRCLE_STARTUP_GRACE_SECONDS`（60）、`NEKOCIRCLE_CHECK_INTERVAL_SECONDS`（20）、`NEKOCIRCLE_HEALTH_ATTEMPTS`（3）、`NEKOCIRCLE_SHUTDOWN_GRACE_SECONDS`（15）。

## スコアと取得範囲

種別の重みは返信 `1`、引用 `0.8`、メンション `0.6`、リポスト `0.4`。方向係数は相手から `1.5`、自分から `0.5`。時間の重みは 0〜2 日が `1`、3〜5 日が `0.95`、5 日を超えると連続的に指数減衰します。

```text
total = inbound × 1.5 + outbound × 0.5
balance = 2 × min(inbound, outbound) / (inbound + outbound)
score = ln(1 + total) × (0.75 + 0.25 × balance)
```

交流がない場合の balance は 0 です。配置は加重スコアで決め、交流回数は別に保持します。Bing は主要ソースのデータが少ない場合に補完し、一つのソースが失敗しても他の利用可能なデータを使用します。

公開検索で全交流を取得できるとは限りません。Yahoo は通常直近約 30 日が対象で、非公開・削除済み・未索引の投稿は取得できません。アバターや外部サービスの状態も影響します。

## 開発

```powershell
npm test
npm run build
```

ビルドには lint と TypeScript チェックを含みます。Next.js 15、React 19、TypeScript、Tailwind CSS 4、SQLite、Canvas、`@vercel/og` を使用しています。

`app/`：ページと API、`components/`：描画と操作、`lib/`：取得・統合・スコア・DB・バックアップ、`messages/`：翻訳、`scripts/`：配置、`tests/`：回帰テスト、`data/`：既定の DB 保存先。

## ライセンスと謝辞

[AGPL-3.0-or-later](LICENSE)。[maebahesioru/nareaitter](https://github.com/maebahesioru/nareaitter) に着想を得ています。

# ongaku.review

ongaku.reviewは、音楽に関する記事を投稿するサイトである。Svelte・Ox Content・Vite+で構成し、`src/content/posts/`のMarkdown／MDXから静的HTMLを生成する。配信先はCloudflare Pages、E2EテストはPlaywrightで実行する。必要なSecrets・Variablesの見本は[`.env.example`](.env.example)を参照する。

## ドキュメント

サイトで公開しないリポジトリのドキュメントは`docs/`に置く。

- [技術スタック](docs/tech-stack.md): 採用している技術の一覧
- [記事の書き方](docs/posts.md): 記事の置き場所、フロントマター、画像の入れ方
- [ユーザー](docs/users.md): 記事の著者の登録方法

## ページ構成

| パス | 内容 |
| --- | --- |
| `/` | 記事一覧。作成日時の新しい順に12件ずつ表示し、13件目以降は`/page/2`から続ける |
| `/tags/<タグ名>` | そのタグを持つ記事をトップページと同じ一覧で表示する |
| `/about` | 固定ページ。[`src/content/about.mdx`](src/content/about.mdx)の内容 |
| `/posts/<ファイル名>` | 各記事 |

## アイコン

アイコンは[FamFamFam Silk as SVG](https://github.com/Simandara/famfamfam-silk-svg)（Simandara作。原作はMark Jamesの[Silk Icons](https://github.com/markjames/famfamfam-silk-icons)）を使い、`public/icons/silk/`に置く。ライセンスは[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/deed.ja)で、[`src/content/about.mdx`](src/content/about.mdx)の「クレジット」に表示する。アイコンを追加したときは`src/config/icons.ts`にも登録する。

## セットアップ

Node.jsは[`.node-version`](.node-version)で指定したバージョンを使用する。パッケージ管理にはnpmを使用する。

```sh
npm ci
npm exec -- playwright install chromium
```

ChromiumはE2Eテストで使用する。

## 開発・動作確認

```sh
npm run dev
```

開発サーバーは`http://127.0.0.1:5173`で起動する。ビルド後の表示を確認する場合は、次のコマンドを実行する。

```sh
npm run build
npm run preview
```

プレビューは`http://127.0.0.1:4173`で起動する。

E2Eテストは`dist-e2e/`へビルドし、その出力を`http://127.0.0.1:4173`で確認する。通常の`npm run build`が作る`dist/`は書き換えないため、E2Eテストを実行した後も`npm run preview`で確認できるのは通常のビルド結果のままになる。

## コマンド

| コマンド | 内容 |
| --- | --- |
| `npm run dev` | 開発サーバーを`http://127.0.0.1:5173`で起動する |
| `npm run build` | サイトをビルドして`dist/`に静的HTMLを生成する |
| `npm run preview` | ビルド結果を`http://127.0.0.1:4173`で確認する |
| `npm run check` | Vite+の書式・静的解析とsvelte-checkでコードを検証する |
| `npm run test:e2e` | PlaywrightでE2Eテストを実行する。ビルドとプレビューの起動を含む |
| `npm run test:e2e:ui` | PlaywrightのUIモードでE2Eテストを実行する |
| `npm run test:e2e:report` | 直前のE2EテストのHTMLレポートを開く |
| `npm run lint:docs` | Markdown・日本語・リンクの文書チェックを順番に実行する |
| `npm run lint` | `lint:docs`と同じ |
| `npm run lint:markdown` | markdownlint-cli2でMarkdownの書式をチェックする |
| `npm run lint:text` | textlintで日本語の単語・言い回しをチェックする |
| `npm run lint:links` | `.agents/skills`と`.github`のMarkdownを対象に、リンク先のファイルと見出しをチェックする |
| `npm run lint:markdown:fix` | markdownlintで自動修正できる問題を修正する |
| `npm run format` | `src`・`e2e`・設定ファイルの書式を整える |

## デプロイ

静的HTMLをCloudflare Pagesへ配信する。Cloudflare PagesのGit連携は使わず、[`.github/workflows/ci.yaml`](.github/workflows/ci.yaml)の`deploy-production`と`deploy-preview`が、`npm run build`で作った`dist/`をwranglerで直接アップロードする。アナリティクスのタグは入れず、アクセスの計測はCloudflare側で行う。

### 配信の条件

| ジョブ | 実行する場面 | 配信先 |
| --- | --- | --- |
| `deploy-production` | `main`へのpush | 本番サイト（`--branch=main`） |
| `deploy-preview` | 手動実行（Run workflow） | 実行したブランチ名に対応するプレビューURL |

どちらのジョブにも次の条件がある。

- リポジトリ変数`PAGES_DEPLOY_ENABLED`が`true`である。未登録または`true`以外のときは、どちらのジョブもスキップして何も配信しない
- `lint`・`check`・`test`・`e2e`がすべて成功している

`deploy-preview`はPRでは自動で配信しない。PRの差分をSecretsのある環境でビルドしないため、手動実行だけにしている。Actionsの「CI」を選び、「Run workflow」で配信したいブランチを指定して実行する。`main`を指定しても配信しない。手動実行でもCIのすべてのジョブを通してから配信する。PRへのコメントは投稿せず、プレビューのURLは`deploy-preview`ジョブのサマリーに書く。同じブランチで新しい手動実行があると、実行中のプレビュー配信はキャンセルする。`deploy-production`は直列に実行し、実行中の配信を後続のジョブでキャンセルしない。

### 初期設定

配信を有効にする手順を示す。リポジトリの設定とCloudflareの設定は手動で行う。

1. CloudflareでDirect Uploadのプロジェクトを作る。このリポジトリはGitHub Actionsから`wrangler pages deploy`で配信するため、Cloudflare PagesのGit連携は使わない。ワークフローと同じバージョンのwranglerで作る場合は、`CLOUDFLARE_API_TOKEN`と`CLOUDFLARE_ACCOUNT_ID`を環境変数に設定して、次のコマンドを実行する。

   ```sh
   npx wrangler@4.157.0 pages project create <プロジェクト名> --production-branch=main
   ```

2. Cloudflareで、対象アカウントの「Cloudflare Pages: Edit」権限を持つAPIトークンを作る。
3. GitHubの「Settings > Secrets and variables > Actions」に、次の値を登録する。登録する名前と説明は[`.env.example`](.env.example)にもある。

   | 種類 | 名前 | 内容 |
   | --- | --- | --- |
   | Secret | `CLOUDFLARE_API_TOKEN` | 手順2で作ったAPIトークン |
   | Secret | `CLOUDFLARE_ACCOUNT_ID` | CloudflareのアカウントID |
   | Variable | `CLOUDFLARE_PAGES_PROJECT_NAME` | 手順1で作ったプロジェクト名 |
   | Variable | `PAGES_DEPLOY_ENABLED` | `true`にすると配信を許可する。登録するまでは何も配信しない |

4. 設定が済んだら`PAGES_DEPLOY_ENABLED`を`true`にする。次の`main`へのpushが本番へ配信される。プレビューは手動実行したときに配信される。配信を止めるときは`false`に戻すか、変数を削除する。

### 手動で配信する

`CLOUDFLARE_API_TOKEN`と`CLOUDFLARE_ACCOUNT_ID`を環境変数に設定したうえで、ビルド結果をアップロードする。`--branch=main`は本番へ、それ以外のブランチ名はプレビューへ配信する。

```sh
npm run build
npx wrangler@4.157.0 pages deploy dist --project-name=<プロジェクト名> --branch=<ブランチ名>
```

### セキュリティヘッダ

[`public/_headers`](public/_headers)は、ビルドで`dist/_headers`へそのままコピーされ、Cloudflare Pagesが配信時にHTTPヘッダとして付ける。付けるヘッダは次のとおりである。

- `Content-Security-Policy`・`X-Content-Type-Options`・`Referrer-Policy`・`Permissions-Policy`・`Strict-Transport-Security`: すべてのパスに付ける
- `Cache-Control`: `/assets/*`は1年・`immutable`、`/feed.xml`と`/sitemap.xml`は1時間にする

`Content-Security-Policy`は、実際に生成したHTMLが読み込む先だけを許可している。外部のオリジンを許可しているのは`frame-src`だけで、YouTube（`www.youtube-nocookie.com`）・Spotify（`open.spotify.com`）・Apple Music（`embed.music.apple.com`）の埋め込みiframeに使う。Xの埋め込みはビルド時に静的なカードにして画像も自サイトから配信するため、外部の許可は要らない。`img-src`の`data:`はカードのアイコン、`style-src`の`'unsafe-inline'`はYouTubeの埋め込みに付く`style`属性のために必要である。

埋め込みや外部の画像・スクリプトを追加したときは、次のコマンドで`_headers`を適用した状態のサイトを確認する。ブラウザの開発者ツールのコンソールにContent Security Policyの違反が出ないことを確かめる。

```sh
npm run build
npx wrangler@4.157.0 pages dev dist
```

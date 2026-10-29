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

静的HTMLをCloudflare Pagesへ配信する。本番サイトへの反映とプレビュー作成に関する設定は、[`.env.example`](.env.example)を参照する。

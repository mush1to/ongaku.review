# ongaku.review

ongaku.reviewは、音楽に関する記事を投稿するサイトである。Svelte・Ox Content・Vite+で構成し、`src/content/posts/`のMarkdown／MDXから静的HTMLを生成する。配信先はCloudflare Pages、E2EテストはPlaywrightで実行する。必要なSecrets・Variablesの見本は[`.env.example`](.env.example)を参照する。

## ドキュメント

サイトで公開しないリポジトリのドキュメントは`docs/`に置く。

- [技術スタック](docs/tech-stack.md): 採用している技術の一覧

## ページ構成

トップページはWindows XPのエクスプローラー風の記事一覧である。ヘッダーにサイト名・説明・Home／About／Searchのナビゲーションを置き、その下にアドレスバー風の現在地表示を置く。アドレスバーのフォルダアイコンはトップページへのリンクで、パスにはサイト名を繰り返さない。2ページ目以降も記事一覧の続きとして扱い、アドレスバーにはページ数を表示しない。ページ送りは一覧の下に置き、デスクトップでは最終ページでもページ送りの位置が変わらないよう、一覧の外側に余白を確保する。このとき空行は描画せず、一覧の枠も広げない。スマートフォンでは一覧の直後に置く。

| パス | 内容 |
| --- | --- |
| `/` | 記事一覧。作成日時の新しい順に12件ずつ表示し、13件目以降は`/page/2/`から続ける |
| `/about/` | [`src/content/posts/about.mdx`](src/content/posts/about.mdx)の内容 |
| `/search/` | サイト内検索 |
| `/posts/<ファイル名>/` | 各記事 |

## 記事

記事は`src/content/posts/`にMarkdown／MDXで追加する。`src/content/posts/`からの相対パスがURLになり、`abbey-road.md`は`/posts/abbey-road/`で公開する。

フロントマターには次の項目を書く。

```yaml
---
title: 「アビイ・ロード」を2026年に聴く
description: The Beatles「Abbey Road」を久しぶりに通して聴き、曲順と録音の面白さを確かめた記録です。
created: 2026-10-25
updated: 2026-10-26
icon: cd
---
```

| 項目 | 内容 |
| --- | --- |
| `title` | 記事名。省略した場合は本文の最初の見出しを使う |
| `description` | 記事の説明。検索エンジン向けの説明とRSSフィードに使う |
| `created` | 作成日を`YYYY-MM-DD`形式で書く。トップページの「作成日時」に表示し、新しい順に並べる。省略した記事は一覧の最後に並ぶ |
| `updated` | 更新日を`YYYY-MM-DD`形式で書く。記事ページの「更新日時」に表示する。省略した場合は`created`と同じ日時になる |
| `icon` | 記事一覧と検索結果に表示するアイコン。`document`（文書）・`music`（音符）・`cd`（CD）から選ぶ。省略した場合は`document` |
| `listed` | `false`にすると記事一覧とRSSフィードに載せない。Aboutページで使う。省略した場合は`true` |

`about`はAboutページ専用、`index`はトップページ専用のため、記事のファイル名には使わない。

## アイコン

アイコンは[FamFamFam Silk as SVG](https://github.com/Simandara/famfamfam-silk-svg)（Simandara作。原作はMark Jamesの[Silk Icons](https://github.com/markjames/famfamfam-silk-icons)）を使い、`public/icons/silk/`に置く。ライセンスは[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/deed.ja)で、[`src/content/posts/about.mdx`](src/content/posts/about.mdx)の「クレジット」に表示する。アイコンを追加したときは`src/config/icons.ts`にも登録する。

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

## コントリビューション

外部からの変更は fork して pull request を送る。手順と著作権の譲渡条件は[`.github/CONTRIBUTING.md`](.github/CONTRIBUTING.md)に記載している。

## ライセンス

このリポジトリの内容について、mush1to はすべての権利を留保している。GitHub の利用規約で認められる範囲を除き、事前の許可なく利用、複製、改変、再配布することはできない。詳細は[`LICENSE`](LICENSE)を参照する。

`public/icons/silk/`のアイコンは第三者の素材で、[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/deed.ja)で提供されている。クレジットは[`src/content/posts/about.mdx`](src/content/posts/about.mdx)に記載している。

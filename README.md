# ongaku.review

ongaku.reviewは、音楽に関する記事を投稿するサイトである。Svelte・Ox Content・Vite+で構成し、`src/content/posts/`のMarkdown／MDXから静的HTMLを生成する。配信先はCloudflare Pages、E2EテストはPlaywrightで実行する。必要なSecrets・Variablesの見本は[`.env.example`](.env.example)を参照する。

## ドキュメント

サイトで公開しないリポジトリのドキュメントは`docs/`に置く。

- [技術スタック](docs/tech-stack.md): 採用している技術の一覧

## ページ構成

| パス | 内容 |
| --- | --- |
| `/` | 記事一覧。作成日時の新しい順に12件ずつ表示し、13件目以降は`/page/2`から続ける |
| `/tags/<タグ名>` | そのタグを持つ記事をトップページと同じ一覧で表示する |
| `/about` | 固定ページ。[`src/content/about.mdx`](src/content/about.mdx)の内容 |
| `/posts/<ファイル名>` | 各記事 |

## 記事

記事は`src/content/posts/`にMarkdown／MDXで追加する。`src/content/posts/`からの相対パスがURLになり、`abbey-road.md`は`/posts/abbey-road`で公開する。

フロントマターには次の項目を書く。

```yaml
---
title: 「アビイ・ロード」を2026年に聴く
description: The Beatles「Abbey Road」を久しぶりに通して聴き、曲順と録音の面白さを確かめた記録です。
created: 2026-10-25
updated: 2026-10-26
icon: cd
thumbnail: ./images/abbey-road.jpg
thumbnailAlt: 「Abbey Road」のジャケット
tags:
  - ロック
  - The Beatles
author: mush1to
---
```

| 項目 | 内容 |
| --- | --- |
| `title` | 記事名。省略した場合は本文の最初の見出しを使う |
| `description` | 記事の説明。検索エンジン向けの説明とRSSフィードに使う |
| `created` | 作成日を`YYYY-MM-DD`形式で書く。トップページの「作成日時」に表示し、新しい順に並べる。省略した記事は一覧の最後に並ぶ |
| `updated` | 更新日を`YYYY-MM-DD`形式で書く。記事ページの「更新日時」に表示する。省略した場合は`created`と同じ日時になる |
| `icon` | 記事一覧と検索結果に表示するアイコン。`document`（文書）・`music`（音符）・`cd`（CD）から選ぶ。省略した場合は`document` |
| `isPublished` | 真偽値。`false`にすると記事を公開しない。記事ページ・記事一覧・RSSフィード・検索のすべてから除外する。省略した場合は`true` |
| `thumbnail` | 見出し画像。記事ファイルからの相対パスで書く。形式はjpg・jpeg・png・webpで、推奨サイズは1200×630。記事の先頭に表示し、OGP画像とXの大きな画像付きカードにも使う。ファイルがない場合や`src/content`の外を指す場合はビルドが失敗する |
| `thumbnailAlt` | 見出し画像の代替テキスト。省略した場合は装飾画像として扱う |
| `tags` | タグを文字列の配列で書く。先頭の`#`は取り除き、重複はまとめる。記事の末尾にタグページへのリンクとして表示する |
| `author` | 著者名。省略した場合は`src/config/site.ts`の`site.author`を使う |

見出し画像は`src/content/posts/images/`に置くことを推奨する。ビルド時にファイルの内容からハッシュ付きのURLを作って配信する。

Aboutは記事置き場の外にある`src/content/about.mdx`から生成する固定ページで、URLは`/about`である。記事一覧とRSSフィードには含めない。記事のファイル名に`about`を使った場合は、通常の記事として`/posts/about`で公開する。`index`はトップページ専用のため、記事のファイル名には使わない。

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

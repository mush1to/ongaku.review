# デプロイ

静的HTMLをCloudflare Pagesへ配信する。Cloudflare PagesのGit連携は使わず、[`.github/workflows/ci.yaml`](../.github/workflows/ci.yaml)の`deploy-production`と`deploy-preview`が、`npm run build`で作った`dist/`をwranglerで直接アップロードする。アナリティクスのタグは入れず、アクセスの計測はCloudflare側で行う。

## 配信の条件

| ジョブ | 実行する場面 | 配信先 |
| --- | --- | --- |
| `deploy-production` | `main`へのpush | 本番サイト（`--branch=main`） |
| `deploy-preview` | 手動実行（Run workflow） | 実行したブランチ名に対応するプレビューURL |

どちらのジョブにも次の条件がある。

- リポジトリ変数`PAGES_DEPLOY_ENABLED`が`true`である。未登録または`true`以外のときは、どちらのジョブもスキップして何も配信しない
- `lint`・`check`・`test`・`e2e`がすべて成功している

### プレビューの条件

- PRでは自動で配信しない。PRの差分をSecretsのある環境でビルドしないため、手動実行だけにしている
- Actionsの「CI」を選び、「Run workflow」で配信したいブランチを指定して実行する
- `main`を指定しても配信しない。`--branch=main`は本番へ配信されるため、プレビュー用のジョブからは`main`を選べないようにしている
- 手動実行でもCIのすべてのジョブを通してから配信する
- PRへのコメントは投稿せず、プレビューのURLは`deploy-preview`ジョブのサマリーに書く

### 同時実行時の挙動

実行中の配信は、後から来た実行では中断されない。同じrefの後続の実行はworkflowのconcurrency groupで待機し、待機している間にさらに新しい実行が来ると、待機していた実行が置き換わることがある。手動実行でも`main`へのpushでも同じである。

置き換えられた実行の配信は行われない。配信されるのは、そのworkflow実行が対象にしたコミットをビルドした内容である。`deploy-production`は直列に実行し、実行中の配信を後続のジョブでキャンセルしない。

### プレビューURLの注意

プレビューのブランチ別エイリアスは、Cloudflareがブランチ名を小文字にし、英数字以外をハイフンに変えて作る。このため`fix/api`と`fix-api`は同じエイリアスになることがある。エイリアスは人が見るための目印で、配信ごとに一意なのはコミット別のURLである。どちらのURLもジョブのサマリーに書く。

## 初期設定

配信を有効にする手順を示す。リポジトリの設定とCloudflareの設定は手動で行う。

1. CloudflareでDirect Uploadのプロジェクトを作る。このリポジトリはGitHub Actionsから`wrangler pages deploy`で配信するため、Cloudflare PagesのGit連携は使わない。ワークフローと同じバージョンのwranglerで作る場合は、`CLOUDFLARE_API_TOKEN`と`CLOUDFLARE_ACCOUNT_ID`を環境変数に設定して、次のコマンドを実行する。

   ```sh
   npx wrangler@4.157.0 pages project create <プロジェクト名> --production-branch=main
   ```

2. Cloudflareで、対象アカウントの「Cloudflare Pages: Edit」権限を持つAPIトークンを作る。
3. GitHubの「Settings > Secrets and variables > Actions」に、次の値を登録する。登録する名前と説明は[`.env.example`](../.env.example)にもある。

   | 種類 | 名前 | 内容 |
   | --- | --- | --- |
   | Secret | `CLOUDFLARE_API_TOKEN` | 手順2で作ったAPIトークン |
   | Secret | `CLOUDFLARE_ACCOUNT_ID` | CloudflareのアカウントID |
   | Variable | `CLOUDFLARE_PAGES_PROJECT_NAME` | 手順1で作ったプロジェクト名 |
   | Variable | `PAGES_DEPLOY_ENABLED` | `true`にすると配信を許可する。登録するまでは何も配信しない |

4. 設定が済んだら`PAGES_DEPLOY_ENABLED`を`true`にする。次の`main`へのpushが本番へ配信される。プレビューは手動実行したときに配信される。配信を止めるときは`false`に戻すか、変数を削除する。

## 手動で配信する

`CLOUDFLARE_API_TOKEN`と`CLOUDFLARE_ACCOUNT_ID`を環境変数に設定したうえで、ビルド結果をアップロードする。`--branch=main`は本番へ、それ以外のブランチ名はプレビューへ配信する。

```sh
npm run build
npx wrangler@4.157.0 pages deploy dist --project-name=<プロジェクト名> --branch=<ブランチ名>
```

## セキュリティヘッダ

[`public/_headers`](../public/_headers)は、ビルドで`dist/_headers`へそのままコピーされ、Cloudflare Pagesが配信時にHTTPヘッダとして付ける。付けるヘッダは次のとおりである。

- `Content-Security-Policy`・`X-Content-Type-Options`・`Referrer-Policy`・`Permissions-Policy`・`Strict-Transport-Security`: すべてのパスに付ける
- `Cache-Control`: `/assets/*`は1年・`immutable`、`/feed.xml`と`/sitemap.xml`は1時間にする

`Content-Security-Policy`は、実際に生成したHTMLが読み込む先だけを許可している。外部のオリジンを許可しているのは`frame-src`だけで、YouTube（`www.youtube-nocookie.com`）・Spotify（`open.spotify.com`）・Apple Music（`embed.music.apple.com`）の埋め込みiframeに使う。Xの埋め込みはビルド時に静的なカードにして画像も自サイトから配信するため、外部の許可は要らない。`img-src`の`data:`はカードのアイコン、`style-src`の`'unsafe-inline'`はYouTubeの埋め込みに付く`style`属性のために必要である。許可先はブラウザで違反を確認して決めた最小構成のため、増やすときも違反を確認してから足す。

埋め込みや外部の画像・スクリプトを追加したときは、次のコマンドで`_headers`を適用した状態のサイトを確認する。ブラウザの開発者ツールのコンソールにContent Security Policyの違反が出ないことを確かめる。

```sh
npm run build
npx wrangler@4.157.0 pages dev dist
```

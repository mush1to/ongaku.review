# デプロイ

静的HTMLをCloudflare Pagesへ配信する。Cloudflare PagesのGit連携は使わず、[`.github/workflows/deploy.yaml`](../.github/workflows/deploy.yaml)の`deploy`ジョブが、`npm run build`で作った`dist/`をwranglerで直接アップロードする。チェックは[`.github/workflows/ci.yaml`](../.github/workflows/ci.yaml)を`workflow_call`で呼び出し、`lint`・`check`・`test`・`e2e`を通してから配信する。アナリティクスのタグは入れず、アクセスの計測はCloudflare側で行う。

## 配信の条件

配信するのは、Actionsの「Deploy」ワークフローの`deploy`ジョブである。`main`へのpushと手動実行のどちらでも同じジョブが動く。

| 実行する場面 | 配信先 |
| --- | --- |
| `main`へのpush | 本番サイト（`--branch=main`） |
| 手動実行（Run workflow）。`environment`で選び、`source_branch`の既定は`main` | `preview`は`source_branch`に対応するプレビューURL、`production`は本番サイト（`--branch=main`） |

どちらの配信にも次の条件がある。

- リポジトリ変数`PAGES_DEPLOY_ENABLED`が`true`である。未登録または`true`以外のときは`deploy`ジョブをスキップして何も配信しない
- `validate`と`verify`がすべて成功している。`validate`は配信元の組み合わせを検証してSHAに解決し、`verify`はそのSHAで`ci.yaml`の`lint`・`check`・`test`・`e2e`を実行する

### 手動実行の条件

- PRでは自動で配信しない。PRの差分をSecretsのある環境でビルドしないため、手動実行だけにしている
- Actionsの「Deploy」を選び、「Run workflow」で`environment`と`source_branch`を指定して実行する
- `environment`の既定は`preview`。`preview`を選ぶときは`source_branch`に`main`以外を入れる
- `preview`では`main`以外のブランチを配信する。`preview`と`main`の組み合わせは失敗する。`--branch=main`は本番へ配信されるため
- `production`では`main`だけを配信する。`main`以外を指定すると失敗する
- `source_branch`のブランチが存在しないときは失敗する
- 手動実行でも`validate`と`verify`を通してから配信する
- PRへのコメントは投稿せず、プレビューのURLは`deploy`ジョブのサマリーに書く

### 同時実行時の挙動

実行中の配信は、後から来た実行では中断されない。同じconcurrency groupの後続の実行は待機し、待機している間にさらに新しい実行が来ると、待機していた実行が置き換わることがある。手動実行でも`main`へのpushでも同じである。

置き換えられた実行の配信は行われない。`validate`が配信元を1回だけSHAに解決し、`verify`と`deploy`はそのSHAをcheckoutする。配信されるのは、検証したSHAと同じコミットをビルドした内容である。`deploy`ジョブは、本番が`deploy-production`、プレビューが`deploy-preview-<ブランチ名>`のconcurrency groupで直列に実行し、実行中の配信を後続のジョブでキャンセルしない。

本番の配信は、配信の直前に`main`の先頭が自分のSHAと一致するか確認する。一致しないときは配信せずに止め、ジョブのサマリーに理由を書く。

### プレビューURLの注意

プレビューのブランチ別エイリアスは、Cloudflareがブランチ名を小文字にし、英数字以外をハイフンに変えて作る。このため`fix/api`と`fix-api`は同じエイリアスになることがある。エイリアスは人が見るための目印で、配信ごとに一意なのはコミット別のURLである。どちらのURLもジョブのサマリーに書く。

## 初期設定

配信を有効にする手順を示す。リポジトリの設定とCloudflareの設定は手動で行う。

1. CloudflareでDirect Uploadのプロジェクトを作る。このリポジトリはGitHub Actionsから`wrangler pages deploy`で配信するため、Cloudflare PagesのGit連携は使わない。ワークフローと同じバージョンのwranglerで作る場合は、`CLOUDFLARE_API_TOKEN`と`CLOUDFLARE_ACCOUNT_ID`を環境変数に設定して、次のコマンドを実行する。

   ```sh
   npx wrangler@4.157.0 pages project create <プロジェクト名> --production-branch=main
   ```

2. Cloudflareで、対象ドメインの「Always Use HTTPS」を有効にする。セキュリティヘッダでHSTSを配らないため、HTTPSへの強制はこの設定が担う。
3. Cloudflareで、対象アカウントの「Cloudflare Pages: Edit」権限を持つAPIトークンを作る。
4. GitHubの「Settings > Secrets and variables > Actions」に、次の値を登録する。登録する名前と説明は[`.env.example`](../.env.example)にもある。

   | 種類 | 名前 | 内容 |
   | --- | --- | --- |
   | Secret | `CLOUDFLARE_API_TOKEN` | 手順3で作ったAPIトークン |
   | Secret | `CLOUDFLARE_ACCOUNT_ID` | CloudflareのアカウントID |
   | Variable | `CLOUDFLARE_PAGES_PROJECT_NAME` | 手順1で作ったプロジェクト名 |
   | Variable | `PAGES_DEPLOY_ENABLED` | `true`にすると配信を許可する。登録するまでは何も配信しない |

5. 設定が済んだら`PAGES_DEPLOY_ENABLED`を`true`にする。次の`main`へのpushが本番へ配信される。プレビューは手動実行したときに配信される。配信を止めるときは`false`に戻すか、変数を削除する。

## 手動で配信する

`CLOUDFLARE_API_TOKEN`と`CLOUDFLARE_ACCOUNT_ID`を環境変数に設定したうえで、ビルド結果をアップロードする。`--branch=main`は本番へ、それ以外のブランチ名はプレビューへ配信する。

```sh
npm run build
npx wrangler@4.157.0 pages deploy dist --project-name=<プロジェクト名> --branch=<ブランチ名>
```

## キャッシュ制御

[`public/_headers`](../public/_headers)は、ビルドで`dist/_headers`へそのままコピーされ、Cloudflare Pagesが配信時にHTTPヘッダとして付ける。配るのは`Cache-Control`だけで、`/assets/*`は1年・`immutable`、`/feed.xml`と`/sitemap.xml`は1時間にする。

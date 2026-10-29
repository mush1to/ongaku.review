# ユーザー

記事の著者は[`src/content/users.yaml`](../src/content/users.yaml)にユーザーIDをキーにして登録する。記事のフロントマターの`author`にユーザーIDを書くと、記事の先頭の著者欄と、記事の末尾の「この記事を書いた人」にそのユーザーを表示する。

```yaml
mush1to:
  name: むしにゃんこ
  description: 趣味で固定給貰ってます。
  icon: ./users/mush1to.webp
  x.com: mush1to
  links:
    - https://links.6410.org
```

| 項目 | 内容 |
| --- | --- |
| キー | ユーザーID。英数字・`-`・`_`で書く |
| `name` | 必須。記事に表示する名前。日本語も使える。20文字以内で、超えるとビルドが失敗する |
| `description` | 「この記事を書いた人」に表示する説明。140文字以内で、超えるとビルドが失敗する。改行した位置で改行して表示するため、複数行にする場合はYAMLの`\|`を使う |
| `icon` | アイコン画像。`src/content/users/`に置いたファイルを`users.yaml`からの相対パスで書く。形式はjpg・jpeg・png・webpで、正方形を推奨する。省略した場合は人物のアイコンを表示する。ファイルがない場合や`src/content`の外を指す場合はビルドが失敗する |
| `x.com` | Xのユーザー名。先頭の`@`は省略できる。`https://x.com/<ユーザー名>`へのリンクをXのアイコンで表示する |
| `links` | そのほかのリンク。http・httpsのURLを文字列の配列で書く。地球儀のアイコンで表示する |

アイコン画像は`src/content/users/`に置く。`./users/mush1to.webp`は`src/content/users/mush1to.webp`を指す。記事の画像と同じく、ビルド時にファイルの内容からハッシュ付きのURLを作って配信するため、同じファイルを差し替えるとURLも変わる。記事の書き方は[記事の書き方](posts.md)を参照する。

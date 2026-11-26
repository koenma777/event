# KENSEI HIRANO's EVENTS

参加・主催・登壇・紹介などで関わるイベントの静的ページです。ビルドはありません。データは [`events.json`](events.json) だけです。ページは表示のたびにこのファイルを読み、アジア/東京のいまの時刻で「これから」と「これまで」に分けます。

タイトルが【サンプル】で始まるものは見た目確認用の架空のイベントです。

公開URLは https://koenma777.github.io/event/ です。

## データの項目

`events.json` はイベントの配列です。

- `id` … 追加したときに付く識別子
- `title` … 名前
- `date` … 開始。`YYYY-MM-DD` または `YYYY-MM-DDTHH:mm`
- `end` … 終了。省略可。形式は `date` と同じ
- `deadline` … 申込締切。省略可。形式は `date` と同じ。日付だけならその日の終わりまで。「これから」のタイルに「申込 M/Dまで」、過ぎると「受付終了」と出る
- `place` … 会場、または「オンライン」
- `kind` … 平野の関わり方。`参加` / `主催` / `紹介` / `登壇` / `講師` / `メンター` / `審査` / `運営` のどれか（英語の `attend` / `host` / `recommend` / `speak` / `teach` / `mentor` / `judge` / `staff` も可）。一覧は `schedule.js` の `KINDS`
- `organizer` … 主催・共催・運営の団体。役割を付けて「／」で区切る（例: `主催 山口県／共催 大学リーグやまぐち／企画・運営 株式会社リージョナルマネジメント`）。後援・協賛は書かない
- `tags` … タグ。省略可。3つまで。`["関係人口", "学生"]` のような配列か、`"#関係人口 #学生"` のような文字列。`#` は付けても付けなくてもよい。タイトルの下に `#関係人口 #学生` と出る。よく使うタグは [`docs/event-bot.md`](docs/event-bot.md)
- `note` … 短いメモ。省略可
- `url` … 公式ページ。`http` または `https`
- `image` … 省略可。URLを書くと `images/<id>.<拡張子>` に保存する。省略すると公式ページの `og:image`（なければ `twitter:image`）を探す。3MBを超える、画像でない、取得できないときは飛ばす。Issue 自体は成功する

時刻のタイムゾーンを省略するとアジア/東京です。`Z` や `+00:00` は東京の時刻に直して保存します。分より細かい秒は切り捨てます。

終了がなければ、開始日はその日が終わるまで「これから」です。終了の時刻を過ぎたもの、終了日の翌日になったものは「これまで」です。「これから」は開始が近い順、「これまで」は新しい順です。

## Issue で更新する

Grok Bot「イベント更新君」の指示は [`docs/event-bot.md`](docs/event-bot.md)、Claude Code 向けの引き継ぎ書は [`docs/handoff.md`](docs/handoff.md) にあります。項目やワークフローを変えたら、そこも合わせて直してください。

`koenma777` がラベル `event` の Issue を開くと、Actions が本文の最初の `json` 囲みを検証して `events.json` を main に反映し、id をコメントして Issue を閉じます。ラベルはあとから付けても同じです。json が不正なときは理由をコメントし、Issue は開いたままにします。その実行は失敗として残ります。

追加:

```json
{
  "action": "add",
  "event": {
    "title": "下関DX朝会",
    "date": "2026-12-12T09:00",
    "end": "2026-12-12T10:00",
    "place": "オンライン",
    "kind": "主催",
    "organizer": "主催 平野賢正",
    "note": "短いメモ",
    "url": "https://example.com/events/example"
  }
}
```

更新は変える項目だけです。`end` と `deadline` と `tags` と `note` と `image` は `null` で消せます。

```json
{
  "action": "update",
  "id": "2026-12-12-dx-ab12cd",
  "event": {
    "note": "メモを差し替え"
  }
}
```

削除:

```json
{
  "action": "delete",
  "id": "2026-12-12-dx-ab12cd"
}
```

id は開始日、タイトルの英数字、短いハッシュから作ります。同じ title・date・url の追加をもう一度送ったときは、新しくは足さず既存の id を返します。

## 最初に一度だけ

1. Settings → Pages → Deploy from a branch → Branch を `main`、Folder を `/ (root)` にして Save
2. Settings → Actions → General → Workflow permissions を **Read and write permissions** にして Save
3. Issues → Labels で、名前が `event` のラベルを作る
4. main にレビュー必須などの保護がある場合は、GitHub Actions からの push を許可する

確認は `node --test` です。

## 共有画像（OGP）

`images/og-share.png`（1200×630）は `tools/og-share.html` を 1200×630 でスクリーンショットして作っています。作り直したら、`index.html` の `og:image` と `twitter:image` の末尾 `?v=` の数字を上げて、SNS のキャッシュを避けてください。

# 平野賢正のイベント

参加・主催・紹介するイベントの静的ページです。ビルドはありません。データは [`events.json`](events.json) だけです。ページは表示のたびにこのファイルを読み、アジア/東京のいまの時刻で「これから」と「これまで」に分けます。

入っているイベントは見た目確認用の架空のものです。タイトルは【サンプル】から始まります。

公開URLは https://koenma777.github.io/event/ です。

## データの項目

`events.json` はイベントの配列です。

- `id` … 追加したときに付く識別子
- `title` … 名前
- `date` … 開始。`YYYY-MM-DD` または `YYYY-MM-DDTHH:mm`
- `end` … 終了。省略可。形式は `date` と同じ
- `place` … 会場、または「オンライン」
- `kind` … `参加` / `主催` / `紹介`（`attend` / `host` / `recommend` も可）
- `organizer` … 主催者
- `note` … 短いメモ。省略可
- `url` … 公式ページ。`http` または `https`
- `image` … 画像のURL、またはリポジトリ内のパス。省略可

時刻のタイムゾーンを省略するとアジア/東京です。`Z` や `+00:00` は東京の時刻に直して保存します。分より細かい秒は切り捨てます。

終了がなければ、開始日はその日が終わるまで「これから」です。終了の時刻を過ぎたもの、終了日の翌日になったものは「これまで」です。「これから」は開始が近い順、「これまで」は新しい順です。

## Issue で更新する

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
    "organizer": "平野賢正",
    "note": "短いメモ",
    "url": "https://example.com/events/example"
  }
}
```

更新は変える項目だけです。`end` と `note` と `image` は `null` で消せます。

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

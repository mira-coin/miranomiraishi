# ミラの未来視 Official Hub

## これは何か

`miranomiraishi` 公式ホームページの公開用フォルダです。

公開URL:

- `https://miranomiraishi.netlify.app/`

このサイトは「監督編集型」です。ユーザーは監督として、どのコンテンツをどこに置くかを決めます。AIや制作者は `data.json`、HTML、CSS、JSの実装を担当します。

## 重要ファイル

- `index.html`: ホームページ本体。`data.json` を読み込んで自動表示します。
- `data.json`: カード、リンク、画像、動画、音声などの全コンテンツ管理データです。
- `admin.html`: `data.json` を編集・ダウンロードするためのローカル管理画面です。
- `netlify.toml`: Netlify公開用設定です。
- `images/`: 表示画像を入れるフォルダです。
- `videos/`: 動画背景やPV素材を入れるフォルダです。
- `assets/`: BGMなどの素材を入れるフォルダです。
- `games/`: ブラウザゲーム体験版を入れるフォルダです。
- `live/`: 2Dライブ系のページを入れるフォルダです。

ゲーム見出し画像:

- `images/rhythm-game-heading.png`: ミラのリズムゲーム体験版カード用
- `images/puzzle-game-heading.jpeg`: ミラの未来視パズルゲームカード用
- `images/mira-video-stage-thumb.jpg`: ミラ無双 横スクロールアクション体験版カード用

漫画見出し画像:

- `images/manga-ai-manga-heading.png`: アイマンガ公開ページへの漫画カード用
- 漫画リンク先: `https://a-i-manga.com/users/1TrcsErv`

## 現在入っているもの

- 公式キービジュアル
- BGMオン/オフ切り替え
- 漫画、ゲーム、音楽、グッズ、世界観、AI Idol Roomのカード
- ミラのリズムゲーム体験版
- ミラの未来視パズルゲームリンク
- ミラ無双 横スクロールアクション体験版
- ミラのキーホルダーなどのグッズ枠
- Ko-fi / BOOTH / Music / GitHub のリンク枠
- `admin.html` からの `data.json` 編集とダウンロード

## data.json の考え方

各アイテムは、必ず `type`、`section`、`order` を持ちます。

`type` はコンテンツの種類です。

- `manga`
- `image`
- `video`
- `voice`
- `link`
- `goods`
- `music`
- `game`

`section` は表示場所です。

- `hero`
- `manga`
- `game`
- `music`
- `goods`
- `world`
- `ai-idol`
- `links`

`order` は並び順です。数字が小さいほど先に表示されます。

例:

```json
{
  "id": "new-manga-001",
  "type": "manga",
  "section": "manga",
  "order": 10,
  "label": "MANGA",
  "icon": "M",
  "title": "作品タイトル",
  "description": "説明文",
  "image": "images/example.png",
  "url": "https://example.com/",
  "buttonLabel": "読む"
}
```

## 自分で更新する手順

1. `admin.html` を開きます。
2. カードを追加・編集・削除します。
3. `data.jsonをダウンロード` を押します。
4. ダウンロードした `data.json` を、このフォルダの `data.json` と置き換えます。
5. 必要な画像は `images/` フォルダに入れます。
6. Netlify Dropへ、このフォルダの中身を丸ごとアップロードします。

ブラウザで直接 `admin.html` を開いた場合、環境によっては既存の `data.json` 自動読込が止まることがあります。その場合は `data.json読込` ボタンから手動で読み込んでください。

`index.html` も、Netlify公開後は `data.json` を自動読込します。ローカルPCでダブルクリックして開いた場合に読込が止まるブラウザでは、画面上に出る `data.jsonを選択` から手動で読み込めます。

## Netlify Dropへ入れるもの

フォルダの中身を丸ごとアップロードしてください。

- `index.html`
- `data.json`
- `admin.html`
- `netlify.toml`
- `images/`
- `videos/`
- `assets/`
- `games/`
- `live/`

`index.html` だけでは画像、BGM、ゲーム、data.jsonが反映されません。

## 別スレで作った作品を入れるルール

- リズムゲーム本体は `games/mira-rhythm-prototype.html` に置きます。
- ミラ無双など別ジャンルのゲームは、リズムゲームと混ぜずに別HTMLとして `games/` に置きます。
- 現在の横スクロールアクション体験版は `games/mira-video-stage-demo.html` です。
- 動画背景は `videos/mira-game-background.mp4` に置き、カード画像は `images/mira-video-stage-thumb.jpg` を使います。
- ゲームカードの表示は `data.json` の `type: "game"` / `section: "game"` で管理します。
- カード画像は `images/` に入れて、`data.json` の `image` にパスを書きます。
- 外部公開済みゲームは `url` に外部URLを書きます。
- 更新後はデスクトップの `miranomiraishi-homepage-drop-datajson` に反映してからNetlify Dropします。

## 注意

BGMはブラウザの仕様上、自動再生ではなく、右上の `BGM OFF` ボタンを押すと再生され
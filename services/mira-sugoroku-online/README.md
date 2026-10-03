# ミラのすごろくクエスト ONLINE サーバー

Node.js + Socket.IOでルーム対戦を処理する小型サーバーです。ゲーム画面と画像・BGMは公式サイト側から配信します。

## Render設定

- Service type: Web Service
- Root Directory: `services/mira-sugoroku-online`
- Build Command: `pnpm install --frozen-lockfile --prod`
- Start Command: `pnpm start`
- Health Check Path: `/healthz`
- Environment: `ALLOWED_ORIGINS=https://mira-official.miranomiraishi.chatgpt.site`
- Instance count: 1

無料プランは無通信時に休止し、最初の接続に時間がかかる場合があります。公開テスト後は常時稼働プランを推奨します。

## ローカル確認

```powershell
pnpm install
pnpm test
pnpm start
```

`http://localhost:8787/healthz` が `{"ok":true}` を返せば起動成功です。

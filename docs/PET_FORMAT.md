# Codex Pet互換仕様

OrcaPetはCodex Pet v2パッケージを変換せずに読み込みます。

```text
my-pet/
├── pet.json
└── spritesheet.webp
```

```json
{
  "id": "my-pet",
  "displayName": "My Pet",
  "description": "A desktop companion.",
  "spriteVersionNumber": 2,
  "spritesheetPath": "spritesheet.webp"
}
```

`spritesheetPath`はPetフォルダ内の相対パスである必要があります。絶対パスやフォルダ外を指すパスは拒否されます。

## スプライトシート

| 行 | 状態 | フレーム数 |
|---:|---|---:|
| 0 | Idle | 7 |
| 1 | Running right | 8 |
| 2 | Running left | 8 |
| 3 | Waving | 4 |
| 4 | Jumping | 5 |
| 5 | Failed | 8 |
| 6 | Waiting | 6 |
| 7 | Running | 6 |
| 8 | Review | 6 |
| 9–10 | Look 16方向 | 16 |

透明背景の8列×11行WebPを推奨します。未使用セルは完全透明にしてください。

## ZIP配布

ZIP内にはPetパッケージを1件だけ含めてください。`pet.json`は4階層以内から自動検出されます。複数の`pet.json`を含むZIPはインストールできません。

各Petの作者は、画像・キャラクター・再配布条件を明記したライセンス文書を同梱してください。

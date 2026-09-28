# OrcaPet

Orcaで動くコーディングエージェントの状態を、デスクトップPetで確認できるmacOSアプリです。Codex Pet v2形式をそのまま利用できます。

![OrcaPet icon](assets/icon.png)

## 主な機能

- Codex Pet v2の8列×11行スプライトシートに対応
- Orcaのプロジェクト、ブランチ、エージェント状態、稼働数、完了数、未読数を表示
- Working、Waiting、Review、Failedなどの状態に合わせてアニメーション
- プロジェクトごとに別のPetを起動
- Petのドラッグ、サイズ変更、クリック停止、アイドル時の端へのダッシュ
- Pet画像、プロンプト、回答内容を外部へ送信しない

## 必要なもの

- macOS
- [Orca](https://github.com/stablyai/orca)
- Codex Pet v2形式のPetパッケージ

配布版にはPet画像を同梱していません。各Petのライセンスに従って入手してください。

## インストール

1. 配布された`OrcaPet.app`を`アプリケーション`フォルダへ移動します。
2. `OrcaPet.app`を開きます。
3. Petを右クリックし、「Petをインストール…」を選びます。
4. Petのフォルダ、`pet.json`、またはZIPを選択します。

未署名の開発ビルドを初めて開く場合は、FinderでアプリをControlキーを押しながらクリックし、「開く」を選択してください。詳しくは[インストールガイド](docs/INSTALLATION.md)を参照してください。

## 使い方

| 操作 | 動作 |
|---|---|
| ドラッグ | Petと情報パネルを移動 |
| クリック | 走行中のPetを停止 |
| ホバー | Waveアニメーション |
| ダブルクリック | Jumpアニメーション |
| 右クリック | 設定を開く |
| ×またはEsc | 設定を閉じる |

標準サイズ`1.0`はCodex DesktopのPetに近い大きさです。設定画面を開いてもPet自体は拡大しません。

## プロジェクトごとのPet

Petを右クリックし、「別プロジェクトのPetを起動…」から対象フォルダを選択します。プロジェクトごとに監視状態、Petの種類、サイズ設定が分離されます。

```sh
open -na /Applications/OrcaPet.app --args --project /path/to/project
```

## ドキュメント

- [インストールとPetの追加](docs/INSTALLATION.md)
- [Codex Pet互換仕様](docs/PET_FORMAT.md)
- [プライバシーとセキュリティ](docs/PRIVACY.md)
- [トラブルシューティング](docs/TROUBLESHOOTING.md)
- [開発と配布](docs/DEVELOPMENT.md)
- [変更履歴](CHANGELOG.md)

## ライセンス

OrcaPetのコードは[MIT License](LICENSE)です。読み込むPetの画像・データには、それぞれのPet固有のライセンスが適用されます。

Orca、Codex、OpenAIとの公式な提携・承認を示すものではありません。

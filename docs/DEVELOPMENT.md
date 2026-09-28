# 開発と配布

## 開発

```sh
npm install
npm start
```

## 検証

```sh
npm test
npm run check
npm audit --omit=dev
```

## macOSアプリを生成する

```sh
npm run dist:mac
```

成果物は`dist/mac-arm64/OrcaPet.app`です。現在の設定ではビルドしたMacのアーキテクチャ向けに未署名の`.app`を生成します。一般配布ではApple Developer IDによるコード署名、公証、ZIPまたはDMGの作成が別途必要です。

## プロジェクト指定

```sh
npm start -- --project /path/to/project
open -na /Applications/OrcaPet.app --args --project /path/to/project
```

## リリース確認

- テスト、構文検査、本番依存関係の監査が成功する
- Petのインストール、更新、切り替えを確認する
- プロジェクト別に複数インスタンスを起動できる
- Working、Waiting、Doneの表示を確認する
- ドラッグ、クリック停止、アイドル走行を確認する
- Pet画像のライセンス対象物をアプリへ同梱していない

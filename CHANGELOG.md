# Changelog

このプロジェクトでは[Semantic Versioning](https://semver.org/)を使用します。

## 0.2.0 — 2026-09-29

### Added

- Windows x64用NSISインストーラーとポータブル版のビルド
- WindowsのOrca CLI自動検出

### Changed

- Pet ZIP展開をOS非依存の実装へ変更

## 0.1.1 — 2026-09-29

### Fixed

- macOS DockへOrcaPetアイコンを明示的に設定
- メニューバーアイコンをライト／ダークモード対応のテンプレート画像へ変更

## 0.1.0 — 2026-09-29

### Added

- Codex Pet v2互換レンダラー
- Orca CLIによるエージェント状態表示
- プロジェクト別の複数Pet起動
- Petのドラッグ、クリック停止、アイドル走行
- フォルダ、`pet.json`、ZIP対応のPetインストーラー
- macOSアプリビルドと専用アイコン

### Security

- Petのパス検証
- ZIPパストラバーサル対策
- プロンプトと回答本文を表示対象から除外

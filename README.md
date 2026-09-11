# MetallKraft for FluidNC

MetallKraftの操作画面と基板設定をまとめた配布パッケージです。日本語のジョグ操作、SDファイル選択、大きな加工開始・クイック停止、加工予定経路の表示を使えます。

**[一式をダウンロード（ZIP）](https://github.com/MetallMeister/metallkraft-fluidnc/archive/refs/heads/main.zip)** · **[はじめての導入手順](docs/INSTALL.md)** · **[更新・元に戻す](docs/UPDATE.md)**

![MetallKraftの操作画面。実機ではなく表示確認用データです。](docs/screen.png)

## はじめに

| 目的 | 使うファイル |
| --- | --- |
| 同じ操作画面にする | `install/ui/` の7ファイル |
| MAX基板の初期設定をする | `install/boards/mks-dlc32-max-v1.0/config.yaml` |
| すでに動く機械の画面だけ変える | UIのみ。既存のYAMLは変更しない |

**FluidNCのファームウェア本体は含めません。** 本体は[公式Web Installer](https://installer.fluidnc.com/fluidnc)から導入します。YAMLと`preferences.json`だけではこのカスタム画面にならないため、画面本体の`index.html.gz`等も同梱しています。

> **同梱YAMLは、MKS DLC32 MAX V1.0_002 / ESP32-S3専用の未校正・初期設定です。通常のDLC32には使えません。**
> 原点復帰・リミット・プローブ・主軸制御・冷却は未設定です。実機の方向、移動量、可動範囲、ドライバ電流と配線を確認するまで加工に使用しないでください。詳細は[基板設定](docs/BOARD.md)。

## 導入の流れ

1. ZIPを展開し、[導入手順](docs/INSTALL.md)を開く。プログラミングやビルドは不要です。
2. 既存ファイルをバックアップし、必要な場合だけ公式FluidNC v4.0.3 Wi-Fi版を導入する。
3. 対応基板のYAMLと、`install/ui/`内のファイルを**基板のFlash直下**へアップロードする。SDではありません。
4. 基板設定を有効にして再起動し、起動ログと画面を確認する。

加工用GコードはSDカードへ。`install/`フォルダ自体やZIPを基板へ送るのではなく、指定した中身のファイルを送ります。

## 配布内容

- **画面**: 白・灰・青を基調にしたMetallKraft UI、日本語表示、サイト・ショップ・コミュニティへのリンク。
- **主軸操作**: 青い「主軸開始」が、基板の指令状態に応じて点滅する「主軸停止」へ切り替わります。実回転の検出ではありません。
- **初期値**: XY/Z移動量10 mm、ジョグ速度500 mm/min。初回の実移動確認は0.01 mmなど小さな値へ変更してください。
- **経路表示**: 白が予定経路、灰が位置報告に基づく通過推定。機械の誤差や実切削、衝突の有無は判定できません。
- **マクロ**: 主軸操作の下に最大6個を表示し、それ以上は枠内でスクロールします。公開版は空で、動作確認用の仮マクロは含めません。
- **設定の分離**: Wi-Fi名・パスワード、個別機の接続先IP、加工データ、作業履歴は含みません。

基準環境はFluidNC v4.0.3 / WebUI-3 v3.0.10です。画面とブラウザ側処理を変更していますが、FluidNCファームウェアは変更せず、コマンド送信は標準WebUIの仕組みを使用します。CSSだけの変更ではありません。[変更範囲と制限](docs/DEVELOPMENT.md)も確認してください。

画面の「クイック停止」は通信に依存するソフト停止です。**電源を遮断する物理的な非常停止の代わりにはなりません。**

## 開発・ライセンス

通常の利用者は`standard/`、`src/`、`vendor/`を基板へ送る必要はありません。これらは保守・再ビルド用です。

[開発手順](docs/DEVELOPMENT.md) · [ライセンスと出典](THIRD_PARTY.md) · [GPL-3.0](LICENSE)

改変元WebUIの対応ソースも同梱しています。FluidNCの全ソースやファームウェアは同梱していません。

[MetallMeister](https://metallmeister.net/) · [ショップ](https://metallmeister.stores.jp/) · [コミュニティ](https://cnc-lab.metallmeister.net/)

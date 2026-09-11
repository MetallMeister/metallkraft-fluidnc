# 更新・元に戻す

[トップへ](../README.md)

## v0.1.1からv0.1.2へ

`index.html.gz`と`theme-metallkraft.gz`の2ファイルをFlash直下へ上書きして再読み込みします。先に現在のファイルをバックアップし、機械と主軸が停止した状態で更新してください。`preferences.json`・YAML・登録マクロは上書きしません。v0.1.0から更新する場合は`lang-ja.json.gz`も更新します。

## v0.1.0からv0.1.1へ

変更ファイルは`theme-metallkraft.gz`と`lang-ja.json.gz`だけです。この2ファイルをFlash直下へ上書きして再読み込みします。YAML・`preferences.json`・登録マクロ・画面本体のJavaScriptは変更しません。[変更履歴](../CHANGELOG.md)

## 画面だけ更新する

1. 機械を停止し、再接続・再読み込みで動く危険がない状態にする。
2. 現在の画面ファイル、`preferences.json`、稼働中のYAMLをバックアップする。
3. `install/ui/`のうち、**`preferences.json`を除く6ファイル**をFlash直下へ上書きする。YAMLは触らない。
4. ブラウザのキャッシュを無視して再読み込みし、表示と接続状態を確認する。

この方法はすでに同じMetallKraft画面構成を使用している方向けです。標準WebUIから初めて導入する場合は、同梱`preferences.json`が必要です。独自マクロや表示設定を保管し、導入後に内容を確認して再登録してください。

画面の初期値へ戻したい場合だけ`preferences.json`も上書きします。**登録マクロ・表示設定が置き換わります。** 機械設定とWi-Fi設定を公開版の値で置き換える操作ではありません。

## 元の画面へ戻す

Flash直下の画面ファイルと`preferences.json`を、導入前のバックアップへ戻します。YAMLを変更していなければ、機械設定を変更する必要はありません。元の標準WebUIに戻すときにカスタム設定だけ残すと、テーマや追加パネルが残る場合があります。

画面を開けなくなった場合も、USB接続の[公式Web Installer](https://installer.fluidnc.com/fluidnc) → `File browser` → `Flash`から復元できます。最初から`fresh-install`やFlash初期化を行わず、ファイル単位の復元を先に確認してください。

YAMLも変更していた場合は、元のYAMLを復元してActive configを選び直し、基板を再起動します。復元後は必ずStartup messagesを確認してください。

## 不具合を報告する

[GitHub Issues](https://github.com/MetallMeister/metallkraft-fluidnc/issues)または[コミュニティ](https://cnc-lab.metallmeister.net/)へ、次を添えてください。

- 基板の正式型番・リビジョン、FluidNCの版、配布版の版番号。
- OS・ブラウザ、再現手順、エラー文、個人情報を隠した画面。
- 設定が関係する場合は必要な箇所だけ。Wi-Fiパスワード、トークン、個人の加工ファイルは投稿しない。

加工を継続できない・意図しない動作がある場合は運転を中止してください。複数のUIや送りソフトから同時に操作しないでください。

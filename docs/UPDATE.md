# 更新・元に戻す

[トップへ](../README.md)

**旧版を入れたい場合は [バージョン一覧](VERSIONS.md) から目的のZIPを選んでください。** 最新版だけでなく、v0.1.0以降の各版を取得できます。旧版へ戻す手順も同ページにあります。

## v0.1.12からv0.2.0-beta.1へ

これはベータ版です。機械と主軸を停止し、本体Flash、稼働中のYAML、`preferences.json`をPCへバックアップしてください。その後、`install/ui/`のうち`preferences.json`を除く6ファイルをFlash直下へ上書きし、画面を再読み込みします。

設定画面の「機能」「MetallKraftインターフェース」「FluidNC」に「標準に戻す」が表示されます。正常な自機設定を確認してから「標準設定・バックアップ」→「現在の設定を標準として保存」を実行してください。配布ZIPには機械固有の標準値を含めません。詳しくは[標準設定への復元](RESTORE.md)を確認してください。

## v0.1.11からv0.1.12へ

機械と主軸を停止し、バックアップ後に `install/ui/` の `index.html.gz` と `theme-metallkraft.gz` を本体Flash直下へ上書きして、画面を再読み込みします。`config.yaml`・`preferences.json`・登録マクロ・SDカードの内容は変更しません。

加工ファイル欄に「全ダウンロード」と、各ゴミ箱の右に個別ダウンロードが追加されます。全ダウンロードは表示中のフォルダ内が対象です。サブフォルダと隠しファイルは含みません。ブラウザが複数ファイルの保存許可を求めた場合は許可してください。保存結果はブラウザのダウンロード一覧で確認できます。

## v0.1.10からv0.1.11へ

停止・バックアップ後に`metallkraft-preview.html.gz`のみ上書きして画面を再読み込みします。次回の加工から通過推定の修正が適用されます。機械設定・標準通信は変更しません。

## v0.1.9からv0.1.10へ

停止・バックアップ後に`metallkraft-preview.html.gz`のみ上書きし、画面を再読み込みします。通過推定の改善であり、制御・通信・YAML・登録マクロは変更しません。

## v0.1.8からv0.1.9へ

機械と主軸を停止し、バックアップ後に`index.html.gz`と`theme-metallkraft.gz`をFlash直下へ上書きして再読み込みします。YAML・`preferences.json`・登録マクロ・SDカードの内容は上書きしません。

## v0.1.7からv0.1.8へ

停止・バックアップ後に`metallkraft-preview.html.gz`だけを上書きして再読み込みします。設定や通信処理の変更はありません。

## v0.1.6からv0.1.7へ

`metallkraft-preview.html.gz`だけを更新します。機械と主軸を停止し、元ファイルをバックアップしてからFlash直下へ上書きし、画面を再読み込みします。通信処理・YAML・登録マクロは変更しません。

## v0.1.5からv0.1.6へ

`index.html.gz`・`theme-metallkraft.gz`・`metallkraft-preview.html.gz`を更新します。機械と主軸を停止し、現在のファイルをバックアップしてからFlash直下へ上書きし、画面を再読み込みします。YAML・`preferences.json`・登録マクロは変更しません。

## v0.1.4からv0.1.5へ

`theme-metallkraft.gz`と`metallkraft-preview.html.gz`の2ファイルだけを更新します。現在のファイルをバックアップし、機械と主軸が停止した状態でFlash直下へ上書きして再読み込みします。標準画面本体・YAML・`preferences.json`・登録マクロは上書きしません。

## v0.1.3からv0.1.4へ

変更は`theme-metallkraft.gz`だけです。現在のファイルをバックアップし、機械と主軸が停止した状態でFlash直下へ上書きして再読み込みします。画面JavaScript・YAML・登録マクロは変更しません。

## v0.1.2からv0.1.3へ

変更は`theme-metallkraft.gz`だけです。現在のファイルをバックアップし、機械と主軸が停止した状態でFlash直下へ上書きして再読み込みします。画面JavaScript・YAML・登録マクロは変更しません。

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

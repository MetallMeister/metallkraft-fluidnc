# はじめての導入

[トップへ戻る](../README.md)

## 1. 自分の基板を確認する

同梱の`config.yaml`は**MKS DLC32 MAX V1.0_002 / ESP32-S3用**です。通常のDLC32や異なる基板へ流用しないでください。画面だけ導入する場合は、すでに動作確認済みの自分のYAMLを使います。

本パッケージは初期設定と画面の配布です。基板の起動・表示確認と、機械の校正・安全確認は別です。YAMLの前提は[基板設定](BOARD.md)を参照してください。

## 2. ダウンロードとバックアップ

1. [ZIPをダウンロード](https://github.com/MetallMeister/metallkraft-fluidnc/archive/refs/heads/main.zip)して展開します。GitHubの緑色の`Code` → `Download ZIP`でも同じです。
2. [FluidNC Web Installer](https://installer.fluidnc.com/fluidnc)をChromeまたはEdgeで開き、USBで接続します。他のシリアル接続アプリは閉じてください。
3. すでに設定がある場合は`File browser` → **Flash**から、現在のYAML、`preferences.json`、`index.html.gz`と他の画面ファイルをダウンロードして保管します。Wi-Fi設定は別管理なので自分で控えます。

作業前に機械を停止し、モータ・主軸が不用意に動かない電源状態にしてください。配線の抜き差しは必ず電源を切って行います。ファイル転送中の基板電源は切りません。

## 3. FluidNC本体を入れる（必要な場合のみ）

すでにFluidNC v4.0.3が正常起動しているなら、再インストールは不要です。

1. Web Installerの`Install`で、基板が**esp32s3**として認識されているか確認します。MAX用です。
2. この配布物の基準版`v4.0.3`、`wifi`を選択します。
3. 新規導入時のみ`fresh-install`を使用します。**既存のファイル・設定が消えます。** 更新目的なら先にバックアップと公式の更新手順を確認してください。
4. 画面選択が出たらWebUI-3を選び、インストール完了を待ちます。後から同梱UIで置き換えます。

インストール直後、YAMLがまだない場合は「Cannot open config file」等が表示されることがあります。**すべての起動エラーを正常扱いしないでください。** 次の設定後にも警告・エラーが残る場合は、`Startup messages`で原因を確認します。

## 4. 基板設定を入れる

既存の機械設定を維持する人は、この節を飛ばしてください。

1. `File browser` → **Flash**を選択します。場所は直下の`/`です。
2. `Upload`から`install/boards/mks-dlc32-max-v1.0/config.yaml`を送ります。実際のファイル名は`config.yaml`です。
3. 一覧の`config.yaml`を**Active config**にします。
4. Active configを選べない場合は、`Terminal`で次の1行を送ります。

```text
$Config/Filename=config.yaml
```

まだ再起動せず、次の画面ファイルも送ります。

## 5. 画面を入れる

`File browser`の**Flash直下**へ、`install/ui/`に入っている次の7ファイルをアップロードします。

| ファイル名 | 内容 |
| --- | --- |
| `index.html.gz` | カスタムWebUI本体 |
| `theme-metallkraft.gz` | 色・文字・配置 |
| `lang-ja.json.gz` | 日本語表記 |
| `preferences.json` | 初期表示・移動量・移動速度など |
| `metallkraft-preview.html.gz` | 加工予定経路・位置・通過推定 |
| `metallkraft-links.html` | サイト・ショップ・コミュニティ |
| `metallkraft-news.html` | お知らせ |

**`.gz`は解凍せず、そのまま送ります。** macOS等が自動解凍した場合は、展開前の`.gz`を使用してください。同名の非圧縮ファイル（`index.html`など）が以前からある場合は、先にバックアップしてからその競合ファイルだけを削除します。Flash全体を初期化する必要はありません。

`preferences.json`の上書きは表示設定とマクロを初期値へ戻します。既存の独自設定を残したい場合は[更新手順](UPDATE.md)へ進んでください。

## 6. 再起動して開く

1. 転送完了を確認してから、基板を再起動します。ブラウザの再読み込みだけではYAMLは再読込されません。電源を入れ直す場合は、すべての給電元を考慮してください。
2. Web Installerへ再接続し、`Startup messages`で設定ファイル名、基板名、エラーの有無を確認します。
3. `WiFi`で自分の接続先を設定します。パスワードをGitHubへ投稿しないでください。
4. 基板が表示したIPアドレスをブラウザで開きます。他の人のIPアドレスは使用しません。
5. MetallKraftロゴ・日本語表示・加工予定経路・加工ファイル欄が表示されれば、画面導入は完了です。古い画面ならキャッシュを無視して再読み込みしてください。

基板のIPへ`http://`で接続します。インターネットへ基板を直接公開したり、ルーターでポート転送したりしないでください。

## 7. 加工前に

- [基板設定の確認事項](BOARD.md)を完了するまでは、加工開始・原点復帰・プローブを実行しない。
- ジョグ初期値は10 mm / 500 mm/min。**初回確認は移動量と速度を小さくして**、可動範囲と方向を1軸ずつ確認する。
- GコードはSDカードへ入れる。SDでファイルを選ぶと予定経路へ反映されるが、選択だけでは実行しない。
- **大きい「加工開始」を押すと確認ダイアログなしで開始する。** 工具・材料・固定・作業原点を事前に確認する。
- 位置・軌跡・進捗は機械からの報告に基づく表示であり、衝突防止や実加工完了を保証しない。

## よくある問題

| 症状 | 確認すること |
| --- | --- |
| SD / Flashがわからない | 設定・画面はFlash、加工GコードはSD |
| 起動時に設定エラー | Active config、MAXと通常版の取り違え、YAML字下げ、Startup messages |
| 標準画面のまま | `index.html.gz`、競合する`index.html`、ブラウザキャッシュ |
| 配置や日本語が反映されない | `preferences.json`・テーマ・言語ファイルがFlash直下にあるか |
| No SD card | カード、フォーマット、接点、SPI/CS設定。画面が出ることとSD認識は別 |
| 主軸・プローブ・原点復帰が動かない | 同梱YAMLでは未設定。画面のボタンがあるだけでは有効にならない |
| お知らせだけ読み込めない | 外部インターネット接続。機械制御とは別で、受信内容は文字だけを表示 |

公式資料: [インストール](https://github.com/bdring/fluidnc-wiki-content/blob/main/installation.md) / [FluidNC](https://github.com/bdring/FluidNC) / [v4.0.3](https://github.com/bdring/FluidNC/releases/tag/v4.0.3)

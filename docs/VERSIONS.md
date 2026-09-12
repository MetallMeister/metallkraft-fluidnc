# バージョンを選んでダウンロード

[トップへ](../README.md) · **[GitHub Releases一覧](https://github.com/MetallMeister/metallkraft-fluidnc/releases)** · [導入手順](INSTALL.md) · [更新・元に戻す](UPDATE.md)

**安定性優先なら v0.1.12、標準設定の保存・比較・復元を試す場合は v0.2.0-beta.1 を選んでください。** 旧版も、それぞれの公開時点のファイル一式をZIPでダウンロードできます。ビルドは不要です。リンク先は固定タグなので、最新版が更新されても中身は変わりません。

| バージョン | 一式ダウンロード | 主な変更 |
| --- | --- | --- |
| **v0.2.0-beta.1（最新ベータ）** | **[ZIP](https://github.com/MetallMeister/metallkraft-fluidnc/releases/download/v0.2.0-beta.1/metallkraft-ui-v0.2.0-beta.1.zip)** | 自機設定の保存・比較・個別／一括復元 |
| **v0.1.12（安定版）** | **[ZIP](https://github.com/MetallMeister/metallkraft-fluidnc/releases/download/v0.1.12/metallkraft-ui-v0.1.12.zip)** | 全・個別ダウンロード、上部メニューの整理 |
| v0.1.11 | [ZIP](https://github.com/MetallMeister/metallkraft-fluidnc/releases/download/v0.1.11/metallkraft-ui-v0.1.11.zip) | 短い間隔で届く位置報告の通過推定を改善 |
| v0.1.10 | [ZIP](https://github.com/MetallMeister/metallkraft-fluidnc/releases/download/v0.1.10/metallkraft-ui-v0.1.10.zip) | 重複経路での通過推定を改善 |
| v0.1.9 | [ZIP](https://github.com/MetallMeister/metallkraft-fluidnc/releases/download/v0.1.9/metallkraft-ui-v0.1.9.zip) | ファイルの個別・一括削除、確認画面 |
| v0.1.8 | [ZIP](https://github.com/MetallMeister/metallkraft-fluidnc/releases/download/v0.1.8/metallkraft-ui-v0.1.8.zip) | プレビューの操作説明 |
| v0.1.7 | [ZIP](https://github.com/MetallMeister/metallkraft-fluidnc/releases/download/v0.1.7/metallkraft-ui-v0.1.7.zip) | プレビューの平行移動 |
| v0.1.6 | [ZIP](https://github.com/MetallMeister/metallkraft-fluidnc/releases/download/v0.1.6/metallkraft-ui-v0.1.6.zip) | 加工中の手動入力を無効化 |
| v0.1.5 | [ZIP](https://github.com/MetallMeister/metallkraft-fluidnc/releases/download/v0.1.5/metallkraft-ui-v0.1.5.zip) | 工具位置表示の復帰と表示統一 |
| v0.1.4 | [ZIP](https://github.com/MetallMeister/metallkraft-fluidnc/releases/download/v0.1.4/metallkraft-ui-v0.1.4.zip) | 操作ボタンの整理、機能の区切り |
| v0.1.3 | [ZIP](https://github.com/MetallMeister/metallkraft-fluidnc/releases/download/v0.1.3/metallkraft-ui-v0.1.3.zip) | 復旧案内の点滅・停止説明 |
| v0.1.2 | [ZIP](https://github.com/MetallMeister/metallkraft-fluidnc/releases/download/v0.1.2/metallkraft-ui-v0.1.2.zip) | 復旧案内と配置調整 |
| v0.1.1 | [ZIP](https://github.com/MetallMeister/metallkraft-fluidnc/releases/download/v0.1.1/metallkraft-ui-v0.1.1.zip) | 主軸・マクロの配置調整 |
| v0.1.0 | [ZIP](https://github.com/MetallMeister/metallkraft-fluidnc/releases/download/v0.1.0/metallkraft-ui-v0.1.0.zip) | 初回公開 |

## 旧版を入れる手順

1. 機械と主軸を停止し、現在の本体FlashのファイルをPCへバックアップします。
2. 上の表から目的のZIPを選び、展開します。
3. 展開したフォルダの `install/ui/` を開きます。
4. すでにこのUIを使っている場合は、`preferences.json` を除く6ファイルを本体Flash直下へ上書きします。異なる版のUIファイルを混ぜないでください。
5. ブラウザを再読み込みします。表示が変わらない場合はキャッシュを無視して再読み込みしてください。

**`config.yaml` と `preferences.json` はそのまま残します。** 機械のピン設定・校正値や、登録マクロを旧版の初期値で上書きしないためです。旧版で表示設定が合わない場合は、まず手順1のバックアップへ戻してください。初めて導入する場合のみ、[導入手順](INSTALL.md)に従い7ファイルを使用します。

旧版には、その後に修正された不具合が残ります。全版の基準は FluidNC v4.0.3 / WebUI-3 v3.0.10 です。別ファームウェアへの互換性や、実機の安全を保証するものではありません。[現在の免責事項・安全上の注意](DISCLAIMER.md)も確認してください。

上のZIPは画面ファイル・説明書・ライセンスをまとめた導入用です。FluidNC本体や基板用YAMLは含みません。全ソースコードや任意のMAX基板設定例が必要な場合は、各Releaseの「Source code (zip)」を使用してください。

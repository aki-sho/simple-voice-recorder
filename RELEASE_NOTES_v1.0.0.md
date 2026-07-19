# Simple Voice Recorder v1.0.0

Windowsで手軽に録音・保存・再生できる、Simple Voice Recorderの
最初の正式リリースです。

録音データはPC内で処理され、アプリの利用にオンライン接続は必要ありません。

## ダウンロード

| ファイル | 用途 |
| --- | --- |
| `Simple-Voice-Recorder-Setup-1.0.0.exe` | 通常のWindowsインストーラー。初めて使う方におすすめです |
| `Simple-Voice-Recorder-Portable-1.0.0.zip` | インストール不要。展開してEXEを起動します |
| `Simple-Voice-Recorder-Portable-1.0.0.exe` | ポータブル版の単体EXE |
| 各`.sha256`ファイル | ダウンロードしたファイルの整合性確認用 |

## 使い方

### インストール版

1. `Simple-Voice-Recorder-Setup-1.0.0.exe`をダウンロードします。
2. インストーラーを起動します。
3. スタートメニューから「Simple Voice Recorder」を起動します。
4. 「保存先を選択」で録音ファイルの保存場所を指定します。

### ポータブル版

1. `Simple-Voice-Recorder-Portable-1.0.0.zip`をダウンロードします。
2. ZIPを任意の書き込み可能なフォルダへ展開します。
3. `Simple-Voice-Recorder-Portable-1.0.0.exe`を起動します。

設定を保ったまま移動する場合は、EXEと
`Simple-Voice-Recorder-PortableData`フォルダを一緒に移動してください。

## 主な機能

- マイク録音の開始・停止と録音時間表示
- WebM（対応環境ではOpus）またはMP3（128 kbps・モノラル）で保存
- 保存先フォルダと既定形式の設定保持
- 日時を使った録音ファイル名の自動生成
- 保存済み録音の一覧表示
- 再生、一時停止、停止、再生位置変更
- 確認ダイアログ付きの録音ファイル削除
- マイク権限、マイク未接続、保存先消失時のエラー表示

## データの保存場所

録音ファイルは、アプリで選択したフォルダへ保存されます。

インストール版の設定:

```text
%APPDATA%\Simple Voice Recorder\
```

ポータブル版の設定:

```text
<EXEのフォルダ>\Simple-Voice-Recorder-PortableData\
```

レジストリ、スタートアップ、常駐サービスは使用しません。

## 動作環境と注意点

- Windows 10 / 11（64ビット）
- マイク
- Microsoft Edge WebView2 Runtime
- ポータブル版はWebView2 Runtimeを同梱していません
- コード署名を行っていないため、SmartScreenの警告が表示される場合があります
- 録音中にアプリを終了すると、その録音は保存されません

## SHA-256

| ファイル | SHA-256 |
| --- | --- |
| `Simple-Voice-Recorder-Setup-1.0.0.exe` | `1fb1ea1d5cfddbcb454b759cfb5fa14012150aa995c6bb215914787918b455af` |
| `Simple-Voice-Recorder-Portable-1.0.0.exe` | `762d7050de0536933e7614de13dd3a8c58fd5fae728ec4aba19e72c5a9695268` |
| `Simple-Voice-Recorder-Portable-1.0.0.zip` | `df93b5753f7842f89a9f13c13620c9af79289fced89759e79911fade8f8c4bcc` |

PowerShellで確認する場合:

```powershell
Get-FileHash .\Simple-Voice-Recorder-Portable-1.0.0.zip -Algorithm SHA256
Get-Content .\Simple-Voice-Recorder-Portable-1.0.0.zip.sha256
```

## 開発者向け

- Tauri 2
- Rust
- HTML / CSS / JavaScript
- フロントエンドの追加ビルドツールなし
- MP3エンコード: lamejs 1.2.1

開発版の起動:

```powershell
npm install
npm run dev
```

Windows Releaseの再現:

```powershell
npm run release:windows
npm run verify:release
```

生成されるインストール版とポータブル版は、コンパイル時のfeatureで
設定保存場所を分離しています。

## ライセンス

Simple Voice RecorderはMIT Licenseで公開しています。
第三者ライブラリについては`THIRD_PARTY_NOTICES.md`を参照してください。

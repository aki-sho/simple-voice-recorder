Simple Voice Recorder Portable {{VERSION}}
==========================================

起動方法
--------
「{{PORTABLE_EXE}}」をダブルクリックしてください。
インストールは不要です。

設定データの場所
----------------
初回起動時、EXEと同じフォルダに次のフォルダが作成されます。

{{PORTABLE_DATA}}

保存先フォルダと既定の保存形式の設定は、このフォルダ内の
settings.jsonに保存されます。WebViewデータも同じフォルダ内に保存されます。
レジストリ、スタートアップ、常駐サービスは使用しません。

録音ファイル
------------
録音ファイルは、アプリの「保存先を選択」で指定したフォルダへ保存されます。
形式はWebMまたはMP3です。保存先が未設定の場合は、録音停止時に選択画面が
表示されます。

移動方法
--------
設定を引き継いで別のフォルダやUSBメモリへ移動する場合は、次の2つを
一緒に移動してください。

1. {{PORTABLE_EXE}}
2. {{PORTABLE_DATA}}

録音ファイルを別の場所へ保存している場合、そのファイルは自動では
移動されません。

削除方法
--------
アプリを終了してから、EXEと「{{PORTABLE_DATA}}」フォルダを削除してください。
アンインストーラーはありません。

WebView2 Runtimeについて
------------------------
このポータブル版はMicrosoft Edge WebView2 Runtimeを同梱していません。
起動できない場合は、WebView2 Runtime Evergreen版がWindowsに
インストールされていることを確認してください。

第三者ライブラリ
----------------
MP3エンコードにlamejs（LGPL-3.0）を使用しています。
詳細はプロジェクトのTHIRD_PARTY_NOTICES.mdを参照してください。

Simple Voice Recorder
https://github.com/aki-sho/simple-voice-recorder

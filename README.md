# Mag Keyboard Config

磁気キーボード設定用Webアプリです。WebHIDでQMK/Vial系Raw HIDデバイスへ接続します。

## 起動

WebHIDは対応ブラウザとセキュアコンテキストが必要です。ChromeまたはEdgeで、localhostから開いてください。

通常は `start_app.bat` を実行します。ローカルサーバーを起動し、ブラウザでアプリを開きます。

手動起動する場合:

```powershell
cd G:\05_Design\01_Keyboard\250304_磁気キーボード開発\app\mga_kbd_prj\app
python -m http.server 5173
```

ブラウザで以下を開きます。

```text
http://localhost:5173/
```

## 接続条件

- Raw HID usage page: `0xFF60`
- Raw HID usage: `0x61`
- Report ID: `0`
- Packet size: `32byte`

VID/PIDでは絞り込まず、接続ボタンを押すたびにブラウザのデバイス選択ダイアログを表示します。

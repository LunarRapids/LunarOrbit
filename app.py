"""月相轨道模拟器 — 桌面外壳。

使用 pywebview (Edge WebView2) 承载本地 Web 界面，内置一个只监听
127.0.0.1 的静态文件服务，因此无需联网即可运行。
"""

from __future__ import annotations

import ctypes
import functools
import http.server
import os
import sys
import threading
from pathlib import Path

import webview


APP_NAME = "月相轨道模拟器"
APP_ID = "LunarOrbit.Simulator.2"


def resource_dir() -> Path:
    """PyInstaller 打包后资源位于 _MEIPASS，开发时位于脚本目录。"""
    if getattr(sys, "frozen", False):
        return Path(getattr(sys, "_MEIPASS")) / "web"
    return Path(__file__).resolve().parent / "web"


class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, fmt, *args):  # noqa: A003 - 静默访问日志
        pass

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


# 注意：不要把 Window 对象保存在 Api 的公开属性上。
# pywebview 会递归序列化 js_api 的属性，一旦持有 Window 就会无限反射
# 到原生 WebView2 控件，导致 UI 线程异常和日志风暴。
_window: webview.Window | None = None
_maximized = False


class Api:
    def minimize(self) -> None:
        if _window:
            _window.minimize()

    def toggle_maximize(self) -> None:
        global _maximized
        if not _window:
            return
        if _maximized:
            _window.restore()
        else:
            _window.maximize()
        _maximized = not _maximized

    def close(self) -> None:
        if _window:
            _window.destroy()


def start_server(directory: Path):
    handler = functools.partial(QuietHandler, directory=str(directory))
    server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
    server.daemon_threads = True
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    return server


def main() -> int:
    os.environ.setdefault("PYWEBVIEW_GUI", "edgechromium")
    try:
        ctypes.windll.shell32.SetCurrentProcessExplicitAppUserModelID(APP_ID)
    except Exception:
        pass

    web_dir = resource_dir()
    index = web_dir / "index.html"
    if not index.exists():
        webview.create_window(APP_NAME, html="<h1>资源缺失</h1><p>找不到 web/index.html</p>", width=520, height=220)
        webview.start()
        return 1

    server = start_server(web_dir)
    port = server.server_address[1]

    if os.environ.get("LUNAR_DEBUG") == "1":
        webview.settings["REMOTE_DEBUGGING_PORT"] = 9223

    global _window
    api = Api()
    window = webview.create_window(
        APP_NAME,
        url=f"http://127.0.0.1:{port}/index.html",
        js_api=api,
        width=1480,
        height=920,
        min_size=(1180, 760),
        frameless=True,
        easy_drag=False,
        shadow=True,
        background_color="#05070e",
        text_select=False,
        zoomable=False,
        confirm_close=False,
    )
    _window = window

    icon = (web_dir.parent / "assets" / "icon.ico") if getattr(sys, "frozen", False) else (
        Path(__file__).resolve().parent / "assets" / "icon.ico"
    )

    try:
        webview.start(
            gui="edgechromium",
            private_mode=False,
            icon=str(icon) if icon.exists() else None,
        )
    finally:
        server.shutdown()
        server.server_close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

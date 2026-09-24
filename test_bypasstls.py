import requests
from pymongo import MongoClient

# Nếu bạn muốn dùng Playwright để bypass TLS-fingerprint blocking, cài:
# pip install playwright
# python -m playwright install chromium

from playwright.sync_api import sync_playwright

class BypassTLSSession(object):

    def __init__(self,
                 use_playwright: bool = True,
                 user_agent: str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
                 default_timeout: int = 30000):

        self.use_playwright = use_playwright and (sync_playwright is not None)
        self.user_agent = user_agent
        self.default_timeout = default_timeout  # ms for playwright
        self.headers = {
            "User-Agent": self.user_agent,
            "Accept": "application/json, text/plain, */*",
            "Accept-Language": "en-US,en;q=0.9"
        }
        # Playwright objects
        self._pw = None
        self._req_ctx = None

        if self.use_playwright:
            self._start_playwright()

    def _start_playwright(self):
        """Start sync_playwright and create request context."""
        if sync_playwright is None:
            raise RuntimeError("playwright not installed. Install with: pip install playwright && python -m playwright install chromium")

        # start playwright
        self._pw = sync_playwright().start()
        # create a lightweight request context that uses chromium TLS stack
        self._req_ctx = self._pw.request.new_context(
            user_agent=self.user_agent,
            extra_http_headers=self.headers,
            timeout=self.default_timeout
        )

    def _stop_playwright(self):
        try:
            if self._req_ctx:
                self._req_ctx.dispose()
                self._req_ctx = None
            if self._pw:
                self._pw.stop()
                self._pw = None
        except Exception:
            pass

    def close(self):
        """Call when done to free Playwright resources."""
        if self.use_playwright:
            self._stop_playwright()

    # -------- GET ----------
    def get(self, url, params=None, headers=None, timeout_seconds=15):
        """
        GET và trả về JSON đã parse.
        Nếu lỗi sẽ raise RuntimeError với thông báo dễ debug.
        """

        # chuẩn bị headers
        final_headers = dict(self.headers)
        if headers:
            final_headers.update(headers)
        # nếu dùng playwright
        resp = self._req_ctx.get(
            url,
            params=params,
            headers=final_headers,
            timeout=int(timeout_seconds * 1000)
        )

        status = resp.status
        text = resp.text()

        if status != 200:
            preview = text[:500] if isinstance(text, str) else str(text)[:500]
            raise RuntimeError(
                "HTTP {} from {}. Body start: {}".format(status, url, preview)
            )

        try:
            return resp.json()
        except Exception as e:
            preview = text[:800] if isinstance(text, str) else str(text)[:800]
            raise RuntimeError(
                "JSON parse error from {}: {}. Raw: {}".format(url, e, preview)
            )


    # -------- POST ----------
    def post(self, url, data=None, headers=None, timeout_seconds=15):
        """
        POST và trả về JSON đã parse.
        """

        final_headers = dict(self.headers)
        if headers:
            final_headers.update(headers)

        resp = self._req_ctx.post(
            url,
            data=data,
            headers=final_headers,
            timeout=int(timeout_seconds * 1000)
        )
        status = resp.status
        text = resp.text()

        if status != 200:
            preview = text[:500] if isinstance(text, str) else str(text)[:500]
            raise RuntimeError(
                "HTTP {} from {}. Body start: {}".format(status, url, preview)
            )

        try:
            return resp.json()
        except Exception as e:
            preview = text[:800] if isinstance(text, str) else str(text)[:800]
            raise RuntimeError(
                "JSON parse error from {}: {}. Raw: {}".format(url, e, preview)
            )

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        self.close()

data = BypassTLSSession().post("https://api.nhathuoclongchau.com.vn/lccus/ecom-prod/store-front/v3/order-promising/list-shop", data={"maxResult":1,"skipCount":0,"searchBy":{"byProvince":None,"byLocation":None}})
print(data)
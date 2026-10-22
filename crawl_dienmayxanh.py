import argparse
import asyncio
import html
import json
import re
import tempfile
from html.parser import HTMLParser
from pathlib import Path
from typing import Any
from urllib.parse import urljoin, urlparse

from playwright.async_api import APIRequestContext, async_playwright

from sync_daily import sync_daily


BASE_URL = "https://www.dienmayxanh.com"
STORE_INDEX_URL = f"{BASE_URL}/he-thong-sieu-thi-dien-may"
DEFAULT_PROVINCE_URL = f"{STORE_INDEX_URL}/thanh-pho-ho-chi-minh"
RAW_PATH = Path(__file__).with_name("dienmayxanh_raw.json")
SOURCE = "dienmayxanh"
BRAND_PREFIX = "điện máy xanh"
PAGE_SIZE = 10
REQUEST_TIMEOUT = 60_000
MAX_PAGES = 1_000


class StoreListParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.stores: list[dict[str, str]] = []
        self.total_count: int | None = None
        self.province_id: str | None = None
        self._current: dict[str, Any] | None = None
        self._text: list[str] = []
        self._store_link_text: list[str] = []
        self._in_store_link = False
        self._in_old_address = False

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attributes = dict(attrs)
        if tag == "li" and attributes.get("data-id"):
            self._current = {"id": attributes["data-id"], "title": "", "href": "", "text": ""}
            self._text = []
        elif self._current and tag == "a":
            href = attributes.get("href") or ""
            if re.search(r"-id-\d+(?:$|[?#])", href):
                self._current["title"] = attributes.get("title") or ""
                self._current["href"] = href
                self._store_link_text = []
                self._in_store_link = True
        elif self._current and tag == "p" and "address-old" in (attributes.get("class") or ""):
            self._in_old_address = True

        if tag == "a" and "seemore" in (attributes.get("class") or ""):
            onclick = attributes.get("onclick") or ""
            province_match = re.search(r"GetMoreStore\(this,\s*(\d+)", onclick)
            if province_match:
                self.province_id = province_match.group(1)
                total_match = re.search(r'data-total="(\d+)"', self.get_starttag_text() or "")
                if total_match:
                    self.total_count = int(total_match.group(1))

    def handle_data(self, data: str) -> None:
        if self._current and not self._in_old_address:
            self._text.append(data)
            if self._in_store_link:
                self._store_link_text.append(data)

    def handle_endtag(self, tag: str) -> None:
        if tag == "a" and self._current and self._in_store_link:
            if not self._current["title"]:
                self._current["title"] = " ".join(" ".join(self._store_link_text).split())
            self._in_store_link = False
        if tag == "p" and self._in_old_address:
            self._in_old_address = False
        if tag == "li" and self._current:
            self._current["text"] = " ".join(" ".join(self._text).split())
            if self._current["title"]:
                self.stores.append(self._current)
            self._current = None
            self._text = []
            self._store_link_text = []


def parse_store_html(content: str) -> StoreListParser:
    parser = StoreListParser()
    parser.feed(content)
    return parser


def normalize_store(
    store: dict[str, str], province_name: str, province_url: str, province_id: str
) -> dict[str, Any]:
    store_id = store["id"]
    address = html.unescape(store["title"]).strip()
    if not address:
        raise ValueError(f"Cửa hàng Điện Máy Xanh {store_id} thiếu địa chỉ")
    name = "Thế giới di động" if address.lower().startswith("thế giới di động") else "Điện máy Xanh"
    return {
        "shopCode": f"dienmayxanh-{store_id}",
        "shopName": name,
        "shopNameDisplay": address,
        "location": {"addressDisplay": address, "address": address},
        "provinceIDStr": province_id,
        "provinceName": province_name,
        "operation": {"openStatus": True},
        "isEcom": True,
        "detailUrl": urljoin(BASE_URL, store.get("href") or ""),
        "sourceProvinceUrl": province_url,
    }


def is_target_store(store: dict[str, str]) -> bool:
    return html.unescape(store.get("title") or "").strip().casefold().startswith(BRAND_PREFIX)


def validate_payload(payload: Any) -> dict[str, Any]:
    if not isinstance(payload, dict):
        raise ValueError("Payload crawl phải là một object JSON")
    items = payload.get("items")
    if not isinstance(items, list) or not items:
        raise ValueError("Dữ liệu crawl không có items hợp lệ")
    shop_codes = [item.get("shopCode") for item in items if isinstance(item, dict)]
    if len(shop_codes) != len(items) or any(not code for code in shop_codes):
        raise ValueError("Dữ liệu crawl có shopCode thiếu")
    if len(set(shop_codes)) != len(shop_codes):
        raise ValueError("Dữ liệu crawl có shopCode trùng")
    if any((item.get("shopName") or "").casefold() != BRAND_PREFIX for item in items):
        raise ValueError(f"Dữ liệu crawl chứa cửa hàng không thuộc thương hiệu {BRAND_PREFIX}")
    return payload


def province_name_from_url(url: str) -> str:
    return url.rstrip("/").rsplit("/", 1)[-1].replace("-", " ").title()


async def get_text(request_context: APIRequestContext, url: str, **kwargs: Any) -> str:
    response = await request_context.fetch(url, **kwargs)
    text = await response.text()
    if not response.ok:
        raise RuntimeError(f"Điện Máy Xanh API lỗi HTTP {response.status}: {text[:500]}")
    return text


async def fetch_province(
    request_context: APIRequestContext,
    province_url: str,
) -> list[dict[str, Any]]:
    initial_html = await get_text(request_context, province_url, method="GET")
    initial = parse_store_html(initial_html)
    province_name = province_name_from_url(province_url)
    province_match = re.search(r"\bvar\s+provinceId\s*=\s*(\d+)\s*;", initial_html)
    province_id = province_match.group(1) if province_match else initial.province_id
    if not province_id or province_id == "0":
        raise ValueError(f"Không tìm thấy provinceId trong trang {province_url}")

    all_stores = list(initial.stores)
    stores = [normalize_store(store, province_name, province_url, province_id) for store in initial.stores if is_target_store(store)]
    # data-total trên nút này là số cửa hàng còn lại sau danh sách HTML đầu tiên.
    expected_count = (initial.total_count or 0) + len(initial.stores)
    page_index = 1
    while page_index <= MAX_PAGES:
        if expected_count is not None and len({item["shopCode"] for item in stores}) >= expected_count:
            break
        response_html = await get_text(
            request_context,
            f"{BASE_URL}/Store/SuggestSearch",
            method="POST",
            form={
                "provinceId": province_id,
                "districtId": "",
                "keyword": "",
                "pageIndex": str(page_index),
                "pageSize": str(PAGE_SIZE),
                "loadAll": "true",
                "className": "",
                "type": "-1",
            },
            headers={
                "accept": "*/*",
                "origin": BASE_URL,
                "referer": province_url,
                "x-requested-with": "XMLHttpRequest",
            },
        )
        page = parse_store_html(response_html)
        if not page.stores:
            break
        all_stores.extend(page.stores)
        stores.extend(normalize_store(store, province_name, province_url, province_id) for store in page.stores if is_target_store(store))
        page_index += 1

    all_unique_codes = {store["id"] for store in all_stores}
    unique = list({item["shopCode"]: item for item in stores}.values())
    if expected_count and len(all_unique_codes) < expected_count:
        raise ValueError(
            f"Dữ liệu {province_name} không đầy đủ: nhận {len(all_unique_codes)}/{expected_count} cửa hàng"
        )
    return unique


async def province_urls(request_context: APIRequestContext) -> list[str]:
    content = await get_text(request_context, STORE_INDEX_URL, method="GET")
    index_path = urlparse(STORE_INDEX_URL).path.rstrip("/")
    links = re.findall(
        rf'href=["\']([^"\']*?{re.escape(index_path)}/[^"\']+)["\']',
        content,
        flags=re.IGNORECASE,
    )
    return list(dict.fromkeys(urljoin(BASE_URL, link) for link in links))


async def fetch_payload(selected_urls: list[str] | None = None) -> dict[str, Any]:
    async with async_playwright() as playwright:
        request_context = await playwright.request.new_context(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
            extra_http_headers={"accept-language": "vi-VN,vi;q=0.9,en;q=0.6"},
            timeout=REQUEST_TIMEOUT,
        )
        try:
            urls = selected_urls or await province_urls(request_context)
            if not urls:
                raise ValueError("Không có URL tỉnh/thành phố để crawl")
            stores: list[dict[str, Any]] = []
            for url in urls:
                print(f"Đang crawl {url}")
                stores.extend(await fetch_province(request_context, url))
        finally:
            await request_context.dispose()

    unique_stores = list({store["shopCode"]: store for store in stores}.values())
    return validate_payload({"totalCount": len(unique_stores), "items": unique_stores})


def write_payload(payload: dict[str, Any]) -> None:
    with tempfile.NamedTemporaryFile("w", encoding="utf-8", dir=RAW_PATH.parent, delete=False) as temporary:
        json.dump(payload, temporary, ensure_ascii=False, indent=2)
        temporary.write("\n")
        temporary_path = Path(temporary.name)
    temporary_path.replace(RAW_PATH)


def load_and_validate() -> dict[str, Any]:
    with RAW_PATH.open("r", encoding="utf-8") as source:
        return validate_payload(json.load(source))


async def main() -> None:
    parser = argparse.ArgumentParser(description="Crawl Điện Máy Xanh store data")
    parser.add_argument("--dry-run", action="store_true", help="Fetch and validate without writing")
    parser.add_argument("--validate-only", action="store_true", help="Validate raw JSON without network access")
    parser.add_argument("--url", action="append", dest="urls", help="Only crawl this province URL; repeat for multiple provinces")
    args = parser.parse_args()

    if args.validate_only:
        payload = load_and_validate()
    else:
        payload = await fetch_payload(args.urls)

    print(f"Payload hợp lệ: {len(payload['items'])} cửa hàng; totalCount={payload.get('totalCount', 0)}")
    if not args.dry_run and not args.validate_only:
        write_payload(payload)
        print(f"Đã lưu {RAW_PATH.name}")
        sync_daily(payload, source=SOURCE)
        print("Đã đồng bộ dữ liệu Điện Máy Xanh vào MongoDB")


if __name__ == "__main__":
    asyncio.run(main())
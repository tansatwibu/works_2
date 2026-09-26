import argparse
import asyncio
import json
import tempfile
from pathlib import Path
from typing import Any

from playwright.async_api import APIRequestContext, async_playwright

from sync_daily import sync_daily


LOCATION_URL = "https://api.bachhoaxanh.com/gw/LocationV3/GetFull"
STORES_URL = "https://api.bachhoaxanh.com/gw/Location/V2/GetStoresByLocation"
RAW_PATH = Path(__file__).with_name("bachhoaxanh_raw.json")
PAGE_SIZE = 100
REQUEST_TIMEOUT = 60_000


def validate_payload(payload: Any) -> dict[str, Any]:
    if not isinstance(payload, dict):
        raise ValueError("Payload crawl phải là một object JSON")
    items = payload.get("items")
    if not isinstance(items, list) or not items:
        raise ValueError("Dữ liệu crawl không có items hợp lệ")
    expected_count = int(payload.get("totalCount") or 0)
    if expected_count and len(items) < expected_count * 0.95:
        raise ValueError(f"Dữ liệu không đầy đủ: nhận {len(items)}/{expected_count}")
    shop_codes = [item.get("shopCode") for item in items if isinstance(item, dict)]
    if len(shop_codes) != len(items) or any(not code for code in shop_codes):
        raise ValueError("Dữ liệu crawl có shopCode thiếu")
    if len(set(shop_codes)) != len(shop_codes):
        raise ValueError("Dữ liệu crawl có shopCode trùng")
    return payload


def normalize_store(store: dict[str, Any], province: dict[str, Any]) -> dict[str, Any]:
    store_id = store.get("storeId")
    if store_id is None:
        raise ValueError("Cửa hàng Bách Hoá Xanh thiếu storeId")
    name = store.get("storeLocation") or f"Bách Hoá Xanh {store_id}"
    province_id = store.get("provinceId") or province.get("id")
    return {
        "shopCode": f"bhx-{store_id}",
        "shopName": name,
        "shopNameDisplay": name,
        "location": {
            "addressDisplay": store.get("storeAddress"),
            "address": store.get("storeAddress"),
            "coordinates": {"longitude": store.get("lng"), "latitude": store.get("lat")},
        },
        "provinceIDStr": str(province_id) if province_id is not None else None,
        "provinceName": province.get("name"),
        "districtIDStr": str(store["districtId"]) if store.get("districtId") else None,
        "wardIDStr": str(store["wardId"]) if store.get("wardId") else None,
        "operation": {"openStatus": not bool(store.get("isStoreVirtual"))},
        "isEcom": not bool(store.get("isStoreVirtual")),
    }


async def get_json(request_context: APIRequestContext, url: str) -> Any:
    response = await request_context.get(url, headers={"accept": "application/json"})
    text = await response.text()
    if not response.ok:
        raise RuntimeError(f"Bách Hoá Xanh API lỗi HTTP {response.status}: {text[:500]}")
    try:
        return json.loads(text)
    except json.JSONDecodeError as error:
        raise RuntimeError(f"Bách Hoá Xanh API trả về dữ liệu không phải JSON: {text[:500]}") from error


async def fetch_payload() -> dict[str, Any]:
    async with async_playwright() as playwright:
        request_context = await playwright.request.new_context(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
            extra_http_headers={"accept-language": "vi-VN,vi;q=0.9,en;q=0.6"},
            timeout=REQUEST_TIMEOUT,
        )
        try:
            location_data = await get_json(request_context, LOCATION_URL)
            provinces = (location_data.get("data") or {}).get("provinces") or location_data.get("provinces") or []
            if not provinces:
                raise ValueError("Bách Hoá Xanh API không trả về danh sách tỉnh")

            stores: list[dict[str, Any]] = []
            for province in provinces:
                province_count = 0
                page_index = 0
                while True:
                    params = {
                        "provinceId": str(province["id"]),
                        "wardId": "0",
                        "pageSize": str(PAGE_SIZE),
                        "pageIndex": str(page_index),
                    }
                    data = await get_json(request_context, f"{STORES_URL}?{_encode_query(params)}")
                    response_data = data.get("data") or data
                    page = response_data.get("stores") or []
                    stores.extend(normalize_store(store, province) for store in page)
                    province_count += len(page)
                    total = int(response_data.get("total") or 0)
                    if not page or (total and province_count >= total) or (not total and len(page) < PAGE_SIZE):
                        break
                    page_index += 1
        finally:
            await request_context.dispose()

    unique_stores = list({store["shopCode"]: store for store in stores}.values())
    return validate_payload({"totalCount": len(unique_stores), "items": unique_stores})


def _encode_query(params: dict[str, str]) -> str:
    from urllib.parse import urlencode

    return urlencode(params)


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
    parser = argparse.ArgumentParser(description="Crawl Bách Hoá Xanh store data")
    parser.add_argument("--dry-run", action="store_true", help="Fetch and validate without writing or syncing")
    parser.add_argument("--validate-only", action="store_true", help="Validate the existing raw JSON without network access")
    args = parser.parse_args()

    payload = load_and_validate() if args.validate_only else await fetch_payload()
    print(f"Payload hợp lệ: {len(payload['items'])} cửa hàng; totalCount={payload.get('totalCount', 0)}")
    if args.dry_run or args.validate_only:
        return
    write_payload(payload)
    print(f"Đã lưu {RAW_PATH.name}")
    sync_daily(payload, source="bachhoaxanh")
    print("Đã đồng bộ dữ liệu Bách Hoá Xanh vào MongoDB")


if __name__ == "__main__":
    asyncio.run(main())
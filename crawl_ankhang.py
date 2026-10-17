import argparse
import asyncio
import json
import tempfile
from pathlib import Path
from typing import Any

from playwright.async_api import APIRequestContext, async_playwright

from sync_daily import sync_daily


API_URL = "https://webapi.nhathuocankhang.com/gw/bus-ankhang-tmdt/api/Store/GetListStoreByLocation"
STORE_URL = "https://www.nhathuocankhang.com/he-thong-nha-thuoc"
RAW_PATH = Path(__file__).with_name("ankhang_raw.json")
REQUEST_TIMEOUT = 60_000
MIN_EXPECTED_STORES = 100


def validate_payload(payload: Any) -> dict[str, Any]:
    if not isinstance(payload, dict):
        raise ValueError("Payload crawl phải là một object JSON")

    items = payload.get("items")
    if not isinstance(items, list) or not items:
        raise ValueError("Dữ liệu crawl không có items hợp lệ")
    if len(items) < MIN_EXPECTED_STORES:
        raise ValueError(f"Dữ liệu không đầy đủ: chỉ nhận {len(items)} cửa hàng")

    shop_codes = [item.get("shopCode") for item in items if isinstance(item, dict)]
    if len(shop_codes) != len(items) or any(not code for code in shop_codes):
        raise ValueError("Dữ liệu crawl có shopCode thiếu")
    if len(set(shop_codes)) != len(shop_codes):
        raise ValueError("Dữ liệu crawl có shopCode trùng")
    return payload


def normalize_store(store: dict[str, Any]) -> dict[str, Any]:
    store_id = store.get("storeID")
    if store_id is None:
        raise ValueError("API An Khang trả về cửa hàng thiếu storeID")

    name = store.get("webStoreName") or store.get("storeFullName") or store.get("storeName")
    if not name:
        name = f"Nhà thuốc An Khang {store_id}"
    address = store.get("webAddress") or store.get("storeAddress") or ""
    is_open = bool(store.get("isSaleStore", True) and store.get("isShowWeb", True))

    item: dict[str, Any] = {
        "shopCode": f"ankhang-{store_id}",
        "shopName": name,
        "shopNameDisplay": name,
        "location": {
            "addressDisplay": address,
            "address": store.get("storeAddress") or address,
        },
        "provinceIDStr": str(store["provinceID"]) if store.get("provinceID") is not None else None,
        "provinceName": store.get("provinceName"),
        "districtIDStr": str(store["districtID"]) if store.get("districtID") is not None else None,
        "districtName": store.get("districtName"),
        "wardIDStr": str(store["wardID"]) if store.get("wardID") is not None else None,
        "wardName": store.get("wardName"),
        "operation": {"openStatus": is_open},
        "isEcom": is_open,
    }

    longitude = store.get("lng")
    latitude = store.get("lat")
    if isinstance(longitude, (int, float)) and isinstance(latitude, (int, float)):
        item["location"]["coordinates"] = {
            "longitude": longitude,
            "latitude": latitude,
        }
    if store.get("openingDay"):
        item["grandOpening"] = store["openingDay"]
    if store.get("url"):
        item["detailUrl"] = f"{STORE_URL}/{store['url']}"

    return item


async def get_json(request_context: APIRequestContext) -> dict[str, Any]:
    response = await request_context.post(
        API_URL,
        data={},
        headers={
            "accept": "application/json, text/plain, */*",
            "content-type": "application/json",
            "origin": "https://www.nhathuocankhang.com",
            "referer": f"{STORE_URL}",
        },
    )
    text = await response.text()
    if not response.ok:
        raise RuntimeError(f"API An Khang lỗi HTTP {response.status}: {text[:500]}")
    try:
        payload = json.loads(text)
    except json.JSONDecodeError as error:
        raise RuntimeError(f"API An Khang trả về dữ liệu không phải JSON: {text[:500]}") from error
    if payload.get("code") != 0 or not isinstance(payload.get("data"), list):
        raise RuntimeError(f"API An Khang trả về payload lỗi: {text[:500]}")
    return payload


async def fetch_payload() -> dict[str, Any]:
    async with async_playwright() as playwright:
        request_context = await playwright.request.new_context(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
            extra_http_headers={"accept-language": "vi-VN,vi;q=0.9,en;q=0.6"},
            timeout=REQUEST_TIMEOUT,
        )
        try:
            response_payload = await get_json(request_context)
        finally:
            await request_context.dispose()

    stores = [normalize_store(store) for store in response_payload["data"]]
    unique_stores = list({store["shopCode"]: store for store in stores}.values())
    if len(unique_stores) != len(stores):
        print(f"Cảnh báo: API An Khang trả {len(stores) - len(unique_stores)} bản ghi trùng")
    return validate_payload({"totalCount": len(unique_stores), "items": unique_stores})


def write_payload(payload: dict[str, Any]) -> None:
    with tempfile.NamedTemporaryFile(
        "w", encoding="utf-8", dir=RAW_PATH.parent, delete=False
    ) as temporary:
        json.dump(payload, temporary, ensure_ascii=False, indent=2)
        temporary.write("\n")
        temporary_path = Path(temporary.name)
    temporary_path.replace(RAW_PATH)


def load_and_validate() -> dict[str, Any]:
    with RAW_PATH.open("r", encoding="utf-8") as source:
        return validate_payload(json.load(source))


async def main() -> None:
    parser = argparse.ArgumentParser(description="Crawl An Khang store data")
    parser.add_argument("--dry-run", action="store_true", help="Fetch and validate without writing or syncing")
    parser.add_argument("--validate-only", action="store_true", help="Validate the existing raw JSON without network access")
    args = parser.parse_args()

    payload = load_and_validate() if args.validate_only else await fetch_payload()
    print(f"Payload hợp lệ: {len(payload['items'])} cửa hàng; totalCount={payload.get('totalCount', 0)}")
    if args.dry_run or args.validate_only:
        return

    write_payload(payload)
    print(f"Đã lưu {RAW_PATH.name}")
    sync_daily(payload, source="ankhang")
    print("Đã đồng bộ dữ liệu An Khang vào MongoDB")


if __name__ == "__main__":
    asyncio.run(main())
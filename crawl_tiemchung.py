import argparse
import asyncio
import json
import tempfile
from pathlib import Path
from typing import Any
from urllib.parse import urlencode

from playwright.async_api import APIRequestContext, async_playwright

from sync_daily import sync_daily


API_URL = "https://api.tiemchunglongchau.com.vn/gw/v1/public/vac-web-bff-before-order/store/search-stores"
RAW_PATH = Path(__file__).with_name("tiemchunglongchau_raw.json")
REQUEST_TIMEOUT = 60_000
MIN_EXPECTED_CENTERS = 20


def validate_payload(payload: Any) -> dict[str, Any]:
    if not isinstance(payload, dict):
        raise ValueError("Payload crawl phải là một object JSON")
    items = payload.get("items")
    if not isinstance(items, list) or not items:
        raise ValueError("Dữ liệu crawl không có items hợp lệ")
    if len(items) < MIN_EXPECTED_CENTERS:
        raise ValueError(f"Dữ liệu không đầy đủ: chỉ nhận {len(items)} trung tâm")
    shop_codes = [item.get("shopCode") for item in items if isinstance(item, dict)]
    if len(shop_codes) != len(items) or any(not code for code in shop_codes):
        raise ValueError("Dữ liệu crawl có shopCode thiếu")
    if len(set(shop_codes)) != len(shop_codes):
        raise ValueError("Dữ liệu crawl có shopCode trùng")
    return payload


def normalize_center(store: dict[str, Any], legacy_codes: dict[str, str]) -> dict[str, Any]:
    code = store.get("code")
    if not code:
        raise ValueError("API tiêm chủng trả về trung tâm thiếu code")
    address = store.get("displayAddress") or store.get("address") or ""
    province_name = store.get("regulatedProvinceName") or address.rsplit(",", 1)[-1].strip() or None
    province_id = store.get("regulatedProvinceCode") or store.get("provinceCode")
    name = store.get("displayName") or store.get("name") or f"Tiêm chủng Long Châu {code}"
    shop_code = legacy_codes.get(store.get("slug", ""), f"tclc-{code}")
    item = {
        "shopCode": shop_code,
        "shopName": name,
        "shopNameDisplay": name,
        "location": {"addressDisplay": address, "address": store.get("address") or address},
        "provinceIDStr": str(province_id) if province_id is not None else None,
        "provinceName": province_name,
        "districtIDStr": str(store["districtCode"]) if store.get("districtCode") else None,
        "wardIDStr": str(store["wardCode"]) if store.get("wardCode") else None,
        "isEcom": bool(store.get("isEcom", True)),
        "operation": {"openStatus": bool(store.get("isOpen", store.get("status", True)))},
    }
    if store.get("slug"):
        item["detailUrl"] = f"https://tiemchunglongchau.com.vn/he-thong-trung-tam/{store['slug']}"
    longitude = store.get("longitude")
    latitude = store.get("latitude")
    if isinstance(longitude, (int, float)) and isinstance(latitude, (int, float)):
        item["location"]["coordinates"] = {"longitude": longitude, "latitude": latitude}
    if store.get("openDate"):
        item["grandOpening"] = store["openDate"]
    return item


async def get_json(request_context: APIRequestContext, page: int) -> dict[str, Any]:
    url = f"{API_URL}?{urlencode({'page': page})}"
    response = await request_context.get(url, headers={"accept": "application/json"})
    text = await response.text()
    if not response.ok:
        raise RuntimeError(f"API tiêm chủng lỗi HTTP {response.status}: {text[:500]}")
    try:
        data = json.loads(text)
    except json.JSONDecodeError as error:
        raise RuntimeError(f"API tiêm chủng trả về dữ liệu không phải JSON: {text[:500]}") from error
    if data.get("code") != 200 or not isinstance(data.get("data"), dict):
        raise RuntimeError(f"API tiêm chủng trả về payload lỗi: {text[:500]}")
    return data["data"]


async def fetch_payload() -> dict[str, Any]:
    legacy_codes: dict[str, str] = {}
    if RAW_PATH.exists():
        with RAW_PATH.open("r", encoding="utf-8") as source:
            previous_payload = json.load(source)
        for item in previous_payload.get("items", []):
            detail_url = item.get("detailUrl", "")
            if detail_url and item.get("shopCode"):
                legacy_codes[detail_url.rsplit("/", 1)[-1]] = item["shopCode"]

    async with async_playwright() as playwright:
        request_context = await playwright.request.new_context(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
            extra_http_headers={"accept-language": "vi-VN,vi;q=0.9,en;q=0.6"},
            timeout=REQUEST_TIMEOUT,
        )
        try:
            centers: list[dict[str, Any]] = []
            page = 1
            total_records = None
            while total_records is None or len(centers) < total_records:
                page_data = await get_json(request_context, page)
                page_items = page_data.get("items") or []
                total_records = int(page_data.get("totalRecords") or 0)
                page_size = int(page_data.get("size") or 0)
                if not page_items:
                    break
                centers.extend(normalize_center(store, legacy_codes) for store in page_items)
                if len(page_items) < page_size or not page_size:
                    break
                page += 1
        finally:
            await request_context.dispose()

    if total_records and len(centers) < total_records:
        raise ValueError(f"Dữ liệu không đầy đủ: nhận {len(centers)}/{total_records} record API")
    unique_centers = list({center["shopCode"]: center for center in centers}.values())
    if len(unique_centers) != len(centers):
        print(f"Cảnh báo: API tiêm chủng trả {len(centers) - len(unique_centers)} bản ghi trùng")
    return validate_payload({"totalCount": len(unique_centers), "items": unique_centers})


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
    parser = argparse.ArgumentParser(description="Crawl Tiêm chủng Long Châu store data")
    parser.add_argument("--dry-run", action="store_true", help="Fetch and validate without writing or syncing")
    parser.add_argument("--validate-only", action="store_true", help="Validate the existing raw JSON without network access")
    args = parser.parse_args()

    payload = load_and_validate() if args.validate_only else await fetch_payload()
    print(f"Payload hợp lệ: {len(payload['items'])} trung tâm; totalCount={payload.get('totalCount', 0)}")
    if args.dry_run or args.validate_only:
        return
    write_payload(payload)
    print(f"Đã lưu {RAW_PATH.name}")
    sync_daily(payload, source="tiemchunglongchau")
    print("Đã đồng bộ dữ liệu Tiêm chủng Long Châu vào MongoDB")


if __name__ == "__main__":
    asyncio.run(main())
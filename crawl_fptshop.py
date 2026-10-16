import argparse
import asyncio
import json
import tempfile
from pathlib import Path
from typing import Any
from urllib.parse import urlencode

from playwright.async_api import APIRequestContext, async_playwright

from sync_daily import sync_daily


API_URL = "https://papi.fptshop.com.vn/gw/v1/public/bff-before-order/content/stores"
STORE_URL = "https://fptshop.com.vn/cua-hang"
RAW_PATH = Path(__file__).with_name("fptshop_raw.json")
PAGE_SIZE = 5
REQUEST_TIMEOUT = 60_000


def validate_payload(payload: Any) -> dict[str, Any]:
    if not isinstance(payload, dict):
        raise ValueError("Payload crawl phai la mot object JSON")

    items = payload.get("items")
    if not isinstance(items, list) or not items:
        raise ValueError("Du lieu crawl khong co items hop le")

    expected_count = int(payload.get("totalCount") or 0)
    if expected_count and len(items) < expected_count * 0.95:
        raise ValueError(f"Du lieu khong day du: nhan {len(items)}/{expected_count}")

    shop_codes = [item.get("shopCode") for item in items if isinstance(item, dict)]
    if len(shop_codes) != len(items) or any(not code for code in shop_codes):
        raise ValueError("Du lieu crawl co shopCode thieu")
    if len(set(shop_codes)) != len(shop_codes):
        raise ValueError("Du lieu crawl co shopCode trung")

    return payload


def normalize_store(store: dict[str, Any]) -> dict[str, Any]:
    code = store.get("code")
    if code is None or str(code).strip() == "":
        raise ValueError("API FPT Shop tra ve cua hang thieu code")

    name = store.get("displayName") or store.get("name") or f"FPT Shop {code}"
    address = store.get("displayAddress") or store.get("address") or ""
    province_name = store.get("regulatedProvinceName") or store.get("provinceName")
    province_code = store.get("regulatedProvinceCode") or store.get("provinceCode")
    district_code = store.get("regulatedDistrictCode") or store.get("districtCode")
    ward_code = store.get("regulatedWardCode") or store.get("wardCode")

    item: dict[str, Any] = {
        "shopCode": f"fptshop-{code}",
        "shopName": name,
        "shopNameDisplay": name,
        "location": {
            "addressDisplay": address,
            "address": store.get("address") or address,
        },
        "provinceIDStr": str(province_code) if province_code is not None else None,
        "provinceName": province_name,
        "districtIDStr": str(district_code) if district_code is not None else None,
        "districtName": store.get("regulatedDistrictName") or store.get("districtName"),
        "wardIDStr": str(ward_code) if ward_code is not None else None,
        "wardName": store.get("regulatedWardName") or store.get("wardName"),
        "operation": {"openStatus": bool(store.get("status", False))},
        "isEcom": bool(store.get("isEcom", True)),
    }

    longitude = store.get("longitude")
    latitude = store.get("latitude")
    if isinstance(longitude, (int, float)) and isinstance(latitude, (int, float)):
        item["location"]["coordinates"] = {
            "longitude": longitude,
            "latitude": latitude,
        }

    slug = store.get("slug")
    if slug:
        item["detailUrl"] = f"{STORE_URL}/{slug}"
    if store.get("openingDate"):
        item["grandOpening"] = store["openingDate"]

    return item


async def get_page(
    request_context: APIRequestContext,
    page: int,
    page_size: int,
) -> dict[str, Any]:
    query = urlencode({"numberPerPage": page_size, "page": page})
    response = await request_context.get(
        f"{API_URL}?{query}",
        headers={
            "accept": "application/json, text/plain, */*",
            "origin": "https://fptshop.com.vn",
            "referer": STORE_URL,
            "x-channel": "EStore",
            "order-channel": "1",
        },
    )
    text = await response.text()
    if not response.ok:
        raise RuntimeError(f"API FPT Shop loi HTTP {response.status}: {text[:500]}")

    try:
        payload = json.loads(text)
    except json.JSONDecodeError as error:
        raise RuntimeError(
            f"API FPT Shop tra ve du lieu khong phai JSON: {text[:500]}"
        ) from error

    if payload.get("status") != 200 or not isinstance(payload.get("data"), dict):
        raise RuntimeError(f"API FPT Shop tra ve payload loi: {text[:500]}")
    return payload["data"]


async def fetch_payload(start_page: int = 1, page_size: int = PAGE_SIZE) -> dict[str, Any]:
    async with async_playwright() as playwright:
        request_context = await playwright.request.new_context(
            user_agent=(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/131.0.0.0 Safari/537.36"
            ),
            extra_http_headers={"accept-language": "vi-VN,vi;q=0.9,en;q=0.6"},
            timeout=REQUEST_TIMEOUT,
        )
        try:
            stores: list[dict[str, Any]] = []
            page = start_page
            total_records: int | None = None
            while total_records is None or len(stores) < total_records:
                page_data = await get_page(request_context, page, page_size)
                page_items = page_data.get("items") or []
                total_records = int(page_data.get("totalRecords") or 0)
                if not page_items:
                    break

                stores.extend(normalize_store(store) for store in page_items)
                next_page = page_data.get("nextPage")
                if len(stores) >= total_records or not next_page:
                    break
                page = int(next_page)
        finally:
            await request_context.dispose()

    unique_stores = list({store["shopCode"]: store for store in stores}.values())
    if len(unique_stores) != len(stores):
        print(f"Canh bao: API FPT Shop tra {len(stores) - len(unique_stores)} ban ghi trung")

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
    parser = argparse.ArgumentParser(description="Crawl FPT Shop store data")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Fetch and validate without writing or syncing",
    )
    parser.add_argument(
        "--validate-only",
        action="store_true",
        help="Validate the existing raw JSON without network access",
    )
    parser.add_argument(
        "--start-page",
        type=int,
        default=1,
        help="Trang bat dau crawl (mac dinh: 1)",
    )
    parser.add_argument(
        "--page-size",
        type=int,
        default=PAGE_SIZE,
        help="So cua hang moi request (mac dinh: 5)",
    )
    args = parser.parse_args()

    if args.start_page < 1 or args.page_size < 1:
        parser.error("--start-page va --page-size phai lon hon 0")

    payload = (
        load_and_validate()
        if args.validate_only
        else await fetch_payload(args.start_page, args.page_size)
    )
    print(
        f"Payload hop le: {len(payload['items'])} cua hang; "
        f"totalCount={payload.get('totalCount', 0)}"
    )

    if args.dry_run or args.validate_only:
        return

    write_payload(payload)
    print(f"Da luu {RAW_PATH.name}")
    sync_daily(payload, source="fptshop")
    print("Da dong bo du lieu FPT Shop vao MongoDB")


if __name__ == "__main__":
    asyncio.run(main())
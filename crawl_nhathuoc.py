import argparse
import asyncio
import json
import os
import tempfile
from pathlib import Path
from typing import Any

from sync_daily import sync_daily


API_URL = os.getenv(
    "LONGCHAU_API_URL",
    "https://api.nhathuoclongchau.com.vn/lccus/ecom-prod/store-front/v3/order-promising/list-shop",
)
STORE_URL = os.getenv(
    "LONGCHAU_STORE_URL",
    "https://nhathuoclongchau.com.vn/he-thong-cua-hang",
)
RAW_PATH = Path(__file__).with_name("longchau_raw.json")


def validate_payload(payload: Any) -> dict[str, Any]:
    if not isinstance(payload, dict):
        raise ValueError("Payload crawl phải là một object JSON")

    items = payload.get("items")
    if not isinstance(items, list) or not items:
        raise ValueError("Dữ liệu crawl không có items hợp lệ")

    expected_count = int(payload.get("totalCount") or 0)
    if expected_count > 0 and len(items) < expected_count * 0.95:
        raise ValueError(
            f"Dữ liệu không đầy đủ: nhận {len(items)}/{expected_count}"
        )

    shop_codes = [item.get("shopCode") for item in items if isinstance(item, dict)]
    if len(shop_codes) != len(items) or any(not code for code in shop_codes):
        raise ValueError("Dữ liệu crawl có shopCode thiếu")
    if len(set(shop_codes)) != len(shop_codes):
        raise ValueError("Dữ liệu crawl có shopCode trùng")

    return payload


async def fetch_payload(headless: bool) -> dict[str, Any]:
    from playwright.async_api import async_playwright

    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch(
            headless=headless
        )

        context = await browser.new_context(
            user_agent=(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/154.0.0.0 Safari/537.36"
            ),
            viewport={"width": 1280, "height": 720},
            locale="vi-VN",
        )

        page = await context.new_page()

        try:
            await page.goto(
                STORE_URL,
                wait_until="domcontentloaded",
                timeout=120_000,
            )

            # wait for cloudfare
            await page.wait_for_timeout(15_000)

            result = await page.evaluate(
                """async (apiUrl) => {
                    const response = await fetch(apiUrl, {
                        method: 'POST',
                        headers: {
                            'accept': 'application/json, text/plain, */*',
                            'content-type': 'application/json',
                            'order-channel': '1',
                            'x-channel': 'EStore'
                        },
                        body: JSON.stringify({
                            maxResult: 3000,
                            skipCount: 0,
                            searchBy: {
                                byProvince: null,
                                byLocation: null
                            }
                        })
                    });

                    const text = await response.text();

                    return {
                        ok: response.ok,
                        status: response.status,
                        text: text
                    };
                }""",
                API_URL,
            )

        finally:
            await browser.close()

    if not result["ok"]:
        preview = result.get("text", "")[:500]
        raise RuntimeError(
            f"HTTP {result['status']}; preview: {preview}"
        )

    try:
        payload = json.loads(result["text"])
    except json.JSONDecodeError:
        raise RuntimeError(
            "Phản hồi API không phải JSON; "
            f"preview: {result['text'][:500]}"
        )

    return validate_payload(payload)

def write_payload(payload: dict[str, Any]) -> None:
    RAW_PATH.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(
        "w", encoding="utf-8", dir=RAW_PATH.parent, delete=False
    ) as temporary:
        json.dump(payload, temporary, ensure_ascii=False, indent=2)
        temporary.write("\n")
        temporary_path = Path(temporary.name)
    temporary_path.replace(RAW_PATH)


def load_and_validate(path: Path) -> dict[str, Any]:
    with path.open("r", encoding="utf-8") as source:
        return validate_payload(json.load(source))


def run_sync() -> None:
    payload = load_and_validate(RAW_PATH)
    sync_daily(payload)


async def main() -> None:
    parser = argparse.ArgumentParser(description="Crawl Long Chau store data")
    parser.add_argument("--dry-run", action="store_true", help="Fetch and validate without writing or syncing")
    parser.add_argument("--validate-only", action="store_true", help="Validate the existing raw JSON without network access")
    parser.add_argument("--headful", action="store_true", help="Show Chromium while crawling")
    args = parser.parse_args()

    if args.validate_only:
        payload = load_and_validate(RAW_PATH)
    else:
        payload = await fetch_payload(headless=not args.headful)

    item_count = len(payload["items"])
    print(f"Payload hợp lệ: {item_count} cửa hàng; totalCount={payload.get('totalCount', 0)}")

    if args.dry_run or args.validate_only:
        return

    write_payload(payload)
    print(f"Đã lưu {RAW_PATH.name}")
    run_sync()
    print("Đã đồng bộ dữ liệu vào MongoDB")


if __name__ == "__main__":
    asyncio.run(main())
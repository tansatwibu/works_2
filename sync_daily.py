import os
from datetime import datetime, timedelta, timezone
from typing import Any

from bson import ObjectId
from pymongo import MongoClient, UpdateOne


CLOSE_AFTER_MISSING_DAYS = 2
VIETNAM_TIMEZONE = timezone(timedelta(hours=7))


def today_start() -> datetime:
    now = datetime.now(VIETNAM_TIMEZONE)
    return datetime(now.year, now.month, now.day, tzinfo=VIETNAM_TIMEZONE)


def parse_date(value: Any) -> datetime | None:
    if not value:
        return None
    if isinstance(value, datetime):
        return value
    if isinstance(value, str):
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    raise ValueError(f"Ngày không hợp lệ: {value}")


def pharmacy_fields(item: dict[str, Any], observed_at: datetime) -> dict[str, Any]:
    location = item.get("location") or {}
    coordinates = location.get("coordinates") or {}
    fields: dict[str, Any] = {
        "name": {"short": item.get("shopName"), "display": item.get("shopNameDisplay")},
        "address": {
            "display": location.get("addressDisplay"),
            "full": location.get("legacyAddress") or location.get("address"),
            "province": {"id": item.get("provinceIDStr") or item.get("provinceID"), "name": item.get("provinceName")},
            "district": {"id": item.get("districtIDStr") or item.get("districtID"), "name": item.get("districtName")},
            "ward": {"id": item.get("wardIDStr") or item.get("wardID"), "name": item.get("wardName")},
        },
        "openingDate": parse_date(item.get("grandOpening")),
        "lastSeenAt": observed_at,
        "updatedAt": observed_at,
        "status": "active",
        "missingStreak": 0,
        "missingSince": None,
    }
    longitude = coordinates.get("longitude")
    latitude = coordinates.get("latitude")
    if isinstance(longitude, (int, float)) and isinstance(latitude, (int, float)):
        fields["location"] = {"type": "Point", "coordinates": [longitude, latitude]}
    return fields


def record_event(collection: Any, event: dict[str, Any]) -> None:
    collection.update_one(
        {"source": event["source"], "shopCode": event["shopCode"], "eventType": event["eventType"], "eventDate": event["eventDate"]},
        {"$setOnInsert": event},
        upsert=True,
    )


def sync_daily(payload: dict[str, Any], source: str = "longchau") -> None:
    items = payload.get("items")
    expected_count = int(payload.get("totalCount") or 0)
    if not isinstance(items, list) or not items:
        raise ValueError("Dữ liệu crawl không có items hợp lệ")
    if expected_count and len(items) < expected_count * 0.95:
        raise ValueError(f"Dữ liệu không đầy đủ: nhận {len(items)}/{expected_count}")

    shop_codes = [item.get("shopCode") for item in items if isinstance(item, dict)]
    if len(shop_codes) != len(items) or any(not code for code in shop_codes):
        raise ValueError("Dữ liệu crawl có shopCode thiếu")
    if len(set(shop_codes)) != len(shop_codes):
        raise ValueError("Dữ liệu crawl có shopCode trùng")

    client = MongoClient(os.getenv("MONGO_URI", "mongodb://127.0.0.1:27017"))
    try:
        db = client[os.getenv("MONGO_DB", "longchau_dashboard")]
        observed_at = datetime.now(timezone.utc)
        snapshot_date = today_start()
        run_id = ObjectId()
        today_codes = set(shop_codes)
        pharmacies = db["pharmacies"]
        snapshots = db["pharmacy_daily_snapshots"]
        events = db["pharmacy_events"]
        runs = db["crawl_runs"]

        active_pharmacies = list(pharmacies.find({"status": "active", "source": source}, {"shopCode": 1, "missingStreak": 1, "missingSince": 1, "status": 1}))
        previous_pharmacies = list(pharmacies.find({"source": source, "shopCode": {"$in": shop_codes}}, {"shopCode": 1, "status": 1}))
        previous_by_code = {item["shopCode"]: item for item in previous_pharmacies}
        runs.insert_one({"_id": run_id, "type": "daily", "source": source, "startedAt": observed_at, "expectedCount": expected_count, "fetchedCount": len(items), "status": "running"})

        try:
            snapshots.bulk_write(
                [UpdateOne(
                    {"snapshotDate": snapshot_date, "source": source, "shopCode": item["shopCode"]},
                    {"$set": {"runId": run_id, "source": source, "provinceId": item.get("provinceIDStr") or item.get("provinceID"), "provinceName": item.get("provinceName"), "isPresent": True, "openStatus": (item.get("operation") or {}).get("openStatus")}},
                    upsert=True,
                ) for item in items],
                ordered=False,
            )

            for item in items:
                shop_code = item["shopCode"]
                previous = previous_by_code.get(shop_code)
                pharmacies.update_one(
                    {"source": source, "shopCode": shop_code},
                    {"$set": pharmacy_fields(item, observed_at), "$setOnInsert": {"shopCode": shop_code, "source": source, "firstSeenAt": observed_at}},
                    upsert=True,
                )
                if not previous or previous.get("status") == "closed":
                    record_event(events, {"source": source, "shopCode": shop_code, "eventType": "reopened" if previous else "opened", "eventDate": snapshot_date, "detectedAt": observed_at, "provinceId": item.get("provinceIDStr") or item.get("provinceID"), "provinceName": item.get("provinceName"), "runId": run_id})

            for pharmacy in active_pharmacies:
                shop_code = pharmacy["shopCode"]
                if shop_code in today_codes:
                    continue
                missing_streak = (pharmacy.get("missingStreak") or 0) + 1
                missing_since = pharmacy.get("missingSince") or observed_at
                next_status = "closed" if missing_streak >= CLOSE_AFTER_MISSING_DAYS else "active"
                pharmacies.update_one({"source": source, "shopCode": shop_code}, {"$set": {"status": next_status, "missingStreak": missing_streak, "missingSince": missing_since, "updatedAt": observed_at}})
                record_event(events, {"source": source, "shopCode": shop_code, "eventType": "closed" if next_status == "closed" else "missing", "eventDate": snapshot_date, "detectedAt": observed_at, "runId": run_id})

            runs.update_one({"_id": run_id}, {"$set": {"finishedAt": datetime.now(timezone.utc), "status": "success"}})
        except Exception as error:
            runs.update_one({"_id": run_id}, {"$set": {"finishedAt": datetime.now(timezone.utc), "status": "failed", "error": str(error)}})
            raise
    finally:
        client.close()
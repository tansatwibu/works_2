"""Crawl only The Gioi Di Dong stores from the shared store API."""

import asyncio

import crawl_dienmayxanh as shared


shared.BASE_URL = "https://www.thegioididong.com"
shared.STORE_INDEX_URL = f"{shared.BASE_URL}/sieu-thi-the-gioi-di-dong"
shared.DEFAULT_PROVINCE_URL = f"{shared.STORE_INDEX_URL}/thanh-pho-ho-chi-minh"
shared.RAW_PATH = shared.Path(__file__).with_name("thegioididong_raw.json")
shared.SOURCE = "thegioididong"
shared.BRAND_PREFIX = "thế giới di động"


if __name__ == "__main__":
    asyncio.run(shared.main())
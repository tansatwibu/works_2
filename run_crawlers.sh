#!/usr/bin/env bash
echo "===== Crawl started: $(date) ====="

echo "===== Long Chau ====="
if .venv/bin/python crawl_nhathuoc.py; then
    echo "Long Chau: SUCCESS"
else
    echo "Long Chau: FAILED"
fi

echo "===== Bach Hoa Xanh ====="
if .venv/bin/python crawl_bhx.py; then
    echo "Bach Hoa Xanh: SUCCESS"
else
    echo "Bach Hoa Xanh: FAILED"
fi

echo "===== Tiem Chung Long Chau ====="
if .venv/bin/python crawl_tiemchung.py; then
    echo "Tiem Chung: SUCCESS"
else
    echo "Tiem Chung: FAILED"
fi

echo "===== FPT Shop ====="
if .venv/bin/python crawl_fptshop.py; then
    echo "FPT Shop: SUCCESS"
else
    echo "FPT Shop: FAILED"
fi

echo "===== An Khang ====="
if .venv/bin/python crawl_ankhang.py; then
		echo "An Khang: SUCCESS"
else
		echo "An Khang: FAILED"
fi

echo "===== Crawl finished: $(date) ====="
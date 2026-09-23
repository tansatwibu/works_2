# Long Chau Store Intelligence

## Cài đặt sau khi clone

Các bước dưới đây dành cho Windows PowerShell. Cần cài Node.js, MongoDB đang chạy ở `mongodb://127.0.0.1:27017`, và Python nếu muốn dùng các lệnh kiểm tra crawler Python.

```powershell
git clone <repository-url>
cd <repository-folder>
npm install
Copy-Item .env.example .env
```

Nếu MongoDB dùng URI hoặc database khác, sửa `MONGO_URI` và `MONGO_DB` trong `.env`. Không commit file `.env` chứa thông tin riêng của máy.

Khởi tạo database và các index:

```powershell
npm run setup-db
```

## Crawl lần đầu

Chạy thử toàn bộ ba nguồn và ghi snapshot vào MongoDB:

```powershell
npm run daily
```

Ba crawler được chạy theo thứ tự:

1. Nhà thuốc Long Châu: `npm run crawl`
2. Bách Hoá Xanh: `npm run crawl-bhx`
3. Tiêm chủng Long Châu: `npm run crawl-tiem-chung`

Payload thô được lưu tại `longchau_raw.json`, `bachhoaxanh_raw.json` và `tiemchunglongchau_raw.json`. Các nguồn được tách trong MongoDB bằng trường `source`, nên chạy lại không trộn dữ liệu giữa các thương hiệu.

## Chạy dashboard

```powershell
npm run dashboard
```

Mở `http://localhost:3000`.

## Lịch đồng bộ 23:00

Đăng ký Windows Task Scheduler một lần trên mỗi máy sau khi clone:

```powershell
npm run schedule-end-of-day
```

Có thể cần mở PowerShell bằng quyền Administrator. Task `LongChau-EndOfDay-Sync` sẽ chạy ba crawler mỗi ngày lúc 23:00 theo múi giờ máy. Nếu chuyển repo sang thư mục khác hoặc máy khác, cần chạy lại lệnh đăng ký này vì Scheduler lưu đường dẫn tuyệt đối tới `run_daily.ps1`.

Kiểm tra task:

```powershell
Get-ScheduledTask -TaskName "LongChau-EndOfDay-Sync"
Get-ScheduledTaskInfo -TaskName "LongChau-EndOfDay-Sync"
```

Log được ghi tại `logs\crawl-YYYY-MM-DD.log`. Để chạy lại thủ công sau khi task lỗi, dùng `npm run daily`.

## Kiểm tra crawler Long Châu bằng Python

Các lệnh Python chỉ phục vụ kiểm tra crawler Long Châu hiện có:

```powershell
py -3 -m pip install -r requirements.txt
py -3 -m playwright install chromium
python crawl.py --validate-only
python crawl.py --dry-run
```

`npm run crawl` là crawler Long Châu được sử dụng trong lịch tự động. Nếu API lỗi hoặc dữ liệu thiếu/trùng `shopCode`, cần kiểm tra log trước khi chạy lại.

## Cấu trúc MVC

```text
src/
  models/       Truy vấn và biến đổi dữ liệu MongoDB
  controllers/ Nhận query HTTP và gọi model
  routes/       Ánh xạ endpoint tới controller
frontend/
  dashboardModel.js       Gọi API
  dashboardView.js        Render giao diện
  dashboardController.js  Điều phối state và sự kiện người dùng
dashboard.html             View shell
dashboard.css              Presentation
server.js                  HTTP server và static files
```

## API chính

```text
GET /api/stats?from=YYYY-MM-DD&to=YYYY-MM-DD
GET /api/pharmacies?search=&status=&province=&page=1&limit=20
GET /api/events?from=YYYY-MM-DD&to=YYYY-MM-DD&type=opened|closed|all
```

Các thao tác trong giao diện hiện đã hoạt động: chuyển view, lọc ngày, tìm kiếm cửa hàng, lọc tỉnh/trạng thái và lọc loại biến động.
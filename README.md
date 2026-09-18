# Long Chau Store Intelligence

## Chạy ứng dụng

```powershell
npm run dashboard
```

Mở `http://localhost:3000`.

## Đồng bộ cuối ngày

Dashboard không đồng bộ realtime. Crawler tạo một snapshot mỗi ngày lúc 23:00 theo múi giờ Việt Nam:

```powershell
npm run schedule-end-of-day
```

Lệnh trên đăng ký Windows Task Scheduler `LongChau-EndOfDay-Sync`. Dashboard đọc MongoDB và hiển thị thời điểm snapshot thành công gần nhất tại phần trạng thái trên đầu trang.

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
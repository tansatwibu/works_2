# Long Chau Store Intelligence

## Chạy ứng dụng

```powershell
npm run dashboard
```

Mở `http://localhost:3000`.

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
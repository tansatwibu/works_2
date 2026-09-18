const fs = require('fs');
const { syncDaily } = require('./sync_daily');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

(async () => {
    console.log("🚀 Khởi động trình duyệt...");
    const browser = await puppeteer.launch({ 
        headless: process.env.HEADLESS === 'true',
        args: ['--no-sandbox', '--disable-setuid-sandbox'] 
    });
    const page = await browser.newPage();

    console.log("1. Đang mở trang web để giải quyết Cloudflare...");
    // Vào trang hệ thống cửa hàng để lấy Cookie và khởi tạo môi trường
    await page.goto('https://nhathuoclongchau.com.vn/he-thong-cua-hang', { 
        waitUntil: 'networkidle2',
        timeout: 60000
    });

    console.log("⏳ Đợi thêm 3 giây để hệ thống nhận diện là người thật...");
    await new Promise(r => setTimeout(r, 3000));

    console.log("2. Đang thực thi lệnh gọi API ngầm bên trong trình duyệt...");
    
    // Sử dụng page.evaluate() để chạy mã JavaScript bên CẦU TRÌNH DUYỆT
    const apiResult = await page.evaluate(async () => {
        try {
            const response = await fetch("https://api.nhathuoclongchau.com.vn/lccus/ecom-prod/store-front/v3/order-promising/list-shop", {
  "headers": {
    "accept": "application/json, text/plain, */*",
    "accept-language": "vi-VN,vi;q=0.9,fr-FR;q=0.8,fr;q=0.7,en-US;q=0.6,en;q=0.5",
    "access-control-allow-origin": "*",
    "cache-control": "no-cache",
    "content-type": "application/json",
    "order-channel": "1",
    "pragma": "no-cache",
    "priority": "u=1, i",
    "sec-ch-ua": "\"Chromium\";v=\"152\", \"Not?A_Brand\";v=\"24\", \"Google Chrome\";v=\"152\"",
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": "\"Windows\"",
    "sec-fetch-dest": "empty",
    "sec-fetch-mode": "cors",
    "sec-fetch-site": "same-site",
    "x-channel": "EStore"
  },
  "referrer": "https://nhathuoclongchau.com.vn/",
  "body": "{\"maxResult\":3000,\"skipCount\":0,\"searchBy\":{\"byProvince\":null,\"byLocation\":null}}",
  "method": "POST",
  "mode": "cors",
  "credentials": "omit"
});
            // ĐỌC DẠNG TEXT TRƯỚC: Để tránh crash nếu server trả về trang HTML cảnh báo
            const text = await response.text();
            
            try {
                // Thử ép kiểu sang JSON
                const json = JSON.parse(text);
                return { success: true, data: json };
            } catch (parseError) {
                // Nếu không parse được JSON, tức là bị trả về HTML
                return { 
                    success: false, 
                    error: "Phản hồi không phải là JSON", 
                    html: text.substring(0, 500) // Lấy 500 ký tự đầu để xem đó là HTML gì
                };
            }
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    console.log("\n=======================================");
    
    if (apiResult.success) {
        console.log("🎉 ĐÃ LẤY ĐƯỢC DỮ LIỆU THÀNH CÔNG");
        fs.writeFileSync('longchau_raw.json', JSON.stringify(apiResult.data, null, 2), 'utf8');
        console.log("💾 Đã lưu file: longchau_raw.json");
        await syncDaily(apiResult.data);
        console.log("💾 Đã đồng bộ dữ liệu vào MongoDB");
        console.log(`📊 Tổng số bản ghi: ${apiResult.data.items?.length || 0}`);
    } else {
        console.log("⚠️ CÓ LỖI XẢY RA KHI GỌI API");
        console.log("Lý do:", apiResult.error);
        
        if (apiResult.html) {
            console.log("\n--- Nội dung Server trả về ---");
            console.log(apiResult.html);
            console.log("------------------------------\n");
            console.log("💡 NẾU VẪN THẤY CHỮ CLOUDFLARE: Bạn cần F12 trên Chrome thật, tìm API /list-shop -> click chuột phải chọn 'Copy as fetch' và thay thế toàn bộ khối lệnh fetch() ở trên.");
        }
    }
    
    console.log("=======================================\n");

    // Đóng trình duyệt (Bạn có thể thêm dấu // ở đầu để ngăn nó đóng nếu muốn xem kỹ)
    await browser.close(); 
})();
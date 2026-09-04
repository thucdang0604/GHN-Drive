# Bảng Giao Hàng GHN (GHN-Drive)

Ứng dụng web tối ưu cho thiết bị di động hỗ trợ nhân viên giao nhận (shipper) GHN:
- Tải đơn theo mã chuyến từ Google Sheet hoặc dán text thông minh.
- Nhận diện Landmark POI (tòa nhà, trung tâm thương mại, chung cư) với GPS chuẩn xác 100%.
- Bóc tách SĐT phụ và ghi chú giờ giấc, lưu ý giao hàng nhúng trong địa chỉ.
- Tự động nắn sửa tọa độ đa tầng (Landmark POI, Co-location theo mã băm địa điểm, Bắt dính số nhà, Tim đường Street Median).
- Sắp xếp thứ tự giao hàng linh hoạt theo số nhà chẵn/lẻ hoặc kéo thả.
- Đổi trạng thái GTC (Giao thành công) / GTB (Giao thất bại) 1 chạm kèm quản lý tiền thu.
- Tích hợp bản đồ trực quan với Leaflet, dẫn đường Google Maps 1 chạm và quét mã QR Code 128.

## 🌐 Trải Nghiệm Trực Tiếp Trên GitHub Pages
Truy cập ngay trên điện thoại: **[https://thucdang0604.github.io/GHN-Drive/](https://thucdang0604.github.io/GHN-Drive/)** (hoặc `ghn_mobile.html`)

## 📁 Cấu Trúc Dự Án
- `ghn_mobile.html`: File ứng dụng độc lập 100% (All-in-One: HTML, CSS, JavaScript nhúng) chuyên dụng cho điện thoại di động, hoạt động mượt mà cả khi offline hoặc mở trực tiếp.
- `index.html`: Trang chuyển hướng tự động vào `ghn_mobile.html` khi truy cập qua GitHub Pages.
- `desktop.html`: Phiên bản giao diện máy tính nhiều cột.
- `serve_https.py`: Công cụ chạy server HTTPS cục bộ hỗ trợ mở Camera quét mã qua mạng LAN.

# HƯỚNG DẪN VẬN HÀNH & BẢO TRÌ
# Hệ thống Quản lý Học phần Thực tập — ĐH Tôn Đức Thắng

> Tài liệu dành cho **Admin/Giảng viên** vận hành hệ thống mà không cần kiến thức lập trình.

---

## 1. CÀI ĐẶT BAN ĐẦU

### 1.1 Yêu cầu

- Tài khoản Google Workspace (TDTU)
- Google Sheet (file chính chứa dữ liệu)
- Quyền truy cập Apps Script Editor

### 1.2 Các bước cài đặt

```
Bước 1: Mở Google Sheet → Tiện ích mở rộng → Apps Script
Bước 2: Copy code vào Apps Script Editor (Config.js, Controller.js, ...)
Bước 3: Chạy lần đầu → Cấp quyền cho script
Bước 4: Menu "🎓 Quản lý Thực tập" sẽ xuất hiện trên Sheet
Bước 5: Click "📝 Khởi tạo Header" → Tạo cấu trúc bảng
Bước 6: Click "📋 Tạo Form chuẩn" → Tạo Google Form tự động
Bước 7: Click "⚡ Bật Tự động xử lý" → Bật batch job
Bước 8: Click "🧹 Cài Trigger dọn rác ban đêm" → Bật dọn rác tự động
```

### 1.3 Cấu hình MASTER_SHEET_ID

Trong `Config.js`, field `MASTER_SHEET_ID`:
- **Để trống** `""` → Script sẽ dùng Sheet đang mở (phù hợp đa số trường hợp)
- **Điền ID** → Script luôn trỏ đến Sheet cố định (dùng khi có nhiều Sheet khác nhau)

---

## 2. SỬ DỤNG MENU HỆ THỐNG

Sau khi cài đặt, menu `🎓 Quản lý Thực tập` xuất hiện trên thanh menu của Google Sheet:

| Menu | Chức năng | Khi nào dùng |
|---|---|---|
| ⚡ Bật Tự động xử lý | Bật trigger chạy batch job mỗi 1 phút | Đầu mỗi kỳ thực tập |
| ⛔ Tắt tự động xử lý | Tắt trigger | Khi kết thúc kỳ hoặc cần bảo trì |
| 🧹 Cài Trigger dọn rác | Bật dọn rác Queue tự động lúc 4h sáng | Chỉ cần bật 1 lần |
| 📊 Cập nhật Dashboard | Refresh thống kê + DS chưa có DN | Khi cần xem báo cáo mới nhất |
| 📝 Khởi tạo Header | Tạo header cho Students_Data + Queue | Chỉ dùng lần đầu |
| 📋 Tạo Form chuẩn | Tạo Google Form mới | Chỉ dùng khi chưa có form |

---

## 3. CÁC TAB TRONG GOOGLE SHEET

| Tab | Mô tả | Admin cần làm gì |
|---|---|---|
| `Students_Data` | **Bảng chính** — toàn bộ dữ liệu SV | Xem + sửa tay khi cần |
| `Queue_Data` | Hàng đợi xử lý | Theo dõi trạng thái; sửa ERROR → RETRY nếu cần |
| `Dashboard` | Thống kê tổng hợp | Chỉ xem, không sửa (sẽ bị ghi đè khi refresh) |
| `Chua_Co_Cong_Ty` | DS SV chưa có DN | Chỉ xem (tự động tạo lại khi refresh Dashboard) |
| `Company_Dictionary` | Từ điển DN | Hệ thống tự điền, có thể thêm tay |
| `Log_Errors` | Nhật ký hệ thống | Xem khi cần debug lỗi |
| `Raw_web_data` | Backup dữ liệu WebApp | Chỉ xem (backup) |

---

## 4. XỬ LÝ SỰ CỐ THƯỜNG GẶP

### 4.1 Queue bị nghẽn (nhiều dòng PENDING/ERROR)

**Triệu chứng**: Tab Queue_Data có nhiều dòng PENDING hoặc ERROR không được xử lý.

**Xử lý**:
1. Kiểm tra trigger: Menu → ⚡ Bật Tự động xử lý (bật lại nếu tắt)
2. Kiểm tra Log_Errors: xem có lỗi gì không
3. Với các dòng ERROR: đọc payload, sửa lỗi nếu cần, đổi status thành `RETRY`

### 4.2 API VietQR không phản hồi

**Triệu chứng**: Cột "Trạng thái dữ liệu" hiện "Lỗi mạng VietQR (Chờ quét lại)".

**Xử lý**: Hệ thống tự retry mỗi phút. Nếu VietQR sập lâu:
1. Các SV bị ảnh hưởng có status `RETRY` trong Queue
2. Khi VietQR hoạt động lại → tự động xử lý

### 4.3 Sinh viên phản ánh "Nộp rồi mà không thấy"

**Xử lý**:
1. Kiểm tra Queue_Data: tìm MSSV trong cột E
2. Nếu thấy → đang chờ xử lý (status PENDING/PROCESSING)
3. Nếu không thấy → kiểm tra Students_Data (có thể đã xử lý xong)
4. Nếu không có ở cả 2 nơi → kiểm tra Response Sheet của Google Form

### 4.4 Dashboard không cập nhật

**Xử lý**: Menu → 📊 Cập nhật Dashboard & DS Chưa Công ty

---

## 5. BẢO TRÌ ĐỊNH KỲ

### 5.1 Đầu mỗi kỳ thực tập

| # | Việc cần làm | Cách làm |
|---|---|---|
| 1 | Cập nhật năm học | Sửa dropdown năm học trong Form + WebApp |
| 2 | Bật trigger xử lý | Menu → ⚡ Bật Tự động xử lý |
| 3 | Kiểm tra form | Truy cập form → nộp thử → kiểm tra Queue |
| 4 | Clear cache (tuỳ chọn) | Menu → Xóa toàn bộ Cache API |

### 5.2 Cuối mỗi kỳ thực tập

| # | Việc cần làm | Cách làm |
|---|---|---|
| 1 | Refresh Dashboard cuối kỳ | Menu → 📊 Cập nhật Dashboard |
| 2 | Tải về bản sao lưu | File → Tải xuống → .xlsx |
| 3 | Tắt trigger (tiết kiệm quota) | Menu → ⛔ Tắt tự động xử lý |

### 5.3 Hàng năm

| # | Việc cần làm | Chi tiết |
|---|---|---|
| 1 | Cập nhật năm học mới | Thêm option năm mới trong Form + WebApp dropdown |
| 2 | Archive dữ liệu năm cũ | Copy Students_Data sang Sheet archive riêng |
| 3 | Kiểm tra API VietQR | Nộp thử 1 form với MST thật, xem API còn hoạt động không |
| 4 | Kiểm tra Google Form link | Đảm bảo form vẫn kết nối đúng Sheet |

---

## 6. THIẾT KẾ CHO BẢO TRÌ DÀI HẠN

### 6.1 Config-Driven Design

Tất cả giá trị có thể thay đổi được tập trung trong `Config.js`:

```javascript
const SYSTEM_CONFIG = {
  MASTER_SHEET_ID: "",              // ID Sheet chủ
  DATA_TAB_NAME: "Students_Data",   // Tên tab dữ liệu
  ALLOWED_DOMAIN: "@student.tdtu.edu.vn",  // Domain email
  // ... tất cả config tập trung ở đây
};
```

**Khi cần thay đổi**: Chỉ sửa file `Config.js`, không cần sửa logic trong các module khác.

### 6.2 Keyword Matching linh hoạt

Hệ thống dùng `StudentService.extractValue()` với nhiều keywords để tìm đúng cột dữ liệu bất kể form đặt tên thế nào:

```javascript
// Ví dụ: tìm cột MSSV bất kể form gọi nó là gì
extractValue(payload, ["MSSV", "Mã số sinh viên", "Mã sinh viên"])
```

**Khi thêm form mới có tên cột khác**: Chỉ cần thêm keyword vào mảng.

### 6.3 Tự động tính năm học (Đề xuất cải tiến)

Thay vì hardcode danh sách năm học:
```javascript
// Tự tính dựa trên ngày hiện tại
function getAcademicYears() {
  const now = new Date();
  const currentYear = now.getFullYear();
  // Nếu sau tháng 8 → năm học mới bắt đầu
  const startYear = now.getMonth() >= 7 ? currentYear : currentYear - 1;
  return [
    `${startYear} - ${startYear + 1}`,
    `${startYear + 1} - ${startYear + 2}`
  ];
}
```

---

## 7. GIÁM SÁT HỆ THỐNG

### 7.1 Kiểm tra sức khoẻ hệ thống

| Kiểm tra | Nơi xem | Dấu hiệu bình thường |
|---|---|---|
| Trigger đang chạy? | Apps Script → Triggers | Có trigger `processQueueJob` mỗi 1 phút |
| Queue có bị nghẽn? | Tab Queue_Data | Không có PENDING/ERROR tồn đọng lâu |
| API có hoạt động? | Tab Log_Errors | Không có "Circuit Breaker" gần đây |
| Dọn rác có chạy? | Tab Log_Errors | Có entry "Garbage Collector" hàng ngày |

### 7.2 Xem log chi tiết

1. Mở Google Sheet
2. Mở tab `Log_Errors`
3. Cột A: Thời gian, Cột B: Loại sự kiện, Cột C: Chi tiết

### 7.3 Xem lịch sử chạy script

1. Mở Apps Script Editor (Tiện ích mở rộng → Apps Script)
2. Click icon đồng hồ (Executions) bên trái
3. Xem danh sách các lần chạy, thời gian, trạng thái

---

## 8. KHÔI PHỤC SỰ CỐ

### 8.1 Mất dữ liệu Students_Data

1. Kiểm tra Version History: File → Lịch sử phiên bản → Xem lịch sử
2. Khôi phục phiên bản trước khi bị lỗi
3. Chạy lại batch job: các dòng PENDING/RETRY trong Queue sẽ được xử lý lại

### 8.2 Trigger bị xoá/hỏng

1. Mở Apps Script Editor
2. Click icon đồng hồ → Triggers
3. Xoá trigger cũ (nếu còn)
4. Về Sheet → Menu → ⚡ Bật Tự động xử lý

### 8.3 Google Form bị ngắt kết nối

1. Mở Google Form → Responses → chọn lại liên kết Sheet
2. Kiểm tra Polling config: đảm bảo Response Sheet ID đúng
3. Nộp thử 1 form → kiểm tra Queue

---

## 9. CÂU HỎI THƯỜNG GẶP (FAQ)

**Q: Sinh viên nộp form 2 lần, có bị trùng không?**
A: Không. Hệ thống tự khử trùng (dedup) theo MSSV, chỉ giữ lần nộp cuối cùng.

**Q: Sinh viên đổi công ty thì data cũ có mất không?**
A: Hệ thống tự phát hiện MST khác → xoá data DN cũ, tra cứu API mới. Lần nộp cũ vẫn còn trong backup (Raw_web_data hoặc Response Sheet).

**Q: Đang có 500 SV nộp cùng lúc, có sập không?**
A: Không. WebApp dùng RAM buffer + retry. Google Form dùng polling. Cả 2 kênh đều chịu được hàng trăm SV đồng thời.

**Q: Ai có thể xem/sửa dữ liệu?**
A: Phụ thuộc vào quyền chia sẻ Google Sheet. Khuyến nghị: chỉ Admin/GV có quyền Edit, SV chỉ có quyền nộp form.

**Q: Hệ thống có chạy được sau khi developer tốt nghiệp?**
A: Có, nếu: (1) Trigger đã bật, (2) Admin biết dùng menu Sheet, (3) Có tài liệu này để tham khảo. Chỉ cần sửa Config.js khi thay đổi năm học/học kỳ.

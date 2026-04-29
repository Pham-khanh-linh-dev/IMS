# THIẾT KẾ HỆ THỐNG QUẢN LÝ HỌC PHẦN THỰC TẬP
# Trường Đại học Tôn Đức Thắng

| Thông tin | Chi tiết |
|---|---|
| **Phiên bản** | 2.0 |
| **Ngày tạo** | 29/04/2026 |
| **Nền tảng** | Google Apps Script + Google Sheets + Google Forms |
| **Tác giả** | Nhóm phát triển |

---

## 1. TỔNG QUAN HỆ THỐNG

### 1.1 Mục tiêu
Hệ thống hỗ trợ nhà trường quản lý thông tin thực tập sinh viên, bao gồm:
- Thu nhận thông tin đăng ký thực tập từ nhiều kênh (Google Form, Web App)
- Tự động xác minh doanh nghiệp qua API VietQR (tra cứu tên pháp nhân theo MST)
- Thống kê Dashboard đa chiều phục vụ báo cáo
- Quản lý danh sách sinh viên chưa có doanh nghiệp

### 1.2 Phạm vi hệ thống

```
┌─────────────────────────────────────────────────────────┐
│              HỆ THỐNG QUẢN LÝ THỰC TẬP                 │
│                                                         │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐              │
│  │ Thu nhận  │→ │ Xử lý    │→ │ Đầu ra   │              │
│  │ dữ liệu  │  │ nghiệp vụ│  │ báo cáo  │              │
│  └──────────┘  └──────────┘  └──────────┘              │
│                                                         │
│  Kênh vào:        Xử lý:          Kênh ra:             │
│  • Google Form    • Validate       • Dashboard          │
│  • Web App        • API VietQR     • DS Chưa có DN      │
│                   • Upsert SV      • Log hệ thống       │
│                   • Dedup          • Company Dictionary  │
└─────────────────────────────────────────────────────────┘
```

### 1.3 Các bên liên quan (Stakeholders)

| Vai trò | Mô tả | Tương tác với hệ thống |
|---|---|---|
| **Sinh viên** | Người nộp thông tin thực tập | Nộp form (Google Form hoặc Web App) |
| **Giảng viên / Khoa** | Quản lý, theo dõi tình hình thực tập | Xem Dashboard, DS chưa có DN, sửa dữ liệu trên Sheet |
| **Admin hệ thống** | Vận hành kỹ thuật | Bật/tắt trigger, tạo form, xử lý lỗi qua menu Sheet |

---

## 2. KIẾN TRÚC HỆ THỐNG

### 2.1 Sơ đồ kiến trúc tổng quan

```
╔══════════════════════════════════════════════════════════════════╗
║                        KÊNH THU NHẬN                            ║
║  ┌────────────────────┐      ┌────────────────────┐             ║
║  │   Google Form      │      │    Web App Portal   │             ║
║  │ (Nhà trường dùng)  │      │  (UX nâng cao)      │             ║
║  │                    │      │  - Autocomplete MST  │             ║
║  │ Response Sheet     │      │  - Retry thông minh  │             ║
║  │ (100% lưu, 0 mất) │      │  - Chống mạo danh    │             ║
║  └────────┬───────────┘      └────────┬─────────────┘             ║
║           │                           │                          ║
║      ┌────▼────┐               ┌──────▼──────┐                  ║
║      │ POLLING │               │ Properties  │                  ║
║      │ Quét    │               │ Service     │                  ║
║      │ Response│               │ (RAM đệm)  │                  ║
║      │ Sheet   │               │             │                  ║
║      └────┬────┘               └──────┬──────┘                  ║
╚═══════════╪═══════════════════════════╪══════════════════════════╝
            │                           │
            └───────────┬───────────────┘
                        ▼
╔══════════════════════════════════════════════════════════════════╗
║                    XỬ LÝ TRUNG TÂM                              ║
║                                                                  ║
║  ┌─────────────────────────────────────────────┐                ║
║  │         Queue_Data (Hàng đợi)               │                ║
║  │  Trạng thái: PENDING → PROCESSING → DONE   │                ║
║  └─────────────────┬───────────────────────────┘                ║
║                    │                                             ║
║  ┌─────────────────▼───────────────────────────┐                ║
║  │    processQueueJob (Batch Job mỗi 1 phút)   │                ║
║  │                                              │                ║
║  │  1. Drain WebApp submissions                 │                ║
║  │  2. Poll Google Form Response Sheets (MỚI)   │                ║
║  │  3. Deduplication (khử trùng MSSV)           │                ║
║  │  4. Validate (email, MSSV, domain)           │                ║
║  │  5. Chuẩn hoá dữ liệu (StudentService)      │                ║
║  │  6. Tra cứu API VietQR (CompanyService)      │                ║
║  │  7. Upsert vào Students_Data                 │                ║
║  └─────────────────┬───────────────────────────┘                ║
╚════════════════════╪════════════════════════════════════════════╝
                     │
╔════════════════════╪════════════════════════════════════════════╗
║                    ▼    ĐẦU RA                                  ║
║  ┌──────────────┐ ┌──────────────┐ ┌──────────────────────┐    ║
║  │ Students_Data│ │  Dashboard   │ │ Chua_Co_Cong_Ty      │    ║
║  │ (Dữ liệu SV)│ │  (Thống kê)  │ │ (DS chưa có DN)      │    ║
║  └──────────────┘ └──────────────┘ └──────────────────────┘    ║
║  ┌──────────────┐ ┌──────────────┐ ┌──────────────────────┐    ║
║  │  Log_Errors  │ │  Dictionary  │ │ Raw_web_data         │    ║
║  │  (Nhật ký)   │ │ (Từ điển DN) │ │ (Backup WebApp)      │    ║
║  └──────────────┘ └──────────────┘ └──────────────────────┘    ║
╚═════════════════════════════════════════════════════════════════╝
```

### 2.2 Kiến trúc xử lý đồng thời (High Concurrency)

Hệ thống thiết kế theo **4 tầng bảo vệ** để đảm bảo 0% mất data:

| Tầng | Tên | Vị trí | Chức năng |
|---|---|---|---|
| 1 | Jitter Retry | `index.html` | Frontend tự retry khi server quá tải (chỉ WebApp) |
| 2 | RAM Buffer | `WebApp.js` | Ghi vào PropertiesService thay vì Sheet (~0.2s) |
| 3 | Polling | `Controller.js` | Quét Response Sheet thay vì dựa vào trigger (Google Form) |
| 4 | Batch Process | `Controller.js` | Gom lô → Dedup → Validate → API → Upsert |

### 2.3 Cơ chế Polling (Giải quyết giới hạn Google Form)

**Vấn đề**: Google Apps Script giới hạn 30 trigger đồng thời. Khi >30 SV nộp form cùng lúc, trigger `onFormSubmit` bị drop → data không được xử lý.

**Giải pháp**: Google Form **luôn lưu 100% response** vào Response Sheet bất kể có bao nhiêu người nộp. Hệ thống chuyển từ event-driven (chờ trigger) sang **polling** (chủ động quét):

```
Kiến trúc cũ (Event-Driven):
  SV nộp → Trigger onFormSubmit → [BỊ DROP nếu > 30] → Mất xử lý

Kiến trúc mới (Polling):
  SV nộp → Response Sheet (100% lưu) ← Timer quét mỗi 1 phút → Queue
```

**Cách hoạt động:**
1. Cấu hình danh sách Response Sheet IDs trong `SYSTEM_CONFIG`
2. Mỗi phút, `pollFormResponses()` quét từng Response Sheet
3. Tìm các dòng chưa đánh dấu "Processed" → chuyển vào Queue_Data
4. Đánh dấu "DONE" trên Response Sheet để không xử lý lại

---

## 3. CÁC MODULE HỆ THỐNG

### 3.1 Bảng tổng hợp module

| Module | File | Vai trò |
|---|---|---|
| **Config** | `Config.js` | Cấu hình hệ thống: tên tab, domain, ánh xạ cột, headers |
| **Controller** | `Controller.js` | Điều phối trung tâm: batch job, menu, trigger, dọn rác |
| **WebApp** | `WebApp.js` | Backend cho Web Portal: nhận data, drain RAM |
| **StudentService** | `StudentService.js` | Chuẩn hoá dữ liệu sinh viên từ form |
| **CompanyService** | `CompanyService.js` | Tra cứu & cache doanh nghiệp qua VietQR API |
| **DatabaseRepo** | `DatabaseRepo.js` | CRUD dữ liệu: upsert SV, flush, thống kê, log |
| **FormSetup** | `FormSetup.ms` | Tạo Google Form chuẩn tự động |
| **Frontend** | `index.html` | Giao diện Web App Portal |

### 3.2 Mối quan hệ giữa các module

```
Config.js ◄──────── Tất cả module đều đọc config
    │
    ├── Controller.js (Điều phối)
    │       ├── gọi StudentService.js (Chuẩn hoá)
    │       ├── gọi CompanyService.js (Tra cứu API)
    │       ├── gọi DatabaseRepo.js  (Đọc/Ghi dữ liệu)
    │       └── gọi WebApp.js        (Drain submissions)
    │
    ├── WebApp.js (Backend Portal)
    │       └── gọi DatabaseRepo.js  (Log lỗi, connect)
    │
    ├── FormSetup.ms (Tạo form)
    │
    └── index.html (Frontend)
            └── gọi WebApp.js qua google.script.run
```

---

## 4. THIẾT KẾ CƠ SỞ DỮ LIỆU (Google Sheets)

### 4.1 Sơ đồ các Tab (Sheet)

| Tab | Mục đích | Dữ liệu chính |
|---|---|---|
| `Students_Data` | Bảng dữ liệu chính | Thông tin SV + DN đã chuẩn hoá |
| `Queue_Data` | Hàng đợi xử lý | Payload JSON chờ xử lý |
| `Dashboard` | Thống kê | Tổng quan, theo học phần, theo DN |
| `Chua_Co_Cong_Ty` | DS SV chưa có DN | MSSV, Tên, Email, Học phần |
| `Company_Dictionary` | Từ điển doanh nghiệp | MST → Tên pháp nhân, Địa chỉ |
| `Raw_web_data` | Backup WebApp | Data gốc từ Web Portal |
| `Log_Errors` | Nhật ký hệ thống | Timestamp, Message, Context |
| `Dữ_Liệu_Thô_[...]` | Response Sheet | Data gốc từ Google Form |

### 4.2 Schema bảng Students_Data (16 cột)

| STT | Cột | Tên Header | Kiểu | Bắt buộc | Mô tả |
|---|---|---|---|---|---|
| 0 | A | Thời gian nộp | DateTime | Tự động | Thời điểm hệ thống ghi nhận |
| 1 | B | MSSV | Text | ✅ | Mã số sinh viên (Primary Key) |
| 2 | C | Họ và Tên | Text | ✅ | Họ tên đầy đủ (chuẩn hoá viết hoa) |
| 3 | D | Học phần | Text | ✅ | Tập sự / Kiến tập / TT tốt nghiệp |
| 4 | E | Học kỳ - Năm học | Text | ✅ | VD: "Học Kỳ 2 - 2025 - 2026" |
| 5 | F | Trạng thái thực tập | Text | ✅ | "Đã có DN" / "Chưa có DN" |
| 6 | G | Mã số thuế | Text | Có điều kiện | MST doanh nghiệp (khi có DN) |
| 7 | H | Tên DN (Form) | Text | Có điều kiện | Tên do SV tự nhập |
| 8 | I | Tên DN (Tiếng Anh) | Text | Tự động | Từ API VietQR |
| 9 | J | Địa chỉ DN | Text | Có điều kiện | Địa chỉ trụ sở |
| 10 | K | Website DN | Text | Không | Website doanh nghiệp |
| 11 | L | Email DN | Text | Không | Email liên hệ DN |
| 12 | M | Tên pháp nhân (API) | Text | Tự động | Kết quả tra cứu VietQR |
| 13 | N | Trạng thái dữ liệu | Text | Tự động | Hợp lệ / Sai MST / Đang chờ |
| 14 | O | Số lần cập nhật | Number | Tự động | Đếm số lần SV nộp form |
| 15 | P | Nguồn cập nhật | Text | Tự động | "Google Form" / "Web App" |

### 4.3 Schema bảng Queue_Data (5 cột)

| Cột | Tên | Kiểu | Mô tả |
|---|---|---|---|
| A | Thời gian nhận | DateTime | Khi nào data vào hàng đợi |
| B | Payload JSON | Text | Dữ liệu form dạng JSON |
| C | Nguồn Form | Text | "Google Form" / "Web App (Portal)" |
| D | Trạng thái | Text | PENDING / PROCESSING / DONE / RETRY / ERROR |
| E | MSSV | Text | Để phục vụ deduplication nhanh |

### 4.4 Schema bảng Company_Dictionary (5 cột)

| Cột | Tên | Kiểu | Mô tả |
|---|---|---|---|
| A | Mã Số Thuế | Text | MST chuẩn hoá (Primary Key) |
| B | Tên DN (VN) | Text | Tên pháp nhân tiếng Việt |
| C | Tên Tiếng Anh | Text | Tên quốc tế |
| D | Địa Chỉ | Text | Địa chỉ trụ sở chính |
| E | Thời Gian Cập Nhật | DateTime | Lần tra cứu cuối |

---

## 5. TÍCH HỢP BÊN NGOÀI

### 5.1 VietQR API

| Thông tin | Chi tiết |
|---|---|
| **URL** | `https://api.vietqr.io/v2/business/{taxCode}` |
| **Method** | GET |
| **Mục đích** | Tra cứu tên pháp nhân theo MST |
| **Response** | `{ code: "00", data: { name, internationalName, shortName, address } }` |
| **Rate Limit** | ~1-2 request/giây (giãn cách 800ms) |
| **Giới hạn/batch** | Tối đa 40 API calls mỗi batch run |

### 5.2 Chiến lược Cache 3 tầng

```
Tra cứu MST:
  1. Dictionary RAM (O(1), trong vòng đời script)
     ↓ miss
  2. CacheService (TTL 15 phút, cross-execution)
     ↓ miss  
  3. Gọi API VietQR thực tế (800ms delay)
     → Lưu kết quả vào cả 3 tầng
```

### 5.3 Circuit Breaker

- Sau **3 lỗi API liên tục** → ngắt mạch 60 giây
- Trạng thái ngắt mạch lưu trong CacheService (persist cross-execution)
- Các SV có MST bị ảnh hưởng → trạng thái "RETRY" trong Queue

---

## 6. BẢO MẬT

### 6.1 Xác thực & chống mạo danh

| Lớp | Cơ chế | Vị trí |
|---|---|---|
| **Domain Lock** | Chỉ chấp nhận email `@student.tdtu.edu.vn` | Controller, WebApp |
| **MSSV = Email** | Prefix email phải khớp MSSV (VD: 520h0001@... = 520H0001) | Controller, WebApp |
| **Session Check** | `Session.getActiveUser()` phải khớp email input (WebApp) | WebApp.js |
| **Google Login** | Form yêu cầu đăng nhập Google + email verified | FormSetup.ms |

### 6.2 Toàn vẹn dữ liệu

| Cơ chế | Mô tả |
|---|---|
| **Document Lock** | Batch job dùng `LockService.getDocumentLock()` chống ghi đè |
| **Script Lock** | WebApp dùng `LockService.getScriptLock()` cho RAM write |
| **Batch Flush** | Chỉ ghi dòng đã thay đổi, không ghi đè toàn bộ sheet |
| **Error Rollback** | Nếu flush thất bại → đảo trạng thái DONE → ERROR trong Queue |
| **Deduplication** | Khử trùng MSSV trong cùng batch (giữ dòng mới nhất) |

---

## 7. HIỆU NĂNG & GIỚI HẠN

| Thông số | Giá trị | Ghi chú |
|---|---|---|
| Batch size tối đa | 200 dòng/lần chạy | Giới hạn trong processQueueJob |
| Timeout batch | 3 phút | Tự dừng sớm nếu vượt |
| API calls/batch | 40 calls | Tránh rate limit VietQR |
| Chu kỳ batch | 1 phút | Trigger timer |
| RAM buffer | 500KB (~1000 submissions) | Giới hạn PropertiesService |
| Concurrent WebApp | 30 luồng | Giới hạn Google Apps Script |
| Concurrent Form | Không giới hạn | Polling không phụ thuộc trigger |
| Dọn rác | 4h sáng hàng ngày | cleanupQueueNightly |

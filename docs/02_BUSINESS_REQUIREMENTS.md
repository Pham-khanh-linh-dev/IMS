# YÊU CẦU NGHIỆP VỤ & ĐẶC TẢ CHỨC NĂNG
# Hệ thống Quản lý Học phần Thực tập — ĐH Tôn Đức Thắng

---

## 1. VÒNG ĐỜI HỌC PHẦN THỰC TẬP (Internship Lifecycle)

### 1.1 Sơ đồ các giai đoạn

```
 Giai đoạn 1         Giai đoạn 2         Giai đoạn 3         Giai đoạn 4
┌─────────────┐   ┌─────────────┐   ┌─────────────────┐   ┌──────────────┐
│  ĐĂNG KÝ    │──▶│  XÁC NHẬN   │──▶│  THEO DÕI       │──▶│  ĐÁNH GIÁ    │
│  THỰC TẬP   │   │  DOANH NGHIỆP│   │  TIẾN ĐỘ        │   │  KẾT QUẢ     │
│             │   │              │   │                 │   │              │
│ SV khai báo │   │ SV cập nhật  │   │ SV báo cáo      │   │ DN + GV      │
│ thông tin   │   │ công ty mới  │   │ tiến độ thực tập│   │ đánh giá SV  │
└─────────────┘   └─────────────┘   └─────────────────┘   └──────────────┘
     ✅ Đã có           ✅ Đã có           ⬜ Chưa có          ⬜ Chưa có
```

### 1.2 Phạm vi triển khai

| Giai đoạn | Phiên bản hiện tại (v2.0) | Ghi chú |
|---|---|---|
| ① Đăng ký thực tập | ✅ **Đã triển khai** | Google Form + Web App |
| ② Cập nhật doanh nghiệp | ✅ **Đã triển khai** | SV nộp lại form = upsert |
| ③ Theo dõi tiến độ | ⬜ Chưa có | Cần form/workflow riêng |
| ④ Đánh giá kết quả | ⬜ Chưa có | Cần form từ DN + GV |

> **Lưu ý**: Hệ thống thiết kế **mở** (config-driven) để bổ sung giai đoạn 3–4 trong tương lai mà không cần viết lại kiến trúc.

---

## 2. DANH MỤC FORM / KÊNH THU NHẬN

### 2.1 Hiện tại

| # | Kênh | Loại | Giai đoạn | Người dùng | Trạng thái |
|---|---|---|---|---|---|
| F1 | Google Form (Khảo sát DN) | Google Form | ①② | Sinh viên | ✅ Active |
| F2 | Web App Portal | Apps Script WebApp | ①② | Sinh viên | ✅ Active |

### 2.2 Đề xuất mở rộng (Tương lai)

| # | Kênh | Giai đoạn | Người dùng | Mô tả |
|---|---|---|---|---|
| F3 | Form Theo dõi tiến độ | ③ | Sinh viên | Báo cáo tuần/tháng: giờ làm, công việc, nhận xét |
| F4 | Form Đánh giá từ DN | ④ | Doanh nghiệp | Đánh giá SV: thái độ, kỹ năng, điểm số |
| F5 | Form Đánh giá từ GV | ④ | Giảng viên | Đánh giá kết quả thực tập, cho điểm |

### 2.3 Thiết kế hỗ trợ nhiều form

Hệ thống hỗ trợ gắn **nhiều Google Form** vào cùng một bảng tính xử lý thông qua cơ chế **Polling**:

```
Config:
  FORM_RESPONSE_SHEETS: [
    { id: "sheet_id_1", name: "Form Đăng ký HK2-2026", type: "REGISTRATION" },
    { id: "sheet_id_2", name: "Form Đăng ký HK3-2026", type: "REGISTRATION" },
    { id: "sheet_id_3", name: "Form Tiến độ",           type: "PROGRESS" }
  ]

→ pollFormResponses() quét TẤT CẢ Response Sheet trong danh sách
→ Phân loại type để gọi đúng logic xử lý
```

---

## 3. ĐẶC TẢ DỮ LIỆU THU NHẬN (Field Specifications)

### 3.1 Form Đăng ký / Cập nhật Doanh nghiệp (F1, F2)

#### A. Thông tin sinh viên (Bắt buộc)

| # | Tên Field | Kiểu | Bắt buộc | Validation | Ghi chú |
|---|---|---|---|---|---|
| 1 | **Email Sinh Viên** | Email | ✅ | Phải kết thúc `@student.tdtu.edu.vn` | Tự điền từ Google login (Form) hoặc Session (WebApp) |
| 2 | **MSSV** | Text | ✅ | Phải khớp prefix email | Chống mạo danh |
| 3 | **Họ và Tên** | Text | ✅ | Chuẩn hoá viết hoa đầu từ | |
| 4 | **Học phần** | Checkbox | ✅ | Chọn ≥1 | "Tập sự nghề nghiệp", "Kiến tập công nghiệp", "Thực tập tốt nghiệp" |
| 5 | **Học kỳ** | Dropdown | ✅ | | HK1, HK2, HK3 |
| 6 | **Năm học** | Dropdown | ✅ | | Tự động tính toán từ năm hiện tại |
| 7 | **Trạng thái** | Radio | ✅ | | "Đã có DN" / "Chưa có DN" |

#### B. Thông tin doanh nghiệp (Bắt buộc có điều kiện — chỉ khi "Đã có DN")

| # | Tên Field | Kiểu | Bắt buộc | Validation | Ghi chú |
|---|---|---|---|---|---|
| 8 | **Mã số thuế** | Text | ✅* | 10 số (trụ sở) hoặc 13 ký tự (chi nhánh) | Tự bổ sung số 0 đầu nếu thiếu |
| 9 | **Tên doanh nghiệp** | Text | ✅* | | SV tự nhập; hệ thống đối chiếu API |
| 10 | **Địa chỉ DN** | Text | ✅* | | Tự động fill từ autocomplete hoặc API |
| 11 | Website DN | Text | Không | | Tuỳ chọn |
| 12 | Email DN | Email | Không | | Email HR / người hướng dẫn |

> `✅*` = Bắt buộc khi chọn "Đã có doanh nghiệp"

#### C. Trường bổ sung đề xuất (Dựa trên quy chế thực tập phổ biến)

> **⚠️ CẦN XÁC NHẬN VỚI NHÀ TRƯỜNG** trước khi thêm các field này.

| # | Tên Field | Kiểu | Lý do đề xuất | Ưu tiên |
|---|---|---|---|---|
| 13 | **Lớp** | Text | Phân loại SV theo lớp sinh hoạt | 🔴 Cao |
| 14 | **Khoa / Ngành** | Dropdown | Thống kê theo khoa | 🔴 Cao |
| 15 | **SĐT sinh viên** | Text | Liên hệ khẩn cấp | 🟡 TB |
| 16 | **Người hướng dẫn tại DN** | Text | Quản lý mentor | 🟡 TB |
| 17 | **SĐT/Email người HD** | Text | Liên hệ người HD | 🟡 TB |
| 18 | **Vị trí thực tập** | Text | Biết SV làm gì tại DN | 🟢 Thấp |
| 19 | **Ngày bắt đầu thực tập** | Date | Quản lý thời gian | 🟡 TB |
| 20 | **Ngày kết thúc dự kiến** | Date | Quản lý thời gian | 🟡 TB |
| 21 | **Giảng viên hướng dẫn** | Dropdown | Phân công GVHD | 🟡 TB |

### 3.2 Dữ liệu hệ thống tự sinh (Không cần SV nhập)

| # | Field | Nguồn | Mô tả |
|---|---|---|---|
| A | Thời gian nộp | Hệ thống | Timestamp tự động |
| B | Tên pháp nhân (API) | VietQR API | Tên chính thức theo đăng ký KD |
| C | Tên DN (Tiếng Anh) | VietQR API | International Name |
| D | Trạng thái dữ liệu | Hệ thống | Hợp lệ / Sai MST / Đang chờ đồng bộ |
| E | Số lần cập nhật | Hệ thống | Đếm số lần SV nộp form |
| F | Nguồn cập nhật | Hệ thống | Google Form / Web App |

---

## 4. QUY TẮC NGHIỆP VỤ (Business Rules)

### 4.1 Quy tắc thu nhận dữ liệu

| ID | Quy tắc | Mô tả |
|---|---|---|
| BR-01 | **Email domain** | Chỉ chấp nhận email `@student.tdtu.edu.vn` |
| BR-02 | **MSSV = Email** | Prefix email phải khớp MSSV nhập vào |
| BR-03 | **Session check** | Email đăng nhập Google phải khớp email form (WebApp) |
| BR-04 | **Cho phép nộp nhiều lần** | SV được nộp lại form để cập nhật thông tin |
| BR-05 | **Dedup trong batch** | Nhiều lần nộp trong cùng batch → chỉ xử lý lần cuối |

### 4.2 Quy tắc xử lý doanh nghiệp

| ID | Quy tắc | Mô tả |
|---|---|---|
| BR-06 | **MST chuẩn hoá** | Tự bổ sung số 0 đầu nếu bị mất; thêm dấu "-" cho chi nhánh |
| BR-07 | **Validate MST** | MST hợp lệ: 10 số (trụ sở) hoặc 14 ký tự dạng XXXXXXXXXX-XXX |
| BR-08 | **API tra cứu** | Tra cứu VietQR API để lấy tên pháp nhân chính thức |
| BR-09 | **Cache 3 tầng** | RAM → CacheService → API (tránh gọi API trùng) |
| BR-10 | **Rate limit** | Giãn cách 800ms/request, tối đa 40 calls/batch |

### 4.3 Quy tắc Upsert (Cập nhật dữ liệu SV)

| ID | Trường hợp | Hành vi |
|---|---|---|
| BR-11 | **SV nộp lần đầu** | Insert dòng mới vào Students_Data |
| BR-12 | **SV nộp lại, cùng DN** (MST không đổi, đã verify) | Giữ nguyên kết quả API cũ, merge data mới |
| BR-13 | **SV đổi sang DN mới** (MST khác) | Reset API name, xoá website/email cũ, tra cứu lại |
| BR-14 | **SV chuyển "Chưa có DN"** | Xoá sạch toàn bộ data doanh nghiệp |
| BR-15 | **Merge data** | Giữ giá trị cũ nếu giá trị mới rỗng (tên, học phần, học kỳ) |
| BR-16 | **Tracking** | Đếm số lần cập nhật, ghi nguồn form, phân biệt retry vs submit mới |

### 4.4 Quy tắc thống kê Dashboard

| ID | Quy tắc | Mô tả |
|---|---|---|
| BR-17 | **Tổng quan** | Đếm: Đã có DN, Chưa có DN, Tổng SV, Tỷ lệ % |
| BR-18 | **Xác minh** | Phân loại: Hợp lệ, Cần đối chiếu, Đang chờ |
| BR-19 | **Theo học phần** | Group by Học phần → đếm Có DN / Chưa có |
| BR-20 | **Theo DN** | Group by MST → đếm số SV, liệt kê MSSV |
| BR-21 | **DS chưa có DN** | Xuất danh sách riêng với: Email, MSSV, Tên, Học phần, Học kỳ |

---

## 5. LUỒNG NGHIỆP VỤ CHI TIẾT

### 5.1 Luồng: Sinh viên đăng ký thực tập

```
SV mở Form/WebApp
    │
    ├─ WebApp: Tự động fill MSSV + Email từ Google Session
    │  Form: Yêu cầu đăng nhập Google + email verified
    │
    ▼
SV điền thông tin cá nhân
    │
    ▼
SV chọn trạng thái: ──────────────────────────┐
    │                                          │
    │ "Đã có DN"                    "Chưa có DN"
    │                                          │
    ▼                                          ▼
Hiện section DN                         Submit ngay
SV nhập MST, Tên DN, Địa chỉ             │
    │                                      │
    │ WebApp: Gợi ý autocomplete           │
    │ từ Company_Dictionary                │
    │                                      │
    ▼                                      │
Submit ────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────┐
│        HỆ THỐNG XỬ LÝ              │
│                                     │
│ 1. Validate email + MSSV           │
│ 2. Vào Queue (PENDING)             │
│ 3. Dedup (khử trùng MSSV)          │
│ 4. Chuẩn hoá data                  │
│ 5. Tra cứu API VietQR (nếu có DN) │
│ 6. Upsert vào Students_Data        │
│ 7. Cập nhật Dashboard              │
└─────────────────────────────────────┘
```

### 5.2 Luồng: Sinh viên cập nhật / đổi doanh nghiệp

```
SV nộp lại form với thông tin mới
    │
    ▼
Hệ thống tìm MSSV trong Students_Data
    │
    ├─ MST mới = MST cũ (đã verify) → Giữ kết quả API cũ (BR-12)
    ├─ MST mới ≠ MST cũ              → Tra cứu API mới, xoá data cũ (BR-13)
    └─ Chọn "Chưa có DN"             → Xoá sạch data DN (BR-14)
    │
    ▼
Cập nhật Students_Data + Refresh Dashboard
```

---

## 6. MA TRẬN TRUY XUẤT DỮ LIỆU

### 6.1 Ai đọc/ghi gì?

| Tab | Sinh viên | Giảng viên | Hệ thống (Script) |
|---|---|---|---|
| Students_Data | — | Đọc + Sửa tay | Đọc + Ghi (upsert) |
| Queue_Data | — | Đọc + Sửa status | Đọc + Ghi + Xoá |
| Dashboard | — | **Đọc** (báo cáo) | Ghi (tạo lại) |
| Chua_Co_Cong_Ty | — | **Đọc** (theo dõi) | Ghi (tạo lại) |
| Company_Dictionary | — | Đọc | Đọc + Ghi |
| Raw_web_data | — | Đọc (backup) | Ghi |
| Log_Errors | — | Đọc (debug) | Ghi |
| Response Sheet | Ghi (nộp form) | Đọc | Đọc (polling) |

---

## 7. SƠ ĐỒ TRẠNG THÁI (State Diagram)

### 7.1 Trạng thái Queue_Data

```
                                 ┌──────────────┐
                    ┌───────────▶│    DONE      │──── Dọn rác ban đêm ──▶ XOÁ
                    │            └──────────────┘
                    │
┌──────────┐   ┌────┴──────┐   ┌──────────────┐
│ PENDING  │──▶│PROCESSING │──▶│    RETRY     │──── Batch tiếp theo ──▶ PROCESSING
└──────────┘   └────┬──────┘   └──────────────┘
                    │
                    │            ┌──────────────┐
                    └───────────▶│    ERROR     │──── GV sửa tay ──▶ RETRY
                                 └──────────────┘
```

### 7.2 Trạng thái sinh viên

```
┌─────────────────────┐                    ┌──────────────────────┐
│  Chưa có doanh      │ ── SV nộp form ──▶│  Đã có doanh nghiệp  │
│  nghiệp             │◀── SV nộp lại ──  │  (Đang chờ đồng bộ)  │
│                     │                    │         │             │
│  Trạng thái verify: │                    │         ▼             │
│  "Đang chờ cập nhật"│                    │  API tra cứu MST     │
└─────────────────────┘                    │    │          │       │
                                           │  Thành công  Thất bại│
                                           │    │          │       │
                                           │    ▼          ▼       │
                                           │ "Hợp lệ"  "Sai MST" │
                                           └──────────────────────┘
```

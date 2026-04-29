# CHI TIẾT LUỒNG HOẠT ĐỘNG XỬ LÝ ĐỒNG THỜI (CONCURRENCY) TRÊN WEBAPP

Tài liệu này mô tả chính xác những gì diễn ra bên dưới hệ thống từ tích tắc người dùng bấm nút Submit cho đến khi dữ liệu nằm an toàn trong cơ sở dữ liệu `Students_Data`. Kịch bản giả định: **100 sinh viên bấm nút NỘP HỒ SƠ vào cùng một giây.**

---

## GIAI ĐOẠN 1: BẤM NÚT & LỌC TẠI FRONTEND (index.html)

**1. Khóa Giao Diện (UI Lock)**
Ngay khi sinh viên click "Nộp", JavaScript lập tức vô hiệu hóa nút bấm (`btnElement.disabled = true`), đổi text thành "ĐANG GỬI HỒ SƠ...". Điều này chặn triệt để hành vi "Double-click" (spam click) gây rác database.

**2. Góp Data & Gọi Backend**
Giao diện gom toàn bộ trường thông tin thành một Object `studentData` duy nhất. Sau đó gọi hàm `sendWithRetry(payload, ...)` để bắn lệnh `google.script.run.submitFromWebApp(payload)` về máy chủ Google. 
Lúc này cỗ máy bắt đầu khởi động!

---

## GIAI ĐOẠN 2: CHẠM TRÁN BỨC TƯỜNG LỬA CỦA GOOGLE

**1. Vượt Ngưỡng 30 Tiến Trình**
100 request bay đến Server Google. Vì Google Apps Script quy định giới hạn tối đa 30 tiến trình đồng thời (Concurrent Executions), Google mở cửa cho **30 request đầu tiên** chui vào phòng xử lý. 
**70 request còn lại** lập tức bị Server Google đá văng ra ngoài với mã lỗi ngầm (Network Error / System Limit).

**2. Cơ Chế Tự Cứu Vãn (Frontend Retry with Jitter)**
70 request bị đá văng rơi lại về trình duyệt của sinh viên. Nếu là Google Form, 70 form này sẽ vĩnh viễn bốc hơi. 
Nhưng ở WebApp, hàm `withFailureHandler` trong `index.html` tóm được cái lỗi này:
* Nó báo lên giao diện sinh viên: `"Kẹt mạng. Đang tự gỡ..."`
* Trình duyệt kích hoạt hàm Jitter Timer: Random cho người A đợi 1.5s, người B đợi 2s, người C đợi 3.5s...
* Sau khi đếm ngược xong thời gian gian giãn cách, Trình duyệt **tự động bế nguyên cục data đó đâm vào Server Google lần 2**. Nếu vẫn đông, nó thử lại tối đa 5 lần (Retry 5 times).

---

## GIAI ĐOẠN 3: BỘ ĐỆM SIÊU TỐC TRÊN RAM (WebApp.js)

Đối với 30 request (và những request retry lọt vào sau đó), chúng được hàm `submitFromWebApp(data)` xử lý như sau đón tiếp. Tại đây, code của bạn **không ghi vào Google Sheet** vì ghi Sheet quá chậm (~0.8s) dẫn đến nghẽn tắc đường.

**1. Chống Tấn Công Mạo Danh (Zero Trust Security)**
Server soi ngay `Session.getActiveUser().getEmail()`. Bất kỳ ai sửa mã HTML trên trình duyệt để gửi MSSV của bạn bè sẽ bị chặn đứng tại đây, ném lỗi thẳng về Frontend.

**2. Nén Dữ Liệu Ép Cân (Data Compression)**
Thay vì lưu nguyên cục JSON khổng lồ (tốn ~800 Bytes), Server rút ruột nó thành một mảng thô (Array) chỉ còn ~150 Bytes.
Ví dụ: `r: ["520H0001@...", "520H0001", "Nguyễn Văn A", "Tập sự", ...]`

**3. Ghi Vào Properties (Tốc độ 0.2s)**
* Hàm gọi chìa khóa `LockService.getScriptLock()`: bắt cả 30 tiến trình xếp hàng 1 hàng dọc.
* **PropertyService** hoạt động như một thanh RAM siêu tốc. Người 1 bước lên, tăng bộ đếm lên `WEB_1`, ghi mảng nén vào ➜ Trả khóa (Mất 0.2s). Người 2 bước lên, ghi vào `WEB_2` ➜ Trả khóa.
* Do thời gian giữ chìa khóa quá ngắn, chưa đầy 6 giây là 30 người đã xong việc và máy chủ trở nên siêu rảnh rỗi để tiếp tục đón đợt Retry của chục người bị rớt hồi nãy vào.
* Sinh viên nhận được thông báo xanh "Thành Công!", tắt web đi ngủ. Dữ liệu lúc này đang nằm lơ lửng ở bộ nhớ RAM của Google.

---

## GIAI ĐOẠN 4: NGƯỜI DỌN DẸP TRONG ĐÊM (Controller.js)

Dữ liệu trên RAM chỉ là tạm trữ. Mỗi phút (60 giây), Trigger tự động gọi `processQueueJob()` thức dậy làm nhiệm vụ hốt rác.

**1. Khóa Bảng Tính (Document Lock)**
Khác với lúc nãy, lúc này Script xài `LockService.getDocumentLock()` để tránh đụng chạm đến các Script khác đang thao tác trên file Excel. Lượng WebApp phía trên vẫn tiếp tục chạy `ScriptLock` không bị ảnh hưởng.

**2. Drain (Hút cạn bộ nhớ)**
* Hàm `drainWebSubmissions()` sẽ dùng lệnh `PropertiesService` gom toàn bộ từ `WEB_1` đến `WEB_100`.
* Nó "Bung nén" tệp Array 150 Bytes trở lại thành Object dài tay giống hệt định dạng của Google Form.
* Nó ném toàn bộ 100 ông này vào danh sách lưu lại trong `Queue_Data` (Bảng hàng đợi) & `Raw_web_data` (Lịch sử nguyên thủy), rồi tiện tay **xóa sạch RAM** để sẵn sàng đón 100 ông tiếp theo của đợt sau.

**3. Khử Trùng (Deduplication)**
Nếu sinh viên Spam nút Submit, hoặc cố tình làm lại Form 2-3 lần. Hàm `latestIndexSet` sẽ quét 1 vòng theo MSSV, chỉ giữ lại đơn MỚI NHẤT của sinh viên đó, các form cũ quăng đi để đỡ tốn quota API.

**4. Dò Tìm API Công Ty (VietQR)**
* Trích xuất các mã số thuế hợp lệ, chui qua `CompanyService.lookupByTaxCode`.
* Nó kiểm tra Tự điển RAM O(1). Nếu không có, gọi thẳng API VietQR (GIãn cách 800ms mỗi lệnh để chống lỗi Rate Limit).
* Cập nhật tên Công Ty quốc tế thực tế rớt ngầm vào File.

**5. Lên Kệ (Flush Database)**
Toàn bộ thông tin sạch sẽ được hàm `DatabaseRepo.upsertStudent` dồn tọt xuống bảng `Students_Data` bằng cơ chế **Batch Ghi (setValues)** chỉ trong 1 nốt nhạc thay vì chạy 100 vòng lặp tốn kém. Cập nhật Dashboard chốt danh sách.

### KẾT THÚC VÒNG ĐỜI
Từ một cú Click chuột lướt qua bão tố 30 threads của Google, lách qua mưu đồ ghi đè Sheet, cuối cùng dữ liệu sinh viên hạ cánh an toàn không sứt mẻ 1 Byte! Dù 100 hay 1.000 user thì cơ chế này vẫn xếp hàng mượt mà.
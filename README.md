1. Mục tiêu ban đầu
	Tích hợp Google Gemini 2.5 Flash vào hệ thống Apps Script.
	Tạo báo cáo tự động bằng AI dựa trên dữ liệu Students_Data.
	Kết xuất báo cáo thành Google Docs để dễ xem và lưu trữ.
2. Code tích hợp Gemini hiện tại
	Config.js
		Đã thêm cấu hình Gemini:
		GEMINI_MODEL: "gemini-2.5-flash"
		GEMINI_API_KEY_PROPERTY: "GEMINI_API_KEY"
		GEMINI_API_ENDPOINT: "https://generativelanguage.googleapis.com/v1beta/models"
	Controller.js
		Đã mở rộng menu Google Sheets:
		Thêm mục 🧠 Tạo báo cáo Gemini AI
		Gọi hàm generateGeminiReport
	ReportGenerator.gs
		File chính xử lý toàn bộ tích hợp Gemini.
		Chức năng chính:
			setGeminiApiKey(apiKey) / getGeminiApiKey_():
				Lưu và đọc API key từ Script Properties.
			callGemini_({ prompt, temperature, maxOutputTokens }):
				Gọi endpoint Gemini :generateContent.
				Gửi payload theo định dạng contents.parts.
				Xử lý response và trả về nội dung text.
			summarizeStudentData_(dataRows):
				Tính:
					tổng số hồ sơ
					số hồ sơ có doanh nghiệp
					số hồ sơ chưa có doanh nghiệp
					số hồ sơ thiếu mã số thuế
					top doanh nghiệp theo tần suất
			buildGeminiPrompt_(summary, sampleRows):
				Tạo prompt tiếng Việt chuyên nghiệp.
		Yêu cầu Gemini viết theo cấu trúc:
			Tổng quan
			Phân tích số liệu
			Vấn đề cần chú ý
			Khuyến nghị cải thiện
			createGeminiReportDoc_(reportText):
				Tạo Google Doc mới và chèn nội dung báo cáo.
			generateGeminiReport():
				Đọc toàn bộ dữ liệu từ sheet Students_Data
				Lấy summary và sample row
				Gắn JSON mẫu dữ liệu vào prompt
				Gọi Gemini để lấy báo cáo
				Tạo Google Docs và trả về URL
3. Dữ liệu Gemini đang sử dụng
Nguồn dữ liệu
	Sheet: Students_Data
	Dữ liệu lấy toàn bộ range hiện có trong sheet:
		header dòng 1 được bỏ qua
		dữ liệu từ dòng 2 trở đi
	Cột dữ liệu quan trọng được dùng
		SYSTEM_CONFIG.COL.COMPANY_RAW → tên doanh nghiệp sinh viên nhập
		SYSTEM_CONFIG.COL.TAX_CODE → mã số thuế
		SYSTEM_CONFIG.COL.COMPANY_API → tên pháp nhân API
		SYSTEM_CONFIG.COL.STATUS_VERIFY → trạng thái xác thực
		Các cột khác như MSSV, Họ Tên, Học Phần, Học Kỳ, Trạng Thái thực tập cũng được đưa vào JSON mẫu
	Cách dùng
		Gemini nhận:
			summary thống kê
			vài mẫu dữ liệu
			một object JSON của up đến 10 dòng thực tế
			Gemini sẽ phân tích trực tiếp dữ liệu đó và tạo nội dung báo cáo.
4. Kết quả hiện tại
Khi chạy generateGeminiReport():
	nếu sheet rỗng thì báo lỗi bằng SpreadsheetApp.getUi().alert
nếu ok thì:
	gọi Gemini API
	tạo Google Doc báo cáo
	hiển thị alert chứa URL của doc
Google Doc chứa:
	tiêu đề/bản mô tả
	nội dung do Gemini tạo
5. Cách test
Tạo API của google gemini
Bước 1: Cấu hình API key tại hàm setupGeminiKey
Chạy hàm:
	setupGeminiKey
Bước 2: Chạy tạo báo cáo
Từ Apps Script:
	từ menu Google Sheets:
		🎓 Quản lý Thực tập → 🧠 Tạo báo cáo Gemini AI
Bước 3: Kiểm tra kết quả
	Mở Google Doc được tạo.
	Xác nhận nội dung báo cáo

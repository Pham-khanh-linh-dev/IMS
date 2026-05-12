const SYSTEM_CONFIG = {
  MASTER_SHEET_ID: "",
  DATA_TAB_NAME: "Students_Data",
  RAW_DATA_WEBAPP: "Raw_web_data",
  NO_COMPANY_TAB: "Chua_Co_Cong_Ty", // Bảng mới: Danh sách sinh viên chưa có công ty
  LOG_TAB_NAME: "Log_Errors",
  QUEUE_TAB_NAME: "Queue_Data",
  QUEUE_HEADERS: ["Thời gian nhận", "Payload JSON", "Nguồn Form", "Trạng thái", "MSSV"],
  DASHBOARD_TAB_NAME: "Dashboard",
  DICTIONARY_TAB_NAME: "Company_Dictionary",

  POLL_MAX_ROWS_PER_SHEET: 100,
  
  // Gemini AI config (Google Gemini 2.5 Flash)
  GEMINI_MODEL: "gemini-2.5-flash",
  GEMINI_API_KEY_PROPERTY: "GEMINI_API_KEY",
  GEMINI_API_ENDPOINT: "https://generativelanguage.googleapis.com/v1beta/models",

  ALLOWED_DOMAIN: "@student.tdtu.edu.vn",

  COL: {
    TIME: 0,
    MSSV: 1,
    NAME: 2,
    COURSE: 3,
    SEMESTER: 4,
    STATUS_INTERN: 5,
    TAX_CODE: 6,
    COMPANY_RAW: 7,
    COMPANY_EN: 8,
    ADDRESS: 9,
    WEBSITE: 10,
    EMAIL_CO: 11,
    COMPANY_API: 12,
    STATUS_VERIFY: 13,
    UPDATE_COUNT: 14,
    LAST_SOURCE: 15
  },

  HEADERS: [
    "Thời gian nộp", "MSSV", "Họ và Tên", "Học phần", "Học kỳ - Năm học",
    "Trạng thái thực tập", "Mã số thuế", "Tên doanh nghiệp (Form ghi nhận)",
    "Tên doanh nghiệp (Tiếng Anh)", "Địa chỉ doanh nghiệp", "Website doanh nghiệp",
    "Email doanh nghiệp", "Tên pháp nhân (Hệ thống API)", "Trạng thái dữ liệu",
    "Số lần cập nhật", "Nguồn cập nhật"
  ]
};

// lấy Sheet đang chạy nếu MASTER_SHEET_ID trống hoặc không hợp lệ
function getMasterSpreadsheet_() {
  const id = (SYSTEM_CONFIG.MASTER_SHEET_ID || "").toString().trim();
  if (id) {
    try {
      return SpreadsheetApp.openById(id);
    } catch (e) {
      // fallback
    }
  }
  return SpreadsheetApp.getActiveSpreadsheet();
}
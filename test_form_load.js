// ═══════════════════════════════════════════════════════════════
// TEST POLLING: Append trực tiếp dữ liệu vào sheet response
// Thay vì submit form (vốn bị 401 unauthorized)
// ═══════════════════════════════════════════════════════════════

const NUMBER_OF_REQUESTS = 50;
let successCount = 0;

console.log(`Bắt đầu append ${NUMBER_OF_REQUESTS} dòng vào sheet response...`);

const ss = SpreadsheetApp.getActiveSpreadsheet();
const sheets = ss.getSheets();
let responseSheet = null;

// Tìm sheet response (Dữ_Liệu_Thô_* hoặc Form Responses 1)
for (let sheet of sheets) {
    const name = sheet.getName();
    if (name.startsWith("Dữ_Liệu_Thô_") || name === "Form Responses 1") {
        responseSheet = sheet;
        break;
    }
}

if (!responseSheet) {
    Logger.log("❌ Không tìm thấy sheet response. Hãy tạo form trước.");
    throw new Error("Sheet response không tồn tại");
}

const batchData = [];

for (let i = 1; i <= NUMBER_OF_REQUESTS; i++) {
    const mssv = "520H0" + i.toString().padStart(3, '0');
    const row = [
        new Date(),                           // Timestamp (cột 0)
        mssv,                                 // MSSV (cột 1)
        "Test Sinh Viên " + i,               // Họ tên (cột 2)
        "Tập sự nghề nghiệp",                // Học phần (cột 3)
        "Học Kỳ 2",                          // Học kỳ (cột 4)
        "2026 - 2027",                       // Năm học (cột 5)
        i % 2 === 0 ? "Đã có doanh nghiệp" : "Chưa có doanh nghiệp",  // Trạng thái (cột 6)
        i % 2 === 0 ? "0123456789" + i : "", // Mã số thuế (cột 7)
        i % 2 === 0 ? "Công ty Test " + i : "",  // Tên DN (cột 8)
        "Hà Nội",                            // Địa chỉ (cột 9)
        "test" + i + ".vn",                  // Website (cột 10)
        "hr" + i + "@test.vn"                // Email DN (cột 11)
    ];
    batchData.push(row);
}

// Append batch vào sheet response
const lastRow = responseSheet.getLastRow();
responseSheet.getRange(lastRow + 1, 1, batchData.length, 12).setValues(batchData);
successCount = batchData.length;

Logger.log("\n\n KẾT QUẢ APPEND VÀO SHEET RESPONSE:");
Logger.log("- Số dòng append thành công: " + successCount);
Logger.log("- MSV từ: 520H0001 đến 520H0" + String(NUMBER_OF_REQUESTS).padStart(3, '0'));
Logger.log("\n KẾT LUẬN: Chạy processQueueJob() hoặc chờ trigger tự chạy (1 phút) để xem dữ liệu vào Queue_Data.");
Logger.log("Nếu chưa có trigger, hãy chạy: enableAutoProcessing()");
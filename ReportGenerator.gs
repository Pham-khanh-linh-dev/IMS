// ReportGenerator.gs
// Google Gemini 2.5 Flash + Google Apps Script
// Tạo báo cáo AI tự động từ dữ liệu sinh viên thực tập

/**
 * Lưu Gemini API Key vào Script Properties
 */
function setGeminiApiKey(apiKey) {

  if (!apiKey || !apiKey.toString().trim()) {
    throw new Error("API key Gemini không hợp lệ.");
  }

  PropertiesService
    .getScriptProperties()
    .setProperty(
      SYSTEM_CONFIG.GEMINI_API_KEY_PROPERTY,
      apiKey.toString().trim()
    );

  Logger.log("✅ Đã lưu Gemini API key.");
}

/**
 * Lấy API key từ Script Properties
 */
function getGeminiApiKey_() {

  const apiKey = PropertiesService
    .getScriptProperties()
    .getProperty(SYSTEM_CONFIG.GEMINI_API_KEY_PROPERTY);

  if (!apiKey) {
    throw new Error(
      "❌ Chưa cấu hình Gemini API key."
    );
  }

  return apiKey.trim();
}

/**
 * Setup API key lần đầu
 * CHỈ CHẠY 1 LẦN
 */
function setupGeminiKey() {

  setGeminiApiKey("Nhập API vào đây");
}

/**
 * Gọi Gemini API
 */
function callGemini_({
  prompt,
  temperature = 0.3,
  maxOutputTokens = 1024
}) {

  const apiKey = getGeminiApiKey_();

  const url =
    `${SYSTEM_CONFIG.GEMINI_API_ENDPOINT}/` +
    `${SYSTEM_CONFIG.GEMINI_MODEL}:generateContent?key=${apiKey}`;

  const payload = {
    contents: [
      {
        parts: [
          {
            text: prompt
          }
        ]
      }
    ],
    generationConfig: {
      temperature: temperature,
      maxOutputTokens: maxOutputTokens
    }
  };

  const options = {
    method: "post",
    contentType: "application/json",
    muteHttpExceptions: true,
    payload: JSON.stringify(payload)
  };

  const response = UrlFetchApp.fetch(url, options);

  const responseCode = response.getResponseCode();
  const body = response.getContentText();

  Logger.log(body);

  if (responseCode < 200 || responseCode >= 300) {
    throw new Error(
      `Gemini API lỗi HTTP ${responseCode}: ${body}`
    );
  }

  const json = JSON.parse(body);

  if (json.error) {
    throw new Error(json.error.message);
  }

  if (
    !json.candidates ||
    !json.candidates[0] ||
    !json.candidates[0].content ||
    !json.candidates[0].content.parts ||
    !json.candidates[0].content.parts[0]
  ) {
    throw new Error(
      "❌ Gemini không trả về nội dung hợp lệ."
    );
  }

  return json.candidates[0].content.parts[0].text.trim();
}

/**
 * Phân tích dữ liệu sinh viên
 */
function summarizeStudentData_(dataRows) {

  const stats = {
    total: 0,
    withCompany: 0,
    withoutCompany: 0,
    missingTaxCode: 0,
    companyCounts: {}
  };

  dataRows.forEach(row => {

    const hasData = row.some(
      cell => cell !== "" &&
      cell !== null &&
      cell !== undefined
    );

    if (!hasData) return;

    stats.total++;

    const company =
      (row[SYSTEM_CONFIG.COL.COMPANY_RAW] || "")
      .toString()
      .trim();

    const taxCode =
      (row[SYSTEM_CONFIG.COL.TAX_CODE] || "")
      .toString()
      .trim();

    if (company) {

      stats.withCompany++;

      stats.companyCounts[company] =
        (stats.companyCounts[company] || 0) + 1;

    } else {

      stats.withoutCompany++;
    }

    if (
      !taxCode ||
      taxCode.toUpperCase() === "N/A"
    ) {
      stats.missingTaxCode++;
    }
  });

  const topCompanies =
    Object.entries(stats.companyCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([company, count]) =>
        `${company} (${count})`
      )
      .join(", ") ||
    "Chưa có dữ liệu";

  return {
    total: stats.total,
    withCompany: stats.withCompany,
    withoutCompany: stats.withoutCompany,
    missingTaxCode: stats.missingTaxCode,
    topCompanies: topCompanies
  };
}

/**
 * Tạo prompt cho Gemini
 */
function buildGeminiPrompt_(summary, sampleRows) {

  let prompt = "";

  prompt +="Bạn là chuyên gia phân tích dữ liệu thực tập sinh.\n\n";
  prompt +="Hãy viết báo cáo tiếng Việt chuyên nghiệp.\n\n";
  prompt += "\nKHÔNG sử dụng markdown, không dùng ##, **, -, hoặc ký tự định dạng.";
  prompt +=
    "Bố cục gồm:\n" +
    "1. Tổng quan\n" +
    "2. Phân tích số liệu\n" +
    "3. Vấn đề cần chú ý\n" +
    "4. Khuyến nghị cải thiện\n\n";

  prompt += `Tổng số hồ sơ: ${summary.total}\n`;
  prompt += `Đã có doanh nghiệp: ${summary.withCompany}\n`;
  prompt += `Chưa có doanh nghiệp: ${summary.withoutCompany}\n`;
  prompt += `Thiếu mã số thuế: ${summary.missingTaxCode}\n`;
  prompt += `Top doanh nghiệp: ${summary.topCompanies}\n\n`;

  prompt += "Dữ liệu mẫu:\n";
  prompt += `
Cấu trúc dữ liệu:
- Cột 1: Thời gian nộp
- Cột 2: MSSV
- Cột 3: Họ tên
- Cột 4: Học phần
- Cột 5: Học kỳ
- Cột 6: Trạng thái thực tập
- Cột 7: Mã số thuế doanh nghiệp
- Cột 8: Tên doanh nghiệp sinh viên nhập
- Cột 13: Tên pháp nhân xác thực từ API
- Cột 14: Trạng thái dữ liệu
`;
  sampleRows.forEach((row, index) => {
    prompt += `Mẫu ${index + 1}: ${row}\n`;
  });

  prompt +=
    "\nHãy đưa ra nhận xét và đề xuất cải thiện.";

  return prompt;
}

/**
 * Tạo Google Docs báo cáo
 */
function createGeminiReportDoc_(reportText) {

  const title =
    `Bao cao Gemini AI - ` +
    Utilities.formatDate(
      new Date(),
      Session.getScriptTimeZone(),
      "yyyy-MM-dd HH:mm:ss"
    );

  const doc = DocumentApp.create(title);

  const body = doc.getBody();

  body
    .appendParagraph(
      "BÁO CÁO TỔNG HỢP ĐĂNG KÝ THỰC TẬP"
    )
    .setHeading(
      DocumentApp.ParagraphHeading.HEADING1
    );

  body.appendParagraph(
    "Tạo tự động bằng Google Gemini 2.5 Flash."
  );

  body.appendParagraph("\n");

  body.appendParagraph(reportText);

  doc.saveAndClose();

  return doc.getUrl();
}

/**
 * Hàm chính tạo báo cáo AI
 */
function generateGeminiReport() {

  try {

    const sheet =
      DatabaseRepo.connect(
        SYSTEM_CONFIG.DATA_TAB_NAME
      );

    const data =
      sheet.getDataRange().getValues();

    if (!data || data.length <= 1) {

      SpreadsheetApp
        .getUi()
        .alert(
          "❌ Không có dữ liệu Students_Data."
        );

      return;
    }

    const rows = data.slice(1);

    const summary =
      summarizeStudentData_(rows);

    // Convert dữ liệu sheet thành JSON cho Gemini đọc
    const structuredRows =
      rows.slice(0, 10).map(row => {

        return {
          thoiGianNop: row[SYSTEM_CONFIG.COL.TIME],
          mssv: row[SYSTEM_CONFIG.COL.MSSV],
          hoTen: row[SYSTEM_CONFIG.COL.NAME],
          hocPhan: row[SYSTEM_CONFIG.COL.COURSE],
          hocKy: row[SYSTEM_CONFIG.COL.SEMESTER],
          trangThaiThucTap: row[SYSTEM_CONFIG.COL.STATUS_INTERN],
          maSoThue: row[SYSTEM_CONFIG.COL.TAX_CODE],
          doanhNghiepSinhVienNhap:
            row[SYSTEM_CONFIG.COL.COMPANY_RAW],
          tenPhapNhanAPI:
            row[SYSTEM_CONFIG.COL.COMPANY_API],
          trangThaiDuLieu:
            row[SYSTEM_CONFIG.COL.STATUS_VERIFY]
        };

      });

    let prompt =
      buildGeminiPrompt_(summary, []);

    // Gửi JSON thật cho Gemini
    prompt +=
      "\n\nDỮ LIỆU THỰC TẾ TỪ SHEET:\n";

    prompt += JSON.stringify(
      structuredRows,
      null,
      2
    );

    prompt +=
      "\n\nHãy PHÂN TÍCH trực tiếp dữ liệu trên.";

    Logger.log(prompt);

    const reportText =
      callGemini_({
        prompt: prompt,
        temperature: 0.25,
        maxOutputTokens: 120000
      });

    const docUrl =
      createGeminiReportDoc_(reportText);

    SpreadsheetApp
      .getUi()
      .alert(
        `✅ Báo cáo Gemini đã tạo:\n${docUrl}`
      );

    return docUrl;

  } catch (error) {

    Logger.log(error);

    SpreadsheetApp
      .getUi()
      .alert(
        `❌ Lỗi tạo báo cáo:\n${error.message}`
      );

    throw error;
  }
}
function createStandardForm() {
  // KIỂM TRA CHỐNG TẠO NHIỀU FORM
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const existingFormUrl = ss.getFormUrl();

  if (existingFormUrl) {
    SpreadsheetApp.getUi().alert(
      "!MỘT FORM ĐÃ ĐƯỢC KẾT NỐI SẴN VỚI BẢNG TÍNH NÀY!\n\n" +
      "Bạn không cần tạo thêm Form mới nữa để tránh rác hệ thống.\n\n" +
      "Bạn hãy click vào Menu [Công cụ -> Quản lý Biểu mẫu -> Chỉnh sửa biểu mẫu] " +
      "ở ngay góc trên của bảng tính Sheet hiện tại là ra nhé!"
    );
    return existingFormUrl;
  }
 // tẠO FORM
  // Thêm Timestamp vào tên Form để phân biệt nếu tạo nhiều lần
  const timestamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "dd/MM/yyyy HH:mm");
  const formTitle = "Khảo sát thông tin doanh nghiệp [" + timestamp + "]";
  
  const form = FormApp.create(formTitle);  // tạo form + tiêu đề

  form.setDescription("Biểu mẫu cập nhật thông tin thực tập. \nĐược tạo tự động lúc: " + timestamp);
  form.setCollectEmail(true);
  form.setLimitOneResponsePerUser(false); // Cho phép gửi nhiều lần
  form.setRequireLogin(true);

  //THÔNG TIN CƠ BẢN
  form.addTextItem().setTitle("MSSV").setRequired(true);
  form.addTextItem().setTitle("Họ và Tên").setRequired(true);
  form.addCheckboxItem().setTitle("Học Phần").setRequired(true)
    .setChoiceValues(["Tập sự nghề nghiệp", "Kiến tập công nghiệp"]);

  form.addListItem().setTitle("Học Kỳ").setRequired(true)
    .setChoiceValues(["Học Kỳ 1", "Học Kỳ 2", "Học Kỳ 3"]);

  form.addListItem().setTitle("Năm Học").setRequired(true)
    .setChoiceValues(["2025 - 2026", "2026 - 2027", "2027 - 2028", "2028 - 2029"]);

  //TRẠNG THÁI THỰC TẬP (phân nhánh)
  const statusItem = form.addMultipleChoiceItem()
    .setTitle("Trạng thái thực tập").setRequired(true);

  //Trang2
  const pageCompany = form.addPageBreakItem()
    .setTitle("THÔNG TIN DOANH NGHIỆP")
    .setHelpText("Mô tả (không bắt buộc)");

  //logic rẽ nhánh
  statusItem.setChoices([
    statusItem.createChoice("Đã có doanh nghiệp", pageCompany),
    statusItem.createChoice("Chưa có doanh nghiệp", FormApp.PageNavigationType.SUBMIT)
  ]);

  //THÔNG TIN DOANH NGHIỆP (chỉ hiện khi "Đã có DN")
  form.addTextItem().setTitle("Mã Số Doanh Nghiệp/ Mã Số Thuế").setRequired(true);
  form.addTextItem().setTitle("Tên Doanh Nghiệp (Tiếng Việt)").setRequired(true);
  form.addTextItem().setTitle("Địa Chỉ Doanh Nghiệp").setRequired(true);
  form.addTextItem().setTitle("Website Doanh Nghiệp");
  form.addTextItem().setTitle("Email Doanh Nghiệp");

  // add form into thư mục sheet hiện tại
  try {
    const ssFile = DriveApp.getFileById(ss.getId());
    const formFile = DriveApp.getFileById(form.getId());
    const parents = ssFile.getParents();
    if (parents.hasNext()) {
      const folder = parents.next();
      folder.addFile(formFile);
      DriveApp.getRootFolder().removeFile(formFile);
    }
  } catch(e) {
    console.error("Không thể gộp thư mục: " + e);
  }

  // Log URL
  const formUrl = form.getPublishedUrl();
  const editUrl = form.getEditUrl();

  // ===== ĐỒNG BỘ FORM QUAY LẠI SHEET
  form.setDestination(FormApp.DestinationType.SPREADSHEET, ss.getId());
  
  // Đổi tên trang tính (Sheet) tự tạo thành tên có Timestamp để bạn khỏi bị nhầm lẫn
  Utilities.sleep(3000); // Chờ Google 3s để đồng bộ tạo trang tính mới
  const sheets = ss.getSheets();
  for (let s of sheets) {
    if (s.getFormUrl() === formUrl || s.getFormUrl() === form.getPublishedUrl() || s.getName().includes("Biểu mẫu") || s.getName().includes("Form Responses")) {
      try {
        // Chỉ đổi tên nếu trang tính đó chưa được đổi thủ công
        s.setName("Dữ_Liệu_Thô_[" + timestamp + "]");
      } catch(e) {}
    }
  }

  // GẮN TRIGGER ON_FORM_SUBMIT NGAY LÚC TẠO
  try {
    const existingTriggers = ScriptApp.getProjectTriggers();
    let hasTrigger = false;
    for (let t of existingTriggers) {
      if (t.getHandlerFunction() === "onFormSubmit") { hasTrigger = true; break; }
    }
    if (!hasTrigger) {
      ScriptApp.newTrigger("onFormSubmit").forSpreadsheet(ss).onFormSubmit().create();
    }
  } catch(e) {
    console.error("Lỗi tự động gắn trigger: " + e.message);
  }

  console.log("✅ Form đã tạo và tự động kết nối Trigger!");
  console.log("📋 URL cho sinh viên: " + formUrl);
  console.log("✏️ URL chỉnh sửa: " + editUrl);

  SpreadsheetApp.getUi().alert(
    "✅ FORM ĐÃ ĐƯỢC TẠO VÀ KẾT NỐI THÀNH CÔNG VỚI BẢNG TÍNH NÀY!\n\n" +
    "⚠️⚠️ LƯU Ý: BẢO MẬT CHỐNG MẠO DANH ⚠️⚠️\n" +
    "DO HẠN CHẾ KỸ THUẬT. NGƯỜI DÙNG VUI LÒNG ĐIỀU CHỈNH MỤC \"THU THẬP ĐỊA CHỈ EMAIL\" TRONG PHẦN CÀI ĐẶT CỦA FORM LÀ \"ĐÃ XÁC MINH (VERIFIED)\" ĐỂ CHỐNG MẠO DANH\n" +
    "Hãy nhìn lên thanh công cụ của Sheet hiện tại: Click vào Menu [Công cụ -> Quản lý Biểu mẫu -> Chỉnh sửa biểu mẫu -> Cài đặt -> Câu trả lời -> Thu thập địa chỉ email -> chọn \"Đã xác minh (Verified)\"]"
  );

  return formUrl;
}

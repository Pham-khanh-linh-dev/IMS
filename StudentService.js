const StudentService = {

  processSubmission: function(namedValues) {
    let student = {
      // Keywords: ưu tiên tên chính xác từ Form hiện tại → rồi mới đến các biến thể
      name: this.formatName(this.extractValue(namedValues, ["Họ và Tên", "Họ tên", "Tên sinh viên"])),
      mssv: this.extractValue(namedValues, ["MSSV", "Mã số sinh viên", "Mã sinh viên"]).toUpperCase().replace(/\s/g, ''),
      course: this.extractValue(namedValues, ["Học Phần", "Học phần", "Môn học", "Tên học phần"]),
      semester: this._buildSemester(namedValues),

      taxCode: CompanyService.normalizeTaxCode(
        this.extractValue(namedValues, ["Mã Số Thuế", "MST", "Mã Số Doanh Nghiệp"])
      ),
      companyRaw: this.extractValue(namedValues, ["Tên Doanh Nghiệp (Tiếng Việt)", "Tên Công ty", "Cơ quan thực tập", "Tên doanh nghiệp", "Tên DN"]),
      companyEn: "",  // Không lấy từ Form — chỉ auto-fill từ API (internationalName)
      address: this.extractValue(namedValues, ["Địa Chỉ Doanh Nghiệp", "Địa chỉ công ty", "Địa chỉ trụ sở", "Địa chỉ DN"]),
      website: this.extractValue(namedValues, ["Website Doanh Nghiệp", "Website", "Trang web"]),
      emailCo: this.extractValue(namedValues, ["Email Doanh Nghiệp", "Email công ty", "Email đơn vị", "Email DN"]),
      statusInternRaw: this.extractValue(namedValues, ["Trạng thái thực tập", "Tình trạng", "Trạng thái"])
    };

    // Xác định trạng thái: ưu tiên field trạng thái, fallback = kiểm tra MST
    if (student.statusInternRaw && student.statusInternRaw.includes("Chưa")) {
      student.statusIntern = "Chưa có doanh nghiệp";
    } else if (!student.taxCode || student.taxCode === "") {
      student.statusIntern = "Chưa có doanh nghiệp";
    } else {
      student.statusIntern = "Đã có doanh nghiệp";
    }

    if (student.statusIntern === "Chưa có doanh nghiệp") {
      ["taxCode", "companyRaw", "companyEn", "address", "website", "emailCo"].forEach(k => student[k] = "N/A");
      student.companyApi = "N/A";
      student.statusVerify = "Đang chờ cập nhật";
    } else {
      student.companyApi = "Đang chờ đồng bộ";
      student.statusVerify = "Đang chờ đồng bộ";
      student.companyEn = ""; // Để trống chờ API fill sau
    }
    return student;
  },

  // Hỗ trợ cả form tách "Học Kỳ" + "Năm Học" và form gộp 1 trường
  _buildSemester: function(nv) {
    const combined = this.extractValue(nv, ["Học kỳ - Năm học", "Kỳ học"]);
    if (combined) return combined;
    const sem = this.extractValue(nv, ["Học Kỳ", "Học kì", "Kỳ"]);
    const year = this.extractValue(nv, ["Năm Học", "Năm", "Năm học"]);
    if (!sem && !year) return "";
    return `${sem} - ${year}`.trim();
  },

  //tìm cột linh hoạt — hỗ trợ nhiều form đặt tên khác nhau
  extractValue: function(namedValues, keywords) {
    const keys = Object.keys(namedValues);
    
    // Ưu tiên 1: Trùng khớp hoàn toàn
    for (let kw of keywords) {
      for (let key of keys) {
        if (key.toLowerCase().trim() === kw.toLowerCase().trim()) {
          let val = namedValues[key];
          if (!val) continue;
          let result = Array.isArray(val) ? val.join(", ").trim() : val.toString().trim();
          if (result) return result;
        }
      }
    }
    
    // Ưu tiên 2: Trùng một phần nhưng an toàn
    for (let kw of keywords) {       
      for (let key of keys) {        
        if (key.toLowerCase().includes(kw.toLowerCase())) {
          let val = namedValues[key];
          if (!val) continue;
          let result = Array.isArray(val) ? val.join(", ").trim() : val.toString().trim();
          if (result) return result; // Bỏ qua kết quả trống, tìm tiếp
        }
      }
    }
    return "";
  },

  formatName: function(str) {
    if (!str) return "";
    return str.toLowerCase().replace(/(^|\s)\S/g, l => l.toUpperCase());
  }
};
const DatabaseRepo = {

  _studentCache: null,

  connect: function (tabName) {
    const ss = getMasterSpreadsheet_();
    let sheet = ss.getSheetByName(tabName);
    if (!sheet) sheet = ss.insertSheet(tabName);
    return sheet;
  },

  //Khởi tạo header cho sheet Students_Data
  initHeaders: function () {
    const sheet = this.connect(SYSTEM_CONFIG.DATA_TAB_NAME);
    const firstRow = sheet.getRange(1, 1, 1, SYSTEM_CONFIG.HEADERS.length).getValues()[0];
    if (!firstRow[0]) {
      sheet.getRange(1, 1, 1, SYSTEM_CONFIG.HEADERS.length).setValues([SYSTEM_CONFIG.HEADERS]);
      sheet.getRange(1, 1, 1, SYSTEM_CONFIG.HEADERS.length)
        .setFontWeight("bold").setBackground("#4a86e8").setFontColor("white");
      sheet.setFrozenRows(1);
      // TỐI ƯU HÓA CHỐNG AUTO-CAST ngay từ lúc tạo bảng: Đặt định dạng Text (@) cho 2 cột dễ mất mốc số 0
      sheet.getRange(2, SYSTEM_CONFIG.COL.MSSV + 1, sheet.getMaxRows() - 1 || 1, 1).setNumberFormat("@");
      sheet.getRange(2, SYSTEM_CONFIG.COL.TAX_CODE + 1, sheet.getMaxRows() - 1 || 1, 1).setNumberFormat("@");
    }

    // Khởi tạo header cho Queue_Data
    const queueSheet = this.connect(SYSTEM_CONFIG.QUEUE_TAB_NAME);
    const queueHeaders = SYSTEM_CONFIG.QUEUE_HEADERS || ["Thời gian nhận", "Payload JSON", "Nguồn Form", "Trạng thái"];
    const queueLastRow = queueSheet.getLastRow();
    if (queueLastRow === 0) {
      queueSheet.getRange(1, 1, 1, queueHeaders.length).setValues([queueHeaders]);
      queueSheet.getRange(1, 1, 1, queueHeaders.length)
        .setFontWeight("bold").setBackground("#f4cccc");
      queueSheet.setFrozenRows(1);
    } else {
      const firstQueueRow = queueSheet.getRange(1, 1, 1, 4).getValues()[0];
      const status = (firstQueueRow[3] || "").toString();
      const looksLikeDataRow = ["PENDING", "RETRY", "DONE", "ERROR"].indexOf(status) >= 0;
      if (looksLikeDataRow) {
        queueSheet.insertRowBefore(1);
        queueSheet.getRange(1, 1, 1, queueHeaders.length).setValues([queueHeaders]);
        queueSheet.getRange(1, 1, 1, queueHeaders.length)
          .setFontWeight("bold").setBackground("#f4cccc");
        queueSheet.setFrozenRows(1);
      }
    }
  },

  _loadStudentCache: function () {
    if (this._studentCache) return this._studentCache;

    const sheet = this.connect(SYSTEM_CONFIG.DATA_TAB_NAME);
    const data = sheet.getDataRange().getValues();
    const indexByMssv = {};

    for (let i = 1; i < data.length; i++) {
      const key = (data[i][SYSTEM_CONFIG.COL.MSSV] || "").toString().toUpperCase();
      if (key) indexByMssv[key] = i + 1;
    }

    this._studentCache = {
      sheet: sheet,
      data: data,
      indexByMssv: indexByMssv,
      _changedRows: new Set()
    };

    return this._studentCache;
  },

  _invalidateStudentCache: function () {
    this._studentCache = null;
  },

  flushStudents: function () {
    const cache = this._studentCache || this._loadStudentCache();
    const sheet = cache.sheet;
    const data = cache.data;

    if (!data || data.length === 0) return;

    // Ensure header row
    if (!data[0] || !data[0][0]) {
      data[0] = SYSTEM_CONFIG.HEADERS;
    }

    const rowCount = data.length;
    const colCount = SYSTEM_CONFIG.HEADERS.length;
    const padded = data.map(row => {
      row = row || [];
      row.length = colCount;
      for (let i = 0; i < colCount; i++) {
        if (row[i] === undefined) row[i] = "";
      }
      return row;
    });

    // TỐI ƯU HÓA: Mảng đã được xử lý (PAD)

    const maxRows = sheet.getMaxRows();
    if (rowCount > maxRows) {
      sheet.insertRowsAfter(maxRows, rowCount - maxRows);
    }

    // TỐI ƯU HÓA DATA LOSS (BATCH UPDATE BY RANGE):
    // Thay vì úp lại 100% Sheet làm mất dữ liệu chỉnh tay của Giáo viên, 
    // Hệ thống chỉ gom nhóm những dòng (ROW) vừa được cập nhật để setValues() riêng biệt.
    if (!cache._changedRows || cache._changedRows.size === 0) return;

    const changedArr = Array.from(cache._changedRows).sort((a, b) => a - b);
    let blocks = [];
    let currentStart = changedArr[0];
    let currentCount = 1;

    for (let i = 1; i < changedArr.length; i++) {
      if (changedArr[i] === changedArr[i - 1] + 1) {
        currentCount++;
      } else {
        blocks.push({ start: currentStart, count: currentCount });
        currentStart = changedArr[i];
        currentCount = 1;
      }
    }
    blocks.push({ start: currentStart, count: currentCount });

    for (let b of blocks) {
      let blockData = [];
      for (let r = b.start; r < b.start + b.count; r++) {
        blockData.push(padded[r - 1]);
      }
      sheet.getRange(b.start, 1, b.count, colCount).setValues(blockData);
    }

    cache._changedRows.clear();
  },


  //upsertStudent — Ghi hoặc cập nhật dữ liệu sinh viên.
  // BA TRƯỜNG HỢP NGHỆP VỤ (SV cập nhật bằng cách nộp lại Form):
  //   1. "Chưa có DN"          → isResigning=true  → xóa sạch data công ty cũ
  //  2. "Cùng công ty" (MST không đổi) → companyChanged=false → giữ API name + verify status cũ
  // 3. "Đổi công ty" (MST mới # cũ) → companyChanged=true  → reset companyApi/verify, xóa website/email cũ

  upsertStudent: function (student, source) {
    const cache = this._loadStudentCache();
    const data = cache.data;
    const mssvKey = (student.mssv || "").toString().toUpperCase();
    let rowIndex = cache.indexByMssv[mssvKey] || -1;
    let existingRow = rowIndex > 0 ? data[rowIndex - 1] : null;

    const colCount = Object.keys(SYSTEM_CONFIG.COL).length;
    let rowValues = new Array(colCount);
    rowValues[SYSTEM_CONFIG.COL.TIME] = new Date();
    rowValues[SYSTEM_CONFIG.COL.MSSV] = student.mssv;

    // mergeData: Giữ giá trị cũ nếu giá trị mới rỗng/không hợp lệ (dùng cho họ tên, học phần, học kỳ)
    const mergeData = (newVal, colIndex) => {
      const oldVal = existingRow ? existingRow[colIndex] : "";
      if (!newVal || newVal === "N/A" || newVal === " - " || newVal === "") {
        return (oldVal && oldVal !== "N/A" && oldVal !== "") ? oldVal : (newVal || "");
      }
      return newVal;
    };

    rowValues[SYSTEM_CONFIG.COL.NAME] = mergeData(student.name, SYSTEM_CONFIG.COL.NAME);
    rowValues[SYSTEM_CONFIG.COL.COURSE] = mergeData(student.course, SYSTEM_CONFIG.COL.COURSE);
    rowValues[SYSTEM_CONFIG.COL.SEMESTER] = mergeData(student.semester, SYSTEM_CONFIG.COL.SEMESTER);

    const isResigning = student.statusIntern === "Chưa có doanh nghiệp";

    // Xác định SV đổi công ty: MST mới # MST cũ HIỆN CÓ HỢP LỆ trong hệ thống
    const oldTaxCode = existingRow
      ? (existingRow[SYSTEM_CONFIG.COL.TAX_CODE] || "").toString().trim().replace(/^'/, "")
      : "";
    const newTaxCode = (student.taxCode || "").toString().trim();
    const companyChanged = !isResigning
      && existingRow
      && oldTaxCode !== "" && oldTaxCode !== "N/A"
      && newTaxCode !== "" && newTaxCode !== "N/A"
      && oldTaxCode !== newTaxCode;

    // Có thể tái sử dụng kết quả API cũ khi MST KHÔNG thay đổi và đã xác minh trước đó
    const oldVerify = existingRow ? (existingRow[SYSTEM_CONFIG.COL.STATUS_VERIFY] || "").toString() : "";
    const sameCompanyVerified = !isResigning && !companyChanged && existingRow
      && oldTaxCode !== "" && oldTaxCode !== "N/A"
      && (oldVerify.includes("Hợp lệ") || oldVerify.includes("Sai MST"));

    rowValues[SYSTEM_CONFIG.COL.STATUS_INTERN] = student.statusIntern;
    rowValues[SYSTEM_CONFIG.COL.TAX_CODE] = isResigning ? "N/A" : student.taxCode;
    rowValues[SYSTEM_CONFIG.COL.COMPANY_RAW] = isResigning ? "N/A" : student.companyRaw;

    if (isResigning) {
      // TRƯỜNG HỢP 1: Nghỉ công ty → xóa sạch
      rowValues[SYSTEM_CONFIG.COL.COMPANY_EN] = "";
      rowValues[SYSTEM_CONFIG.COL.ADDRESS] = "N/A";
      rowValues[SYSTEM_CONFIG.COL.WEBSITE] = "N/A";
      rowValues[SYSTEM_CONFIG.COL.EMAIL_CO] = "N/A";
      rowValues[SYSTEM_CONFIG.COL.COMPANY_API] = "N/A";
      rowValues[SYSTEM_CONFIG.COL.STATUS_VERIFY] = "Đang chờ cập nhật";
    } else if (sameCompanyVerified) {
      // TRƯỜNG HỢP 2: Cùng công ty, đã xác minh trước đó → giữ nguyên kết quả cũ (không cần check lại API)
      rowValues[SYSTEM_CONFIG.COL.COMPANY_EN] = existingRow[SYSTEM_CONFIG.COL.COMPANY_EN];
      rowValues[SYSTEM_CONFIG.COL.ADDRESS] = mergeData(student.address, SYSTEM_CONFIG.COL.ADDRESS);
      rowValues[SYSTEM_CONFIG.COL.WEBSITE] = mergeData(student.website, SYSTEM_CONFIG.COL.WEBSITE);
      rowValues[SYSTEM_CONFIG.COL.EMAIL_CO] = mergeData(student.emailCo, SYSTEM_CONFIG.COL.EMAIL_CO);
      rowValues[SYSTEM_CONFIG.COL.COMPANY_API] = existingRow[SYSTEM_CONFIG.COL.COMPANY_API];  // Giữ API name cũ đã đúng
      rowValues[SYSTEM_CONFIG.COL.STATUS_VERIFY] = existingRow[SYSTEM_CONFIG.COL.STATUS_VERIFY]; // Giữ trạng thái verify cũ
    } else if (companyChanged) {
      // TRƯỜNG HỢP 3: Đổi sang công ty mới → cập nhật data mới từ API (xóa data cũ form không điền)
      rowValues[SYSTEM_CONFIG.COL.COMPANY_EN] = student.companyEn || "";
      rowValues[SYSTEM_CONFIG.COL.ADDRESS] = student.address || "";
      rowValues[SYSTEM_CONFIG.COL.WEBSITE] = student.website || ""; // Không mergeData: tránh giữ website công ty cũ
      rowValues[SYSTEM_CONFIG.COL.EMAIL_CO] = student.emailCo || ""; // Tương tự email
      rowValues[SYSTEM_CONFIG.COL.COMPANY_API] = student.companyApi;
      rowValues[SYSTEM_CONFIG.COL.STATUS_VERIFY] = student.statusVerify;
    } else {
      // TRƯỜNG HỢP 4: Lần đầu nộp hoặc cùng công ty chưa verify → dùng mergeData bình thường
      rowValues[SYSTEM_CONFIG.COL.COMPANY_EN] = student.companyEn || "";
      rowValues[SYSTEM_CONFIG.COL.ADDRESS] = mergeData(student.address, SYSTEM_CONFIG.COL.ADDRESS);
      rowValues[SYSTEM_CONFIG.COL.WEBSITE] = mergeData(student.website, SYSTEM_CONFIG.COL.WEBSITE);
      rowValues[SYSTEM_CONFIG.COL.EMAIL_CO] = mergeData(student.emailCo, SYSTEM_CONFIG.COL.EMAIL_CO);
      rowValues[SYSTEM_CONFIG.COL.COMPANY_API] = student.companyApi;
      rowValues[SYSTEM_CONFIG.COL.STATUS_VERIFY] = student.statusVerify;
    }

    // Tracking: đếm số lần cập nhật & nguồn
    const oldCount = existingRow ? (parseInt(existingRow[SYSTEM_CONFIG.COL.UPDATE_COUNT]) || 0) : 0;
    // Nếu là hệ thống tự Retry thì giữ nguyên số cũ, ngược lại thì mới cộng 1 (hoặc cộng thêm số lần PENDING đã bị gộp)
    if (student.isSystemRetry) {
      rowValues[SYSTEM_CONFIG.COL.UPDATE_COUNT] = oldCount > 0 ? oldCount : 1;
    } else {
      const addedCount = student.pendingCountThisBatch || 1;
      rowValues[SYSTEM_CONFIG.COL.UPDATE_COUNT] = oldCount + addedCount;
    }

    rowValues[SYSTEM_CONFIG.COL.LAST_SOURCE] = source || "Unknown";

    // Bảo toàn số 0 đầu MST bằng prefix nháy đơn ngay trong dữ liệu
    rowValues[SYSTEM_CONFIG.COL.TAX_CODE] = "'" + rowValues[SYSTEM_CONFIG.COL.TAX_CODE];

    if (rowIndex > 0) {
      data[rowIndex - 1] = rowValues.slice();
    } else {
      data.push(rowValues.slice());
      rowIndex = data.length;
      cache.indexByMssv[mssvKey] = rowIndex;
    }
    if (!cache._changedRows) cache._changedRows = new Set();
    cache._changedRows.add(rowIndex);


  },


  //  DASHBOARD — Thống kê realtime, nhiều chiều và tự động xuất danh sách Chưa có công ty
  generateStatistics: function () {
    const sheetData = this.connect(SYSTEM_CONFIG.DATA_TAB_NAME).getDataRange().getValues();
    const dash = this.connect(SYSTEM_CONFIG.DASHBOARD_TAB_NAME);
    dash.clear();

    let haveCompany = 0, noCompany = 0;
    let companyStats = {};   // MST → { name, count, students[] }
    let courseStats = {};     // Course → { have, no }
    let verifyStats = { ok: 0, check: 0, waiting: 0 };
    let noCompanyList = []; // Mảng lưu trữ danh sách SV Chưa có công ty
    const now = new Date();

    for (let i = 1; i < sheetData.length; i++) {
      const row = sheetData[i];
      const status = row[SYSTEM_CONFIG.COL.STATUS_INTERN];
      const tax = row[SYSTEM_CONFIG.COL.TAX_CODE];
      const apiName = row[SYSTEM_CONFIG.COL.COMPANY_API];
      const course = row[SYSTEM_CONFIG.COL.COURSE] || "Không rõ";
      const verify = row[SYSTEM_CONFIG.COL.STATUS_VERIFY] || "";
      const mssv = row[SYSTEM_CONFIG.COL.MSSV];
      const name = row[SYSTEM_CONFIG.COL.NAME];
      const lastUp = row[SYSTEM_CONFIG.COL.TIME];
      const semester = row[SYSTEM_CONFIG.COL.SEMESTER] || "";

      if (!courseStats[course]) courseStats[course] = { have: 0, no: 0 };

      if (status === "Đã có doanh nghiệp" && tax && tax !== "N/A") {
        haveCompany++;
        courseStats[course].have++;
        if (!companyStats[tax]) {
          companyStats[tax] = {
            name: (apiName && apiName !== "N/A" && !apiName.includes("Không tìm") && !apiName.includes("Đang chờ")) ? apiName : row[SYSTEM_CONFIG.COL.COMPANY_RAW],
            count: 0, students: []
          };
        }
        companyStats[tax].count++;
        companyStats[tax].students.push(mssv);
        if (verify.includes("Hợp lệ")) verifyStats.ok++;
        else if (verify.includes("Cần đối chiếu")) verifyStats.check++;
        else verifyStats.waiting++;
      } else {
        noCompany++;
        courseStats[course].no++;
        // Thêm vào danh sách Chưa có công ty
        noCompanyList.push([
          lastUp, // Thời gian nộp form cuối cùng
          mssv + "@student.tdtu.edu.vn", // Email
          mssv, // MSSV
          name, // Họ và Tên
          course, // Học phần
          semester // Học kỳ
        ]);
      }

    }

    // --- Cập nhật Tab Chưa có công ty ---
    try {
      const noCompanySheet = this.connect(SYSTEM_CONFIG.NO_COMPANY_TAB);
      noCompanySheet.clear();
      noCompanySheet.getRange(1, 1, 1, 6).setValues([["Thời gian nộp", "Email", "MSSV", "Họ Tên", "Học phần", "Học kỳ - Năm học"]]);
      noCompanySheet.getRange(1, 1, 1, 6).setFontWeight("bold").setBackground("#ea4335").setFontColor("white");

      if (noCompanyList.length > 0) {
        noCompanySheet.getRange(2, 1, noCompanyList.length, 6).setValues(noCompanyList);
      }
    } catch (eList) {
      this.logError("Lỗi xuất DS Chưa có công ty", eList.message);
    }


    let r = 1;
    const total = haveCompany + noCompany;
    const pct = (n) => total > 0 ? Math.round(n / total * 100) + "%" : "0%";

    // Đảm bảo Dash đủ dòng cho lượng công ty
    const requiredRows = Object.keys(companyStats).length + Object.keys(courseStats).length + 20;
    const currentRows = dash.getMaxRows();
    if (requiredRows > currentRows) {
      dash.insertRowsAfter(currentRows, requiredRows - currentRows);
    }

    // --- SECTION 1: Tổng quan ---
    dash.getRange(r, 1, 1, 3).setValues([["TỔNG QUAN THỰC TẬP", "Số lượng", "Tỷ lệ"]]);
    dash.getRange(r, 1, 1, 3).setFontWeight("bold").setBackground("#1a73e8").setFontColor("white").setFontSize(12);
    r++;
    dash.getRange(r, 1, 4, 3).setValues([
      ["✅ Đã chốt doanh nghiệp", haveCompany, pct(haveCompany)],
      ["⏳ Chưa có doanh nghiệp", noCompany, pct(noCompany)],
      ["📋 Tổng sinh viên", total, ""],
      ["", "", ""]
    ]);
    r += 4;

    // --- SECTION 2: Xác minh ---
    dash.getRange(r, 1, 1, 2).setValues([["XÁC MINH DOANH NGHIỆP", "Số lượng"]]);
    dash.getRange(r, 1, 1, 2).setFontWeight("bold").setBackground("#34a853").setFontColor("white"); r++;
    dash.getRange(r, 1, 3, 2).setValues([
      ["Hợp lệ (tên khớp API)", verifyStats.ok],
      ["Cần đối chiếu", verifyStats.check],
      ["Đang chờ", verifyStats.waiting]
    ]);
    r += 4;

    // --- SECTION 3: Theo học phần ---
    dash.getRange(r, 1, 1, 4).setValues([["THEO HỌC PHẦN", "Có DN", "Chưa có", "Tổng"]]);
    dash.getRange(r, 1, 1, 4).setFontWeight("bold").setBackground("#fbbc04").setFontColor("#333"); r++;
    let courseData = [];
    for (let c of Object.keys(courseStats).sort()) {
      const cs = courseStats[c];
      courseData.push([c, cs.have, cs.no, cs.have + cs.no]);
    }
    if (courseData.length > 0) {
      dash.getRange(r, 1, courseData.length, 4).setValues(courseData);
      r += courseData.length;
    }
    r++;

    // --- SECTION 4: Theo công ty ---
    dash.getRange(r, 1, 1, 4).setValues([["THEO DOANH NGHIỆP", "MST", "Số SV", "MSSV"]]);
    dash.getRange(r, 1, 1, 4).setFontWeight("bold").setBackground("#4285f4").setFontColor("white"); r++;
    const sorted = Object.keys(companyStats).sort((a, b) => companyStats[b].count - companyStats[a].count);
    let companyData = [];
    for (let tax of sorted) {
      const c = companyStats[tax];
      companyData.push([c.name, tax, c.count, c.students.join(", ")]);
    }
    if (companyData.length > 0) {
      dash.getRange(r, 2, companyData.length, 1).setNumberFormat("@");
      dash.getRange(r, 1, companyData.length, 4).setValues(companyData);
      r += companyData.length;
    }
    r++;

    dash.autoResizeColumns(1, 4);
  },

  logError: function (msg, context) {
    try {
      this.connect(SYSTEM_CONFIG.LOG_TAB_NAME).appendRow([new Date(), msg, context]);
    } catch (e) {
      console.error("Critical: " + e.message);
    }
  }
};
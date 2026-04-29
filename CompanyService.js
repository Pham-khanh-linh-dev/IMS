const CompanyService = {

  // Biến lưu trữ Dictionary trên RAM trong vòng đời 1 lần chạy Script
  _memoryDictionary: null,
  _newEntries: [], // Batch lưu trữ để ghi xuống Sheet 1 lần duy nhất
  _consecutiveErrors: 0,
  _circuitOpenUntil: 0,
  _apiHitCount: 0,

  getApiHitCount: function () { return this._apiHitCount; },
  resetApiHitCount: function () { this._apiHitCount = 0; },

  normalizeTaxCode: function (taxCode) {
    if (!taxCode) return "";
    // Lọc lấy toàn bộ số (Tạm thời bỏ dấu gạch ngang do SV hay gõ sai hoặc không gõ)
    let code = taxCode.toString().trim().replace(/[^0-9]/g, '');

    // NẾU gõ 9 số hoặc 12 số (chi nhánh) MÀ KHÔNG bắt đầu bằng số 0 
    // -> Đây là do phần mềm Excel/Sheets tự động gọt mất số 0 ở đầu -> Bổ sung số 0
    if (code.length === 9 && !code.startsWith("0")) {
      code = "0" + code;
    } else if (code.length === 12 && !code.startsWith("0")) {
      code = "0" + code;
    }

    // NGƯỢC LẠI: Nếu SV gõ 9 số mà chữ số đầu CÓ SẴN là số 0 -> Chứng tỏ SV gõ thiếu 1 số ở khúc giữa -> Để nguyên 9 số chờ báo lỗi bên dưới.

    // API Của VietQR (Và đa số ngân hàng) yêu cầu chi nhánh phải có định dạng 10số-3số (VD: 0101248141-001)
    if (code.length === 13) {
      return code.substring(0, 10) + "-" + code.substring(10);
    }

    return code;
  },

  // Tải toàn bộ Tự Điển vào RAM
  _loadDictionaryToMemory: function () {
    if (this._memoryDictionary) return;
    const ss = getMasterSpreadsheet_();
    let dictSheet = ss.getSheetByName(SYSTEM_CONFIG.DICTIONARY_TAB_NAME);
    if (!dictSheet) {
      dictSheet = ss.insertSheet(SYSTEM_CONFIG.DICTIONARY_TAB_NAME);
      dictSheet.appendRow(["Mã Số Thuế", "Tên Doanh Nghiệp (VN)", "Tên Tiếng Anh", "Địa Chỉ", "Thời Gian Cập Nhật"]);
      dictSheet.getRange(1, 1, 1, 5).setFontWeight("bold").setBackground("#d9d2e9");
      dictSheet.setFrozenRows(1);
    }

    this._memoryDictionary = {};
    const dictData = dictSheet.getDataRange().getValues();
    for (let i = 1; i < dictData.length; i++) {
      let code = dictData[i][0].toString();
      this._memoryDictionary[code] = {
        name: dictData[i][1],
        nameEn: dictData[i][2] || "",
        address: dictData[i][3] || "",
        normalizedTaxCode: code
      };
    }
  },

  // Lưu 1 mã vào Dictionary Memory và nạp vào Batch
  _saveToDictionary: function (cleanCode, apiResult) {
    if (this._memoryDictionary && this._memoryDictionary[cleanCode] && this._memoryDictionary[cleanCode].name) return;

    // Lưu vào RAM ngay tập tức để dùng cho các row tiếp theo
    this._memoryDictionary[cleanCode] = apiResult;

    // Đẩy vào mảng 2D - Chưa ghi
    this._newEntries.push([
      "'" + cleanCode,
      apiResult.name,
      apiResult.nameEn || "",
      apiResult.address || "",
      new Date()
    ]);
  },

  // Thực thi TẤT CẢ yêu cầu ghi O(1)
  flushNewEntries: function () {
    if (this._newEntries.length === 0) return;
    const lockDict = LockService.getDocumentLock();
    try {
      lockDict.waitLock(15000);
      const ss = getMasterSpreadsheet_();
      let dictTarget = ss.getSheetByName(SYSTEM_CONFIG.DICTIONARY_TAB_NAME);
      if (!dictTarget) {
        dictTarget = ss.insertSheet(SYSTEM_CONFIG.DICTIONARY_TAB_NAME);
        dictTarget.appendRow(["Mã Số Thuế", "Tên Doanh Nghiệp (VN)", "Tên Tiếng Anh", "Địa Chỉ", "Thời Gian Cập Nhật"]);
        dictTarget.getRange(1, 1, 1, 5).setFontWeight("bold").setBackground("#d9d2e9");
        dictTarget.setFrozenRows(1);
      }
      const lastRow = Math.max(1, dictTarget.getLastRow());

      // Kiểm tra và kéo giãn số lượng dòng của Sheet nếu mảng Data tràn giới hạn
      const maxRows = dictTarget.getMaxRows();
      const requiredRows = lastRow + this._newEntries.length;
      if (requiredRows > maxRows) {
        dictTarget.insertRowsAfter(maxRows, requiredRows - maxRows);
      }

      // Ghi mảng 2D xuống Sheet trong 0.1 giây
      dictTarget.getRange(lastRow + 1, 1, this._newEntries.length, 5).setValues(this._newEntries);

      // Chỉ xóa hàng chờ khi ghi thành công
      this._newEntries = [];
    } catch (e) {
      console.error("Lỗi khi xả Data vào Dictionary: " + e);
      DatabaseRepo.logError("Lỗi xả Dictionary", e.message);
      throw e; // Ném lỗi để quá trình bên ngoài biết và không đánh dấu DONE
    } finally {
      if (lockDict.hasLock()) {
        lockDict.releaseLock();
      }
    }
  },

  lookupByTaxCode: function (taxCode) {
    if (!taxCode || taxCode === "N/A") return null;

    const cleanCode = this.normalizeTaxCode(taxCode);
    // Độ dài VN là 10 số (Trụ sở chính) hoặc 14 ký tự (Chi nhánh: XXXXXXXXXX-XXX)
    if (cleanCode.length !== 10 && cleanCode.length !== 14) {
      return "INVALID_TAX";
    }

    // 1. Kiểm tra trong Tự điển RAM (O(1))
    this._loadDictionaryToMemory();
    if (this._memoryDictionary[cleanCode]) {
      return this._memoryDictionary[cleanCode];
    }

    //Kiểm tra xem mạch có bị ngắt từ phiên chạy trước hay không
    const cache = CacheService.getScriptCache();
    if (cache.get("VIETQR_CIRCUIT_OPEN") === "true") {
      return "NETWORK_ERROR";
    }

    // Mạch cục bộ
    if (this._circuitOpenUntil && Date.now() < this._circuitOpenUntil) {
      return "NETWORK_ERROR";
    }

    // 2. Gọi API Giãn cách 800ms -> VietQR cho phép khoảng 1-2 request/s
    Utilities.sleep(800);
    const result = this._fetchVietQR(cleanCode);

    // 3. CHỈ LƯU TỪ ĐIỂN RAM KHI THÀNH CÔNG, KHÔNG LƯU MÃ ẢO
    if (result && result.name) {
      result.normalizedTaxCode = cleanCode;
      this._saveToDictionary(cleanCode, result);

      // Reset breaker on success
      this._consecutiveErrors = 0;
      this._circuitOpenUntil = 0;
      cache.remove("VIETQR_CIRCUIT_OPEN");
    }

    return result;
  },

  //Tối ưu Retry Logic (Fail Fast)

  _fetchVietQR: function (taxCode) {
    const url = "https://api.vietqr.io/v2/business/" + encodeURIComponent(taxCode);
    const options = { method: "get", muteHttpExceptions: true, timeout: 5000 };

    // fast fail (circuit breaker logic moved out of retry loop)
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        this._apiHitCount++;
        const res = UrlFetchApp.fetch(url, options);
        const httpCode = res.getResponseCode();

        // Nếu nghẽn mạng hoặc lỗi server -> Tăng thời gian đợi theo số lần thử
        if (httpCode === 429 || httpCode >= 500) {
          const baseDelay = attempt === 1 ? 2000 : attempt === 2 ? 5000 : 10000;
          const jitter = Math.floor(100 + Math.random() * 400);
          Utilities.sleep(baseDelay + jitter);
          continue;
        }

        // Nếu mã không hợp lệ theo chuẩn API (404, 400, v.v...) -> Invalid Tax
        if (httpCode !== 200) return "INVALID_TAX";

        const json = JSON.parse(res.getContentText());
        if (json && json.code === "00" && json.data) {
          return {
            name: json.data.name || "",
            nameEn: json.data.internationalName || "",
            shortName: json.data.shortName || "",
            address: json.data.address || ""
          };
        }
        return "INVALID_TAX";
      } catch (e) {
        if (attempt >= 2) console.error("VietQR Fatal: Mã " + taxCode + " - " + e.message);
        const baseDelay = attempt === 1 ? 2000 : attempt === 2 ? 5000 : 10000;
        const jitter = Math.floor(100 + Math.random() * 400);
        Utilities.sleep(baseDelay + jitter);
      }
    }

    // Nếu cả 3 lần chạy đối với item này đều thất bại (System level timeout/error)
    this._consecutiveErrors++;
    if (this._consecutiveErrors >= 3) {
      this._circuitOpenUntil = Date.now() + 60 * 1000; // Nghỉ 1 phút
      CacheService.getScriptCache().put("VIETQR_CIRCUIT_OPEN", "true", 60);
      console.warn("CIRCUIT BREAKER KÍCH HOẠT: Đã ngắt API 60s do lỗi liên tục.");
    }

    return "NETWORK_ERROR";
  }
};
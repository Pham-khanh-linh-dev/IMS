function ensureQueueSheetHeader_(queueSheet) {
  const headers = SYSTEM_CONFIG.QUEUE_HEADERS || ["Thời gian nhận", "Payload JSON", "Nguồn Form", "Trạng thái", "MSSV"];
  const lastRow = queueSheet.getLastRow();

  if (lastRow === 0) {
    queueSheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    queueSheet.getRange(1, 1, 1, headers.length).setFontWeight("bold").setBackground("#f4cccc");
    queueSheet.setFrozenRows(1);
    return;
  }

  const firstRow = queueSheet.getRange(1, 1, 1, headers.length).getValues()[0];
  const firstStatus = (firstRow[3] || "").toString();
  const looksLikeDataRow = ["PENDING", "RETRY", "DONE", "ERROR"].indexOf(firstStatus) >= 0;
  const headerMissing = looksLikeDataRow || !firstRow[0] || firstRow[0].toString() === "";

  if (headerMissing) {
    queueSheet.insertRowBefore(1);
    queueSheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    queueSheet.getRange(1, 1, 1, headers.length).setFontWeight("bold").setBackground("#f4cccc");
    queueSheet.setFrozenRows(1);
  }
}

// ═══════════════════════════════════════════════════════════════
// POLLING — Quét Response Sheet chủ động thay vì dùng trigger onFormSubmit
// ═══════════════════════════════════════════════════════════════
//
// NÂNG CẤP TỪ PHIÊN BẢN CŨ (pullFormResponses):
//   ✅ Auto-Discovery thay vì hardcode tên tab
//   ✅ Delta Read thay vì getDataRange() toàn bộ
//   ✅ Per-sheet bookmark thay vì 1 key chung
//   ✅ Guard clause khi bookmark corrupt
//   ✅ MAX_PER_SHEET giới hạn quét mỗi lần
//   ✅ Giữ backup raw data (điểm hay của bản gốc)
//   ✅ Xoá onFormSubmit (tránh duplicate data)
//
function pollFormResponses() {
  const ss = getMasterSpreadsheet_();
  const sheets = ss.getSheets();
  const props = PropertiesService.getScriptProperties();
  const queueSheet = DatabaseRepo.connect(SYSTEM_CONFIG.QUEUE_TAB_NAME);
  const MAX_PER_SHEET = SYSTEM_CONFIG.POLL_MAX_ROWS_PER_SHEET || 100;
  let totalPolled = 0;

  for (const sheet of sheets) {
    // Auto-Discovery: Chỉ quét các tab có gắn Google Form
    let formUrl = null;
    try { formUrl = sheet.getFormUrl(); } catch (e) { continue; }
    if (!formUrl) continue;

    const sheetId = sheet.getSheetId();
    const bookmarkKey = "POLL_BOOKMARK_" + sheetId;
    const lastProcessed = parseInt(props.getProperty(bookmarkKey) || "1");
    const maxRow = sheet.getLastRow();

    // Guard clause: Tránh lỗi khi GV xóa bớt dòng trong response sheet
    if (lastProcessed > maxRow) {
      props.setProperty(bookmarkKey, String(maxRow));
      continue;
    }
    if (maxRow <= lastProcessed) continue;

    const numNew = Math.min(maxRow - lastProcessed, MAX_PER_SHEET);
    const colCount = sheet.getLastColumn();
    if (colCount === 0) continue;

    const headers = sheet.getRange(1, 1, 1, colCount).getValues()[0];
    const newRows = sheet.getRange(lastProcessed + 1, 1, numNew, colCount).getValues();

    const queueRows = [];
    for (const row of newRows) {
      if (!row[0]) continue; // Bỏ qua dòng trống

      // Dynamic Mapping: Biến data thành JSON dựa trên header thực tế
      const namedValues = {};
      for (let c = 0; c < headers.length; c++) {
        const headerName = headers[c] ? headers[c].toString().trim() : "";
        if (headerName) {
          namedValues[headerName] = row[c] != null ? row[c].toString() : "";
        }
      }

      let mssv = "";
      try {
        mssv = StudentService.extractValue(namedValues, 
          ["MSSV", "Mã số sinh viên", "Mã sinh viên"]).toUpperCase().replace(/\s/g, '');
      } catch (e) { }

      queueRows.push([
        row[0] || new Date(),
        JSON.stringify(namedValues),
        "Form: " + sheet.getName(),
        "PENDING",
        mssv
      ]);
    }

    // Batch append vào Queue
    if (queueRows.length > 0) {
      const qLastRow = queueSheet.getLastRow();
      const qMaxRows = queueSheet.getMaxRows();
      if (qLastRow + queueRows.length > qMaxRows) {
        queueSheet.insertRowsAfter(qMaxRows, qLastRow + queueRows.length - qMaxRows);
      }
      queueSheet.getRange(qLastRow + 1, 1, queueRows.length, 5).setValues(queueRows);
      totalPolled += queueRows.length;
    }

    // Cập nhật bookmark sau khi ghi thành công
    props.setProperty(bookmarkKey, String(lastProcessed + numNew));
  }
  return totalPolled;
}

function processQueueJob() {
  // SỬ DỤNG DOCUMENT LOCK: Chỉ khóa thao tác trên Sheet.
  // Không dùng ScriptLock ở đây để chừa đường cho WebApp (Tầng 1) dùng ScriptLock ghi RAM.
  const jobLock = LockService.getDocumentLock();
  if (!jobLock.tryLock(1000)) { // 1000ms: nếu job khác đang chạy thì thoát ngay
    DatabaseRepo.logError("Bỏ qua Batch Job", "Đã có phiên xử lý hàng đợi khác đang chạy.");
    return;
  }

  try {
    const queueSheet = DatabaseRepo.connect(SYSTEM_CONFIG.QUEUE_TAB_NAME);
    if (DatabaseRepo._invalidateStudentCache) DatabaseRepo._invalidateStudentCache();
    ensureQueueSheetHeader_(queueSheet);

    // ── DRAIN: Gom submissions từ WebApp PropertiesService → Queue_Data + Raw_web_data ──
    // Phải chạy TRƯỚC khi đọc queueData để batch mới nhất được xử lý ngay lần này
    try {
      const drained = drainWebSubmissions();
      if (drained > 0) {
        DatabaseRepo.logError("WebApp Drain", "Đã gom " + drained + " submissions từ Web App vào Queue.");
      }
    } catch (drainErr) {
      DatabaseRepo.logError("Lỗi Drain WebApp", drainErr.message);
    }

    // ── PULL: Gom responses từ Google Form → Queue_Data + Raw_web_data ──
    try {
      const pulled = pollFormResponses();
      if (pulled > 0) {
        DatabaseRepo.logError("Form Pull", "Đã pull " + pulled + " responses từ Form vào Queue.");
      }
    } catch (pullErr) {
      DatabaseRepo.logError("Lỗi Pull Form", pullErr.message);
    }

    const queueData = queueSheet.getDataRange().getValues();

    if (queueData.length <= 1) return; // KHÔNG có ai vừa nộp form thì thôi nghỉ

    let activeCount = 0;
    for (let i = 1; i < queueData.length; i++) {
      if (queueData[i][3] === "PENDING" || queueData[i][3] === "RETRY" || queueData[i][3] === "PROCESSING") activeCount++;
    }
    if (activeCount === 0) return; // Máy chủ tự tắt cực nhanh

    // ====== DEDUPLICATION PRE-PASS ======
    const latestByMssv = {}; // MSSV.toUpperCase() → index trong queueData
    const pendingCountByMssv = {}; // Đếm số lần nộp mới (PENDING) của mỗi MSSV trong batch này
    for (let i = 1; i < queueData.length; i++) {
      const st = queueData[i][3];
      if (st !== "PENDING" && st !== "RETRY" && st !== "PROCESSING") continue;
      try {
        let mssv = queueData[i][4] ? queueData[i][4].toString().trim() : "";
        if (!mssv) {
          // Fallback: nếu form cũ chưa có cột 5 thì parse JSON để lấy
          const p = JSON.parse(queueData[i][1]);
          mssv = StudentService.extractValue(p, ["MSSV", "M\u00e3 s\u1ed1 sinh vi\u00ean"]).toUpperCase().replace(/\s/g, '');
        }
        if (!mssv) continue;

        if (st === "PENDING") {
          pendingCountByMssv[mssv] = (pendingCountByMssv[mssv] || 0) + 1;
        }

        if (!latestByMssv[mssv] || new Date(queueData[i][0]).getTime() >= new Date(queueData[latestByMssv[mssv]][0]).getTime()) {
          latestByMssv[mssv] = i;
        }
      } catch (ignore) { }
    }
    const latestIndexSet = new Set(Object.values(latestByMssv));
    // END DEDUPLICATION

    //PRE-MARK PROCESSING
    const toProcessSet = new Set();
    for (let i = 1; i < queueData.length; i++) {
      const status = queueData[i][3];
      if (status !== "PENDING" && status !== "RETRY" && status !== "PROCESSING") continue;
      if (!latestIndexSet.has(i)) continue;
      toProcessSet.add(i);
      if (toProcessSet.size >= 200) break;
    }

    if (toProcessSet.size > 0) {
      const statusColumn = [];
      for (let i = 1; i < queueData.length; i++) {
        let status = queueData[i][3];
        if (toProcessSet.has(i)) {
          queueData[i][5] = status; // Lưu lại status gốc để phân biệt form mới và script tự chạy lại
          status = "PROCESSING";
        }
        statusColumn.push([status]);
        queueData[i][3] = status;
      }
      queueSheet.getRange(2, 4, statusColumn.length, 1).setValues(statusColumn);
    }
    // ====== END PRE-MARK ======

    const startTime = Date.now();
    const MAX_ROWS_PER_RUN = 200;
    const MAX_API_CALLS_PER_RUN = 40;
    let processedCount = 0;
    let scannedCount = 0;
    let upsertCount = 0;
    let retryCount = 0;
    let errorCount = 0;
    CompanyService.resetApiHitCount();
    let deleteSet = {};
    let retrySet = {};
    let errorSet = {};

    // Lặp Hàng đợi để bốc từng sinh viên ra xử lý
    for (let i = 1; i < queueData.length; i++) {
      if (Date.now() - startTime > 180000 || scannedCount >= MAX_ROWS_PER_RUN) {
        DatabaseRepo.logError("Dừng Batch Job sớm (Quá 3 phút)", "Đã xử lý: " + processedCount + " sinh viên.");
        break;
      }

      let status = queueData[i][3];

      // Nếu dòng này không được chọn xử lý trong lượt này thì bỏ qua
      if (!toProcessSet.has(i)) {
        if (status === "DONE") {
          deleteSet[i + 1] = true;
        } else if ((status === "PENDING" || status === "RETRY" || status === "PROCESSING") && !latestIndexSet.has(i)) {
          // LỌC TRÙNG
          deleteSet[i + 1] = true;
          processedCount++;
        }
        continue;
      }

      // DEDUP
      if (!latestIndexSet.has(i)) {
        deleteSet[i + 1] = true;
        continue;
      }

      scannedCount++;

      let payloadStr = queueData[i][1];
      let formTitle = queueData[i][2];

      try {
        const payload = JSON.parse(payloadStr);
        if (!payload) throw new Error("Payload JSON bị lỗi hoặc không thể phân tích");

        // Xác thực email & MSSV trước khi xử lý
        const emailRaw = StudentService.extractValue(payload, ["Email Sinh Viên", "Địa chỉ email", "Email Address"]);
        if (!emailRaw) throw new Error("Không có email");
        const email = emailRaw.toLowerCase();
        if (!email.endsWith(SYSTEM_CONFIG.ALLOWED_DOMAIN)) throw new Error("Sai Domain");

        const emailPrefix = email.split('@')[0].toUpperCase();
        const inputMssv = StudentService.extractValue(payload, ["MSSV", "Mã số sinh viên"]).toUpperCase().replace(/\s/g, '');
        if (emailPrefix !== inputMssv) throw new Error("Mạo danh MSSV");

        // Chuẩn hóa dữ liệu Form
        const studentData = StudentService.processSubmission(payload);

        // Tra cứu API (chỉ khi cần: có DN, có MST hợp lệ, và chưa được skip bởi upsertStudent)
        let needsRetry = false;
        if (studentData.statusIntern !== "Chưa có doanh nghiệp" && studentData.taxCode && studentData.taxCode !== "N/A") {

          const cleanCode = CompanyService.normalizeTaxCode(studentData.taxCode);

          if (CompanyService.getApiHitCount() < MAX_API_CALLS_PER_RUN) {
            const apiResult = CompanyService.lookupByTaxCode(cleanCode);

            if (apiResult && apiResult.name) {
              studentData.companyApi = apiResult.name;
              studentData.companyEn = apiResult.nameEn || "";
              if (!studentData.address) studentData.address = apiResult.address || "";
              studentData.statusVerify = "Hợp lệ";
            } else if (apiResult === "INVALID_TAX") {
              studentData.companyApi = "Sai MST / Mã ảo";
              studentData.statusVerify = "Sai MST / Mã ảo";
            } else if (apiResult === "NETWORK_ERROR") {
              studentData.statusVerify = "Lỗi mạng VietQR (Chờ quét lại)";
              needsRetry = true;
            }
          } else {
            // Hết quota API lần này: vẫn ghi SV trước, queue giữ lại để đồng bộ lần sau
            studentData.statusVerify = "Chờ đồng bộ MST (xếp hàng)";
            needsRetry = true;
          }
        }

        let originalStatus = queueData[i][5] || status;

        // đánh dấu retry, không phải sinh viên nộp mới
        if (originalStatus === "RETRY" || originalStatus === "PROCESSING") {
          studentData.isSystemRetry = true;
        } else {
          // Lấy số lần sinh viên thực sự nộp bù lại do Deduplication đã gộp dòng
          studentData.pendingCountThisBatch = pendingCountByMssv[inputMssv] || 1;
        }

        // Úp toàn bộ dữ liệu xuống student data
        DatabaseRepo.upsertStudent(studentData, formTitle);
        upsertCount++;

        if (needsRetry) {
          retrySet[i + 1] = true;
          retryCount++;
        } else {
          deleteSet[i + 1] = true;
          processedCount++;
        }

      } catch (e) {
        DatabaseRepo.logError("Lỗi xử lý Queue (Dòng " + (i + 1) + ")", e.message);
        errorSet[i + 1] = true; //Đưa vào danh sách ERROR thay vì Deletes
        errorCount++;
      }
    }

    let dictFlushSuccess = true;
    try {
      CompanyService.flushNewEntries();
    } catch (e) {
      dictFlushSuccess = false;
      DatabaseRepo.logError("Lỗi xả Dictionary (Giữ lại Queue để thử lại)", e.message);
    }

    //Lấy lại trạng thái mới nhất rớt từ trên Sheet vào giây phút hiện tại 
    // Để không ghi đè mất công thao tác tay của Giáo viên (VD sửa ERROR thành RETRY ngay trong lúc script chạy)
    const currentStatusCol = queueData.length > 1 ? queueSheet.getRange(2, 4, queueData.length - 1, 1).getValues() : [];

    // Chuẩn bị mảng trạng thái
    const statusUpdates = [];
    for (let i = 1; i < queueData.length; i++) {
      const rowNo = i + 1;
      if (!dictFlushSuccess && deleteSet[rowNo]) {
        // Nếu Dictionary xả hụt, ta không thể đánh dấu DONE được vì sẽ mất info trên RAM
        statusUpdates.push(["ERROR"]);
      } else if (deleteSet[rowNo]) {
        statusUpdates.push(["DONE"]);
      } else if (retrySet[rowNo]) {
        statusUpdates.push(["RETRY"]);
      } else if (errorSet[rowNo]) {
        statusUpdates.push(["ERROR"]);
      } else if (queueData[i][3] === "PROCESSING") {
        statusUpdates.push(["PENDING"]);
      } else {
        // Dùng trạng thái mới nhất trên sheet thay vì bản clone cũ cách đây 3 phút lấy từ RAM
        let realtimeStatus = (currentStatusCol.length >= i) ? currentStatusCol[i - 1][0] : queueData[i][3];
        statusUpdates.push([realtimeStatus]);
      }
    }

    //Lưu Data sinh viên thành công thì mới được phép cập nhật Queue_Data
    let flushSuccess = true;
    if (upsertCount > 0) {
      try {
        DatabaseRepo.flushStudents();
      } catch (e) {
        flushSuccess = false;
        DatabaseRepo.logError("Lỗi khi flushStudents (Nguy cơ mất data)", e.message);

        // Đảo ngược trạng thái DONE thành ERROR để giữ an toàn trong Queue
        for (let j = 0; j < statusUpdates.length; j++) {
          if (statusUpdates[j][0] === "DONE") {
            statusUpdates[j][0] = "ERROR";
          }
        }
      }
    }

    //ghi mảng trạng thái xuống Sheet Queue
    if (statusUpdates.length > 0) {
      queueSheet.getRange(2, 4, statusUpdates.length, 1).setValues(statusUpdates);
    }

    DatabaseRepo.logError(
      "Tổng kết Batch Job",
      "Scanned=" + scannedCount +
      ", Upsert=" + upsertCount +
      ", ApiCalls=" + CompanyService.getApiHitCount() +
      ", Deleted=" + (flushSuccess ? processedCount : 0) +
      ", Retry=" + retryCount +
      ", Error=" + (flushSuccess ? errorCount : errorCount + processedCount) +
      ", QueueRemaining=" + (queueData.length - 1)
    );
  } finally {
    jobLock.releaseLock();
  }
}


//  Menu tiện ích trên Google Sheet
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("🎓 Quản lý Thực tập")
    .addItem("⚡ Bật Tự động xử lý (1 phút/lần)", "enableAutoProcessing")
    .addItem("⛔ Tắt tự động xử lý", "disableAutoProcessing")
    .addItem("🧹 Cài Trigger dọn rác ban đêm", "setupNightlyCleanupTrigger")
    .addSeparator()
    .addItem("📊 Cập nhật Dashboard & DS Chưa Công ty", "refreshDashboard")
    .addItem("📝 Khởi tạo Header", "initHeaders")
    .addItem("📋 Tạo Form chuẩn", "createStandardForm")
    .addItem("🧠 Tạo báo cáo Gemini AI", "generateGeminiReport")
    .addSeparator()
    .addItem("Giả lập 400 Sinh viên nộp Form (Test Tải)", "simulate400FormSubmits")
    .addItem("Xóa toàn bộ Cache API (Dùng để Test)", "clearSystemCache")
    .addToUi();
}

function clearTriggerByName_(functionName) {
  const triggers = ScriptApp.getProjectTriggers();
  let removed = 0;
  for (let i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === functionName) {
      ScriptApp.deleteTrigger(triggers[i]);
      removed++;
    }
  }
  return removed;
}

function enableAutoProcessing() {
  const ui = SpreadsheetApp.getUi();
  const removed = clearTriggerByName_("processQueueJob");

  ScriptApp.newTrigger("processQueueJob")
    .timeBased()
    .everyMinutes(1)
    .create();

  ui.alert(
    "✅ ĐÃ BẬT CHẾ ĐỘ AUTO.\n" +
    "Trigger cũ đã gỡ: " + removed + "\n" +
    "Trigger mới: processQueueJob mỗi 1 phút.",
    ui.ButtonSet.OK
  );
}

function disableAutoProcessing() {
  const ui = SpreadsheetApp.getUi();
  const removed = clearTriggerByName_("processQueueJob");

  ui.alert(
    removed > 0
      ? "✅ Đã tắt tự động xử lý. Đã gỡ " + removed + " trigger."
      : "ℹ️ Không có trigger tự động nào để tắt.",
    ui.ButtonSet.OK
  );
}

//Bơm 400 Form siêu tốc vào Queue để Test nghẽn cổ chai
function simulate400FormSubmits() {
  const ui = SpreadsheetApp.getUi();
  const confirm = ui.alert(
    "Giả lập 400 Form",
    "Chức năng này sẽ BƠM 400 data giả (Gồm MST đúng, MST sai và MSSV trùng lặp) vào Hàng Đợi (Queue_Data) trong nháy mắt để kiểm tra sức chịu tải của Hệ Thống.\n\nBạn có muốn tiếp tục?",
    ui.ButtonSet.YES_NO
  );

  if (confirm !== ui.Button.YES) return;

  const queueSheet = DatabaseRepo.connect(SYSTEM_CONFIG.QUEUE_TAB_NAME);
  ensureQueueSheetHeader_(queueSheet);
  const fakeData = [];
  const testCompanies = [
    "319515814", "319514627", "319514426", "319514313", "319513743", "319513662", "319513373", "319513366", "319513084", "319513052", "319513045", "319512940", "319512926", "319512764", "319512637", "319512588", "319512556", "319512531", "319512524", "319512210", "319512122", "319512098", "319512066", "319511908", "319511866", "319511707", "319511633", "319511601", "319511584", "319511545", "319511351", "319511344", "319511256", "319511249", "319511168", "319511150", "319511143", "319511136", "319511087", "319511055", "319510982", "319510975", "319510943", "319510936", "319510929", "319510904", "319510816", "319510767", "319510742", "319510710", "319510686", "319510654", "319510647", "319510622", "319510615", "319510566", "319510527", "319510439", "319510340", "319510284", "319510189", "319510100", "319510037", "319509923", "319509916", "319509909", "319509899", "319509867", "319509793", "319509641", "319509602", "319509560", "319509553", "319509521", "319509497", "319509458", "319509440", "319509401", "319509352", "319509313", "319509296", "319509264", "319509232", "319509225", "319509190", "319509176", "319509151", "319509137", "319509105", "319509063", "319508976", "319508951", "319508863", "319508768", "319508743", "319508623", "319508599", "319508528", "319508510", "319508503", "319505728", "319505710", "319505615", "319505598", "319505541", "319505534", "319505527", "319505502", "319505439", "319505397", "319505372", "319505365", "319505326", "319505277", "319505213", "319505206", "319505118", "319505100", "319505090", "319505076", "319505051", "319505037", "319505012", "319505005", "319504925", "319504918", "319504900", "319504876", "319504851", "319504795", "319504770", "319504675", "319504643", "319504604", "319504587", "319504481", "319504474", "319504435", "319504428", "319504410", "319504393", "319504386", "319504379", "319504347", "319504322", "319504308", "319504241", "319504234", "319504192", "319504160", "319504153", "319504146", "319504114", "319504107", "319504072", "319504058", "319504001", "319503985", "319503978", "319503960", "319503953", "319503939", "319503921", "319503914", "319503872", "319503865", "319503858", "319503840", "319503819", "319503784", "319503752", "319503720", "319503625", "319503583", "319503544", "319503512", "319503505", "319503375", "319503343", "319503311", "319503304", "319503287", "319503216", "319503209", "319503167", "319503135", "319503128", "319502999", "319502981", "319502974", "319502935", "319502903", "319502879", "319502854", "319502847", "319502822", "319502808", "319502798", "319502780", "319502766", "319495808", "319495798", "319495780", "319495766", "319495759", "319495741", "319495734", "319495727", "319495702", "319495692", "319495685", "319495678", "319495660", "319495646", "319495639", "319495621", "319495614", "319495607", "319495597", "319495572", "319495565", "319495558", "319495540", "319495533", "319495519", "319495501", "319495491", "319495484", "319495477", "319495452", "319495445", "319495438", "319495420", "319495413", "319495406", "319495396", "319495389", "319495371", "319495364", "319495357", "319495332", "319495325", "319495290", "319495269", "319495251", "319495244", "319495237", "319495205", "319495195", "319495188", "319495170", "319495163", "319495156", "319495149", "319495131", "319495124", "319495117", "319495075", "319495068", "319495050", "319495043", "319495036", "319495029", "319495011", "319495004", "319494995", "319494988", "319494970", "319494963", "319494956", "319494949", "319494931", "319494924", "319494917", "319494882", "319494875", "319494868", "319494850", "319494843", "319494836", "319494829", "319494804", "319494794", "319494787", "319494762", "319494755", "319494748", "319494730", "319494723", "319494716", "319494709", "319494699", "319494681", "319494674", "319494667", "319494642", "319494635", "319494628", "319494610", "319494603", "319485782", "319485775", "319485768", "319485750", "319485743", "319485736", "319485729", "319485711", "319485704", "319485694", "319485687", "319485662", "319485655", "319485648", "319485630", "319485623", "319485616", "319485609", "319485599", "319485581", "319485574", "319485567", "319485542", "319485535", "319485528", "319485510", "319485503", "319485493", "319485454", "319485447", "319485422", "319485415", "319485408", "319485398", "319485380", "319485373", "319485366", "319485359", "319485341", "319485334", "319485327", "319485302", "319485292", "319485285", "319485278", "319485260", "319485253", "319485246", "319485239", "319485221", "319485214", "319485207", "319485197", "319485172", "319485165", "319485158", "319485140", "319485133", "319485126", "319485119", "319485101", "319485091", "319485084", "319485077", "319485052", "319485045", "319485038", "319485020", "319485013", "319485006", "319484997", "319484972", "319484965", "319484958", "319484940", "319484933", "319484926", "319484919", "319484901", "319484891", "319484884", "319484877", "319484852", "319484845", "319484838", "319484820", "319484813", "319484806", "319484796", "319484789", "319484771", "319484764", "319484757", "319484732", "319484725", "319484718", "319484700", "319484690", "319484683", "319484676"
  ];


  for (let i = 1; i <= 400; i++) {
    // Tăng lên 100 MSSV khác nhau để không vứt bỏ mất 30 MST do thuật toán Deduplication lọc top 50
    // let mssv = "520H00" + (i % 100); 
    // let taxCode = testCompanies[i % testCompanies.length]; // Xoay vòng 80 MST

    // Tạo 400 MSSV khác nhau để đảm bảo mỗi MSSV là một dòng (không bị deduplication dồn dòng)
    let mssv = "520H0" + i.toString().padStart(3, '0');
    let taxCode = testCompanies[i % testCompanies.length]; // Xoay vòng 400 MST

    let mockPayload = {
      "Email Sinh Viên": [mssv.toLowerCase() + "@student.tdtu.edu.vn"],
      "MSSV": [mssv],
      //"Họ và Tên": ["Sinh Viên Test " + (i % 100)],
      "Họ và Tên": ["Sinh Viên Test " + i],
      "Học phần": ["Tập sự nghề nghiệp"],
      "Học kỳ - Năm học": ["HK2 - 2026"],
      "Trạng thái thực tập": [taxCode ? "Đã có doanh nghiệp" : "Chưa có doanh nghiệp"],
      "Mã số thuế": [taxCode],
      "Tên Doanh Nghiệp (Tự viết)": ["Tên bừa bãi"],
      "Địa chỉ": ["123 Đường Test"],
      "Website": ["test.com"],
      "Thông tin liên hệ (Email công ty)": ["hr@test.com"]
    };

    fakeData.push([new Date(), JSON.stringify(mockPayload), "Form Test Auto", "PENDING", mssv]);
  }

  // Khắc phục Max Rows (tránh Out of bounds)
  const currentRows = queueSheet.getMaxRows();
  const lastRow = queueSheet.getLastRow();
  const targetRows = lastRow + fakeData.length;
  if (targetRows > currentRows) {
    queueSheet.insertRowsAfter(currentRows, targetRows - currentRows);
  }

  queueSheet.getRange(queueSheet.getLastRow() + 1, 1, fakeData.length, 5).setValues(fakeData);

  ui.alert("✅ Đã BƠM xong 400 Sinh viên vào hàng đợi Queue_Data");
}

function clearSystemCache() {
  const ui = SpreadsheetApp.getUi();
  const confirm = ui.alert(
    "Cảnh báo Xóa Cache",
    "Thao tác này sẽ xóa toàn bộ bộ nhớ đệm (Cache) của hệ thống chứa kết quả tra cứu API VietQR.\n" +
    "Các lần kiểm tra MST tiếp theo đối với các công ty đã từng tra cứu sẽ BẮT BUỘC phải gọi lại API thực tế (mất nhiều thời gian hơn).\n\n" +
    "Dùng chức năng này khi bạn muốn Kiểm thử (Stress-Test) khả năng chịu tải API của hệ thống.\n\n" +
    "Bạn có chắc chắn muốn xóa Cache?",
    ui.ButtonSet.YES_NO
  );

  if (confirm === ui.Button.YES) {
    const sheet = DatabaseRepo.connect(SYSTEM_CONFIG.DATA_TAB_NAME);
    const data = sheet.getDataRange().getValues();
    const cache = CacheService.getScriptCache();
    let count = 0;

    // Quét toàn bộ MST trong bảng và xóa key tương ứng trong Cache
    for (let i = 1; i < data.length; i++) {
      let tax = data[i][SYSTEM_CONFIG.COL.TAX_CODE];
      if (tax && tax !== "N/A" && tax !== "") {
        const cleanCode = CompanyService.normalizeTaxCode(tax);
        cache.remove("BIZ_" + cleanCode);
        count++;
      }
    }

    ui.alert("✅ Đã xóa " + count + " khóa Cache. Bạn có thể bắt đầu Test tra cứu API từ đầu!");
  }
}

function refreshDashboard() {
  DatabaseRepo.generateStatistics();
  SpreadsheetApp.getUi().alert("✅ Dashboard và Danh sách SV Chưa có công ty đã cập nhật!");
}

function initHeaders() {
  DatabaseRepo.initHeaders();
  SpreadsheetApp.getUi().alert("✅ Header đã được khởi tạo!");
}

// trigger dọn dẹp ban đem
function cleanupQueueNightly() {
  const lock = LockService.getDocumentLock();
  if (!lock.tryLock(30000)) return; // Nếu kẹt thì thôi đêm mai dọn

  try {
    const sheet = DatabaseRepo.connect(SYSTEM_CONFIG.QUEUE_TAB_NAME);
    const data = sheet.getDataRange().getValues();
    if (data.length <= 1) return;

    // Xoá khối liên tục thay vì gọi vòng lặp xóa từng dòng gây lỗi Timeout 6 phút
    let totalDeleted = 0;
    let blocks = [];
    let count = 0;

    for (let i = data.length - 1; i >= 1; i--) {
      if (data[i][3] === "DONE") {
        count++;
      } else {
        if (count > 0) {
          blocks.push({ start: i + 2, numRows: count });
          count = 0;
        }
      }
    }
    if (count > 0) {
      blocks.push({ start: 2, numRows: count });
    }

    // Tiến hành gọi API bằng mảng khối đã ghi
    for (let b of blocks) {
      sheet.deleteRows(b.start, b.numRows);
      totalDeleted += b.numRows;
    }

    if (totalDeleted > 0) {
      DatabaseRepo.logError("Garbage Collector", "Đã dọn dẹp " + totalDeleted + " dòng rác (DONE).");
    }

    // Refresh Dashboard and No Company List every night automatically
    DatabaseRepo.generateStatistics();

  } catch (e) {
    console.error("Lỗi dọn rác ban đêm: " + e.message);
  } finally {
    lock.releaseLock();
  }
}

function setupNightlyCleanupTrigger() {
  clearTriggerByName_("cleanupQueueNightly");
  ScriptApp.newTrigger("cleanupQueueNightly")
    .timeBased().everyDays(1).atHour(4).create(); // Chạy lúc 4h sáng

  cleanupQueueNightly();
  SpreadsheetApp.getUi().alert("✅ Đã cài đặt tự động dọn rác (DONE) trong hàng đợi vào 2h sáng mỗi ngày!");
}
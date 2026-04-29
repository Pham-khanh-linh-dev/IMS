(async function testWebAppLoadExact() {
    console.log("BẮT ĐẦU BẮN 50 REQUEST CHUẨN FORM VÀO WEBAPP CÙNG LÚC...");

    // Nút giả để không bị lỗi UI khi hàm sendWithRetry cố đổi chữ "Đang gửi..."
    let mockBtn = document.createElement('button');

    // 3 Mã Số Thuế có thật dùng để luân phiên mồi API VietQR 
    // (kiểm tra luôn khả năng tra cứu API không bị sập khi load cao)
    const testTaxCodes = ["0100686174", "0312211516", ""];

    for (let i = 1; i <= 50; i++) {
        // Sinh MSSV tăng dần: 520H001 -> 520H050
        let mssvStr = "520H0" + i.toString().padStart(3, '0');
        let taxCode = testTaxCodes[i % 3]; // Xoay vòng MST

        let studentData = {
            email: mssvStr.toLowerCase() + "@student.tdtu.edu.vn",
            mssv: mssvStr,
            fullName: "SV Load Test " + i,
            course: "Tập sự nghề nghiệp",
            semester: "HK2",
            schoolYear: "2025-2026",
            status: taxCode !== "" ? "Đã có doanh nghiệp" : "Chưa có doanh nghiệp",
            taxCode: taxCode,
            companyName: taxCode !== "" ? "Doanh nghiệp tự nhập Test" : "",
            companyAddress: "",
            companyWebsite: "test.com",
            companyEmail: "hr@test.com"
        };

        // Bắn trực tiếp qua hàm chống nghẽn Front-end (cho phép thử lại tối đa 5 lần)
        sendWithRetry(studentData, mockBtn, "Gửi", 5);

        console.log(`Đã đẩy SV ${mssvStr} vào luồng bắn Data...`);
    }
})();
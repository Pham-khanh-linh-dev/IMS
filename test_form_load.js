const NUMBER_OF_REQUESTS = 50;
let successCount = 0;
let errorCount = 0;

console.log(`Bắt đầu bắn ${NUMBER_OF_REQUESTS} request vào Google Form CÙNG MỘT LÚC...`);

const requests = [];

for (let i = 0; i < NUMBER_OF_REQUESTS; i++) {
    // 1. URL VÀ PAYLOAD THẬT ĐƯỢC ĐƯA VÀO ĐÂY
    const req = fetch("https://docs.google.com/forms/d/e/1FAIpQLSdkNhzs-4FtY7GDYReos14BfFRhRLpVlVrPJOffwrUA4HVnMw/formResponse", {
        "headers": {
            "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
            "accept-language": "vi-VN,vi;q=0.9",
            "cache-control": "max-age=0",
            "content-type": "application/x-www-form-urlencoded",
            "priority": "u=0, i",
            "sec-ch-ua": "\"Google Chrome\";v=\"147\", \"Not.A/Brand\";v=\"8\", \"Chromium\";v=\"147\"",
            "sec-ch-ua-arch": "\"x86\"",
            "sec-ch-ua-bitness": "\"64\"",
            "sec-ch-ua-full-version-list": "\"Google Chrome\";v=\"147.0.7727.116\", \"Not.A/Brand\";v=\"8.0.0.0\", \"Chromium\";v=\"147.0.7727.116\"",
            "sec-ch-ua-mobile": "?0",
            "sec-ch-ua-model": "\"\"",
            "sec-ch-ua-platform": "\"Windows\"",
            "sec-ch-ua-platform-version": "\"19.0.0\"",
            "sec-ch-ua-wow64": "?0",
            "sec-fetch-dest": "document",
            "sec-fetch-mode": "navigate",
            "sec-fetch-site": "same-origin",
            "sec-fetch-user": "?1",
            "upgrade-insecure-requests": "1",
            "x-browser-channel": "stable",
            "x-browser-copyright": "Copyright 2026 Google LLC. All Rights Reserved.",
            "x-browser-validation": "Mlh0w3o4mtkqhwvc8Z4V2nYNhc8=",
            "x-browser-year": "2026"
        },
        "referrer": "https://docs.google.com/forms/d/e/1FAIpQLSdkNhzs-4FtY7GDYReos14BfFRhRLpVlVrPJOffwrUA4HVnMw/formResponse",
        "body": "fvv=1&partialResponse=%5B%5B%5Bnull%2C1786119325%2C%5B%2252100908%22%5D%2C0%5D%2C%5Bnull%2C236784568%2C%5B%22d%22%5D%2C0%5D%2C%5Bnull%2C865086978%2C%5B%22Ki%E1%BA%BFn+t%E1%BA%ADp+c%C3%B4ng+nghi%E1%BB%87p%22%5D%2C0%5D%2C%5Bnull%2C1166938951%2C%5B%22H%E1%BB%8Dc+K%E1%BB%B3+1%22%5D%2C0%5D%2C%5Bnull%2C1992429118%2C%5B%222026+-+2027%22%5D%2C0%5D%2C%5Bnull%2C706996274%2C%5B%22Ch%C6%B0a+c%C3%B3+doanh+nghi%E1%BB%87p%22%5D%2C0%5D%5D%2Cnull%2C%223155315602092065613%22%5D&pageHistory=0%2C-3&fbzx=3155315602092065613&submissionTimestamp=1777305774440",
        "method": "POST",
        "mode": "cors",
        "credentials": "include"
    }).then(res => {
        successCount++;
        process.stdout.write("✅");
    }).catch(err => {
        errorCount++;
        process.stdout.write("❌");
    });

    requests.push(req);
}

// Chạy cả 50 luồng ĐỒNG THỜI 100%
Promise.all(requests).then(() => {
    console.log(`\n\n KẾT QUẢ GỬI FORM LÊN MÁY CHỦ GOOGLE:`);
    console.log(`- Google Form báo nhận thành công: ${successCount}`);
    console.log(`- Google Form báo lỗi mạng rớt: ${errorCount}`);
    console.log(`\n KẾT LUẬN QUAN TRỌNG: Mở Google Sheet (file Excel) lên xem ngay tab Queue_Data. Sẽ có sự chênh lệch (Lọt Sổ) vì Trigger bị bóp!`);
});
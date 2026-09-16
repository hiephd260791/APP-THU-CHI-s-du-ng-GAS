Hướng dẫn cài đặt & sử dụng — Hệ thống Quản lý Chi tiêu Gia đình
Hệ thống chạy hoàn toàn trên Google Sheets + Google Apps Script (miễn phí, không cần server ngoài). Gồm 3 file mã nguồn:

File
Vai trò
Code.gs
Toàn bộ logic backend (đọc/ghi dữ liệu, tính toán, gửi email)
Dashboard.html
Trang tổng quan — biểu đồ, ngân sách, Tenpai, cho vay, theo dõi Lottery/PSA
FormNhap.html
Form nhập chi tiêu nhanh, tối ưu cho điện thoại



1. Cài đặt lần đầu
Bước 1 — Mở Apps Script Editor
Mở Google Sheet của bạn → menu Extensions (Tiện ích mở rộng) → Apps Script.
Bước 2 — Dán code
Trong file Code.gs có sẵn (hoặc tạo mới), xoá hết nội dung cũ, dán toàn bộ nội dung file Code.gs được cung cấp vào.
Tạo thêm 2 file HTML: bấm dấu + cạnh "Files" → HTML → đặt tên chính xác là Dashboard (Apps Script tự thêm đuôi .html) → dán nội dung Dashboard.html vào.
Làm tương tự để tạo file FormNhap → dán nội dung FormNhap.html vào.
Bấm Lưu (biểu tượng đĩa mềm hoặc Ctrl+S).

⚠️ Tên file HTML phải đúng tuyệt đối là Dashboard và FormNhap (không dấu, không khoảng trắng) vì code gọi thẳng tên này.
Bước 3 — Chạy khởi tạo sheet
Trong Apps Script Editor, ở thanh công cụ trên cùng, chọn hàm ensureSheets_ ở ô dropdown, bấm Run (▶).

Lần đầu chạy, Google sẽ hiện màn hình xin cấp quyền:

Bấm Review permissions
Chọn tài khoản Google của bạn
Nếu hiện cảnh báo "Google chưa xác minh ứng dụng" → bấm Advanced (Nâng cao) → Go to [tên project] (unsafe) → Allow

Đây là cảnh báo bình thường vì đây là script riêng của bạn, không phải ứng dụng public.

Sau khi chạy xong, quay lại Google Sheet, bạn sẽ thấy tự động xuất hiện các sheet:

Transactions — sổ giao dịch chính (nếu bạn đã có sẵn dữ liệu cũ, hệ thống không đụng vào, chỉ thêm cột còn thiếu)
Settings — danh mục Thu/Chi + các ô cấu hình
ChoVay — quản lý cho vay
TheoDoiHang — theo dõi Lottery (Chusen) & Chấm PSA
Bước 4 — Khai báo danh mục (nếu Settings đang trống)
Mở sheet Settings, nhập vào:

Cột A (từ A2): danh mục Thu nhập, ví dụ Tiền lương, Tiền thưởng, Tiền tenpai
Cột B (từ B2): danh mục Chi tiêu, ví dụ Tiền siêu thị, Tiền combini, Tiền xăng, Tiền điện, Nước, Gas, Internet, Điện thoại, Tiền mua đồ tenpai, Tiền gửi chăm con, Tiền gửi bố mẹ, Tiền ăn với công ty...

Nếu bạn đã từng chạy ensureSheets_ rồi, 2 danh mục Tiền lottery/PSA tenpai và Tiền bóc pack combini sẽ được tự động thêm vào cột B — không cần gõ tay.
Bước 5 — Tải lại Google Sheet
Bấm F5 hoặc tải lại trang. Bạn sẽ thấy menu mới: 💰 Quản lý chi tiêu với 2 mục:

📊 Mở Dashboard
✏️ Nhập chi tiêu

Đây là cách mở nhanh nhất, không cần deploy Web App, và luôn hiển thị đúng code mới nhất mỗi khi bạn sửa code.
Bước 6 (tuỳ chọn) — Deploy Web App để mở qua link/điện thoại
Nếu muốn có 1 đường link riêng (dùng để mở trên điện thoại, thêm vào màn hình chính...):

Góc trên phải Apps Script Editor → Deploy → New deployment
Bấm biểu tượng bánh răng cạnh "Select type" → chọn Web app
Execute as: Me (chính bạn)
Who has access: "Only myself" (chỉ mình bạn) hoặc "Anyone with the link" (nếu muốn mở trên điện thoại không cần đăng nhập)
Bấm Deploy, cấp quyền nếu được hỏi
Copy URL — đó là link Dashboard; thêm ?page=form vào cuối URL để có link Form nhập nhanh

⚠️ Rất quan trọng: mỗi lần bạn (hoặc tôi) sửa code sau này, link Web App KHÔNG tự cập nhật. Bạn phải vào Deploy → Manage deployments → bấm biểu tượng bút chì ✏️ trên deployment đang dùng → mục Version chọn New version → Deploy. Việc này giữ nguyên URL cũ nhưng nạp code mới. Nếu chỉ dùng menu trong Sheet (Bước 5) thì không gặp vấn đề này.


2. Cấu trúc dữ liệu
Sheet Transactions
Ngày
Loại
Danh mục
Số tiền
Ghi chú
Tên sản phẩm
2026-09-01
Chi tiêu
Tiền siêu thị
5000
Mua đồ ăn




Cột Tên sản phẩm chỉ cần điền khi danh mục liên quan đến Tenpai (xem mục 4).
Sheet Settings
Cột
Ý nghĩa
A
Danh mục Thu nhập
B
Danh mục Chi tiêu
D1/D2
Nhãn / Hạn mức ngân sách ăn uống mỗi tháng (mặc định 20.000¥)
F1:G1, F2:G...
Danh mục cần giới hạn ngân sách riêng + hạn mức/tháng (bạn tự khai báo)
H1/H2
Email nhận báo cáo tự động (để trống = dùng email tài khoản Google này)

Sheet ChoVay (quản lý cho vay)
Ngày cho vay
Tên người vay
Số tiền
Hạn trả
Ngày đã trả
Ghi chú


Để trống Ngày đã trả nghĩa là khoản vay vẫn đang chờ thu hồi.
Sheet TheoDoiHang (theo dõi Lottery/PSA)
Ngày ghi nhận
Loại
Tên sản phẩm
Số tiền đã trả
Ngày dự kiến về
Trạng thái
Ghi chú


Sheet này được ghi tự động khi bạn thêm đơn Lottery/PSA từ Form hoặc Dashboard — bạn không cần tự nhập tay ở đây, chỉ cần vào sửa cột Trạng thái nếu muốn (hoặc dùng nút "Đã về" trên Dashboard).


3. Sử dụng hàng ngày
Nhập chi tiêu nhanh (Form)
Mở qua menu 💰 Quản lý chi tiêu → ✏️ Nhập chi tiêu.

Chọn Thu nhập hoặc Chi tiêu
Bấm chọn danh mục (nút to, dễ bấm trên điện thoại)
Một số danh mục đặc biệt sẽ tự hiện thêm ô:
Tenpai / Lottery/PSA / Bóc pack combini → hiện ô Tên sản phẩm (có gợi ý autocomplete từ các tên đã nhập trước đó — gõ vài ký tự sẽ thấy danh sách hiện ra, giúp tránh gõ lệch tên giữa lúc mua và lúc bán)
Riêng danh mục Lottery/PSA → hiện thêm ô chọn Loại (Lottery/Chấm PSA) và Ngày dự kiến về hàng (tự gợi ý +4,5 tháng cho PSA, +1 tháng cho Lottery, bạn có thể sửa lại hoặc để trống)
Bóc pack combini → ô Tên sản phẩm không bắt buộc (vì bóc mù, có thể chưa biết trúng thẻ gì)
Nhập số tiền (có nút cộng nhanh +1.000/+3.000/+5.000/+10.000), chọn ngày, ghi chú
Bấm Lưu giao dịch
Xem Dashboard
Mở qua menu 💰 Quản lý chi tiêu → 📊 Mở Dashboard. Gồm các phần:

KPI năm — tổng thu/chi/số dư năm, chi ăn uống tháng hiện tại
Tổng quan tháng này — thu/chi/tiết kiệm/tỷ lệ tiết kiệm của tháng đang xem, kèm mũi tên ▲▼ so với tháng trước (MoM)
Biểu đồ thu–chi theo tháng — bấm vào 1 cột để xem chi tiết tháng đó
Ngân sách ăn uống — thanh tiến độ + cảnh báo vàng (≥80%) / đỏ (≥100%)
Cơ cấu chi tiêu — biểu đồ tròn theo danh mục trong tháng
Ngân sách theo danh mục — tự hiện 1 thanh tiến độ cho mỗi danh mục bạn đã khai báo ở Settings!F2:G
Xu hướng nhiều năm theo danh mục — chọn 1 danh mục ở dropdown để xem biểu đồ đường trải dài toàn bộ lịch sử
Chi tiết giao dịch — bảng đầy đủ giao dịch trong tháng
Lời lãi kinh doanh Tenpai — xem mục 4 bên dưới
Quản lý cho vay — xem mục 5
Theo dõi Lottery/PSA — xem mục 6
Cài đặt báo cáo — đổi email nhận báo cáo (xem mục 7)


4. Kinh doanh Tenpai (mua đi bán lại)
Nguyên tắc: khớp lời/lãi theo đúng "Tên sản phẩm" bạn nhập — không quan tâm mua và bán cách nhau bao lâu hay khác quý/năm. Lời/lãi được tính vào quý bán hàng gần nhất.

Có 3 nguồn chi phí đều được gộp chung vào 1 báo cáo:

Tiền mua đồ tenpai — mua hàng thường để bán lại (Tên sản phẩm bắt buộc)
Tiền lottery/PSA tenpai — trả tiền khi trúng Lottery hoặc gửi thẻ đi chấm PSA (Tên sản phẩm bắt buộc, có kèm theo dõi ngày về hàng — xem mục 6)
Tiền bóc pack combini — mua bóc pack tại combini (Tên sản phẩm không bắt buộc, để trống nếu chưa biết trúng gì)

Khi bán, luôn ghi vào danh mục Tiền tenpai (Thu nhập), Tên sản phẩm phải giống hệt tên lúc mua thì mới khớp được.

Cách đọc bảng kết quả:

Đã bán — hiện chi phí, doanh thu, lời/lỗ, và % lãi trên vốn
Đang chờ bán — hàng đã mua nhưng chưa có doanh thu, không tính là lỗ; nếu quá 60 ngày chưa bán sẽ bị gắn nhãn đỏ "TỒN LÂU" kèm cảnh báo tổng số món tồn lâu


5. Quản lý cho vay
Ghi lại các khoản bạn cho người khác vay ở sheet ChoVay hoặc form "➕ Thêm khoản cho vay mới" ngay trên Dashboard.

Đang cho vay = tổng các khoản chưa có Ngày đã trả
Quá hạn = khoản chưa trả VÀ đã qua Hạn trả + 15 ngày. Khi đó Dashboard hiện banner đỏ cảnh báo và số ngày quá hạn cụ thể
Khi người vay trả tiền, bấm nút "Đã trả" ngay trên bảng — hệ thống tự ghi ngày hôm nay vào cột Ngày đã trả


6. Theo dõi Lottery (Chusen) & Chấm PSA
Mỗi khi bạn trúng Lottery hoặc gửi thẻ đi chấm PSA và trả tiền, hệ thống ghi 1 lúc 2 nơi:

Một dòng chi phí thật vào Transactions (danh mục "Tiền lottery/PSA tenpai") — tự động tính vào lời/lãi Tenpai
Một dòng theo dõi vào TheoDoiHang — lưu ngày dự kiến về hàng + trạng thái

Bạn có thể thêm đơn theo dõi từ Form nhập chi tiêu (mục 3) hoặc từ form "➕ Thêm đơn theo dõi mới" trên Dashboard — cả 2 chỗ đều tương đương.

Đang chờ — chưa tới ngày dự kiến, bình thường
Trễ hẹn (cảnh báo vàng) — đã qua ngày dự kiến mà bạn chưa đánh dấu về hàng
Khi hàng thực sự về, bấm nút "Đã về" trên bảng để tắt cảnh báo — không ảnh hưởng gì đến chi phí đã ghi trước đó, chỉ là cập nhật trạng thái theo dõi


7. Báo cáo & nhắc nhở tự động qua email
Có 3 loại, đều cần bạn tự kích hoạt lịch chạy (chỉ cần làm 1 lần):

Hàm
Nội dung
Lịch mặc định
sendWeeklyReportEmail
Tổng kết thu/chi/tiết kiệm tuần vừa qua (Thứ 2 → Chủ nhật) + luỹ kế ăn uống trong tháng
8h sáng Thứ 2 hàng tuần
checkDailyReminder
Nhắc nhở nếu hôm đó chưa nhập giao dịch nào
20h mỗi ngày
sendDailyReportEmail
Báo cáo đầy đủ cuối ngày (giống snapshot Dashboard: KPI tháng, giao dịch hôm nay, ngân sách, Tenpai, cho vay, Lottery/PSA) kèm file PDF đính kèm
Bạn tự chọn giờ

Kích hoạt báo cáo tuần + nhắc nhập liệu
Trong Apps Script Editor, chọn hàm setupTriggers ở dropdown → Run. Chạy lại nhiều lần vẫn an toàn (không bị nhân đôi lịch).
Kích hoạt báo cáo cuối ngày (kèm PDF)
Hàm này cần tự thiết lập riêng vì bạn muốn tự chọn giờ chạy:

Trong Apps Script Editor, bấm biểu tượng đồng hồ (Triggers) ở thanh bên trái
Add Trigger
Choose function: sendDailyReportEmail
Event source: Time-driven
Type: Day timer → chọn khung giờ buổi tối bạn muốn (vd 21h–22h)
Save

Lần đầu chạy sendDailyReportEmail (thủ công hoặc qua trigger), Google sẽ hỏi cấp thêm quyền Google Docs/Drive — đây là quyền cần thiết để tạo và tự xoá file PDF tạm, không phải lỗi.
Đổi email nhận báo cáo
Mặc định cả 3 loại email đều gửi tới email tài khoản Google đang mở Sheet. Muốn đổi sang email khác: mở Dashboard, cuộn xuống card "⚙️ Cài đặt báo cáo", nhập email mới, bấm Lưu. Để trống ô này rồi Lưu để quay lại dùng email tài khoản Google.


8. Xử lý sự cố thường gặp
Dashboard trống trơn, không có biểu đồ → Kiểm tra kết nối mạng (Chart.js tải từ CDN). Nếu vẫn không được, mở Console trình duyệt (F12) xem lỗi cụ thể.

Form nhập liệu báo "Vui lòng chọn danh mục" dù đã chọn / danh mục trống → Sheet Settings cột A/B (từ dòng 2) đang trống hoặc sai tên sheet. Kiểm tra lại đúng tên sheet là Settings và có dữ liệu từ A2/B2 trở xuống.

Sửa code xong mà giao diện không đổi gì → Nếu bạn mở qua link Web App (dạng .../exec), code sửa xong không tự cập nhật vào link đó — phải vào Deploy → Manage deployments → sửa deployment đang dùng → Version: New version → Deploy (xem lại Bước 6). Cách chắc ăn nhất để luôn thấy code mới nhất: mở qua menu 💰 Quản lý chi tiêu ngay trong Sheet.

Không nhận được email báo cáo → Kiểm tra: (1) đã chạy setupTriggers (cho báo cáo tuần + nhắc nhập liệu) hoặc tự tạo trigger cho sendDailyReportEmail chưa; (2) vào biểu tượng đồng hồ Triggers xem trigger có báo lỗi (chấm đỏ) không; (3) kiểm tra thư mục Spam; (4) nếu vừa đổi email nhận báo cáo, xác nhận đã bấm Lưu thành công ở card Cài đặt báo cáo.

Ngân sách theo danh mục / Lời lãi Tenpai không hiện dữ liệu như mong đợi → Ngân sách theo danh mục cần bạn tự khai báo ở Settings!F2:G (không tự sinh). Lời lãi Tenpai cần Tên sản phẩm ở dòng mua và dòng bán giống hệt nhau từng ký tự — gõ lệch 1 chữ cũng không khớp được (dùng gợi ý autocomplete ở Form để tránh lỗi này).



Tài liệu này mô tả đúng phiên bản Code.gs / Dashboard.html / FormNhap.html đã bàn giao gần nhất. Khi có thêm tính năng mới, tài liệu có thể cần cập nhật lại.


/**
 * ============================================================
 *  QUẢN LÝ CHI TIÊU GIA ĐÌNH - Google Apps Script Backend
 * ============================================================
 * Khớp với cấu trúc sheet đã có sẵn:
 *   - Sheet "Transactions": Ngày | Loại | Danh mục | Số tiền | Ghi chú
 *   - Sheet "Settings"    : cột A = danh mục Thu nhập, cột B = danh mục Chi tiêu
 *                           cột D = hạn mức ngân sách ăn uống (tự thêm nếu chưa có)
 *
 * Danh mục KHÔNG hard-code trong script — được đọc trực tiếp từ sheet "Settings"
 * (cột A/B), nên bạn thêm/sửa/xoá danh mục trong Settings là Form + Dashboard
 * tự cập nhật theo, không cần sửa code.
 *
 * Triển khai (deploy):
 *   1. Mở Google Sheet -> Extensions (Tiện ích mở rộng) -> Apps Script
 *   2. Tạo file "Code.gs" và dán nội dung này vào (ghi đè file mặc định)
 *   3. Tạo 2 file HTML tên đúng là "Dashboard" và "FormNhap", dán nội dung tương ứng
 *   4. Deploy -> New deployment -> chọn loại "Web app"
 *        - Execute as: Me (chính bạn)
 *        - Who has access: Only myself (hoặc Anyone with the link nếu muốn mở trên điện thoại)
 *   5. Bấm Deploy, cấp quyền (authorize) khi được hỏi
 *   6. Mở URL Web App vừa được cấp:
 *        - Dashboard: <URL>
 *        - Form nhập nhanh: <URL>?page=form
 *   7. (Tuỳ chọn) Quay lại Google Sheet, tải lại trang -> sẽ thấy menu
 *      "💰 Quản lý chi tiêu" để mở Dashboard/Form ngay trong Sheet, không cần URL.
 * ============================================================
 */

// ---------- TÊN SHEET (khớp với sheet bạn đã tạo sẵn) ----------
const SHEET_TRANSACTIONS = 'Transactions';
const SHEET_SETTINGS = 'Settings';

// Nhãn Loại giao dịch — PHẢI khớp với danh sách xổ xuống (data validation)
// đã có sẵn ở cột B sheet Transactions.
const LABEL_INCOME = 'Thu nhập';
const LABEL_EXPENSE = 'Chi tiêu';

// Các danh mục (đúng chính tả trong cột B - Chi tiêu của sheet Settings) được
// cộng vào "ngân sách ăn uống" để cảnh báo giới hạn 2 man/tháng.
const FOOD_BUDGET_CATEGORIES = ['Tiền siêu thị', 'Tiền combini', 'Tiền ăn với công ty'];
const DEFAULT_FOOD_BUDGET = 20000; // 2 man yên — có thể chỉnh trong Settings!D2

// Vị trí ô lưu hạn mức ngân sách ăn uống trong sheet Settings (không đụng vào cột A/B).
const BUDGET_LABEL_CELL = 'D1';
const BUDGET_VALUE_CELL = 'D2';

// Danh mục dùng để tính lời/lãi kinh doanh Tenpai (mua đi bán lại).
// Khớp chi phí và doanh thu với nhau dựa trên cột "Tên sản phẩm" (cột F).
// TENPAI_EXPENSE_CATEGORIES gồm 3 nguồn "vốn Tenpai" khác nhau nhưng đều được khớp
// chung vào 1 báo cáo lời/lãi theo Tên sản phẩm ở getTenpaiReport():
//   - Tiền mua đồ tenpai        : mua hàng bình thường để bán lại
//   - Tiền lottery/PSA tenpai   : tiền trả khi trúng Lottery (Chusen) hoặc gửi thẻ đi chấm PSA —
//                                  ghi nhận NGAY lúc trả tiền (không đợi hàng về), Tên sản phẩm bắt buộc.
//   - Tiền bóc pack combini     : mua bóc pack tại combini — Tên sản phẩm KHÔNG bắt buộc vì mua mù,
//                                  có thể chưa biết bóc trúng thẻ gì; nếu để trống sẽ rơi vào nhóm
//                                  "(Chưa đặt tên sản phẩm)" và không khớp được lời/lãi.
const TENPAI_EXPENSE_CATEGORY = 'Tiền mua đồ tenpai';
const TENPAI_LOTTERY_CATEGORY = 'Tiền lottery/PSA tenpai';
const COMBINI_PACK_CATEGORY = 'Tiền bóc pack combini';
const TENPAI_INCOME_CATEGORY = 'Tiền tenpai';
const TENPAI_EXPENSE_CATEGORIES = [TENPAI_EXPENSE_CATEGORY, TENPAI_LOTTERY_CATEGORY, COMBINI_PACK_CATEGORY];
// Các danh mục Tenpai mà Tên sản phẩm là BẮT BUỘC (bóc pack combini KHÔNG có trong danh sách này).
const TENPAI_REQUIRED_PRODUCT_NAME_CATEGORIES = [TENPAI_EXPENSE_CATEGORY, TENPAI_LOTTERY_CATEGORY, TENPAI_INCOME_CATEGORY];
const PRODUCT_NAME_HEADER = 'Tên sản phẩm';
const UNNAMED_PRODUCT_LABEL = '(Chưa đặt tên sản phẩm)';
const TENPAI_STALE_DAYS = 60; // hàng chờ bán quá 60 ngày -> cảnh báo tồn kho lâu

const TRANSACTION_HEADERS = ['Ngày', 'Loại', 'Danh mục', 'Số tiền', 'Ghi chú', PRODUCT_NAME_HEADER];

// Bảng ngân sách giới hạn theo TỪNG danh mục riêng lẻ (khác với ngân sách ăn uống
// gộp nhóm ở trên) — người dùng tự liệt kê trong Settings!F2:G, mỗi dòng 1 danh mục.
const CATEGORY_BUDGET_RANGE = { startRow: 2, col: 6 }; // cột F=6, G=7
const CATEGORY_BUDGET_LABEL_CELL = 'F1';
const CATEGORY_BUDGET_LIMIT_CELL = 'G1';

// ---------- THEO DÕI LOTTERY (CHUSEN) & CHẤM PSA ----------
const SHEET_TRACKING = 'TheoDoiHang';
const TRACKING_HEADERS = ['Ngày ghi nhận', 'Loại', 'Tên sản phẩm', 'Số tiền đã trả', 'Ngày dự kiến về', 'Trạng thái', 'Ghi chú'];
const TRACKING_TYPE_LOTTERY = 'Lottery (Chusen)';
const TRACKING_TYPE_PSA = 'Chấm PSA';
const TRACKING_TYPES = [TRACKING_TYPE_LOTTERY, TRACKING_TYPE_PSA];
const TRACKING_STATUS_WAITING = 'Đang chờ';
const TRACKING_STATUS_ARRIVED = 'Đã về hàng';
const TRACKING_STATUSES = [TRACKING_STATUS_WAITING, TRACKING_STATUS_ARRIVED];

// ---------- QUẢN LÝ CHO VAY ----------
const SHEET_LENDING = 'ChoVay';
const LENDING_HEADERS = ['Ngày cho vay', 'Tên người vay', 'Số tiền', 'Hạn trả', 'Ngày đã trả', 'Ghi chú'];
const LENDING_OVERDUE_DAYS = 15; // quá hạn trả + 15 ngày mà chưa thu hồi -> cảnh báo

// ---------- EMAIL NHẬN BÁO CÁO (tuỳ chọn, khác với email tài khoản Google đang mở sheet) ----------
const REPORT_EMAIL_LABEL_CELL = 'H1';
const REPORT_EMAIL_VALUE_CELL = 'H2';

// ============================================================
// WEB APP ENTRY POINT
// ============================================================
function doGet(e) {
  ensureSheets_();
  const page = (e && e.parameter && e.parameter.page) || 'dashboard';
  const template = page === 'form'
    ? HtmlService.createTemplateFromFile('FormNhap')
    : HtmlService.createTemplateFromFile('Dashboard');

  return template.evaluate()
    .setTitle(page === 'form' ? 'Nhập chi tiêu' : 'Dashboard Chi tiêu')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/** Trả về URL web app hiện tại (null nếu chưa deploy) để 2 trang có thể link chéo nhau. */
function getWebAppUrl() {
  try {
    return ScriptApp.getService().getUrl();
  } catch (err) {
    return null;
  }
}

// ============================================================
// MENU KHI MỞ TRỰC TIẾP GOOGLE SHEET
// ============================================================
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('💰 Quản lý chi tiêu')
    .addItem('📊 Mở Dashboard', 'showDashboardDialog_')
    .addItem('✏️ Nhập chi tiêu', 'showFormDialog_')
    .addToUi();
}

function showDashboardDialog_() {
  ensureSheets_();
  const html = HtmlService.createTemplateFromFile('Dashboard').evaluate()
    .setWidth(1150).setHeight(780);
  SpreadsheetApp.getUi().showModalDialog(html, 'Dashboard Chi tiêu');
}

function showFormDialog_() {
  ensureSheets_();
  const html = HtmlService.createTemplateFromFile('FormNhap').evaluate()
    .setWidth(480).setHeight(700);
  SpreadsheetApp.getUi().showModalDialog(html, 'Nhập chi tiêu');
}

// ============================================================
// KHỞI TẠO / VÁ SHEET (idempotent - gọi lại nhiều lần vẫn an toàn)
// Không đụng tới dữ liệu/danh mục đã có sẵn — chỉ tạo mới nếu thiếu.
// ============================================================
function ensureSheets_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  let txSheet = ss.getSheetByName(SHEET_TRANSACTIONS);
  if (!txSheet) {
    txSheet = ss.insertSheet(SHEET_TRANSACTIONS);
    txSheet.appendRow(TRANSACTION_HEADERS);
    txSheet.setFrozenRows(1);
    txSheet.getRange(1, 1, 1, TRANSACTION_HEADERS.length).setFontWeight('bold');
    const rule = SpreadsheetApp.newDataValidation()
      .requireValueInList([LABEL_INCOME, LABEL_EXPENSE], true)
      .setAllowInvalid(false)
      .build();
    txSheet.getRange(2, 2, 500, 1).setDataValidation(rule);
  }

  // Đảm bảo có cột F "Tên sản phẩm" để khớp lời lãi Tenpai — không đụng cột A-E hiện có.
  const colFHeader = txSheet.getRange(1, 6).getValue();
  if (String(colFHeader).trim() !== PRODUCT_NAME_HEADER) {
    txSheet.getRange(1, 6).setValue(PRODUCT_NAME_HEADER).setFontWeight('bold');
  }

  let settingsSheet = ss.getSheetByName(SHEET_SETTINGS);
  if (!settingsSheet) {
    settingsSheet = ss.insertSheet(SHEET_SETTINGS);
    settingsSheet.getRange('A1').setValue(LABEL_INCOME).setFontWeight('bold');
    settingsSheet.getRange('B1').setValue(LABEL_EXPENSE).setFontWeight('bold');
  }

  // Đảm bảo có ô cấu hình hạn mức ăn uống mà không đụng tới cột A/B/C hiện có.
  if (!settingsSheet.getRange(BUDGET_VALUE_CELL).getValue()) {
    settingsSheet.getRange(BUDGET_LABEL_CELL).setValue('Ngân sách ăn uống / tháng').setFontWeight('bold');
    settingsSheet.getRange(BUDGET_VALUE_CELL).setValue(DEFAULT_FOOD_BUDGET);
  }

  // Đảm bảo có tiêu đề cho bảng ngân sách theo TỪNG danh mục (cột F/G) — chỉ thêm
  // tiêu đề, không tự thêm dòng dữ liệu; bạn tự điền tên danh mục + hạn mức muốn
  // giới hạn (VD: F2="Tiền xăng", G2=10000) — sao chép đúng chính tả từ cột B.
  if (String(settingsSheet.getRange(CATEGORY_BUDGET_LABEL_CELL).getValue()).trim() === '') {
    settingsSheet.getRange(CATEGORY_BUDGET_LABEL_CELL).setValue('Danh mục cần giới hạn').setFontWeight('bold');
    settingsSheet.getRange(CATEGORY_BUDGET_LIMIT_CELL).setValue('Hạn mức/tháng').setFontWeight('bold');
  }

  // Tự động bổ sung 2 danh mục CHI mới bắt buộc phải có để tính năng Lottery/PSA và
  // bóc pack combini hoạt động (khác với ngân sách F/G ở trên — đây là danh mục giao
  // dịch thật, hệ thống cần biết trước để form nhập liệu + validate hoạt động đúng).
  ensureCategoryInSettings_(settingsSheet, 2, TENPAI_LOTTERY_CATEGORY);
  ensureCategoryInSettings_(settingsSheet, 2, COMBINI_PACK_CATEGORY);

  // Ô cấu hình email nhận báo cáo (tuỳ chọn) — để trống thì mặc định gửi tới email
  // của tài khoản Google đang sở hữu/chạy trigger; điền vào đây để gửi sang 1 địa chỉ khác.
  if (String(settingsSheet.getRange(REPORT_EMAIL_LABEL_CELL).getValue()).trim() === '') {
    settingsSheet.getRange(REPORT_EMAIL_LABEL_CELL).setValue('Email nhận báo cáo (để trống = dùng tài khoản Google này)').setFontWeight('bold');
  }

  // Sheet theo dõi Lottery (Chusen) & Chấm PSA — chỉ lưu ngày dự kiến về hàng + trạng
  // thái theo dõi; chi phí thật đã được ghi vào Transactions ngay lúc trả tiền (tránh
  // tính trùng 2 lần).
  let trackingSheet = ss.getSheetByName(SHEET_TRACKING);
  if (!trackingSheet) {
    trackingSheet = ss.insertSheet(SHEET_TRACKING);
    trackingSheet.appendRow(TRACKING_HEADERS);
    trackingSheet.setFrozenRows(1);
    trackingSheet.getRange(1, 1, 1, TRACKING_HEADERS.length).setFontWeight('bold');
    trackingSheet.getRange(2, 2, 500, 1).setDataValidation(
      SpreadsheetApp.newDataValidation().requireValueInList(TRACKING_TYPES, true).setAllowInvalid(false).build());
    trackingSheet.getRange(2, 6, 500, 1).setDataValidation(
      SpreadsheetApp.newDataValidation().requireValueInList(TRACKING_STATUSES, true).setAllowInvalid(false).build());
  }

  // Sheet quản lý cho vay — "quá hạn" = chưa có Ngày đã trả VÀ đã qua Hạn trả + 15 ngày.
  let lendingSheet = ss.getSheetByName(SHEET_LENDING);
  if (!lendingSheet) {
    lendingSheet = ss.insertSheet(SHEET_LENDING);
    lendingSheet.appendRow(LENDING_HEADERS);
    lendingSheet.setFrozenRows(1);
    lendingSheet.getRange(1, 1, 1, LENDING_HEADERS.length).setFontWeight('bold');
  }
}

/**
 * Thêm 1 danh mục vào cuối dữ liệu THỰC TẾ của cột A (Thu nhập=1) hoặc B (Chi tiêu=2)
 * trong Settings nếu chưa có — dò đúng ô trống cuối cùng của CHÍNH cột đó (không dùng
 * getLastRow() toàn sheet) để không tạo khoảng trống nếu cột F/G có nhiều dòng hơn.
 */
function ensureCategoryInSettings_(settingsSheet, col, categoryName) {
  const numRows = Math.max(settingsSheet.getLastRow(), 1);
  const colValues = settingsSheet.getRange(1, col, numRows, 1).getValues().flat().map(v => String(v).trim());
  if (colValues.slice(1).indexOf(categoryName) !== -1) return; // đã tồn tại rồi

  let lastNonEmptyRow = 1; // dòng 1 = tiêu đề
  for (let r = 2; r <= numRows; r++) {
    if (colValues[r - 1] !== '') lastNonEmptyRow = r;
  }
  settingsSheet.getRange(lastNonEmptyRow + 1, col).setValue(categoryName);
}

/** Đọc bảng ngân sách theo từng danh mục từ Settings!F2:G -> {category: limit}. */
function getCategoryBudgets_() {
  ensureSheets_();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_SETTINGS);
  const lastRow = sheet.getLastRow();
  const budgets = {};
  if (lastRow < CATEGORY_BUDGET_RANGE.startRow) return budgets;

  const data = sheet.getRange(
    CATEGORY_BUDGET_RANGE.startRow, CATEGORY_BUDGET_RANGE.col,
    lastRow - CATEGORY_BUDGET_RANGE.startRow + 1, 2
  ).getValues();

  data.forEach(row => {
    const name = String(row[0] || '').trim();
    const limit = Number(row[1]);
    if (name && !isNaN(limit) && limit > 0) budgets[name] = limit;
  });
  return budgets;
}

// ============================================================
// DANH MỤC — đọc động từ sheet Settings (cột A = Thu nhập, cột B = Chi tiêu)
// ============================================================
function getCategories() {
  ensureSheets_();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_SETTINGS);
  const lastRow = sheet.getLastRow();

  const income = lastRow >= 2
    ? sheet.getRange(2, 1, lastRow - 1, 1).getValues().flat().filter(v => String(v).trim() !== '')
    : [];
  const expense = lastRow >= 2
    ? sheet.getRange(2, 2, lastRow - 1, 1).getValues().flat().filter(v => String(v).trim() !== '')
    : [];

  return {
    income, expense,
    foodBudgetCategories: FOOD_BUDGET_CATEGORIES,
    tenpaiCategories: TENPAI_EXPENSE_CATEGORIES.concat([TENPAI_INCOME_CATEGORY]),
    // Danh mục Tenpai nhưng Tên sản phẩm KHÔNG bắt buộc (bóc pack combini là mua mù).
    optionalProductNameCategories: [COMBINI_PACK_CATEGORY]
  };
}

// ============================================================
// GHI GIAO DỊCH MỚI
// ============================================================
function addTransaction(payload) {
  try {
    if (!payload || !payload.type || !payload.category || payload.amount === undefined) {
      throw new Error('Thiếu dữ liệu bắt buộc (loại / danh mục / số tiền).');
    }

    const amount = Number(payload.amount);
    if (isNaN(amount) || amount <= 0) {
      throw new Error('Số tiền không hợp lệ.');
    }

    const type = payload.type === 'income' ? LABEL_INCOME : LABEL_EXPENSE;
    const cats = getCategories();
    const validCategories = type === LABEL_INCOME ? cats.income : cats.expense;
    if (validCategories.indexOf(payload.category) === -1) {
      throw new Error('Danh mục không hợp lệ: ' + payload.category);
    }

    // Parse ngày thủ công (yyyy-MM-dd) để tránh lệch múi giờ khi dùng new Date(string).
    let date;
    if (payload.date) {
      const parts = String(payload.date).split('-').map(Number);
      date = new Date(parts[0], parts[1] - 1, parts[2]);
    } else {
      date = new Date();
    }
    if (isNaN(date.getTime())) {
      throw new Error('Ngày không hợp lệ.');
    }

    // Giao dịch thuộc danh mục Tenpai (mua hoặc bán) cần tên sản phẩm để khớp lời lãi ở
    // getTenpaiReport() — riêng "Tiền bóc pack combini" KHÔNG bắt buộc vì là mua mù, có
    // thể chưa biết bóc trúng thẻ gì ngay lúc mua (xem TENPAI_REQUIRED_PRODUCT_NAME_CATEGORIES).
    const requiresProductName = TENPAI_REQUIRED_PRODUCT_NAME_CATEGORIES.indexOf(payload.category) !== -1;
    const productName = String(payload.productName || '').trim();
    if (requiresProductName && !productName) {
      throw new Error('Vui lòng nhập tên sản phẩm để có thể tính lời lãi Tenpai.');
    }

    ensureSheets_();
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(SHEET_TRANSACTIONS);

    // Khoá script để tránh 2 request ghi đè nhau khi có nhiều người nhập cùng lúc.
    const lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try {
      sheet.appendRow([date, type, payload.category, amount, payload.note || '', productName]);
    } finally {
      lock.releaseLock();
    }

    return { success: true, message: 'Đã lưu giao dịch thành công.' };
  } catch (err) {
    console.error('addTransaction error: ' + err.message);
    return { success: false, message: err.message };
  }
}

/**
 * Danh sách tên sản phẩm đã từng nhập (Transactions cột F) — dùng để gợi ý autocomplete
 * ở Form nhập liệu (cả tab Thu và Chi), tránh gõ lệch tên giữa lúc mua và lúc bán khiến
 * getTenpaiReport() không khớp được lời/lãi.
 */
function getKnownProductNames() {
  try {
    ensureSheets_();
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(SHEET_TRANSACTIONS);
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return [];

    const names = sheet.getRange(2, 6, lastRow - 1, 1).getValues().flat()
      .map(v => String(v || '').trim())
      .filter(v => v !== '' && v !== UNNAMED_PRODUCT_LABEL);

    return Array.from(new Set(names)).sort((a, b) => a.localeCompare(b, 'vi'));
  } catch (err) {
    console.error('getKnownProductNames error: ' + err.message);
    return [];
  }
}

/** Parse ngày dạng 'yyyy-MM-dd' (input type=date) thành Date theo giờ local — tránh lệch
 * múi giờ so với dùng trực tiếp new Date(string). Trả về null nếu chuỗi không hợp lệ. */
function parseDateString_(str) {
  if (!str) return null;
  const parts = String(str).split('-').map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) return null;
  const d = new Date(parts[0], parts[1] - 1, parts[2]);
  return isNaN(d.getTime()) ? null : d;
}

function fmtYen_(n) {
  return '¥' + Math.round(n || 0).toLocaleString('ja-JP');
}

// ============================================================
// LẤY DỮ LIỆU CHO DASHBOARD
// ============================================================
function getDashboardData(year) {
  try {
    ensureSheets_();
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(SHEET_TRANSACTIONS);
    const lastRow = sheet.getLastRow();
    const budget = getFoodBudget_();
    const categoryBudgets = getCategoryBudgets_(); // {category: limit/tháng}
    const now = new Date();

    const result = {
      success: true,
      year: (year && Number(year)) || now.getFullYear(),
      availableYears: [],
      monthly: [],          // [{month, income, expense, balance, savingsRate}]
      categoryTotals: {},   // {category: tổng chi trong năm}
      transactions: [],     // toàn bộ giao dịch trong năm (FE tự lọc theo tháng)
      foodBudget: { limit: budget, byMonth: [] }, // [{month, spent, percent}]
      prevDecember: { income: 0, expense: 0 },    // để tính MoM khi selectedMonth = Tháng 1
      categoryBudgets: { limits: categoryBudgets, byMonth: {} } // { category: [{month, spent, percent}] }
    };

    Object.keys(categoryBudgets).forEach(cat => { result.categoryBudgets.byMonth[cat] = []; });

    if (lastRow < 2) {
      result.availableYears = [result.year];
      for (let m = 1; m <= 12; m++) {
        result.monthly.push({ month: m, income: 0, expense: 0, balance: 0, savingsRate: 0 });
        result.foodBudget.byMonth.push({ month: m, spent: 0, percent: 0 });
        Object.keys(categoryBudgets).forEach(cat => {
          result.categoryBudgets.byMonth[cat].push({ month: m, spent: 0, percent: 0 });
        });
      }
      return result;
    }

    const data = sheet.getRange(2, 1, lastRow - 1, TRANSACTION_HEADERS.length).getValues();

    const yearsSet = {};
    data.forEach(row => {
      const d = row[0];
      if (d instanceof Date) yearsSet[d.getFullYear()] = true;
    });
    yearsSet[now.getFullYear()] = true;
    result.availableYears = Object.keys(yearsSet).map(Number).sort((a, b) => b - a);

    const targetYear = (year && result.availableYears.indexOf(Number(year)) !== -1)
      ? Number(year) : result.availableYears[0];
    result.year = targetYear;

    const monthlyMap = {};
    const foodMap = {};
    const catBudgetMap = {}; // { category: { 1: spent, 2: spent, ... } }
    Object.keys(categoryBudgets).forEach(cat => { catBudgetMap[cat] = {}; });
    for (let m = 1; m <= 12; m++) {
      monthlyMap[m] = { month: m, income: 0, expense: 0, balance: 0, savingsRate: 0 };
      foodMap[m] = 0;
      Object.keys(categoryBudgets).forEach(cat => { catBudgetMap[cat][m] = 0; });
    }

    let prevDecIncome = 0, prevDecExpense = 0;

    data.forEach((row, i) => {
      const dateVal = row[0], type = row[1], category = row[2], amount = row[3], note = row[4];
      if (!(dateVal instanceof Date)) return;

      // Riêng tháng 12 của năm liền trước targetYear -> gom lại để so sánh MoM khi
      // người dùng đang xem Tháng 1 (không có "tháng 0" trong cùng năm để so sánh).
      if (dateVal.getFullYear() === targetYear - 1 && dateVal.getMonth() === 11) {
        const amt0 = Number(amount) || 0;
        if (type === LABEL_INCOME) prevDecIncome += amt0;
        else if (type === LABEL_EXPENSE) prevDecExpense += amt0;
      }

      if (dateVal.getFullYear() !== targetYear) return;

      const m = dateVal.getMonth() + 1;
      const amt = Number(amount) || 0;

      if (type === LABEL_INCOME) {
        monthlyMap[m].income += amt;
      } else if (type === LABEL_EXPENSE) {
        monthlyMap[m].expense += amt;
        result.categoryTotals[category] = (result.categoryTotals[category] || 0) + amt;
        if (FOOD_BUDGET_CATEGORIES.indexOf(category) !== -1) {
          foodMap[m] += amt;
        }
        if (catBudgetMap[category]) {
          catBudgetMap[category][m] += amt;
        }
      }

      result.transactions.push({
        id: 'r' + (i + 2),
        date: Utilities.formatDate(dateVal, Session.getScriptTimeZone(), 'yyyy-MM-dd'),
        month: m,
        type: type,
        category: category,
        amount: amt,
        note: note || ''
      });
    });

    result.prevDecember = { income: prevDecIncome, expense: prevDecExpense };

    for (let m = 1; m <= 12; m++) {
      const mm = monthlyMap[m];
      mm.balance = mm.income - mm.expense;
      mm.savingsRate = mm.income > 0 ? Math.round(((mm.income - mm.expense) / mm.income) * 1000) / 10 : 0;
      result.monthly.push(mm);
      result.foodBudget.byMonth.push({
        month: m,
        spent: foodMap[m],
        percent: budget > 0 ? Math.round((foodMap[m] / budget) * 1000) / 10 : 0
      });
      Object.keys(categoryBudgets).forEach(cat => {
        const limit = categoryBudgets[cat];
        const spent = catBudgetMap[cat][m];
        result.categoryBudgets.byMonth[cat].push({
          month: m, spent: spent,
          percent: limit > 0 ? Math.round((spent / limit) * 1000) / 10 : 0
        });
      });
    }

    // Sắp xếp giao dịch mới nhất lên trước cho bảng chi tiết.
    result.transactions.sort((a, b) => b.date.localeCompare(a.date));

    return result;
  } catch (err) {
    console.error('getDashboardData error: ' + err.message);
    return { success: false, message: err.message };
  }
}

function getFoodBudget_() {
  ensureSheets_();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_SETTINGS);
  const v = Number(sheet.getRange(BUDGET_VALUE_CELL).getValue());
  return isNaN(v) || v <= 0 ? DEFAULT_FOOD_BUDGET : v;
}

/** Cho phép chỉnh hạn mức ăn uống trực tiếp từ Dashboard (tuỳ chọn). */
function saveFoodBudget(newBudget) {
  try {
    const budget = Number(newBudget);
    if (isNaN(budget) || budget <= 0) throw new Error('Hạn mức không hợp lệ.');

    ensureSheets_();
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(SHEET_SETTINGS);
    sheet.getRange(BUDGET_VALUE_CELL).setValue(budget);

    return { success: true, message: 'Đã cập nhật hạn mức ăn uống.' };
  } catch (err) {
    console.error('saveFoodBudget error: ' + err.message);
    return { success: false, message: err.message };
  }
}

/**
 * Email nhận các loại báo cáo tự động (nhắc nhập liệu / báo cáo tuần / báo cáo cuối ngày).
 * Mặc định dùng email của tài khoản Google đang sở hữu/chạy trigger — nếu bạn điền 1 địa
 * chỉ khác vào Settings!H2 thì toàn bộ email sẽ gửi sang địa chỉ đó thay vì tài khoản này.
 */
function getReportRecipientEmail_() {
  ensureSheets_();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_SETTINGS);
  const override = String(sheet.getRange(REPORT_EMAIL_VALUE_CELL).getValue() || '').trim();
  if (override) return override;
  return Session.getActiveUser().getEmail() || Session.getEffectiveUser().getEmail();
}

/** Đọc email nhận báo cáo hiện đang cấu hình (rỗng = đang dùng email tài khoản Google này). */
function getReportRecipientEmailValue() {
  try {
    ensureSheets_();
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(SHEET_SETTINGS);
    return String(sheet.getRange(REPORT_EMAIL_VALUE_CELL).getValue() || '').trim();
  } catch (err) {
    console.error('getReportRecipientEmailValue error: ' + err.message);
    return '';
  }
}

/** Cho phép đổi email nhận báo cáo trực tiếp từ Dashboard (tuỳ chọn, thay vì tự vào Settings!H2). */
function saveReportRecipientEmail(newEmail) {
  try {
    const email = String(newEmail || '').trim();
    // Cho phép để trống (quay về dùng email tài khoản Google) hoặc phải là email hợp lệ.
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new Error('Địa chỉ email không hợp lệ.');
    }
    ensureSheets_();
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(SHEET_SETTINGS);
    sheet.getRange(REPORT_EMAIL_VALUE_CELL).setValue(email);
    return { success: true, message: email ? 'Đã lưu email nhận báo cáo: ' + email : 'Đã xoá — quay lại dùng email tài khoản Google này.' };
  } catch (err) {
    console.error('saveReportRecipientEmail error: ' + err.message);
    return { success: false, message: err.message };
  }
}

// ============================================================
// BÁO CÁO LỜI LÃI KINH DOANH TENPAI (mua đi bán lại)
// ============================================================
// Cách tính:
//  - Gom TẤT CẢ giao dịch "Tiền mua đồ tenpai" (chi) và "Tiền tenpai" (thu) trên
//    TOÀN BỘ lịch sử (không giới hạn theo năm), nhóm theo đúng "Tên sản phẩm".
//  - Với mỗi tên sản phẩm: lời/lãi = tổng doanh thu - tổng chi phí của tên đó.
//  - Nếu ĐÃ có doanh thu (đã bán): tính là "đã bán", ghi nhận lời/lãi vào QUÝ của
//    lần bán gần nhất (theo lựa chọn của bạn) — vì đó là thời điểm thực sự có lãi.
//  - Nếu CHƯA có doanh thu (mới chỉ trả tiền mua): xếp vào "đang chờ bán", KHÔNG
//    tính là lỗ ở quý nào cả — chỉ hiển thị riêng là vốn chưa thu hồi.
//  - Sản phẩm không nhập tên sẽ được gom chung vào nhóm "(Chưa đặt tên sản phẩm)"
//    để không bị mất dữ liệu, nhưng sẽ không khớp chính xác với sản phẩm khác.
// ============================================================
function getTenpaiReport() {
  try {
    ensureSheets_();
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(SHEET_TRANSACTIONS);
    const lastRow = sheet.getLastRow();

    const result = {
      success: true,
      quarters: [],  // [{key, label, revenue, cost, profit}]
      items: [],     // [{name, cost, revenue, profit, profitPercent, lastSaleDate}] — đã bán
      pending: [],   // [{name, cost, lastCostDate, daysSincePurchase, isStale}] — đang chờ bán
      totals: { revenue: 0, cost: 0, profit: 0, pendingCost: 0 },
      staleCount: 0
    };

    if (lastRow < 2) return result;

    const data = sheet.getRange(2, 1, lastRow - 1, TRANSACTION_HEADERS.length).getValues();
    const groups = {}; // tên sản phẩm -> { cost, revenue, lastSaleDate, lastCostDate }

    data.forEach(row => {
      const dateVal = row[0], type = row[1], category = row[2], amount = Number(row[3]) || 0, rawName = row[5];
      const isCost = type === LABEL_EXPENSE && TENPAI_EXPENSE_CATEGORIES.indexOf(category) !== -1;
      const isRevenue = type === LABEL_INCOME && category === TENPAI_INCOME_CATEGORY;
      if (!isCost && !isRevenue) return;
      if (!(dateVal instanceof Date)) return;

      const name = String(rawName || '').trim() || UNNAMED_PRODUCT_LABEL;
      if (!groups[name]) {
        groups[name] = { name: name, cost: 0, revenue: 0, lastSaleDate: null, lastCostDate: null };
      }

      if (isCost) {
        groups[name].cost += amount;
        if (!groups[name].lastCostDate || dateVal > groups[name].lastCostDate) groups[name].lastCostDate = dateVal;
      } else {
        groups[name].revenue += amount;
        if (!groups[name].lastSaleDate || dateVal > groups[name].lastSaleDate) groups[name].lastSaleDate = dateVal;
      }
    });

    const quarterMap = {};
    const tz = Session.getScriptTimeZone();
    const today = new Date();
    const MS_PER_DAY = 24 * 60 * 60 * 1000;

    Object.values(groups).forEach(g => {
      const profit = g.revenue - g.cost;

      if (g.revenue > 0) {
        // Đã bán được (có ít nhất 1 dòng doanh thu) -> ghi nhận lời/lãi vào quý bán gần nhất.
        const d = g.lastSaleDate;
        const q = Math.floor(d.getMonth() / 3) + 1;
        const key = d.getFullYear() + '-Q' + q;
        if (!quarterMap[key]) {
          quarterMap[key] = {
            key: key, label: 'Q' + q + '/' + d.getFullYear(),
            revenue: 0, cost: 0, profit: 0, sortKey: d.getFullYear() * 10 + q
          };
        }
        quarterMap[key].revenue += g.revenue;
        quarterMap[key].cost += g.cost;
        quarterMap[key].profit += profit;

        result.items.push({
          name: g.name,
          cost: g.cost,
          revenue: g.revenue,
          profit: profit,
          // % lãi trên vốn — null nếu không có vốn để so sánh (VD: hàng biếu tặng).
          profitPercent: g.cost > 0 ? Math.round((profit / g.cost) * 1000) / 10 : null,
          lastSaleDate: Utilities.formatDate(d, tz, 'yyyy-MM-dd')
        });
        result.totals.revenue += g.revenue;
        result.totals.cost += g.cost;
        result.totals.profit += profit;
      } else {
        // Chưa bán được -> hàng đang chờ bán, không tính lời/lỗ ở quý nào.
        const daysSincePurchase = g.lastCostDate
          ? Math.floor((today.getTime() - g.lastCostDate.getTime()) / MS_PER_DAY)
          : null;
        result.pending.push({
          name: g.name,
          cost: g.cost,
          lastCostDate: g.lastCostDate ? Utilities.formatDate(g.lastCostDate, tz, 'yyyy-MM-dd') : '',
          daysSincePurchase: daysSincePurchase,
          isStale: daysSincePurchase !== null && daysSincePurchase >= TENPAI_STALE_DAYS
        });
        result.totals.pendingCost += g.cost;
      }
    });

    result.staleCount = result.pending.filter(p => p.isStale).length;

    result.quarters = Object.values(quarterMap).sort((a, b) => a.sortKey - b.sortKey);
    result.items.sort((a, b) => (b.lastSaleDate || '').localeCompare(a.lastSaleDate || ''));
    result.pending.sort((a, b) => (b.lastCostDate || '').localeCompare(a.lastCostDate || ''));

    return result;
  } catch (err) {
    console.error('getTenpaiReport error: ' + err.message);
    return { success: false, message: err.message };
  }
}

// ============================================================
// XU HƯỚNG NHIỀU NĂM THEO DANH MỤC
// ============================================================
// Trả về 1 timeline liên tục theo tháng (không bỏ sót tháng nào, kể cả tháng
// không có giao dịch) trải dài từ giao dịch đầu tiên đến giao dịch gần nhất,
// cùng tổng chi/thu của TỪNG danh mục trong mỗi tháng đó — để vẽ biểu đồ
// đường (line chart) xem xu hướng dài hạn theo mùa/theo năm.
function getCategoryTrend() {
  try {
    ensureSheets_();
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(SHEET_TRANSACTIONS);
    const lastRow = sheet.getLastRow();
    const cats = getCategories();
    const allCategories = cats.income.concat(cats.expense);

    const result = { success: true, timeline: [], series: {}, categories: allCategories };
    allCategories.forEach(c => { result.series[c] = []; });

    if (lastRow < 2) return result;

    const data = sheet.getRange(2, 1, lastRow - 1, TRANSACTION_HEADERS.length).getValues();
    const monthMap = {}; // 'yyyy-MM' -> {category: tổng}
    let minKey = null, maxKey = null;

    data.forEach(row => {
      const dateVal = row[0], category = row[2], amount = Number(row[3]) || 0;
      if (!(dateVal instanceof Date)) return;
      const key = dateVal.getFullYear() + '-' + String(dateVal.getMonth() + 1).padStart(2, '0');
      if (!monthMap[key]) monthMap[key] = {};
      monthMap[key][category] = (monthMap[key][category] || 0) + amount;
      if (!minKey || key < minKey) minKey = key;
      if (!maxKey || key > maxKey) maxKey = key;
    });

    if (!minKey) return result;

    const minParts = minKey.split('-').map(Number);
    const maxParts = maxKey.split('-').map(Number);
    let y = minParts[0], m = minParts[1];
    const maxY = maxParts[0], maxM = maxParts[1];

    while (y < maxY || (y === maxY && m <= maxM)) {
      const key = y + '-' + String(m).padStart(2, '0');
      result.timeline.push(String(m).padStart(2, '0') + '/' + y);
      allCategories.forEach(c => {
        result.series[c].push((monthMap[key] && monthMap[key][c]) || 0);
      });
      m++;
      if (m > 12) { m = 1; y++; }
    }

    return result;
  } catch (err) {
    console.error('getCategoryTrend error: ' + err.message);
    return { success: false, message: err.message };
  }
}

// ============================================================
// EMAIL BÁO CÁO TỔNG KẾT CUỐI TUẦN + NHẮC NHẬP LIỆU HÀNG NGÀY
// ============================================================
// Cả 2 hàm dưới đây KHÔNG tự chạy — bạn cần chạy setupTriggers() MỘT LẦN DUY
// NHẤT (chọn hàm "setupTriggers" trên thanh công cụ Apps Script Editor rồi bấm
// Run) để cài đặt lịch tự động. Email sẽ được gửi tới đúng địa chỉ Google của
// người cài đặt trigger (không hard-code email trong code).
// ============================================================
/**
 * Tổng kết TUẦN VỪA KẾT THÚC (Thứ 2 -> Chủ nhật liền trước ngày chạy hàm này).
 * Chạy vào sáng Thứ 2 hàng tuần (xem setupTriggers()) sẽ tổng kết đúng tuần vừa qua.
 * Ngoài thu/chi/tiết kiệm trong tuần, còn kèm số liệu LŨY KẾ ăn uống của cả tháng
 * hiện tại (so với hạn mức tháng) để không mất mốc theo dõi giữa các tuần.
 */
function sendWeeklyReportEmail() {
  try {
    ensureSheets_();
    const tz = Session.getScriptTimeZone();
    const now = new Date();
    const MS_PER_DAY = 24 * 60 * 60 * 1000;

    // now.getDay(): 0=CN,1=T2,...,6=T7. daysSinceMonday quy về số ngày từ Thứ 2 tuần
    // này đến hôm nay, để từ đó lùi thêm 1 tuần ra đúng khoảng Thứ 2 -> Chủ nhật vừa qua.
    const daysSinceMonday = (now.getDay() + 6) % 7;
    const thisMonday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysSinceMonday);
    const weekStart = new Date(thisMonday.getTime() - 7 * MS_PER_DAY);       // Thứ 2 tuần trước, 00:00
    const weekEnd = new Date(thisMonday.getTime() - 1);                      // Chủ nhật tuần trước, 23:59:59.999

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(SHEET_TRANSACTIONS);
    const lastRow = sheet.getLastRow();

    let weekIncome = 0, weekExpense = 0, weekFoodSpent = 0;
    const weekCatTotals = {};
    let monthFoodSpent = 0;
    const currentYear = now.getFullYear(), currentMonth = now.getMonth() + 1;

    if (lastRow >= 2) {
      const data = sheet.getRange(2, 1, lastRow - 1, TRANSACTION_HEADERS.length).getValues();
      data.forEach(row => {
        const dateVal = row[0], type = row[1], category = row[2], amount = Number(row[3]) || 0;
        if (!(dateVal instanceof Date)) return;

        // Luỹ kế ăn uống của THÁNG HIỆN TẠI (tính tới hôm nay) — để giữ mốc theo dõi
        // giữa các tuần, vì hạn mức ăn uống vốn tính theo tháng, không theo tuần.
        if (type === LABEL_EXPENSE && dateVal.getFullYear() === currentYear && dateVal.getMonth() + 1 === currentMonth &&
            FOOD_BUDGET_CATEGORIES.indexOf(category) !== -1) {
          monthFoodSpent += amount;
        }

        if (dateVal.getTime() < weekStart.getTime() || dateVal.getTime() > weekEnd.getTime()) return;
        if (type === LABEL_INCOME) {
          weekIncome += amount;
        } else if (type === LABEL_EXPENSE) {
          weekExpense += amount;
          weekCatTotals[category] = (weekCatTotals[category] || 0) + amount;
          if (FOOD_BUDGET_CATEGORIES.indexOf(category) !== -1) weekFoodSpent += amount;
        }
      });
    }

    const foodBudget = getFoodBudget_();
    const weekBalance = weekIncome - weekExpense;
    const savingsRate = weekIncome > 0 ? Math.round(((weekIncome - weekExpense) / weekIncome) * 1000) / 10 : 0;
    const topCats = Object.entries(weekCatTotals).sort((a, b) => b[1] - a[1]).slice(0, 5);
    const fmt = (n) => '¥' + Math.round(n).toLocaleString('ja-JP');
    const weekLabel = Utilities.formatDate(weekStart, tz, 'dd/MM') + ' - ' + Utilities.formatDate(weekEnd, tz, 'dd/MM/yyyy');

    let body = 'BÁO CÁO CHI TIÊU TUẦN ' + weekLabel + '\n\n';
    body += 'Tổng thu: ' + fmt(weekIncome) + '\n';
    body += 'Tổng chi: ' + fmt(weekExpense) + '\n';
    body += 'Số dư: ' + fmt(weekBalance) + '\n';
    body += 'Tỷ lệ tiết kiệm: ' + savingsRate + '%\n\n';
    body += 'Ăn uống tuần này: ' + fmt(weekFoodSpent) + '\n';
    body += 'Ăn uống luỹ kế tháng ' + currentMonth + '/' + currentYear + ': ' + fmt(monthFoodSpent) + ' / ' + fmt(foodBudget) +
      ' (' + (foodBudget > 0 ? Math.round(monthFoodSpent / foodBudget * 100) : 0) + '%)\n\n';
    if (topCats.length) {
      body += 'Top danh mục chi nhiều nhất trong tuần:\n';
      topCats.forEach(([cat, amt]) => { body += '  - ' + cat + ': ' + fmt(amt) + '\n'; });
    } else {
      body += 'Không có chi tiêu nào trong tuần này.\n';
    }

    const url = getWebAppUrl();
    if (url) body += '\nXem chi tiết: ' + url;

    const recipient = getReportRecipientEmail_();
    if (!recipient) {
      console.error('sendWeeklyReportEmail: không xác định được email người nhận.');
      return;
    }
    MailApp.sendEmail(recipient, '📊 Báo cáo chi tiêu tuần ' + weekLabel, body);
  } catch (err) {
    console.error('sendWeeklyReportEmail error: ' + err.message);
  }
}

function checkDailyReminder() {
  try {
    ensureSheets_();
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(SHEET_TRANSACTIONS);
    const lastRow = sheet.getLastRow();
    const tz = Session.getScriptTimeZone();
    const todayStr = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');

    let hasToday = false;
    if (lastRow >= 2) {
      const dates = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
      hasToday = dates.some(row =>
        row[0] instanceof Date && Utilities.formatDate(row[0], tz, 'yyyy-MM-dd') === todayStr
      );
    }
    if (hasToday) return; // đã nhập rồi trong hôm nay, không cần nhắc

    const recipient = getReportRecipientEmail_();
    if (!recipient) return;

    const url = getWebAppUrl();
    let body = 'Hôm nay bạn chưa ghi giao dịch thu/chi nào. Đừng quên nhập để số liệu được đầy đủ nhé!';
    if (url) body += '\n\nNhập ngay: ' + url + '?page=form';

    MailApp.sendEmail(recipient, '📝 Nhắc nhập chi tiêu hôm nay', body);
  } catch (err) {
    console.error('checkDailyReminder error: ' + err.message);
  }
}

/**
 * CHẠY HÀM NÀY 1 LẦN DUY NHẤT (chọn "setupTriggers" trên toolbar Apps Script
 * Editor -> bấm Run) để bật email báo cáo cuối TUẦN + nhắc nhập liệu hàng ngày.
 * Hàm tự xoá trigger cũ trùng tên trước khi tạo mới (kể cả trigger
 * "sendMonthlyReportEmail" của bản cũ nếu bạn từng chạy setupTriggers() trước đây),
 * nên chạy lại nhiều lần vẫn an toàn, không bị nhân đôi hay chạy trùng 2 loại báo cáo.
 */
function setupTriggers() {
  ScriptApp.getProjectTriggers().forEach(t => {
    const fn = t.getHandlerFunction();
    if (fn === 'sendWeeklyReportEmail' || fn === 'checkDailyReminder' || fn === 'sendMonthlyReportEmail') {
      ScriptApp.deleteTrigger(t);
    }
  });

  // Báo cáo tổng kết: 8h sáng Thứ 2 hàng tuần (tổng kết Thứ 2 - Chủ nhật vừa qua).
  ScriptApp.newTrigger('sendWeeklyReportEmail')
    .timeBased()
    .onWeekDay(ScriptApp.WeekDay.MONDAY)
    .atHour(8)
    .create();

  // Nhắc nhập liệu: 20h mỗi ngày, chỉ gửi nếu hôm đó chưa nhập giao dịch nào.
  ScriptApp.newTrigger('checkDailyReminder')
    .timeBased()
    .everyDays(1)
    .atHour(20)
    .create();

  Logger.log('Đã thiết lập xong: báo cáo hàng tuần (sáng Thứ 2, 8h) + nhắc nhập liệu (20h mỗi ngày).');
}

// ============================================================
// QUẢN LÝ CHO VAY (+ CẢNH BÁO QUÁ HẠN 15 NGÀY)
// ============================================================
// "Quá hạn" = chưa có Ngày đã trả VÀ hôm nay đã qua Hạn trả + LENDING_OVERDUE_DAYS ngày.
function getLendingReport() {
  try {
    ensureSheets_();
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(SHEET_LENDING);
    const lastRow = sheet.getLastRow();
    const tz = Session.getScriptTimeZone();
    const today = new Date();
    const MS_PER_DAY = 24 * 60 * 60 * 1000;

    const result = { success: true, items: [], totals: { totalLending: 0, totalOverdue: 0, overdueCount: 0 } };
    if (lastRow < 2) return result;

    const data = sheet.getRange(2, 1, lastRow - 1, LENDING_HEADERS.length).getValues();
    data.forEach((row, i) => {
      const lendDate = row[0], borrower = row[1], amount = row[2], dueDate = row[3], paidDate = row[4], note = row[5];
      if (!(lendDate instanceof Date) || !borrower) return;

      const amt = Number(amount) || 0;
      const isPaid = paidDate instanceof Date;
      let daysOverdue = null, isOverdue = false;
      if (!isPaid && dueDate instanceof Date) {
        const overdueDeadline = new Date(dueDate.getTime() + LENDING_OVERDUE_DAYS * MS_PER_DAY);
        if (today > overdueDeadline) {
          daysOverdue = Math.floor((today.getTime() - dueDate.getTime()) / MS_PER_DAY);
          isOverdue = true;
        }
      }

      result.items.push({
        rowIndex: i + 2, // dùng để gọi markLendingPaid(rowIndex)
        lendDate: Utilities.formatDate(lendDate, tz, 'yyyy-MM-dd'),
        borrower: String(borrower),
        amount: amt,
        dueDate: dueDate instanceof Date ? Utilities.formatDate(dueDate, tz, 'yyyy-MM-dd') : '',
        paidDate: isPaid ? Utilities.formatDate(paidDate, tz, 'yyyy-MM-dd') : '',
        note: note || '',
        isPaid: isPaid,
        daysOverdue: daysOverdue,
        isOverdue: isOverdue
      });

      if (!isPaid) {
        result.totals.totalLending += amt;
        if (isOverdue) { result.totals.totalOverdue += amt; result.totals.overdueCount++; }
      }
    });

    // Chưa trả lên trước; trong nhóm chưa trả thì hạn trả gần nhất lên trước.
    result.items.sort((a, b) => {
      if (a.isPaid !== b.isPaid) return a.isPaid ? 1 : -1;
      return (a.dueDate || '').localeCompare(b.dueDate || '');
    });

    return result;
  } catch (err) {
    console.error('getLendingReport error: ' + err.message);
    return { success: false, message: err.message };
  }
}

function addLendingEntry(payload) {
  try {
    if (!payload || !payload.borrower || !payload.amount || !payload.lendDate) {
      throw new Error('Thiếu dữ liệu bắt buộc (tên người vay / số tiền / ngày cho vay).');
    }
    const amount = Number(payload.amount);
    if (isNaN(amount) || amount <= 0) throw new Error('Số tiền không hợp lệ.');

    const lendDate = parseDateString_(payload.lendDate);
    if (!lendDate) throw new Error('Ngày cho vay không hợp lệ.');
    const dueDate = payload.dueDate ? parseDateString_(payload.dueDate) : '';

    ensureSheets_();
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(SHEET_LENDING);

    const lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try {
      sheet.appendRow([lendDate, String(payload.borrower).trim(), amount, dueDate, '', payload.note || '']);
    } finally {
      lock.releaseLock();
    }

    return { success: true, message: 'Đã lưu khoản cho vay.' };
  } catch (err) {
    console.error('addLendingEntry error: ' + err.message);
    return { success: false, message: err.message };
  }
}

/** Đánh dấu 1 khoản cho vay đã được thu hồi (ghi ngày hôm nay vào cột "Ngày đã trả"). */
function markLendingPaid(rowIndex) {
  try {
    const row = Number(rowIndex);
    if (!row || row < 2) throw new Error('Dòng không hợp lệ.');
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(SHEET_LENDING);
    sheet.getRange(row, 5).setValue(new Date()); // cột E = Ngày đã trả
    return { success: true, message: 'Đã đánh dấu đã thu hồi.' };
  } catch (err) {
    console.error('markLendingPaid error: ' + err.message);
    return { success: false, message: err.message };
  }
}

// ============================================================
// THEO DÕI LOTTERY (CHUSEN) & CHẤM PSA — ngày dự kiến về hàng
// ============================================================
// Chi phí thật được ghi nhận NGAY vào Transactions (danh mục "Tiền lottery/PSA tenpai")
// tại thời điểm trúng/gửi đi trả tiền — sheet TheoDoiHang chỉ lưu ngày dự kiến về hàng +
// trạng thái theo dõi, KHÔNG phải bản ghi tài chính thứ hai (tránh tính trùng chi phí).
function getTrackingReport() {
  try {
    ensureSheets_();
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(SHEET_TRACKING);
    const lastRow = sheet.getLastRow();
    const tz = Session.getScriptTimeZone();
    const today = new Date();

    const result = { success: true, items: [], waitingCount: 0, overdueCount: 0 };
    if (lastRow < 2) return result;

    const data = sheet.getRange(2, 1, lastRow - 1, TRACKING_HEADERS.length).getValues();
    data.forEach((row, i) => {
      const recordDate = row[0], type = row[1], name = row[2], amount = row[3], expectedDate = row[4], status = row[5], note = row[6];
      if (!(recordDate instanceof Date) || !name) return;

      const st = String(status || '').trim() || TRACKING_STATUS_WAITING;
      const isWaiting = st !== TRACKING_STATUS_ARRIVED;
      const isOverdue = isWaiting && expectedDate instanceof Date && today > expectedDate;

      result.items.push({
        rowIndex: i + 2, // dùng để gọi markTrackingArrived(rowIndex)
        recordDate: Utilities.formatDate(recordDate, tz, 'yyyy-MM-dd'),
        type: String(type || ''),
        name: String(name),
        amount: Number(amount) || 0,
        expectedDate: expectedDate instanceof Date ? Utilities.formatDate(expectedDate, tz, 'yyyy-MM-dd') : '',
        status: st,
        note: note || '',
        isWaiting: isWaiting,
        isOverdue: isOverdue
      });

      if (isWaiting) { result.waitingCount++; if (isOverdue) result.overdueCount++; }
    });

    // Đang chờ lên trước; trong nhóm đang chờ thì ngày dự kiến về gần nhất lên trước.
    result.items.sort((a, b) => {
      if (a.isWaiting !== b.isWaiting) return a.isWaiting ? -1 : 1;
      return (a.expectedDate || '').localeCompare(b.expectedDate || '');
    });

    return result;
  } catch (err) {
    console.error('getTrackingReport error: ' + err.message);
    return { success: false, message: err.message };
  }
}

/**
 * Thêm 1 đơn theo dõi Lottery/PSA MỚI. Đồng thời ghi luôn 1 giao dịch CHI vào Transactions
 * (danh mục "Tiền lottery/PSA tenpai", cùng Tên sản phẩm) — vì chi phí được tính ngay lúc
 * trả tiền theo lựa chọn thiết kế, không đợi hàng về mới ghi nhận.
 */
function addTrackingEntry(payload) {
  try {
    if (!payload || !payload.type || !payload.name || !payload.amount || !payload.recordDate) {
      throw new Error('Thiếu dữ liệu bắt buộc (loại / tên sản phẩm / số tiền / ngày ghi nhận).');
    }
    if (TRACKING_TYPES.indexOf(payload.type) === -1) throw new Error('Loại theo dõi không hợp lệ.');
    const amount = Number(payload.amount);
    if (isNaN(amount) || amount <= 0) throw new Error('Số tiền không hợp lệ.');

    const recordDate = parseDateString_(payload.recordDate);
    if (!recordDate) throw new Error('Ngày ghi nhận không hợp lệ.');
    const expectedDate = payload.expectedDate ? parseDateString_(payload.expectedDate) : '';
    const name = String(payload.name).trim();
    if (!name) throw new Error('Vui lòng nhập tên sản phẩm.');

    ensureSheets_();
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const txSheet = ss.getSheetByName(SHEET_TRANSACTIONS);
    const trackSheet = ss.getSheetByName(SHEET_TRACKING);

    const lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try {
      const noteLabel = (payload.type === TRACKING_TYPE_PSA ? 'Chấm PSA' : 'Trúng Lottery');
      txSheet.appendRow([recordDate, LABEL_EXPENSE, TENPAI_LOTTERY_CATEGORY, amount, noteLabel + ': ' + name, name]);
      trackSheet.appendRow([recordDate, payload.type, name, amount, expectedDate, TRACKING_STATUS_WAITING, payload.note || '']);
    } finally {
      lock.releaseLock();
    }

    return { success: true, message: 'Đã lưu — đồng thời ghi nhận chi phí vào Transactions.' };
  } catch (err) {
    console.error('addTrackingEntry error: ' + err.message);
    return { success: false, message: err.message };
  }
}

/** Đánh dấu 1 đơn Lottery/PSA đã về hàng. */
function markTrackingArrived(rowIndex) {
  try {
    const row = Number(rowIndex);
    if (!row || row < 2) throw new Error('Dòng không hợp lệ.');
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(SHEET_TRACKING);
    sheet.getRange(row, 6).setValue(TRACKING_STATUS_ARRIVED); // cột F = Trạng thái
    return { success: true, message: 'Đã đánh dấu đã về hàng.' };
  } catch (err) {
    console.error('markTrackingArrived error: ' + err.message);
    return { success: false, message: err.message };
  }
}

// ============================================================
// BÁO CÁO CUỐI NGÀY (kèm PDF) — thu/chi hôm nay + KPI tháng + cảnh báo nợ/cho vay/tồn kho
// ============================================================
// Hàm này KHÔNG tự chạy — tự tạo trigger time-driven cho hàm "sendDailyReportEmail":
// Apps Script Editor > biểu tượng đồng hồ "Triggers" (bên trái) > Add Trigger >
// Choose function: sendDailyReportEmail > Time-driven > Day timer > chọn khung giờ buổi tối.
// (Không gộp vào setupTriggers() vì bạn muốn tự chọn giờ chạy riêng cho báo cáo này.)
function sendDailyReportEmail() {
  try {
    ensureSheets_();
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const tz = Session.getScriptTimeZone();
    const now = new Date();
    const todayStr = Utilities.formatDate(now, tz, 'yyyy-MM-dd');
    const year = now.getFullYear(), month = now.getMonth() + 1;

    const sheet = ss.getSheetByName(SHEET_TRANSACTIONS);
    const lastRow = sheet.getLastRow();
    const categoryBudgetLimits = getCategoryBudgets_();
    const foodLimit = getFoodBudget_();

    let monthIncome = 0, monthExpense = 0, foodSpent = 0;
    const catSpent = {};
    Object.keys(categoryBudgetLimits).forEach(c => { catSpent[c] = 0; });
    const todayTx = [];

    if (lastRow >= 2) {
      const data = sheet.getRange(2, 1, lastRow - 1, TRANSACTION_HEADERS.length).getValues();
      data.forEach(row => {
        const dateVal = row[0], type = row[1], category = row[2], amount = Number(row[3]) || 0, note = row[4];
        if (!(dateVal instanceof Date)) return;

        if (Utilities.formatDate(dateVal, tz, 'yyyy-MM-dd') === todayStr) {
          todayTx.push({ type: type, category: category, amount: amount, note: note || '' });
        }
        if (dateVal.getFullYear() !== year || dateVal.getMonth() + 1 !== month) return;

        if (type === LABEL_INCOME) {
          monthIncome += amount;
        } else if (type === LABEL_EXPENSE) {
          monthExpense += amount;
          if (FOOD_BUDGET_CATEGORIES.indexOf(category) !== -1) foodSpent += amount;
          if (catSpent.hasOwnProperty(category)) catSpent[category] += amount;
        }
      });
    }

    const savingsRate = monthIncome > 0 ? Math.round(((monthIncome - monthExpense) / monthIncome) * 1000) / 10 : 0;
    const foodPercent = foodLimit > 0 ? Math.round(foodSpent / foodLimit * 1000) / 10 : 0;
    const categoryBudgets = Object.keys(categoryBudgetLimits).map(cat => ({
      category: cat,
      spent: catSpent[cat],
      limit: categoryBudgetLimits[cat],
      percent: categoryBudgetLimits[cat] > 0 ? Math.round(catSpent[cat] / categoryBudgetLimits[cat] * 1000) / 10 : 0
    }));

    const tenpai = getTenpaiReport();
    const lending = getLendingReport();
    const tracking = getTrackingReport();
    const lendingOverdueItems = (lending.items || []).filter(i => i.isOverdue);
    const trackingOverdueItems = (tracking.items || []).filter(i => i.isOverdue);

    const reportData = {
      dateLabel: Utilities.formatDate(now, tz, 'dd/MM/yyyy'),
      year: year, month: month,
      monthIncome: monthIncome, monthExpense: monthExpense, savingsRate: savingsRate,
      todayTx: todayTx,
      foodSpent: foodSpent, foodLimit: foodLimit, foodPercent: foodPercent,
      categoryBudgets: categoryBudgets,
      tenpai: {
        revenue: tenpai.totals.revenue, cost: tenpai.totals.cost, profit: tenpai.totals.profit,
        pendingCost: tenpai.totals.pendingCost, staleCount: tenpai.staleCount
      },
      lending: {
        totalLending: lending.totals.totalLending, totalOverdue: lending.totals.totalOverdue,
        overdueCount: lending.totals.overdueCount, overdueItems: lendingOverdueItems
      },
      tracking: { overdueItems: trackingOverdueItems }
    };

    // ---- Nội dung email (text ngắn gọn) ----
    let bodyText = 'BÁO CÁO CUỐI NGÀY - ' + reportData.dateLabel + '\n\n';
    if (todayTx.length) {
      const todayIncome = todayTx.filter(t => t.type === LABEL_INCOME).reduce((s, t) => s + t.amount, 0);
      const todayExpense = todayTx.filter(t => t.type === LABEL_EXPENSE).reduce((s, t) => s + t.amount, 0);
      bodyText += 'Hôm nay: Thu ' + fmtYen_(todayIncome) + ' · Chi ' + fmtYen_(todayExpense) + ' (' + todayTx.length + ' giao dịch)\n';
    } else {
      bodyText += '⚠️ Hôm nay chưa nhập giao dịch nào — đừng quên nhập nhé!\n https://script.google.com/macros/s/AKfycbxh94BJvuGUamEJJZW90bqAVBFGAI1XR1sV1BtiVQ4aMXTLwmcKmIti5RmBFBYpAY4TdQ/exec?page=form';
    }
    bodyText += '\nTháng ' + month + '/' + year + ': Thu ' + fmtYen_(monthIncome) + ' · Chi ' + fmtYen_(monthExpense) +
      ' · Tiết kiệm ' + savingsRate + '%\n';
    bodyText += 'Ăn uống: ' + fmtYen_(foodSpent) + ' / ' + fmtYen_(foodLimit) + ' (' + foodPercent + '%)\n';

    const warnings = [];
    if (lendingOverdueItems.length) {
      warnings.push('💸 ' + lendingOverdueItems.length + ' khoản cho vay quá hạn (' + LENDING_OVERDUE_DAYS +
        '+ ngày), tổng ' + fmtYen_(lending.totals.totalOverdue));
    }
    if (trackingOverdueItems.length) {
      warnings.push('📦 ' + trackingOverdueItems.length + ' đơn Lottery/PSA đã trễ hẹn về hàng');
    }
    if (tenpai.staleCount > 0) {
      warnings.push('🛍️ ' + tenpai.staleCount + ' món hàng Tenpai tồn kho quá ' + TENPAI_STALE_DAYS + ' ngày');
    }
    if (warnings.length) {
      bodyText += '\nCẢNH BÁO:\n' + warnings.map(w => '  - ' + w).join('\n') + '\n';
    }
    bodyText += '\n📎 Xem báo cáo đầy đủ (giống Dashboard) trong file PDF đính kèm.';

    const recipient = getReportRecipientEmail_();
    if (!recipient) {
      console.error('sendDailyReportEmail: không xác định được email người nhận.');
      return;
    }

    const pdfBlob = buildDailyReportPdf_(reportData);
    MailApp.sendEmail({
      to: recipient,
      subject: '📊 Báo cáo cuối ngày ' + reportData.dateLabel,
      body: bodyText,
      attachments: [pdfBlob]
    });
  } catch (err) {
    console.error('sendDailyReportEmail error: ' + err.message);
  }
}

/**
 * Dựng file PDF báo cáo đầy đủ (giống snapshot Dashboard) bằng cách tạo tạm 1 Google Doc,
 * đổ nội dung vào, xuất ra PDF rồi xoá Doc tạm — đây là cách chuẩn để tạo PDF trong Apps
 * Script (không có API xuất PDF trực tiếp từ HTML). LƯU Ý: lần đầu chạy hàm này (hoặc
 * sendDailyReportEmail) Google sẽ hỏi cấp thêm quyền truy cập Google Docs/Drive — đó là
 * quyền cần thiết để tạo & xoá file Doc tạm, không phải lỗi.
 */
function buildDailyReportPdf_(reportData) {
  const tempDoc = DocumentApp.create('BaoCaoTamThoi_' + new Date().getTime());
  const docId = tempDoc.getId();
  const body = tempDoc.getBody();
  body.setMarginTop(36).setMarginBottom(36).setMarginLeft(40).setMarginRight(40);

  body.appendParagraph('BÁO CÁO CHI TIÊU HÀNG NGÀY').setHeading(DocumentApp.ParagraphHeading.TITLE);
  body.appendParagraph(reportData.dateLabel);

  body.appendParagraph('Tổng quan tháng ' + reportData.month + '/' + reportData.year).setHeading(DocumentApp.ParagraphHeading.HEADING1);
  body.appendTable([
    ['Thu nhập', fmtYen_(reportData.monthIncome)],
    ['Chi tiêu', fmtYen_(reportData.monthExpense)],
    ['Số dư', fmtYen_(reportData.monthIncome - reportData.monthExpense)],
    ['Tỷ lệ tiết kiệm', reportData.savingsRate + '%']
  ]);

  body.appendParagraph('Giao dịch hôm nay').setHeading(DocumentApp.ParagraphHeading.HEADING1);
  if (reportData.todayTx.length) {
    const rows = [['Loại', 'Danh mục', 'Số tiền', 'Ghi chú']].concat(
      reportData.todayTx.map(t => [t.type, t.category, fmtYen_(t.amount), t.note])
    );
    body.appendTable(rows);
  } else {
    body.appendParagraph('Không có giao dịch nào được ghi nhận hôm nay.');
  }

  body.appendParagraph('Ngân sách ăn uống').setHeading(DocumentApp.ParagraphHeading.HEADING1);
  body.appendParagraph(fmtYen_(reportData.foodSpent) + ' / ' + fmtYen_(reportData.foodLimit) +
    ' (' + reportData.foodPercent + '%)');

  if (reportData.categoryBudgets.length) {
    body.appendParagraph('Ngân sách theo danh mục').setHeading(DocumentApp.ParagraphHeading.HEADING1);
    const catRows = [['Danh mục', 'Đã chi', 'Hạn mức', '%']].concat(
      reportData.categoryBudgets.map(c => [c.category, fmtYen_(c.spent), fmtYen_(c.limit), c.percent + '%'])
    );
    body.appendTable(catRows);
  }

  body.appendParagraph('Kinh doanh Tenpai').setHeading(DocumentApp.ParagraphHeading.HEADING1);
  body.appendParagraph(
    'Doanh thu: ' + fmtYen_(reportData.tenpai.revenue) +
    '   Chi phí: ' + fmtYen_(reportData.tenpai.cost) +
    '   Lời/lỗ: ' + fmtYen_(reportData.tenpai.profit) +
    '   Vốn chờ bán: ' + fmtYen_(reportData.tenpai.pendingCost)
  );
  if (reportData.tenpai.staleCount > 0) {
    body.appendParagraph('⚠ Có ' + reportData.tenpai.staleCount + ' món hàng tồn kho quá ' + TENPAI_STALE_DAYS + ' ngày chưa bán.');
  }

  body.appendParagraph('Quản lý cho vay').setHeading(DocumentApp.ParagraphHeading.HEADING1);
  body.appendParagraph(
    'Tổng đang cho vay: ' + fmtYen_(reportData.lending.totalLending) +
    '   Quá hạn (> ' + LENDING_OVERDUE_DAYS + ' ngày): ' + fmtYen_(reportData.lending.totalOverdue) +
    ' (' + reportData.lending.overdueCount + ' khoản)'
  );
  if (reportData.lending.overdueItems.length) {
    const lendRows = [['Người vay', 'Số tiền', 'Hạn trả', 'Số ngày quá hạn']].concat(
      reportData.lending.overdueItems.map(l => [l.borrower, fmtYen_(l.amount), l.dueDate, String(l.daysOverdue)])
    );
    body.appendTable(lendRows);
  }

  body.appendParagraph('Theo dõi Lottery / Chấm PSA').setHeading(DocumentApp.ParagraphHeading.HEADING1);
  if (reportData.tracking.overdueItems.length) {
    body.appendParagraph('⚠ Các đơn đã trễ hẹn về hàng:');
    const trackRows = [['Loại', 'Tên sản phẩm', 'Ngày dự kiến về']].concat(
      reportData.tracking.overdueItems.map(t => [t.type, t.name, t.expectedDate])
    );
    body.appendTable(trackRows);
  } else {
    body.appendParagraph('Không có đơn nào trễ hẹn.');
  }

  tempDoc.saveAndClose();
  const file = DriveApp.getFileById(docId);
  const pdfBlob = file.getAs(MimeType.PDF).setName('BaoCao_' + reportData.dateLabel.replace(/\//g, '-') + '.pdf');
  file.setTrashed(true); // chỉ dùng Doc để render PDF — dọn ngay, không để rác trong Drive

  return pdfBlob;
}
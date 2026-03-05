const SHEET_ID = "1mplUtqcwy_pIu4-q6nzF1VFFTUiV3ipa0L6Ir1P1ODI";

function doGet(e) { return handleRequest(e); }
function doPost(e) { return handleRequest(e); }

function handleRequest(e) {
  const params = e.parameter;
  const body = e.postData ? JSON.parse(e.postData.contents) : {};
  const action = params.action || body.action;

  try {
    const ss = SpreadsheetApp.openById(SHEET_ID);
    let result;

    if (action === "read") {
      const sheet = ss.getSheetByName(params.sheet);
      if (!sheet) throw new Error("Sheet not found: " + params.sheet);
      const data = sheet.getRange(params.range || "A1:Z1000").getValues();
      result = { success: true, data };

    } else if (action === "append") {
      const sheet = ss.getSheetByName(body.sheet);
      if (!sheet) throw new Error("Sheet not found: " + body.sheet);
      sheet.appendRow(body.row);
      result = { success: true };

    } else if (action === "updateStatus") {
      const sheet = ss.getSheetByName("Posts Log");
      if (!sheet) throw new Error("Posts Log sheet not found");
      const lastRow = sheet.getLastRow();
      // Find the row by scanning Approval Status column (col 12)
      const data = sheet.getRange(5, 1, lastRow, 12).getValues();
      let updated = false;
      for (let i = data.length - 1; i >= 0; i--) {
        if (data[i][11] === "Pending" || data[i][11] === "") {
          sheet.getRange(5 + i, 12).setValue(body.status);
          sheet.getRange(5 + i, 13).setValue(new Date().toLocaleTimeString());
          updated = true;
          break;
        }
      }
      result = { success: true, updated };

    } else if (action === "ping") {
      const sheets = ss.getSheets().map(s => s.getName());
      result = { success: true, message: "Football Lens Brain connected!", sheets };

    } else {
      result = { success: false, message: "Unknown action" };
    }

    return ContentService
      .createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ success: false, error: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

const MAX_CELL = 5000;

function doGet() {
  const [headers, ...values] = firstSheet().getDataRange().getValues();
  const rows = values.map((cells) => Object.fromEntries(headers.map((header, index) => [String(header).trim(), cellText(cells[index])])));
  return json(rows);
}

function doPost(event) {
  const input = JSON.parse(event.postData.contents);
  const passcode = PropertiesService.getScriptProperties().getProperty('PASSCODE');
  if (!passcode || input.passcode !== passcode) {
    return json({ error: '团员密码不对。' });
  }
  const id = youtubeId(input['链接']);
  if (!id) {
    return json({ error: '这不是 YouTube 影片链接。' });
  }
  input['类型'] = String(input['类型'] || '').trim() || '练习';
  input['标题'] = String(input['标题'] || '').trim() || youtubeTitle(input['链接']) || '未命名影片';
  input['日期'] = String(input['日期'] || '').trim() || Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sheet = firstSheet();
    const values = sheet.getDataRange().getValues();
    const headers = values[0].map((header) => String(header).trim());
    const linkColumn = headers.indexOf('链接');
    const index = values.findIndex((cells, rowIndex) => rowIndex > 0 && youtubeId(cells[linkColumn]) === id);
    const old = index > 0 ? values[index] : [];
    // A leading ' stores the text as typed, so a 鼓谱 like "-R" never becomes a formula.
    const row = headers.map((header, column) => {
      if (header in input) {
        return "'" + String(input[header]).slice(0, MAX_CELL);
      }
      return old[column] === undefined ? '' : old[column];
    });
    if (index > 0) {
      sheet.getRange(index + 1, 1, 1, row.length).setValues([row]);
    } else {
      sheet.appendRow(row);
    }
  } finally {
    lock.releaseLock();
  }
  return json({ ok: true, id: id });
}

function firstSheet() {
  return SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
}

function youtubeTitle(url) {
  try {
    const response = UrlFetchApp.fetch('https://www.youtube.com/oembed?format=json&url=' + encodeURIComponent(url), { muteHttpExceptions: true });
    return response.getResponseCode() === 200 ? JSON.parse(response.getContentText()).title : '';
  } catch (error) {
    return '';
  }
}

function youtubeId(url) {
  const match = String(url || '').match(/(?:v=|youtu\.be\/|shorts\/|embed\/|live\/)([\w-]{11})/);
  return match ? match[1] : '';
}

function cellText(value) {
  // Sheets turns typed dates into Date objects; the site sorts on YYYY-MM-DD text.
  return value instanceof Date ? Utilities.formatDate(value, Session.getScriptTimeZone(), 'yyyy-MM-dd') : String(value);
}

function json(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
}

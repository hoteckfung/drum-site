const MAX_CELL = 5000;
const WAVES = ['sine', 'triangle', 'square', 'sawtooth'];
const FILTERS = ['lowpass', 'bandpass', 'highpass'];
const MAX_LAYERS = 4;

function doGet(event) {
  if (event && event.parameter && event.parameter.sounds) {
    return json(JSON.parse(PropertiesService.getScriptProperties().getProperty('SOUNDS') || 'null'));
  }
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
  if (input.action === 'sounds') {
    PropertiesService.getScriptProperties().setProperty('SOUNDS', JSON.stringify(cleanSounds(input.sounds)));
    return json({ ok: true });
  }
  const id = youtubeId(input['链接']);
  if (!id) {
    return json({ error: '这不是 YouTube 影片链接。' });
  }
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    if (input.action === 'delete') {
      deleteVideo(id);
    } else {
      saveVideo(input, id);
    }
  } finally {
    lock.releaseLock();
  }
  return json({ ok: true, id: id });
}

function saveVideo(input, id) {
  input['类型'] = String(input['类型'] || '').trim() || '练习';
  input['标题'] = String(input['标题'] || '').trim() || youtubeTitle(input['链接']) || '未命名影片';
  input['日期'] = String(input['日期'] || '').trim() || Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
  const sheet = firstSheet();
  const values = sheet.getDataRange().getValues();
  const headers = values[0].map((header) => String(header).trim());
  const index = rowIndex(values, id);
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
}

function deleteVideo(id) {
  const sheet = firstSheet();
  const index = rowIndex(sheet.getDataRange().getValues(), id);
  if (index > 0) {
    sheet.deleteRow(index + 1);
  }
}

function rowIndex(values, id) {
  const linkColumn = values[0].map((header) => String(header).trim()).indexOf('链接');
  return values.findIndex((cells, index) => index > 0 && youtubeId(cells[linkColumn]) === id);
}

function cleanSounds(input) {
  const source = input || {};
  return { core: cleanSound(source.core), rim: cleanSound(source.rim) };
}

function cleanSound(input) {
  const sound = input || {};
  const layers = Array.isArray(sound.layers) ? sound.layers.slice(0, MAX_LAYERS) : [];
  const noise = sound.noise || {};
  return {
    layers: layers.map((layer) => ({
      wave: WAVES.includes(layer.wave) ? layer.wave : 'sine',
      from: clamp(layer.from, 20, 8000),
      to: clamp(layer.to, 20, 8000),
      drop: clamp(layer.drop, 0.001, 1),
      length: clamp(layer.length, 0.005, 3),
      volume: clamp(layer.volume, 0, 1),
    })),
    noise: {
      filter: FILTERS.includes(noise.filter) ? noise.filter : 'lowpass',
      frequency: clamp(noise.frequency, 50, 12000),
      q: clamp(noise.q, 0.1, 30),
      length: clamp(noise.length, 0.001, 0.5),
      volume: clamp(noise.volume, 0, 10),
    },
  };
}

function clamp(value, low, high) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(high, Math.max(low, number)) : low;
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

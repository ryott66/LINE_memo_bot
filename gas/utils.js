function log(msg) {
  const ss = SpreadsheetApp.openByUrl(SHEET_URL);
  const sheet = ss.getSheetByName("Log") || ss.insertSheet("Log");
  sheet.appendRow([new Date(), JSON.stringify(msg)]);
}

function safeFetch(url, options, context = 'LINE API') {
  try {
    const response = UrlFetchApp.fetch(url, options);
    const code = response.getResponseCode();

    if (code !== 200) {
      console.error(`[${context}] HTTP ${code} - ${response.getContentText()}`);
      return null;
    }
    logResponse(url, options, response);
    return response;
  } catch (err) {
    console.error(`[${context}] Fetch error: ${err.message}`);
    return null;
  }
}

function logResponse(url, options, response) {
  Logger.log('==== API Request ====');
  Logger.log('URL: ' + url);
  Logger.log('Payload: ' + options.payload);
  Logger.log('Headers: ' + JSON.stringify(options.headers));
  if (response) {
    Logger.log('Response Code: ' + response.getResponseCode());
    Logger.log('Response Body: ' + response.getContentText());
  }
  Logger.log('=====================');
}

function showLoading(userId, seconds) {
  try {
    const ACCESS_TOKEN = PropertiesService.getScriptProperties().getProperty('ACCESS_TOKEN');
    const payload = JSON.stringify({
      chatId: userId,
      loadingSeconds: seconds
    });
    const option = {
      'headers': {
        'Content-Type': 'application/json; charset=UTF-8',
        'Authorization': 'Bearer ' + ACCESS_TOKEN
      },
      'method': 'post',
      'payload': payload,
      // muteHttpExceptions を付け、呼び出し失敗でも例外にしない
      'muteHttpExceptions': true
    };
    // safeFetch を使ってエラーを吸収する
    const resp = safeFetch(LINE_SHOW_LOADING_URL, option, 'LINE loading');
    if (!resp) {
      console.warn('[showLoading] loading API returned non-200 or fetch failed');
    }
    return resp;
  } catch (err) {
    console.error('[showLoading] unexpected error', err);
    return null;
  }
}

function getMemoSheetName(userId) {
  return `${userId}_MEMO`;
}

function getUrlSheetName(userId) {
  return `${userId}_URL`;
}

function getOrCreateSheet(name) {
  const sheet = SpreadsheetApp.openByUrl(SHEET_URL);
  let theSheet = sheet.getSheetByName(name);
  if (!theSheet) {
    theSheet = sheet.insertSheet(name);
  }
  return theSheet;
}

function setUserMode(userId, mode) {
  const userProps = PropertiesService.getUserProperties();
  userProps.setProperty(userId, mode);
}

function getUserMode(userId) {
  const userProps = PropertiesService.getUserProperties();
  return userProps.getProperty(userId) || 'idle';
}

function clearUserMode(userId) {
  const userProps = PropertiesService.getUserProperties();
  userProps.deleteProperty(userId);
}

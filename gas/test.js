// Unit tests for LINE bot functionality
// GAS-compatible test approach using testable wrapper functions

function test_webhook_url() {
  const option = {
    'headers': {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + ACCESS_TOKEN,
    },
    'method': 'post',
  };
  safeFetch("https://api.line.me/v2/bot/channel/webhook/test", option, context = 'LINE webhook test')
}

// Test utilities
function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message}\nExpected: ${expected}\nActual: ${actual}`);
  }
}

function assertIncludes(str, substring, message) {
  if (!str.includes(substring)) {
    throw new Error(`${message}\nExpected string to include: ${substring}\nActual: ${str}`);
  }
}

function assertNotEqual(actual, expected, message) {
  if (actual === expected) {
    throw new Error(`${message}\nExpected values to be different`);
  }
}

// Mock classes for GAS services
class MockPropertiesService {
  constructor() {
    this.userProperties = {};
    this.scriptProperties = {
      'ACCESS_TOKEN': 'test_token_12345',
      'SHEET_URL': 'https://test.sheet.url'
    };
  }
  
  getUserProperties() {
    const props = this.userProperties;
    return {
      setProperty: (key, value) => { props[key] = value; },
      getProperty: (key) => props[key] || null,
      deleteProperty: (key) => { delete props[key]; }
    };
  }
  
  getScriptProperties() {
    const props = this.scriptProperties;
    return {
      getProperty: (key) => props[key] || null
    };
  }
}

// Add CHANNEL_SECRET to mock script properties for signature tests
MockPropertiesService.prototype.getScriptProperties = function() {
  const props = this.scriptProperties;
  props['CHANNEL_SECRET'] = 'test_secret_123';
  return {
    getProperty: (key) => props[key] || null
  };
};

class MockUrlFetchApp {
  constructor() {
    this.fetchCalls = [];
  }
  
  fetch(url, options) {
    this.fetchCalls.push({ url, options });
    return { getResponseCode: () => 200 };
  }
}

class MockSpreadsheet {
  constructor(sheetData) {
    this.sheetData = sheetData || [['Item 1'], ['Item 2'], ['Item 3']];
  }
  
  getDataRange() {
    return {
      getValues: () => this.sheetData
    };
  }
  
  getLastRow() {
    return this.sheetData.length;
  }
  
  getRange(row, col) {
    const parent = this;
    return {
      setValue: (value) => {
        parent.sheetData.push([value]);
      }
    };
  }
  
  deleteRow(index) {
    if (index >= 1 && index <= this.sheetData.length) {
      this.sheetData.splice(index - 1, 1);
    }
  }
}

class MockSpreadsheetApp {
  constructor(sheetData) {
    this.sheet1 = new MockSpreadsheet(sheetData);
    this.sheet2 = new MockSpreadsheet(sheetData ? JSON.parse(JSON.stringify(sheetData)) : null);
  }
  
  openByUrl(url) {
    return {
      getSheets: () => [this.sheet1, this.sheet2]
    };
  }
}

// Testable wrapper functions that accept dependencies
function doPostTestable(e, deps) {
  const json = JSON.parse(e.postData.contents);
  const data = json.events[0];
  const userId = data.source.userId;
  const message = createReplyMessageTestable(userId, data.message.text, deps);

  const option = {
    'headers': {
      'Content-Type': 'application/json; charset=UTF-8',
      'Authorization': 'Bearer ' + deps.PropertiesService.getScriptProperties().getProperty('ACCESS_TOKEN'),
    },
    'method': 'post',
    'payload': JSON.stringify({
      'replyToken': data.replyToken,
      'messages': [{
        "type": "text",
        "text": message
      }],
    }),
  };
  deps.UrlFetchApp.fetch('https://api.line.me/v2/bot/message/reply', option);
}

function createReplyMessageTestable(userId, receivedMessage, deps) {
  const mode = getUserModeTestable(userId, deps);

  if (receivedMessage === '記入モード') {
    setUserModeTestable(userId, 'waiting_input', deps);
    return '記録モードに入りました。次のメッセージを記録します。';
  }
  else if (receivedMessage === '削除モード') {
    setUserModeTestable(userId, 'waiting_delete', deps);
    return '削除モードに入りました。削除したい番号を送ってください。削除をやめる場合は0を入力してください';
  }
  else if (receivedMessage === 'URL') {
    return readSheatTestable(0, deps);
  }
  else if (receivedMessage === 'メモ') {
    return readSheatTestable(1, deps);
  }
  else if (mode === 'waiting_input') {
    recordToSheatTestable(receivedMessage, 1, deps);
    clearUserModeTestable(userId, deps);
    return 'メモを記録しました。';
  }
  else if (mode === 'waiting_delete') {
    const deleteIndex = Number(receivedMessage);
    
    if (deleteIndex === 0) {
      clearUserModeTestable(userId, deps);
      return '削除をキャンセルしました。';
    }
    
    if (!Number.isInteger(deleteIndex)) {
      return '数字で削除したい番号を送ってください。（0でキャンセル）';
    }
    
    const result = deleteFromSheatTestable(1, deleteIndex, deps);
    
    if (result === '無効な番号です。') {
      return '無効な番号です。再度番号を送ってください。（0でキャンセル）';
    }
    
    clearUserModeTestable(userId, deps);
    return result;
  }
  else {
    return "";
  }
}

function setUserModeTestable(userId, mode, deps) {
  const userProps = deps.PropertiesService.getUserProperties();
  userProps.setProperty(userId, mode);
}

function getUserModeTestable(userId, deps) {
  const userProps = deps.PropertiesService.getUserProperties();
  return userProps.getProperty(userId) || 'idle';
}

function clearUserModeTestable(userId, deps) {
  const userProps = deps.PropertiesService.getUserProperties();
  userProps.deleteProperty(userId);
}

function recordToSheatTestable(word, type, deps) {
  const spreadSheet = deps.SpreadsheetApp.openByUrl('test_url');
  const theSheet = spreadSheet.getSheets()[type];
  const lastRow = theSheet.getLastRow();
  theSheet.getRange(lastRow + 1, 1).setValue(word);
}

function readSheatTestable(type, deps) {
  const spreadSheet = deps.SpreadsheetApp.openByUrl('test_url');
  const theSheet = spreadSheet.getSheets()[type];
  const dataRanges = theSheet.getDataRange();
  const datas = dataRanges.getValues();

  const dataString = datas.map((row, i) => `${i + 1}. ${row.join(' ')}`).join('\n');
  return dataString || 'データが存在しません。';
}

function deleteFromSheatTestable(type, index, deps) {
  const spreadSheet = deps.SpreadsheetApp.openByUrl('test_url');
  const theSheet = spreadSheet.getSheets()[type];
  const lastRow = theSheet.getLastRow();

  if (index < 1 || index > lastRow) {
    return '無効な番号です。';
  }

  theSheet.deleteRow(index);
  return `メモ ${index} を削除しました。`;
}

// Test 1: doPost correctly processes incoming LINE messages and sends a reply
function testDoPostProcessesMessagesAndSendsReply() {
  console.log('Running Test 1: doPost processes incoming LINE messages and sends a reply');
  
  const mockProps = new MockPropertiesService();
  const mockFetch = new MockUrlFetchApp();
  const mockSheet = new MockSpreadsheetApp();
  
  const deps = {
    PropertiesService: mockProps,
    UrlFetchApp: mockFetch,
    SpreadsheetApp: mockSheet
  };
  
  const mockEvent = {
    postData: {
      contents: JSON.stringify({
        events: [{
          replyToken: 'test_reply_token_123',
          source: { userId: 'test_user_001' },
          message: { text: 'メモ' }
        }]
      })
    }
  };
  
  doPostTestable(mockEvent, deps);
  
  assertEqual(mockFetch.fetchCalls.length, 1, 'Should make exactly 1 fetch call');
  assertEqual(mockFetch.fetchCalls[0].url, 'https://api.line.me/v2/bot/message/reply', 'Should call LINE API');
  assertEqual(mockFetch.fetchCalls[0].options.method, 'post', 'Should use POST method');
  assertIncludes(mockFetch.fetchCalls[0].options.headers.Authorization, 'test_token', 'Should include access token');
  
  const payload = JSON.parse(mockFetch.fetchCalls[0].options.payload);
  assertEqual(payload.replyToken, 'test_reply_token_123', 'Should include reply token');
  assertEqual(payload.messages[0].type, 'text', 'Should send text message');
  
  console.log('✓ Test 1 passed');
}

// Test 2: createReplyMessage correctly handles the '記入モード' command and updates the user's state
function testCreateReplyMessageHandlesRecordMode() {
  console.log('Running Test 2: createReplyMessage handles 記入モード command');
  
  const mockProps = new MockPropertiesService();
  const deps = {
    PropertiesService: mockProps,
    UrlFetchApp: new MockUrlFetchApp(),
    SpreadsheetApp: new MockSpreadsheetApp()
  };
  
  const userId = 'test_user_002';
  const reply = createReplyMessageTestable(userId, '記入モード', deps);
  
  assertEqual(reply, '記録モードに入りました。次のメッセージを記録します。', 'Should return correct message');
  assertEqual(getUserModeTestable(userId, deps), 'waiting_input', 'Should set user mode to waiting_input');
  
  console.log('✓ Test 2 passed');
}

// Test 3: createReplyMessage correctly handles recording a message when the user is in 'waiting_input' mode
function testCreateReplyMessageHandlesRecordingInWaitingInputMode() {
  console.log('Running Test 3: createReplyMessage handles recording in waiting_input mode');
  
  const mockProps = new MockPropertiesService();
  const mockSheet = new MockSpreadsheetApp();
  const deps = {
    PropertiesService: mockProps,
    UrlFetchApp: new MockUrlFetchApp(),
    SpreadsheetApp: mockSheet
  };
  
  const userId = 'test_user_003';
  setUserModeTestable(userId, 'waiting_input', deps);
  
  const initialLength = mockSheet.sheet2.sheetData.length;
  const testMessage = 'Test memo content';
  
  const reply = createReplyMessageTestable(userId, testMessage, deps);
  
  assertEqual(reply, 'メモを記録しました。', 'Should return success message');
  assertEqual(mockSheet.sheet2.sheetData.length, initialLength + 1, 'Should add data to sheet');
  assertEqual(mockSheet.sheet2.sheetData[mockSheet.sheet2.sheetData.length - 1][0], testMessage, 'Should record correct message');
  assertEqual(getUserModeTestable(userId, deps), 'idle', 'Should clear user mode');
  
  console.log('✓ Test 3 passed');
}

// Test 4: createReplyMessage correctly handles the '削除モード' command and updates the user's state
function testCreateReplyMessageHandlesDeleteMode() {
  console.log('Running Test 4: createReplyMessage handles 削除モード command');
  
  const mockProps = new MockPropertiesService();
  const deps = {
    PropertiesService: mockProps,
    UrlFetchApp: new MockUrlFetchApp(),
    SpreadsheetApp: new MockSpreadsheetApp()
  };
  
  const userId = 'test_user_004';
  const reply = createReplyMessageTestable(userId, '削除モード', deps);
  
  assertEqual(reply, '削除モードに入りました。削除したい番号を送ってください。削除をやめる場合は0を入力してください', 'Should return correct message');
  assertEqual(getUserModeTestable(userId, deps), 'waiting_delete', 'Should set user mode to waiting_delete');
  
  console.log('✓ Test 4 passed');
}

// Test 5: createReplyMessage correctly handles deleting a record when the user is in 'waiting_delete' mode with a valid index and clears the state
function testCreateReplyMessageHandlesDeletingWithValidIndex() {
  console.log('Running Test 5: createReplyMessage handles deleting with valid index in waiting_delete mode');
  
  const mockProps = new MockPropertiesService();
  const mockSheet = new MockSpreadsheetApp();
  const deps = {
    PropertiesService: mockProps,
    UrlFetchApp: new MockUrlFetchApp(),
    SpreadsheetApp: mockSheet
  };
  
  const userId = 'test_user_005';
  setUserModeTestable(userId, 'waiting_delete', deps);
  
  const initialLength = mockSheet.sheet2.sheetData.length;
  const reply = createReplyMessageTestable(userId, '2', deps);
  
  assertIncludes(reply, '削除しました', 'Should return deletion confirmation');
  assertEqual(mockSheet.sheet2.sheetData.length, initialLength - 1, 'Should delete data from sheet');
  assertEqual(getUserModeTestable(userId, deps), 'idle', 'Should clear user mode');
  
  console.log('✓ Test 5 passed');
}

// Test 5b: Cancel deletion with 0
function testCreateReplyMessageHandlesCancelDeletion() {
  console.log('Running Test 5b: createReplyMessage handles cancel deletion with 0');
  
  const mockProps = new MockPropertiesService();
  const mockSheet = new MockSpreadsheetApp();
  const deps = {
    PropertiesService: mockProps,
    UrlFetchApp: new MockUrlFetchApp(),
    SpreadsheetApp: mockSheet
  };
  
  const userId = 'test_user_005b';
  setUserModeTestable(userId, 'waiting_delete', deps);
  
  const initialLength = mockSheet.sheet2.sheetData.length;
  const reply = createReplyMessageTestable(userId, '0', deps);
  
  assertEqual(reply, '削除をキャンセルしました。', 'Should return cancellation message');
  assertEqual(mockSheet.sheet2.sheetData.length, initialLength, 'Should not delete data');
  assertEqual(getUserModeTestable(userId, deps), 'idle', 'Should clear user mode');
  
  console.log('✓ Test 5b passed');
}

// Test 5c: Invalid index
function testCreateReplyMessageHandlesInvalidIndex() {
  console.log('Running Test 5c: createReplyMessage handles invalid deletion index');
  
  const mockProps = new MockPropertiesService();
  const mockSheet = new MockSpreadsheetApp();
  const deps = {
    PropertiesService: mockProps,
    UrlFetchApp: new MockUrlFetchApp(),
    SpreadsheetApp: mockSheet
  };
  
  const userId = 'test_user_005c';
  setUserModeTestable(userId, 'waiting_delete', deps);
  
  const initialLength = mockSheet.sheet2.sheetData.length;
  const reply = createReplyMessageTestable(userId, '999', deps);
  
  assertIncludes(reply, '無効な番号', 'Should return invalid index message');
  assertEqual(mockSheet.sheet2.sheetData.length, initialLength, 'Should not delete data');
  
  console.log('✓ Test 5c passed');
}

// Test 5d: Non-numeric input
function testCreateReplyMessageHandlesNonNumericInput() {
  console.log('Running Test 5d: createReplyMessage handles non-numeric input in delete mode');
  
  const mockProps = new MockPropertiesService();
  const mockSheet = new MockSpreadsheetApp();
  const deps = {
    PropertiesService: mockProps,
    UrlFetchApp: new MockUrlFetchApp(),
    SpreadsheetApp: mockSheet
  };
  
  const userId = 'test_user_005d';
  setUserModeTestable(userId, 'waiting_delete', deps);
  
  const initialLength = mockSheet.sheet2.sheetData.length;
  const reply = createReplyMessageTestable(userId, 'abc', deps);
  
  assertIncludes(reply, '数字', 'Should ask for numeric input');
  assertEqual(mockSheet.sheet2.sheetData.length, initialLength, 'Should not delete data');
  assertEqual(getUserModeTestable(userId, deps), 'waiting_delete', 'Should keep user in waiting_delete mode');
  
  console.log('✓ Test 5d passed');
}

// Run all tests
function runAllTests() {
  console.log('======================================');
  console.log('Starting Unit Tests');
  console.log('======================================\n');
  
  const tests = [
    testDoPostProcessesMessagesAndSendsReply,
    testCreateReplyMessageHandlesRecordMode,
    testCreateReplyMessageHandlesRecordingInWaitingInputMode,
    testCreateReplyMessageHandlesDeleteMode,
    testCreateReplyMessageHandlesDeletingWithValidIndex,
    testCreateReplyMessageHandlesCancelDeletion,
    testCreateReplyMessageHandlesInvalidIndex,
    testCreateReplyMessageHandlesNonNumericInput
  ];
  
  let passed = 0;
  let failed = 0;
  
  for (const test of tests) {
    try {
      test();
      passed++;
    } catch (error) {
      failed++;
      console.log(`✗ Test failed: ${error.message}`);
      console.log(`  Stack: ${error.stack}\n`);
    }
  }
  
  console.log('\n======================================');
  console.log(`Test Results: ${passed} passed, ${failed} failed`);
  console.log('======================================');
  
  return { passed, failed };
}

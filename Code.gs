function doGet(req) {
  var SPREADSHEET_ID = '1FSKB1vqEHa4fZSNEAPU4TIDzZMtNSIorsta_HH36IcE';
  var action = req && req.parameter ? req.parameter.action : '';
  var tableReq = req && req.parameter ? req.parameter.table : '';

  if (!action || !tableReq) {
    return response().auto(req, {
      success: false,
      error: 'Missing required query parameters: action, table'
    });
  }

  var db = SpreadsheetApp.openById(SPREADSHEET_ID);
  var table = db.getSheetByName(tableReq);
  if (!table) {
    return response().auto(req, {
      success: false,
      error: 'Sheet not found: ' + tableReq,
      spreadsheetId: db.getId(),
      spreadsheetUrl: db.getUrl()
    });
  }

  var ret;
  switch (action) {
    case 'read':
      ret = Read(req, table, db);
      break;
    case 'insert':
      ret = Insert(req, table, db);
      break;
    case 'update':
      ret = Update(req, table, db);
      break;
    case 'delete':
      ret = Delete(req, table, db);
      break;
    default:
      ret = {
        success: false,
        error: 'Unsupported action: ' + action
      };
      break;
  }

  return response().auto(req, ret);
}
			    
			    /* Read
			     * request for all tables
			     *
			     * @parameter action=read
			     * @parameter table=
			     * @parameter id=
			     *
			     * @example-request | ?action=read&table=
			     * @example-request-single-row | ?action=read&table=&id=
			     */
function Read(request, table, db) {
  var requestId = request && request.parameter ? request.parameter.id : '';
  return {
    success: true,
    data: _read(table, requestId),
    meta: buildMeta(db, table)
  };
}
			    
			    /* Insert
			     * dynamic for all data
			     *
			     * @parameter action=insert
			     * @parameter table=
			     * @parameter data=JSON
			     *  
			     * @example-request | ?action=insert&table=&data={"name":"John Doe"}
			     */
function Insert(request, table, db) {
  var result = {};

  try {
    var lastCol = table.getLastColumn();
    var firstRow = table.getRange(1, 1, 1, lastCol).getValues();
    var headers = firstRow.shift();
    var data = JSON.parse(request.parameter.data);

    // 데이터를 파싱한 뒤, 출시 알림/피드백 테이블이면 안내 메일 발송
    if (request.parameter.table === 'tab_final' && data.email) {
      sendMail(data.email);
    }

    // 중복 전송 방지: 최근 20개의 행을 확인하여 동일한 id와 time_stamp가 있는지 검사
    var allData = table.getDataRange().getValues();
    if (allData.length > 1) {
      var idIdx = headers.indexOf('id');
      var tsIdx = headers.indexOf('time_stamp');
      if (idIdx !== -1 && tsIdx !== -1) {
        var startIndex = Math.max(1, allData.length - 20);
        for (var i = startIndex; i < allData.length; i++) {
          if (allData[i][idIdx] == data.id && allData[i][tsIdx] == data.time_stamp) {
            result.success = true;
            result.data = data;
            result.meta = buildMeta(db, table);
            return result; // 중복이므로 추가하지 않고 성공 반환
          }
        }
      }
    }

    var newRow = prepareRow(data, headers);
    table.appendRow(newRow);

    result.success = true;
    result.data = data;
    result.meta = buildMeta(db, table);
  } catch (error) {
    result.success = false;
    result.data = { error: error.message };
  }

  return result;
}
			    
			    /* Update
			     * dynamic for all tablese
			     *
			     * @parameter action=update
			     * @parameter table=
			     * @parameter id=
			     * @parameter data=JSON
			     * 
			     * @example-request | ?action=update&table=&id=&data={"col_to_update": "value" }
			     */
function Update(request, table, db) {
  var result = {};

  try {
    var lastCol = table.getLastColumn();
    var firstRow = table.getRange(1, 1, 1, lastCol).getValues();
    var headers = firstRow.shift();

    var requestId = request.parameter.id;
    var currentData = _read(table, requestId);
    if (!currentData) {
      throw new Error('Row not found for id=' + requestId);
    }

    var data = JSON.parse(request.parameter.data);
    var currentRow = currentData.row;

    for (var objectKey in data) {
      var currentCol = headers.indexOf(objectKey) + 1;
      if (currentCol > 0) {
        table.getRange(currentRow, currentCol).setValue(data[objectKey]);
        currentData[objectKey] = data[objectKey];
      }
    }

    result.success = true;
    result.data = currentData;
    result.meta = buildMeta(db, table);
  } catch (error) {
    result.success = false;
    result.data = { error: error.message };
  }

  return result;
}
			    
			    /* Delete
			     * dynamic for all tables
			     *
			     * @parameter action=delete
			     * @parameter table=
			     * @parameter id=
			     * 
			     * @example-request | ?action=update&table=&id=
			     */
function Delete(request, table, db) {
  try {
    var requestId = request.parameter.id;
    var currentData = _read(table, requestId);
    if (!currentData) {
      throw new Error('Row not found for id=' + requestId);
    }

    table.deleteRow(currentData.row);
    return {
      success: true,
      data: currentData,
      meta: buildMeta(db, table)
    };
  } catch (error) {
    return {
      success: false,
      data: { error: error.message }
    };
  }
}
			    
			    /**
			     * Build the response content type 
			     * back to the user
			     */
function response() {
  return {
    json: function (data) {
      return ContentService
        .createTextOutput(JSON.stringify(data))
        .setMimeType(ContentService.MimeType.JSON);
    },
    jsonp: function (callback, data) {
      return ContentService
        .createTextOutput(callback + '(' + JSON.stringify(data) + ')')
        .setMimeType(ContentService.MimeType.JAVASCRIPT);
    },
    auto: function (req, data) {
      var callback = req && req.parameter ? (req.parameter.callback || req.parameter.jsonp) : '';
      if (callback) {
        return this.jsonp(callback, data);
      }
      return this.json(data);
    }
  };
}
			    
			    /**
			    * Read from sheet and return map key-value
			    * javascript object
			    */
function _read(sheet, id) {
  var data = sheet.getDataRange().getValues();
  var header = data.shift();

  var result = data.map(function (row, indx) {
    var reduced = header.reduce(function (accumulator, currentValue, currentIndex) {
      accumulator[currentValue] = row[currentIndex];
      return accumulator;
    }, {});

    reduced.row = indx + 2;
    return reduced;
  });

  if (typeof id !== 'undefined' && id !== null && String(id) !== '') {
    var idAsString = String(id);
    var filtered = result.filter(function (record) {
      return String(record.id) === idAsString;
    });
    return filtered.shift() || null;
  }

  return result;
}
			    
			    /*
			     * Prepare row with correct order to insert into
			     * sheet.
			     * 
			     * @throws Error
			     */
function prepareRow(objectToSort, arrayWithOrder) {
  var sortedArray = [];

  for (var i = 0; i < arrayWithOrder.length; i++) {
    var value = objectToSort[arrayWithOrder[i]];
    if (typeof value === 'undefined') {
      throw new Error('The attribute/column <' + arrayWithOrder[i] + '> is missing.');
    }
    sortedArray[i] = value;
  }

  return sortedArray;
}

function buildMeta(db, table) {
  return {
    spreadsheetId: db.getId(),
    spreadsheetUrl: db.getUrl(),
    sheetName: table.getName()
  };
}

function sendMail(email) {
  try {
    MailApp.sendEmail({
      to: email,
      subject: '감사합니다. 알려드리겠습니다.',
      htmlBody: '<html><p> 감사합니다. 많은 도움이 되었습니다. </p></html>'
    });
  } catch (e) {
    Logger.log(e);
  }
}
// Privacy scan for sms-privacy: reads every document the signed-in user has in
// the LOCAL Firestore emulator and reports any string field containing NEEDLE.
//
// Inputs (runScript env): NEEDLE — a distinctive fragment of the injected SMS body.
// Outputs: output.scanned (docs read), output.hits (array of "collection/id.field")
var PROJECT = 'loop-app-0403';
var OWNER = { Authorization: 'Bearer owner', 'Content-Type': 'application/json' };
var BASE = 'http://127.0.0.1:8080/v1/projects/' + PROJECT + '/databases/(default)/documents';
var COLLECTIONS = [
  'expenses', 'pendingExpenses', 'categories', 'settings', 'checkIns', 'coinLedger',
  'streak', 'wallet', 'dailyRollups', 'monthlyRollups', 'rollupApplied', 'devices',
];

function strings(value, path, found) {
  if (value === null || value === undefined) return;
  if ('stringValue' in value) found.push({ path: path, text: value.stringValue });
  if ('mapValue' in value) {
    var f = value.mapValue.fields || {};
    for (var k in f) strings(f[k], path + '.' + k, found);
  }
  if ('arrayValue' in value) (value.arrayValue.values || []).forEach(function (v, i) { strings(v, path + '[' + i + ']', found); });
}

var accounts = json(
  http.post('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/projects/' + PROJECT + '/accounts:query', {
    headers: OWNER,
    body: '{}',
  }).body,
);
var uid = (accounts.userInfo || [])[0] ? accounts.userInfo[0].localId : null;
output.scanned = 0;
output.hits = [];
if (uid) {
  var profile = http.get(BASE + '/users/' + uid, { headers: OWNER });
  var docs = profile.status === 200 ? [json(profile.body)] : [];
  COLLECTIONS.forEach(function (c) {
    var page = json(http.get(BASE + '/users/' + uid + '/' + c + '?pageSize=300', { headers: OWNER }).body);
    docs = docs.concat(page.documents || []);
  });
  docs.forEach(function (doc) {
    output.scanned += 1;
    var found = [];
    var f = doc.fields || {};
    for (var k in f) strings(f[k], k, found);
    found.forEach(function (s) {
      if (s.text.indexOf(NEEDLE) >= 0) output.hits.push(doc.name.split('/documents/')[1] + '.' + s.path);
    });
  });
}

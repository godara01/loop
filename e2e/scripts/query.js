// Reads the signed-in user's data straight from the local emulators, so flows can
// assert what was actually stored rather than only what is on screen.
//
// Inputs (runScript env):
//   COLLECTION  optional, e.g. "expenses" — a collection under users/{uid}
//   DOC         optional, e.g. "settings/app" — a single document under users/{uid}
// Outputs:
//   output.userCount, output.uid, output.docs (array of plain objects with `id`), output.doc
var PROJECT = 'loop-app-0403';
var OWNER = { Authorization: 'Bearer owner', 'Content-Type': 'application/json' };
var BASE = 'http://127.0.0.1:8080/v1/projects/' + PROJECT + '/databases/(default)/documents';

function decode(value) {
  if (value === undefined || value === null) return null;
  if ('nullValue' in value) return null;
  if ('stringValue' in value) return value.stringValue;
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return value.doubleValue;
  if ('booleanValue' in value) return value.booleanValue;
  if ('arrayValue' in value) return (value.arrayValue.values || []).map(decode);
  if ('mapValue' in value) return fields(value.mapValue.fields || {});
  return null;
}
function fields(map) {
  var out = {};
  for (var key in map) out[key] = decode(map[key]);
  return out;
}
function toDoc(raw) {
  var doc = fields(raw.fields || {});
  doc.id = raw.name.split('/').pop();
  return doc;
}

var accounts = json(
  http.post(
    'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/projects/' + PROJECT + '/accounts:query',
    { headers: OWNER, body: '{}' },
  ).body,
);
var users = accounts.userInfo || [];
output.userCount = users.length;
output.uid = users.length > 0 ? users[0].localId : null;
output.docs = [];
output.doc = null;

if (output.uid && typeof COLLECTION !== 'undefined') {
  var page = json(http.get(BASE + '/users/' + output.uid + '/' + COLLECTION + '?pageSize=300', { headers: OWNER }).body);
  output.docs = (page.documents || []).map(toDoc);
}
if (output.uid && typeof DOC !== 'undefined') {
  var response = http.get(BASE + '/users/' + output.uid + '/' + DOC, { headers: OWNER });
  output.doc = response.status === 200 ? toDoc(json(response.body)) : null;
}

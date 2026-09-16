// Deletes every document and account in the LOCAL emulators. The URLs are
// hard-wired to 127.0.0.1, so this cannot reach a real project.
var PROJECT = 'loop-app-0403';
var firestore = http.delete(
  'http://127.0.0.1:8080/emulator/v1/projects/' + PROJECT + '/databases/(default)/documents',
);
var auth = http.delete('http://127.0.0.1:9099/emulator/v1/projects/' + PROJECT + '/accounts');
output.reset = firestore.status === 200 && auth.status === 200;

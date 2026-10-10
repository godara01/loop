// Reads the latest phone verification code the LOCAL Auth emulator issued. The
// URL is hard-wired to 127.0.0.1, so this cannot reach a real project.
var PROJECT = 'loop-app-0403';
var res = http.get('http://127.0.0.1:9099/emulator/v1/projects/' + PROJECT + '/verificationCodes');
var codes = JSON.parse(res.body).verificationCodes || [];
var code = '';
for (var i = 0; i < codes.length; i++) {
  if (codes[i].phoneNumber === '+919999900001') code = codes[i].code;
}
output.code = code;

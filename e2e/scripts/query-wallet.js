/**
 * Query the current user's wallet (coin balance).
 * Requires: FIRESTORE_EMULATOR_HOST set.
 */
const fs = require('fs');
const uid = process.env.TEST_UID || 'owner';
const host = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080';

const url = `http://${host}/v1/projects/demo-loop/databases/(default)/documents/users/${uid}/wallet/main`;

fetch(url, {
  headers: { 'Authorization': 'Bearer owner' }
})
  .then(r => r.json())
  .then(data => {
    if (data.fields) {
      console.log(JSON.stringify({
        coinBalance: data.fields.coinBalance?.integerValue || 0
      }));
    } else {
      console.log(JSON.stringify({ coinBalance: 0 }));
    }
  })
  .catch(e => {
    console.error('Wallet query error:', e.message);
    process.exit(1);
  });

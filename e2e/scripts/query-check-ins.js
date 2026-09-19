/**
 * Query check-ins for the current user on today's date.
 * Requires: FIRESTORE_EMULATOR_HOST set.
 */
const fs = require('fs');
const uid = process.env.TEST_UID || 'owner';
const host = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080';

const url = `http://${host}/v1/projects/demo-loop/databases/(default)/documents/users/${uid}/checkIns`;

fetch(url, {
  headers: { 'Authorization': 'Bearer owner' }
})
  .then(r => r.json())
  .then(data => {
    console.log(JSON.stringify({
      docs: data.documents || []
    }));
  })
  .catch(e => {
    console.error('Check-ins query error:', e.message);
    process.exit(1);
  });

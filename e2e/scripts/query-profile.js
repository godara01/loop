/**
 * Query the current user's profile document.
 * Requires: FIRESTORE_EMULATOR_HOST set.
 */
const fs = require('fs');
const uid = process.env.TEST_UID || 'owner';
const host = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080';

const url = `http://${host}/v1/projects/demo-loop/databases/(default)/documents/users/${uid}/profile/main`;

fetch(url, {
  headers: { 'Authorization': 'Bearer owner' }
})
  .then(r => r.json())
  .then(data => {
    if (data.fields) {
      console.log(JSON.stringify({
        onboardedAt: data.fields.onboardedAt?.stringValue || null,
        currency: data.fields.currency?.stringValue || null,
        displayName: data.fields.displayName?.stringValue || null,
      }));
    } else {
      console.log(JSON.stringify({}));
    }
  })
  .catch(e => {
    console.error('Profile query error:', e.message);
    process.exit(1);
  });

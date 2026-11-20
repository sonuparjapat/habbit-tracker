/**
 * Adds to app.json at build time (everything else lives in app.json).
 *
 * Push notifications from the server (evening check-in, Admin → Notifications) reach Android
 * phones through Google's Firebase Cloud Messaging. Drop the `google-services.json` you download
 * from Firebase into this folder and it is picked up automatically — no other change needed.
 * Without the file the app still builds and works (only server push is unavailable).
 */
const fs = require('node:fs');
const path = require('node:path');

module.exports = ({ config }) => {
  const firebaseFile = path.join(__dirname, 'google-services.json');
  if (!fs.existsSync(firebaseFile)) return config;
  return { ...config, android: { ...config.android, googleServicesFile: './google-services.json' } };
};

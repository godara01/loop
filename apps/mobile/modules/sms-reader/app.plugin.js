/**
 * Config plugin for the local sms-reader module: declares the two SMS
 * permissions in the Android manifest. Nothing else — the receiver is
 * registered at runtime, only while the app has asked to listen.
 */
const { AndroidConfig } = require('expo/config-plugins');

module.exports = function withSmsReader(config) {
  return AndroidConfig.Permissions.withPermissions(config, [
    'android.permission.RECEIVE_SMS',
    'android.permission.READ_SMS',
  ]);
};

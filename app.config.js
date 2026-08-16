const appJson = require('./app.json');

module.exports = {
  expo: {
    ...appJson.expo,
    extra: {
      ...(appJson.expo.extra || {}),
      apiUrl: process.env.EXPO_PUBLIC_API_URL || undefined,
    },
    android: {
      ...appJson.expo.android,
      package: appJson.expo.android?.package || 'com.consoletrace.app',
    },
    ios: {
      ...appJson.expo.ios,
      bundleIdentifier: appJson.expo.ios?.bundleIdentifier || 'com.consoletrace.app',
    },
  },
};

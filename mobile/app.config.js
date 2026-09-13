const fs = require('fs');
const path = require('path');

// app.json stays the source of truth; this only adds what can't be static.
//
// Push on Android goes through Firebase Cloud Messaging, and the app can't get
// an Expo push token until Firebase is initialised from google-services.json.
// That file is per Firebase project and isn't committed - CI writes it from the
// GOOGLE_SERVICES_JSON secret (see mobile/README.md, Push notifications). With
// no file the build still succeeds and push simply stays unavailable, as before.
module.exports = ({ config }) => {
  const googleServices = path.join(__dirname, 'google-services.json');
  if (!fs.existsSync(googleServices)) return config;
  return {
    ...config,
    android: { ...config.android, googleServicesFile: './google-services.json' },
  };
};

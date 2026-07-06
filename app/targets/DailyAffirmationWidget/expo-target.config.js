/** @type {import('@kingstinct/expo-apple-targets/build/config').Config} */
module.exports = {
  type: "widget",
  name: "DailyAffirmationWidget",
  bundleIdentifier: ".DailyAffirmationWidget",
  deploymentTarget: "17.0",
  colors: {
    $accent: "#FF6B22",
    $widgetBackground: "#FFF7EE",
    affirmationInk: {
      light: "#20150D",
      dark: "#FFF7EE",
    },
    affirmationMuted: {
      light: "#8A5A35",
      dark: "#FFD1A8",
    },
  },
  entitlements: {
    "com.apple.security.application-groups": ["group.app.kadoze.yikudo"],
  },
};

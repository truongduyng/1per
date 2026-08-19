/** @type {import('@kingstinct/expo-apple-targets/build/config').Config} */
module.exports = {
  type: "widget",
  name: "GoalHabitsWidget",
  bundleIdentifier: ".GoalHabitsWidget",
  deploymentTarget: "17.0",
  colors: {
    $accent: "#FB923C",
    $widgetBackground: {
      light: "#FFFFFF",
      dark: "#1C1E1F",
    },
    goalHabitsSurface: {
      light: "#FFFFFF",
      dark: "#1C1E1F",
    },
    goalHabitsInk: {
      light: "#0A0A0A",
      dark: "#FFFFFF",
    },
    goalHabitsMuted: {
      light: "#687076",
      dark: "#9BA1A6",
    },
    goalHabitsAccent: "#FB923C",
  },
  entitlements: {
    "com.apple.security.application-groups": ["group.app.kadoze.yikudo"],
  },
};

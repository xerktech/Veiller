module.exports = {
  project: {
    android: {
      packageName:
        process.env.EXPO_PUBLIC_DEPLOYMENT_REGION === "china" ? "com.xerktech.foverlay.cn" : "com.xerktech.foverlay",
    },
    ios: {},
  },
}

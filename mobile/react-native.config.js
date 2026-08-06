module.exports = {
  project: {
    android: {
      packageName:
        process.env.EXPO_PUBLIC_DEPLOYMENT_REGION === "china" ? "com.xerktech.veiller.cn" : "com.xerktech.veiller",
    },
    ios: {},
  },
}

// app.js
App({
  onLaunch() {
    // 初始化云开发
    if (wx.cloud) {
      wx.cloud.init({
        // env 参数说明：
        // env 参数决定接下来小程序发起的云开发调用（bindtap、bindchange等）会默认请求到哪个云环境的资源
        // 此处请填入环境 ID, 环境 ID 可打开云控制台查看
        // 如不填则使用默认环境（第一个创建的环境）
        env: 'cloud1-7gxup56u7936c397', // 填入你的环境ID
        traceUser: true,
      });
      this.globalData.cloudEnabled = true;
    } else {
      console.warn('当前微信版本不支持云开发');
      this.globalData.cloudEnabled = false;
    }

    // 获取系统信息
    const systemInfo = wx.getSystemInfoSync();
    this.globalData.systemInfo = systemInfo;
    this.globalData.statusBarHeight = systemInfo.statusBarHeight;
    this.globalData.windowHeight = systemInfo.windowHeight;
    this.globalData.windowWidth = systemInfo.windowWidth;
  },
  globalData: {
    systemInfo: null,
    statusBarHeight: 0,
    windowHeight: 0,
    windowWidth: 0,
    cloudEnabled: false
  }
});

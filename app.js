// app.js
const api = require('./utils/api.js');

App({
  // 🌟 修复：合并了全局变量，避免相互覆盖
  globalData: {
    isAuditMode: null, // 🌟 必须改为 null！让系统知道还没获取过配置，必须去问服务器！
    systemInfo: null,
    statusBarHeight: 0,
    windowHeight: 0,
    windowWidth: 0,
    cloudEnabled: false,
    userInfo: null,
    blockList: [] // 🌟 顺手加一个这个，存屏蔽名单
  },
  
  onLaunch() {
    // 1. 初始化云开发
    if (wx.cloud) {
      wx.cloud.init({
        // env 参数决定接下来小程序发起的云开发调用会默认请求到哪个云环境的资源
        env: 'cloud1-7gxup56u7936c397', // 你的环境ID
        traceUser: true,
      });
      this.globalData.cloudEnabled = true;
    } else {
      console.warn('当前微信版本不支持云开发');
      this.globalData.cloudEnabled = false;
    }

    // 2. 获取系统信息
    const systemInfo = wx.getSystemInfoSync();
    this.globalData.systemInfo = systemInfo;
    this.globalData.statusBarHeight = systemInfo.statusBarHeight;
    this.globalData.windowHeight = systemInfo.windowHeight;
    this.globalData.windowWidth = systemInfo.windowWidth;

    // 🌟 3. 执行核心业务：静默登录获取服务器 Token
    this.doSilentLogin();
  },

  // ================= 🌟 微信静默登录逻辑 =================
  doSilentLogin() {
    const token = wx.getStorageSync('token');
    
    // 如果本地已经有 token，说明之前登录过，直接放行
    if (token) {
      console.log('已有 Token，免登录进入');
      return;
    }

    // 没有 token，调用微信官方接口索要临时登录凭证 code
    wx.login({
      success: res => {
        if (res.code) {
          console.log('获取到微信 code，正在向 Python 后端换取 Token...');
          // 发送 code 到咱们自己的 Python 后端
          // 发送 code 到咱们自己的 Python 后端 (带上正确的网关前缀)
          api.post('/api/v1/wx-proxy/login', {
            code: res.code,
            app_tag: api.APP_TAG
          }).then(serverRes => {
            if (serverRes.code === 200) {
              wx.setStorageSync('token', serverRes.data.token);
              console.log('✅ 静默登录成功，获得专属 Token:', serverRes.data.token);
            } else {
              // 🌟 修复：打印出完整的 serverRes，万一报错不再抓瞎
              console.error('❌ 服务器拒绝登录，完整返回:', serverRes);
            }
          }).catch(err => {
            console.error('❌ 登录请求网络异常:', err);
          });
        } else {
          console.error('❌ 获取微信登录态失败！' + res.errMsg);
        }
      }
    });
  }
});
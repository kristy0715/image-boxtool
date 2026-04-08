// 这是一个 1x1 像素的极小透明 PNG 的 Base64，用于合法且极速地穿透后端图像检测逻辑
const DUMMY_B64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

Page({
  data: {
    baseUrl: 'https://goodgoodstudy-nb.top', // 默认测试你的主域名
    apiKey: 'sk-rrSmCvg0iE8BIBKksziXWQ',
    logs: [],
    lastLogId: ''
  },

  onBaseUrlInput(e) { this.setData({ baseUrl: e.detail.value.trim() }); },
  onApiKeyInput(e) { this.setData({ apiKey: e.detail.value.trim() }); },

  addLog(type, msg) {
    const time = new Date().toLocaleTimeString();
    const logs = this.data.logs;
    logs.push({ type, msg, time });
    this.setData({ logs, lastLogId: 'log-' + (logs.length - 1) });
  },

  clearLogs() { this.setData({ logs: [] }); },

  doRequest(endpoint, method, data) {
    if (!this.data.apiKey) {
      wx.showToast({ title: '请先输入 API Key', icon: 'none' });
      this.addLog('error', '测试中止：API Key 为空');
      return;
    }
    
    const url = this.data.baseUrl + endpoint;
    this.addLog('info', `🚀 发起请求 -> ${method} ${endpoint}`);
    
    wx.request({
      url: url,
      method: method,
      header: {
        'x-api-key': this.data.apiKey,
        'Content-Type': 'application/json'
      },
      data: data,
      success: (res) => {
        // 核心测试验证逻辑
        if (res.statusCode === 200) {
          // 如果返回 200，且 msg 中包含失败信息，说明通过了权限校验，只是 AI 引擎在处理这 1x1 假图时报错，这同样证明【权限是通的】！
          this.addLog('success', `[HTTP 200 通信正常/权限通过] 返回数据: ${JSON.stringify(res.data)}`);
        } else if (res.statusCode === 403) {
          this.addLog('error', `[HTTP 403 权限被拦截] 返回数据: ${JSON.stringify(res.data)}`);
        } else if (res.statusCode === 402) {
          this.addLog('warning', `[HTTP 402 余额不足] 返回数据: ${JSON.stringify(res.data)}`);
        } else {
          this.addLog('warning', `[HTTP ${res.statusCode} 其他状态] 返回数据: ${JSON.stringify(res.data)}`);
        }
      },
      fail: (err) => {
        this.addLog('error', `[网络崩溃/请求未发出] 错误信息: ${err.errMsg}`);
      }
    });
  },

  // 1. 测试账户查询
  testUserInfo() { this.doRequest('/api/user/info', 'GET', {}); },
  
  // 2. 测试抠图
  testRemoveBg() { this.doRequest('/api/remove-bg', 'POST', { image: DUMMY_B64, only_human: true }); },
  
  // 3. 测试证件照
  testIdPhoto() { this.doRequest('/api/idphoto', 'POST', { image: DUMMY_B64, height: 413, width: 295, color: '438ed8' }); },
  
  // 4. 测试去水印
  testRemoveWatermark() { this.doRequest('/api/remove-watermark', 'POST', { image: DUMMY_B64, mask: DUMMY_B64 }); },
  
  // 5. 测试高清修复
  testHdRestore() { this.doRequest('/api/hd-restore', 'POST', { image: DUMMY_B64 }); },
  
  // 6. 测试视频解析
  testParseVideo() { this.doRequest('/api/parse-video', 'POST', { url: 'https://v.douyin.com/idTXYZ/' }); }
});
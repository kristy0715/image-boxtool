// pages/admin/score/score.js
const app = getApp();

// 🔥 LaF 云函数地址
const LAF_CLOUD_FUNCTION_URL = 'https://kvpoib63ld.sealosbja.site/get-api-score'; 

Page({
  data: {
    score: 0,
    logs: [],
    isLoading: false
  },

  onLoad() {
    // 1. 启动时先加载本地历史记录
    const cachedData = wx.getStorageSync('score_data_cache');
    if (cachedData) {
      this.setData({ 
        score: cachedData.score || 0, 
        logs: cachedData.logs || [] 
      });
    }
    
    // 2. 自动发起一次查询（这会增加一条新记录）
    this.fetchData();
  },

  onPullDownRefresh() {
    this.fetchData(() => wx.stopPullDownRefresh());
  },

  onRefresh() {
    this.fetchData();
  },

  // 🔥 核心逻辑：查询积分 -> 生成记录 -> 存入本地
  fetchData(callback) {
    this.setData({ isLoading: true });
    wx.showNavigationBarLoading();

    wx.request({
      url: LAF_CLOUD_FUNCTION_URL, 
      method: 'POST',
      data: {}, 
      success: (res) => {
        if (res.statusCode === 200 && res.data && res.data.code === 0) {
          const apiData = res.data.data || {};
          
          // 1. 获取当前最新积分
          const currentScore = apiData.credit !== undefined ? apiData.credit : (apiData.score || 0);
          
          // 2. 生成一条新的查询记录
          const now = new Date();
          const newLog = {
            id: now.getTime(), // 使用时间戳作为唯一ID
            score: currentScore,
            date: this.formatDate(now), // YYYY/MM/DD
            time: this.formatTime(now)  // HH:mm:ss
          };

          // 3. 将新记录插入到现有列表的最前面 (追加模式)
          const currentLogs = this.data.logs;
          // 限制一下最大记录数，比如只保留最近50条，防止缓存无限膨胀
          const updatedLogs = [newLog, ...currentLogs].slice(0, 50);

          // 4. 更新页面
          this.setData({
            score: currentScore,
            logs: updatedLogs,
            isLoading: false
          });

          // 5. 保存到本地缓存
          wx.setStorageSync('score_data_cache', { 
            score: currentScore, 
            logs: updatedLogs 
          });

          wx.showToast({ title: '查询成功', icon: 'success' });
        } else {
          console.error('API Error:', res);
          wx.showToast({ title: '接口异常', icon: 'none' });
        }
      },
      fail: (err) => {
        console.error('Net Error:', err);
        wx.showToast({ title: '网络错误', icon: 'none' });
      },
      complete: () => {
        this.setData({ isLoading: false });
        wx.hideNavigationBarLoading();
        if (callback) callback();
      }
    });
  },

  // 获取日期 YYYY/MM/DD
  formatDate(date) {
    const y = date.getFullYear();
    const m = (date.getMonth() + 1).toString().padStart(2, '0');
    const d = date.getDate().toString().padStart(2, '0');
    return `${y}/${m}/${d}`;
  },

  // 获取时间 HH:mm:ss
  formatTime(date) {
    const hh = date.getHours().toString().padStart(2, '0');
    const mm = date.getMinutes().toString().padStart(2, '0');
    const ss = date.getSeconds().toString().padStart(2, '0');
    return `${hh}:${mm}:${ss}`;
  },

  // 删除单条记录
  onDeleteLog(e) {
    const id = e.currentTarget.dataset.id;
    wx.showModal({
      title: '提示',
      content: '确定删除这条查询记录吗？',
      confirmColor: '#e02020',
      success: (res) => {
        if (res.confirm) {
          // 1. 过滤掉该ID的记录
          const newLogs = this.data.logs.filter(item => item.id !== id);
          
          // 2. 更新页面
          this.setData({ logs: newLogs });
          
          // 3. 更新缓存
          const cachedData = wx.getStorageSync('score_data_cache') || {};
          cachedData.logs = newLogs;
          wx.setStorageSync('score_data_cache', cachedData);

          wx.showToast({ title: '已删除', icon: 'none' });
        }
      }
    });
  }
});
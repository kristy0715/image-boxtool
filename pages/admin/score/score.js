// pages/admin/score/score.js
const app = getApp();

// 🟢 接口 1：Shiliu 平台接口 (原有积分)
const SHILIU_API_URL = 'https://kvpoib63ld.sealosbja.site/get-api-score'; 
// 🔵 接口 2：商业后台接口 (您的新接口)
const COMMERCIAL_API_URL = 'https://goodgoodstudy-nb.top/api/user/info'; 
// 🔑 您的 API Key
const API_KEY = 'sk-ucGynTYiVxxw3_nclVtepg'; 

Page({
  data: {
    score: 0,          // Shiliu 平台积分
    balance: 0.00,     // 商业余额
    isVip: false,
    vipExpireAt: '',
    logs: [],
    isLoading: false
  },

  onLoad() {
    const cachedData = wx.getStorageSync('score_data_cache_v4');
    if (cachedData) {
      this.setData({ 
        score: cachedData.score || 0,
        balance: cachedData.balance || 0,
        isVip: cachedData.isVip || false,
        vipExpireAt: cachedData.vipExpireAt || '',
        logs: cachedData.logs || [] 
      });
    }
    this.fetchData();
  },

  fetchData(callback) {
    this.setData({ isLoading: true });
    wx.showNavigationBarLoading();

    // 1. 获取 Shiliu 积分
    const p1 = new Promise((resolve) => {
      wx.request({
        url: SHILIU_API_URL,
        method: 'POST',
        success: (res) => {
          // 适配 shiliu 返回格式
          const s = res.data?.data?.credit || res.data?.data?.score || 0;
          resolve(s);
        },
        fail: () => resolve(this.data.score)
      });
    });

    // 2. 获取商业后台资产 (加强解析逻辑)
    const p2 = new Promise((resolve) => {
      wx.request({
        url: COMMERCIAL_API_URL,
        method: 'GET',
        header: { 
          'x-api-key': API_KEY,
          'Accept': 'application/json'
        },
        success: (res) => {
          console.log("商业接口返回详情:", res.data); // 这里的打印非常重要，请在控制台查看
          if (res.data && res.data.code === 200 && res.data.data) {
            resolve(res.data.data); 
          } else {
            console.error("商业接口业务失败:", res.data?.msg || '未知错误');
            resolve({ balance: 0, is_vip: false });
          }
        },
        fail: (err) => {
          console.error("商业接口网络请求失败:", err);
          resolve({ balance: 0, is_vip: false });
        }
      });
    });

    Promise.all([p1, p2]).then(([newScore, commData]) => {
      const now = new Date();
      // 这里的 balance 取值严格对应后端字段
      const currentBalance = commData.balance !== undefined ? parseFloat(commData.balance) : 0.00;
      
      const newLog = {
        id: now.getTime(),
        score: newScore,
        balance: currentBalance,
        date: this.formatDate(now),
        time: this.formatTime(now)
      };

      const updatedLogs = [newLog, ...this.data.logs].slice(0, 50);

      this.setData({
        score: newScore,
        balance: currentBalance,
        isVip: commData.is_vip || false,
        vipExpireAt: commData.vip_expire_at || '无',
        logs: updatedLogs,
        isLoading: false
      });

      wx.setStorageSync('score_data_cache_v4', { 
        score: newScore,
        balance: currentBalance,
        isVip: this.data.isVip,
        vipExpireAt: this.data.vipExpireAt,
        logs: updatedLogs 
      });

      wx.hideNavigationBarLoading();
      if (callback) callback();
    });
  },

  formatDate(date) {
    const y = date.getFullYear();
    const m = (date.getMonth() + 1).toString().padStart(2, '0');
    const d = date.getDate().toString().padStart(2, '0');
    return `${y}/${m}/${d}`;
  },

  formatTime(date) {
    const hh = date.getHours().toString().padStart(2, '0');
    const mm = date.getMinutes().toString().padStart(2, '0');
    const ss = date.getSeconds().toString().padStart(2, '0');
    return `${hh}:${mm}:${ss}`;
  },

  onRefresh() { this.fetchData(); },
  
  onDeleteLog(e) {
    const id = e.currentTarget.dataset.id;
    const newLogs = this.data.logs.filter(item => item.id !== id);
    this.setData({ logs: newLogs });
    const cachedData = wx.getStorageSync('score_data_cache_v4') || {};
    cachedData.logs = newLogs;
    wx.setStorageSync('score_data_cache_v4', cachedData);
  }
});
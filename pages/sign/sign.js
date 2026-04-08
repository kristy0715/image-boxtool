const api = require('../../utils/api.js');

Page({
  data: {
    points: 0,
    continuousDays: 0,
    isSignedToday: false,
    todayReward: 1,
    tomorrowReward: 2,
    progressPercent: 0,
    weekList: [],
    
    // 🌟 对账单核心数据
    currentTab: 'all',  // 当前选中的 Tab：all / income / expense
    allHistory: [],     // 服务器返回的全量数据
    displayHistory: []  // 过滤后渲染到页面的数据
  },

  onShow() {
    this.syncServerData();
    this.loadHistory();
  },

  syncServerData() {
    api.get('/api/v1/wx-proxy/user/sync').then(res => {
      const rData = res.data && res.data.points !== undefined ? res.data : (res.data && res.data.data ? res.data.data : res);
      if (res.code === 200 || rData.points !== undefined) {
        const days = rData.continuous_days || 0;
        const isSigned = rData.is_signed_today || false;
        this.setData({
          points: rData.points || 0,
          continuousDays: days,
          isSignedToday: isSigned
        });
        this.updateUIStatus(days, isSigned);
      }
    });
  },

  updateUIStatus(days, isSigned) {
    let todayReward = 1;
    if (!isSigned) {
        if (days + 1 === 2) todayReward = 2;
        if (days + 1 >= 3) todayReward = 3;
    } else {
        if (days === 1) todayReward = 1;
        if (days === 2) todayReward = 2;
        if (days >= 3) todayReward = 3;
    }

    let tomorrowReward = 1;
    let tomorrowDays = isSigned ? days + 1 : days + 2;
    if (tomorrowDays === 2) tomorrowReward = 2;
    if (tomorrowDays >= 3) tomorrowReward = 3;

    let cycleDays = days % 7;
    if (cycleDays === 0 && days > 0 && isSigned) cycleDays = 7;

    const weekList = [];
    for (let i = 1; i <= 7; i++) {
        let reward = 1;
        if (i === 2) reward = 2;
        if (i >= 3) reward = 3;

        let state = 'future';
        if (isSigned) {
            if (i <= cycleDays) state = 'past';
        } else {
            if (i <= cycleDays) state = 'past';
            else if (i === cycleDays + 1) state = 'today';
        }
        weekList.push({ day: i, label: `第${i}天`, reward: reward, state: state });
    }

    this.setData({ todayReward, tomorrowReward, weekList, progressPercent: (cycleDays / 7) * 100 });
  },

  onSignTap() {
    if (this.data.isSignedToday) return wx.showToast({ title: '今天已经签到过啦', icon: 'none' });
    wx.vibrateShort();
    wx.showLoading({ title: '签到中...' });

    api.post('/api/v1/wx-proxy/user/sign').then(res => {
      wx.hideLoading();
      const rData = res.data && res.data.reward !== undefined ? res.data : (res.data && res.data.data ? res.data.data : res);

      if (res.code === 200 || rData.reward !== undefined) {
        const getReward = rData.reward || 1;
        wx.showToast({ title: `签到成功 +${getReward}`, icon: 'success' });
        this.syncServerData();
        this.loadHistory(); // 签到后刷新账单
      } else {
        wx.showToast({ title: res.msg || '签到失败', icon: 'error' });
      }
    }).catch((err) => {
      wx.hideLoading();
      wx.showToast({ title: err || '网络请求异常', icon: 'error' });
    });
  },

  // ================= 🌟 账单明细逻辑 =================
  loadHistory() {
    api.get('/api/v1/wx-proxy/user/history').then(res => {
      const records = res.data && Array.isArray(res.data) ? res.data : (res.data && res.data.data ? res.data.data : []);
      this.setData({ allHistory: records });
      this.filterHistory(); // 加载完立即过滤渲染
    });
  },

  switchTab(e) {
    const tab = e.currentTarget.dataset.tab;
    if (this.data.currentTab === tab) return;
    this.setData({ currentTab: tab });
    this.filterHistory();
  },

  filterHistory() {
    const { currentTab, allHistory } = this.data;
    let filtered = [];
    
    if (currentTab === 'all') {
      filtered = allHistory;
    } else if (currentTab === 'income') {
      filtered = allHistory.filter(item => item.delta > 0);
    } else if (currentTab === 'expense') {
      filtered = allHistory.filter(item => item.delta < 0);
    }
    
    this.setData({ displayHistory: filtered });
  }
});
Page({
  data: {
    currentTab: 'all',
    historyList: [],
    filteredHistory: []
  },

  onShow() {
    this.loadHistoryData();
  },

  loadHistoryData() {
    const rawList = wx.getStorageSync('parseHistory') || [];
    
    // 🌟 核心优化：清洗数据，去掉秒数，让时间更简洁
    const formattedList = rawList.map(item => {
      let shortTime = item.timestamp;
      // 如果时间格式为 "2026-03-31 14:20:00"，截取前 16 位变成 "2026-03-31 14:20"
      if (shortTime && shortTime.length >= 16) {
        shortTime = shortTime.substring(0, 16); 
      }
      return {
        ...item,
        display_time: shortTime // 新增一个专门用于展示的时间字段
      };
    });

    this.setData({ historyList: formattedList });
    this.filterData(this.data.currentTab);
  },

  switchTab(e) {
    const tab = e.currentTarget.dataset.tab;
    this.setData({ currentTab: tab });
    this.filterData(tab);
  },

  filterData(tab) {
    const allData = this.data.historyList;
    let filtered = [];
    if (tab === 'all') {
      filtered = allData;
    } else {
      filtered = allData.filter(item => item.type === tab);
    }
    this.setData({ filteredHistory: filtered });
  },

  onReParse(e) {
    const targetUrl = e.currentTarget.dataset.url;
    // 🌟 完美联动：把链接存入缓存，然后跳到视频解析页，video.js 会自动接管
    wx.setStorageSync('pendingParseTask', targetUrl);
    wx.vibrateShort();
    wx.switchTab({
      url: '/pages/video/video'
    });
  },

  onClearCache() {
    wx.showModal({
      title: '操作确认',
      content: '清空后所有解析记录将无法找回，是否确认清空？',
      confirmColor: '#ef4444',
      cancelColor: '#64748b',
      success: (res) => {
        if (res.confirm) {
          wx.removeStorageSync('parseHistory');
          this.setData({
            historyList: [],
            filteredHistory: []
          });
          wx.showToast({
            title: '记录已清空',
            icon: 'success'
          });
        }
      }
    });
  }
});
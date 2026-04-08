const api = require('../../utils/api.js');

Page({
  data: {
    points: 0,
    goodsList: [] // 🌟 变成空数组，完全由服务器动态接管
  },

  onShow() {
    this.fetchUserPoints();
    this.fetchMallData(); // 🌟 每次打开商城，实时获取最新价格和商品
  },

  fetchUserPoints() {
    api.get('/api/v1/wx-proxy/user/sync').then(res => {
      const rData = res.data && res.data.points !== undefined ? res.data : (res.data && res.data.data ? res.data.data : res);
      if (res.code === 200 || rData.points !== undefined) {
        this.setData({ points: rData.points || 0 });
      }
    });
  },

  // 🌟 核心：动态加载服务器商城配置
  fetchMallData() {
    wx.showLoading({ title: '加载中...', mask: true });
    api.get('/api/v1/wx-proxy/mall/config').then(res => {
      wx.hideLoading();
      if (res.code === 200) {
        // 自动计算原价：实际积分 × 2 (营造5折视觉效果)
        const processedList = res.data.map(item => {
          return {
            ...item,
            originalPrice: item.price * 2,
            discount: '5.0' // 固定显示5折
          };
        });
        this.setData({ goodsList: processedList });
      }
    }).catch(() => {
      wx.hideLoading();
      wx.showToast({ title: '获取商城配置失败', icon: 'none' });
    });
  },

  goToRecord() {
    wx.navigateTo({
      url: '/pages/sign/sign',
      fail: () => { wx.switchTab({ url: '/pages/sign/sign' }); }
    });
  },

  onRedeem(e) { 
    const item = e.currentTarget.dataset.item;

    // 积分不足校验
    if (this.data.points < item.price) {
      return wx.showModal({
        title: '积分不足',
        content: '您的积分不够兑换该商品，快去签到攒积分吧！',
        confirmText: '去签到',
        confirmColor: '#2B66FF',
        success: (res) => {
          if (res.confirm) {
            wx.navigateTo({
              url: '/pages/sign/sign',
              fail: () => { wx.switchTab({ url: '/pages/sign/sign' }); }
            });
          }
        }
      });
    }

    // 确认兑换弹窗
    wx.showModal({
      title: '确认兑换',
      content: `将消耗 ${item.price} 积分兑换【${item.name}】`,
      confirmColor: '#2B66FF',
      success: (res) => {
        if (res.confirm) {
          this.executeExchangeApi(item);
        }
      }
    });
  },

  executeExchangeApi(item) {
    wx.showLoading({ title: '兑换中...', mask: true });

    api.post('/api/v1/wx-proxy/mall/redeem', {
      type: item.type,
      price: item.price,
      value: item.value
    }).then(res => {
      wx.hideLoading();

      if (res.code === 200) {
        const rData = res.data && res.data.points !== undefined ? res.data : (res.data && res.data.data ? res.data.data : res);
        this.setData({ points: rData.points });

        if (rData.gold_vip_expire) {
          const goldTs = new Date(rData.gold_vip_expire.replace(/-/g, '/')).getTime();
          wx.setStorageSync('goldVipExpire', goldTs);
        }
        wx.setStorageSync('silverVipCount', rData.silver_vip_count);

        wx.vibrateShort();
        wx.showToast({ title: '兑换成功 🎉', icon: 'success', duration: 2000 });
      } else {
        wx.showToast({ title: res.msg || '兑换失败', icon: 'error' });
      }
    }).catch((err) => {
      wx.hideLoading();
      wx.showToast({ title: err || '网络异常', icon: 'error' });
    });
  }
});
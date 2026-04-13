const api = require('../../utils/api.js');

Page({
  data: {
    uid: '', // 🌟 新增：用户专属 ID，方便查账
    points: 0,
    vipTypeName: '普通会员',
    vipTagClass: 'tag-gray',
    vipClass: 'normal-mode',
    vipIcon: '👤',
    vipStatusDesc: '签到兑换免广告特权卡',
    todayCount: 0,
    totalCount: 0,
    bannerAdId: 'adunit-ecfcec4c6a0c871b' // 🌟 新增：Banner 广告 ID
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 2 });
    }
    this.fetchServerData();
  },

  fetchServerData() {
    wx.showNavigationBarLoading();
    api.get('/api/v1/wx-proxy/user/sync').then(res => {
      wx.hideNavigationBarLoading();
      const rData = res.data && res.data.points !== undefined ? res.data : (res.data && res.data.data ? res.data.data : res);
      if (res.code === 200 || rData.points !== undefined) {
        this.renderUserProfile(rData);
      }
    }).catch(() => { wx.hideNavigationBarLoading(); });
  },

  // 🌟 核心渲染函数：处理头像变身与信息对齐
  renderUserProfile(data) {
    const goldExpireStr = data.gold_vip_expire;
    const silverCount = data.silver_vip_count || 0;
    let goldTs = 0;
    if (goldExpireStr) { goldTs = new Date(goldExpireStr.replace(/-/g, '/')).getTime(); }

    let vipTypeName = '普通会员', vipTagClass = 'tag-gray', vipClass = 'normal-mode', vipStatusDesc = '签到兑换免广告特权卡';
    
    // 🌟 默认头像逻辑：普通用户显示默认灰色头像
    let vipIconUrl = '/assets/User/default_avatar.png'; 

    if (goldTs > Date.now()) {
      // 金色 VIP 状态
      vipTypeName = '金色 VIP'; vipTagClass = 'tag-gold'; vipClass = 'gold-mode'; 
      vipIconUrl = '/assets/Mall/jinvip1.png'; // 头像直接变为金牌图标
      vipStatusDesc = `特权至：${goldExpireStr.substring(0, 16)}`; // 精确到分钟
    } else if (silverCount > 0) {
      // 银色 VIP 状态
      vipTypeName = '银色 VIP'; vipTagClass = 'tag-silver'; vipClass = 'silver-mode'; 
      vipIconUrl = '/assets/Mall/yinvip.png'; // 头像直接变为银牌图标
      vipStatusDesc = `余免广告卡：${silverCount} 张`;
    }

    this.setData({
      uid: data.uid || '获取中', 
      points: data.points || 0,
      todayCount: data.today_parses || 0,
      totalCount: data.total_parses || 0,
      vipTypeName, vipTagClass, vipClass, vipIconUrl, vipStatusDesc
    });

    wx.setStorageSync('goldVipExpire', goldTs);
    wx.setStorageSync('silverVipCount', silverCount);
  },

  copyUid() {
    if (!this.data.uid || this.data.uid === '获取中') return;
    wx.setClipboardData({
      data: String(this.data.uid),
      success: () => { wx.showToast({ title: 'UID已复制，请发给客服', icon: 'none' }); }
    });
  },

  onSignTap() { wx.navigateTo({ url: '/pages/sign/sign' }); },
  goToMall() { wx.navigateTo({ url: '/pages/mall/mall' }); },
  goToHistory() { wx.navigateTo({ url: '/pages/history/history' }); },
  
  // 🌟 修复：函数名必须跟 wxml 中的 bindtap="onRedeemTap" 一致
  onRedeemTap() { wx.navigateTo({ url: '/pages/redeem/redeem' }); }, 
  
  // 🌟 修复：打通帮助中心跳转
  goToHelp() { wx.navigateTo({ url: '/pages/help/help' }); },
  
  contactService() { wx.showToast({ title: '正在呼叫客服...', icon: 'none' }); }
});
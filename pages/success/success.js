// pages/success/success.js

// 【配置】请替换为您后台申请的 插屏广告 ID
const INTERSTITIAL_AD_ID = 'adunit-a9556a7e617c27b7';

Page({
  data: {
    imagePath: '',
    // 如果您想用原生广告，可以在这里配置 ID
    nativeAdId: 'adunit-ecfcec4c6a0c871b' 
  },

  interstitialAd: null,

  onLoad(options) {
    if (options.path) {
      this.setData({
        imagePath: decodeURIComponent(options.path)
      });
    }

    // === 核心：加载插屏广告 ===
    this.showInterstitialAd();
  },

  // 显示插屏广告
  showInterstitialAd() {
    if (wx.createInterstitialAd) {
      this.interstitialAd = wx.createInterstitialAd({
        adUnitId: INTERSTITIAL_AD_ID
      });
      
      this.interstitialAd.onLoad(() => {
        console.log('插屏广告加载成功');
      });
      
      this.interstitialAd.onError((err) => {
        console.error('插屏广告加载失败', err);
      });

      // 尝试显示
      this.interstitialAd.show().catch((err) => {
        console.error('插屏广告显示失败', err);
      });
    }
  },

  // 预览大图
  previewImage() {
    if (this.data.imagePath) {
      wx.previewImage({
        urls: [this.data.imagePath] 
      });
    }
  },

  // 分享给好友
  onShareAppMessage() {
    return {
      title: '免费好用的全能图片工具箱！去水印、切图、证件照一键搞定',
      path: '/pages/index/index',
      imageUrl: this.data.imagePath
    };
  },

  // 分享到朋友圈
  onShareTimeline() {
    return {
      title: '强烈推荐这个全能图片工具箱，功能强大完全免费！',
      imageUrl: this.data.imagePath
    };
  },

  // 返回首页
  goHome() {
    wx.reLaunch({ url: '/pages/index/index' });
  },

  // 再做一张
  makeAnother() {
    wx.navigateBack({
      delta: 1,
      fail: () => { 
        // 失败（例如没有上一页历史）则回首页
        wx.reLaunch({ url: '/pages/index/index' }); 
      }
    });
  }
});
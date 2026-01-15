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

  // ... (保留原有的 onShareAppMessage, onShareTimeline, goHome, makeAnother) ...
  // 请确保保留这些原有函数
  onShareAppMessage() {
    return {
      title: '推荐给你一个超好用的证件照制作工具！',
      path: '/pages/index/index',
      imageUrl: this.data.imagePath
    };
  },
  onShareTimeline() {
    return {
      title: '手机就能拍证件照，智能换底色',
      imageUrl: this.data.imagePath
    };
  },
  goHome() {
    wx.reLaunch({ url: '/pages/index/index' });
  },
  makeAnother() {
    wx.navigateBack({
      delta: 1,
      fail: () => { wx.redirectTo({ url: '/pages/idphoto/idphoto' }); }
    });
  }
});
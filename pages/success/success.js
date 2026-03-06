// pages/success/success.js

const INTERSTITIAL_AD_ID = 'adunit-a9556a7e617c27b7';

Page({
  data: {
    imagePath: '',
    type: 'image', // ⭐ 新增：用来区分是图片还是视频
    nativeAdId: 'adunit-ecfcec4c6a0c871b' 
  },

  interstitialAd: null,

  onLoad(options) {
    if (options.path) {
      this.setData({
        imagePath: decodeURIComponent(options.path),
        type: options.type || 'image' // ⭐ 接收 video.js 传过来的 type=video
      });
    }

    this.showInterstitialAd();
  },

  showInterstitialAd() {
    if (wx.createInterstitialAd) {
      this.interstitialAd = wx.createInterstitialAd({
        adUnitId: INTERSTITIAL_AD_ID
      });
      
      this.interstitialAd.onLoad(() => console.log('插屏广告加载成功'));
      this.interstitialAd.onError((err) => console.error('插屏广告加载失败', err));
      this.interstitialAd.show().catch((err) => console.error('插屏广告显示失败', err));
    }
  },

  previewImage() {
    if (this.data.imagePath) {
      wx.previewImage({
        urls: [this.data.imagePath] 
      });
    }
  },

  onShareAppMessage() {
    const imageUrl = this.data.imagePath || '/assets/share-cover.png';
    return {
      title: '我发现了一个超棒的实用工具，快来看看！',
      path: '/pages/index/index', 
      imageUrl: imageUrl
    };
  },

  onShareTimeline() {
    const imageUrl = this.data.imagePath || '/assets/share-cover.png';
    return {
      title: '我发现了一个超棒的实用工具，快来看看！',
      query: '',
      imageUrl: imageUrl
    };
  },

  goHome() {
    wx.reLaunch({ url: '/pages/index/index' });
  },

  makeAnother() {
    wx.navigateBack({
      delta: 1,
      fail: () => { 
        wx.reLaunch({ url: '/pages/index/index' }); 
      }
    });
  }
});
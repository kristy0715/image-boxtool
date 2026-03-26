// pages/restore/restore.js
const app = getApp();

// 引入本地算法(兜底)
let LocalAlgo = null;
try { LocalAlgo = require('../../utils/local-algo.js'); } catch (e) {}

const TEST_MODE = false; 
const BASE_URL = 'https://goodgoodstudy-nb.top/api/v1/wx-proxy'; 
const APP_TAG = 'default_app'; 

const AD_CONFIG = {
  BANNER_ID: 'adunit-ecfcec4c6a0c871b',
  VIDEO_ID: 'adunit-da175a2014d3443b',
  // 🌟 使用你指定的最新插屏广告 ID
  INTERSTITIAL_ID: 'adunit-a9556a7e617c27b7'   
};

// 🌟 核心修改：每日免费 1 次，看视频奖励 3 次
const QUOTA_CONFIG = {
  SAVE_FREE: 2,    
  SAVE_REWARD: 5 
};

Page({
  data: {
    selectedImage: '', // 用户选中的原图（待处理状态）
    originImage: '',   // 用于滑块对比的底图
    resultImage: '',   // 处理后的结果图
    isProcessing: false,
    sliderValue: 50, 
    bannerUnitId: AD_CONFIG.BANNER_ID,
    layout: { width: 300, height: 400 },
    boxRect: null
  },

  videoAd: null,
  interstitialAd: null,
  maxDisplayWidth: 0,
  maxDisplayHeight: 0,

  onLoad() {
    this.initAds(); 
    this.calcMaxDisplay(); 
  },

  calcMaxDisplay() {
    try {
      const sys = wx.getSystemInfoSync();
      this.maxDisplayWidth = sys.windowWidth - (sys.windowWidth / 750 * 60); 
      this.maxDisplayHeight = sys.windowHeight * 0.65;
    } catch (e) {}
  },

  updateImageRatio(path) {
    if (!path) return;
    wx.getImageInfo({
      src: path,
      success: (res) => {
        const ratio = res.width / res.height;
        let finalW = this.maxDisplayWidth;
        let finalH = finalW / ratio;
        if (finalH > this.maxDisplayHeight) {
          finalH = this.maxDisplayHeight;
          finalW = finalH * ratio;
        }
        this.setData({ layout: { width: finalW, height: finalH } });
        setTimeout(() => this.initBoxRect(), 300);
      }
    });
  },

  initBoxRect() {
    wx.createSelectorQuery().select('#compareBox').boundingClientRect((rect) => {
      if (rect) this.boxRect = rect;
    }).exec();
  },

  onTouchStart(e) {
    wx.createSelectorQuery().select('#compareBox').boundingClientRect((rect) => {
      if (rect) {
        this.boxRect = rect;
        this.updateSlider(e.touches[0].clientX);
      }
    }).exec();
  },

  onTouchMove(e) { if (e.touches[0] && this.boxRect) this.updateSlider(e.touches[0].clientX); },

  updateSlider(clientX) {
    if (!this.boxRect) return;
    const offset = clientX - this.boxRect.left;
    let percent = (offset / this.boxRect.width) * 100;
    percent = Math.max(0, Math.min(100, percent));
    this.setData({ sliderValue: percent });
  },

  initAds() {
    if (wx.createRewardedVideoAd) {
      this.videoAd = wx.createRewardedVideoAd({ adUnitId: AD_CONFIG.VIDEO_ID });
      this.videoAd.onError(err => console.error('激励视频加载失败', err));
      this.videoAd.onClose(res => {
        if (res && res.isEnded) {
          this.grantSaveQuota();
        } else {
          wx.showToast({ title: '需完整观看才能解锁保存', icon: 'none' });
        }
      });
    }

    if (wx.createInterstitialAd) {
      this.interstitialAd = wx.createInterstitialAd({ adUnitId: AD_CONFIG.INTERSTITIAL_ID });
      this.interstitialAd.onLoad(() => console.log('插屏广告已准备就绪'));
      this.interstitialAd.onError(err => console.error('插屏广告加载出错', err));
    }
  },

  getQuota(key) {
    const today = new Date().toLocaleDateString();
    let r = wx.getStorageSync(key) || { date: today, count: 0, extra: 0 };
    if (r.date !== today) r = { date: today, count: 0, extra: 0 };
    return r;
  },

  updateQuota(key, val) { wx.setStorageSync(key, val); },

  // 选择照片时不再检测任何次数，直接进入“待处理”状态
  chooseImage() {
    wx.chooseMedia({
      count: 1, mediaType: ['image'], sizeType: ['compressed'], 
      success: (res) => {
        const path = res.tempFiles[0].tempFilePath;
        this.setData({
          selectedImage: path,
          originImage: path,
          resultImage: '',
          sliderValue: 50
        });
        this.updateImageRatio(path);
      }
    });
  },

  // 点击“开始高清处理”按钮后触发，前端不拦截次数
  async startRestoration() {
    if (!this.data.selectedImage) return;
    const path = this.data.selectedImage;
    this.setData({ isProcessing: true });

    if (TEST_MODE) { this.runLocalAlgo(path); return; }

    try {
      const compressedPath = await this.compressBeforeUpload(path);
      const fs = wx.getFileSystemManager();
      const base64 = fs.readFileSync(compressedPath, 'base64');
      
      const res = await new Promise((resolve, reject) => {
        wx.request({
          url: BASE_URL + '/hd-restore',
          method: 'POST',
          data: { app_tag: APP_TAG, image: base64 },
          timeout: 60000, 
          success: resolve, fail: reject
        });
      });

      if (res.data && res.data.code === 200) {
        let cleanBase64 = res.data.data.image;
        if (cleanBase64.startsWith('data:image')) cleanBase64 = cleanBase64.split('base64,')[1];
        cleanBase64 = cleanBase64.replace(/[\r\n\s]/g, "");

        const localPath = `${wx.env.USER_DATA_PATH}/restore_cloud_${Date.now()}.png`;
        fs.writeFileSync(localPath, wx.base64ToArrayBuffer(cleanBase64), 'binary');
        
        // 处理成功出图时，立刻弹出插屏广告
        this.setData({ resultImage: localPath, isProcessing: false }, () => {
            if (this.interstitialAd) {
              this.interstitialAd.show().catch((err) => {
                console.warn('插屏广告呼叫失败:', err);
              });
            }
        });
      } else {
        throw new Error(res.data?.msg || '处理失败，请稍后重试');
      }
    } catch (err) {
      console.error('Restoration Failed:', err);
      if (LocalAlgo) {
         wx.showToast({ title: '网络波动，转本地增强', icon: 'none' });
         this.runLocalAlgo(path);
      } else {
         this.fallbackSuccess(path);
      }
    }
  },

  runLocalAlgo(path) {
      if (LocalAlgo && LocalAlgo.process) {
          wx.getImageInfo({
              src: path,
              success: (imgInfo) => {
                  const canvas = wx.createOffscreenCanvas({ type: '2d', width: 100, height: 100 });
                  const ctx = canvas.getContext('2d');
                  const img = canvas.createImage();
                  img.onload = () => {
                      LocalAlgo.process(canvas, ctx, img, imgInfo.width, imgInfo.height, 2)
                          .then(resPath => {
                              // 本地兜底成功同样弹出插屏
                              this.setData({ resultImage: resPath, isProcessing: false }, () => {
                                  wx.showToast({ title: '本地增强完成', icon: 'success' });
                                  if (this.interstitialAd) {
                                      this.interstitialAd.show().catch((err) => console.warn('插屏失败', err));
                                  }
                              });
                          })
                          .catch(() => this.fallbackSuccess(path));
                  };
                  img.onerror = () => this.fallbackSuccess(path);
                  img.src = path;
              },
              fail: () => this.fallbackSuccess(path)
          });
      } else { this.fallbackSuccess(path); }
  },

  compressBeforeUpload(path) {
      return new Promise((resolve) => {
          wx.getFileInfo({
              filePath: path,
              success: (res) => {
                  if (res.size / 1024 / 1024 > 1.0) {
                      wx.compressImage({ src: path, quality: 60, success: (c) => resolve(c.tempFilePath), fail: () => resolve(path) });
                  } else { resolve(path); }
              }, fail: () => resolve(path)
          });
      });
  },

  fallbackSuccess(path) {
      setTimeout(() => {
          this.setData({ resultImage: path, isProcessing: false });
          wx.showToast({ title: '处理失败或遇到网络异常', icon: 'none' });
      }, 500);
  },

  // 🌟 修改点：只在点击保存时，检测剩余次数 (每日1次，之后看广告得3次)
  saveImage() {
    if (!this.data.resultImage) return;
    const save = this.getQuota('restore_save_quota');
    if (save.count >= (QUOTA_CONFIG.SAVE_FREE + save.extra)) {
      this.showAdModal(); 
      return;
    }
    this.saveImageAndJump(this.data.resultImage);
  },

  saveImageAndJump(filePath) {
      wx.showLoading({ title: '保存中...' });
      wx.saveImageToPhotosAlbum({
          filePath: filePath,
          success: () => {
              const save = this.getQuota('restore_save_quota');
              save.count++; 
              this.updateQuota('restore_save_quota', save); 
              wx.hideLoading();
              wx.navigateTo({
                  url: `/pages/success/success?path=${encodeURIComponent(filePath)}`,
                  fail: () => wx.showToast({ title: '已保存', icon: 'success' })
              });
          },
          fail: (err) => {
              wx.hideLoading();
              if (err.errMsg.includes('auth')) wx.showModal({ title: '提示', content: '需开启相册权限', success: r => r.confirm && wx.openSetting() });
              else wx.showToast({ title: '保存失败', icon: 'none' });
          }
      });
  },

  showAdModal() { 
    wx.showModal({
      title: '免费保存次数已用完',
      content: `观看一段视频，即可解锁 ${QUOTA_CONFIG.SAVE_REWARD} 次保存机会！`,
      confirmText: '看视频',
      confirmColor: '#6366f1',
      success: (res) => { 
        if (res.confirm && this.videoAd) this.videoAd.show().catch(() => {}); 
      }
    });
  },

  grantSaveQuota() { 
      const s = this.getQuota('restore_save_quota'); 
      s.extra += QUOTA_CONFIG.SAVE_REWARD; 
      this.updateQuota('restore_save_quota', s); 
      wx.showToast({ title: `成功解锁 ${QUOTA_CONFIG.SAVE_REWARD} 次机会`, icon: 'success' }); 
      setTimeout(() => { this.saveImage(); }, 800); 
  },
  
  onAdError(err) { console.log('Banner Ad Error:', err); },
  
  onShareAppMessage() { return { title: 'AI画质修复神器，老照片无损翻新！', path: '/pages/restore/restore' }; },
  onShareTimeline() { return { title: 'AI画质修复神器，老照片无损翻新！' }; },

  goToWatermark() { wx.navigateTo({ url: '/pages/watermark/watermark' }); }
});
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
  VIDEO_ID: 'adunit-da175a2014d3443b'
};

const QUOTA_CONFIG = {
  AI_FREE: 1,      
  AI_REWARD: 3,    
  SAVE_FREE: 2,    
  SAVE_REWARD: 999 
};

Page({
  data: {
    originImage: '', 
    resultImage: '', 
    isProcessing: false,
    sliderValue: 50, 
    bannerUnitId: AD_CONFIG.BANNER_ID,
    layout: { width: 300, height: 400 },
    boxRect: null
  },

  videoAd: null,
  pendingAdType: null,
  maxDisplayWidth: 0,
  maxDisplayHeight: 0,

  onLoad() {
    this.initVideoAd();
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

  initVideoAd() {
    if (wx.createRewardedVideoAd) {
      this.videoAd = wx.createRewardedVideoAd({ adUnitId: AD_CONFIG.VIDEO_ID });
      this.videoAd.onClose(res => {
        if (res && res.isEnded) {
          if (this.pendingAdType === 'ai') this.grantAiQuota();
          if (this.pendingAdType === 'save') this.grantSaveQuota();
        }
      });
    }
  },

  getQuota(key) {
    const today = new Date().toLocaleDateString();
    let r = wx.getStorageSync(key) || { date: today, count: 0, extra: 0, unlimited: false };
    if (r.date !== today) r = { date: today, count: 0, extra: 0, unlimited: false };
    return r;
  },

  updateQuota(key, val) { wx.setStorageSync(key, val); },

  chooseImage() {
    const ai = this.getQuota('restore_ai_quota');
    const limit = QUOTA_CONFIG.AI_FREE + ai.extra;
    
    if (ai.count >= limit) {
      this.pendingAdType = 'ai'; 
      this.showAdModal('ai'); 
      return;
    }

    wx.chooseMedia({
      count: 1, mediaType: ['image'], sizeType: ['original'], 
      success: (res) => {
        const path = res.tempFiles[0].tempFilePath;
        // 🌟 核心优化：彻底删除前端本地安检，直接扔给 9527 服务器接管，速度翻倍！
        this.startRestoration(path);
      }
    });
  },

  async startRestoration(path) {
    this.setData({ isProcessing: true, originImage: path, resultImage: '' });
    this.updateImageRatio(path);

    const ai = this.getQuota('restore_ai_quota');
    ai.count++;
    this.updateQuota('restore_ai_quota', ai);

    if (TEST_MODE) { this.runLocalAlgo(path); return; }

    try {
      const compressedPath = await this.compressBeforeUpload(path);
      const fs = wx.getFileSystemManager();
      const base64 = fs.readFileSync(compressedPath, 'base64');
      
      const res = await new Promise((resolve, reject) => {
        wx.request({
          url: BASE_URL + '/hd-fix',
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
        this.setData({ resultImage: localPath, isProcessing: false });
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
                              this.setData({ resultImage: resPath, isProcessing: false });
                              wx.showToast({ title: '本地增强完成', icon: 'success' });
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

  saveImage() {
    if (!this.data.resultImage) return;
    const save = this.getQuota('restore_save_quota');
    if (!save.unlimited && save.count >= QUOTA_CONFIG.SAVE_FREE) {
      this.pendingAdType = 'save'; this.showAdModal('save'); return;
    }
    this.saveImageAndJump(this.data.resultImage);
  },

  saveImageAndJump(filePath) {
      wx.showLoading({ title: '保存中...' });
      wx.saveImageToPhotosAlbum({
          filePath: filePath,
          success: () => {
              const save = this.getQuota('restore_save_quota');
              if (!save.unlimited) { save.count++; this.updateQuota('restore_save_quota', save); }
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

  showAdModal(type) { 
    const isAi = type === 'ai';
    wx.showModal({
      title: isAi ? '处理次数不足' : '保存次数不足',
      content: isAi ? `观看一段视频，免费解锁 ${QUOTA_CONFIG.AI_REWARD} 次修复机会！` : '观看一段视频，即可解锁今日无限次保存！',
      confirmText: '看视频',
      confirmColor: '#6366f1',
      success: (res) => { 
        if (res.confirm && this.videoAd) this.videoAd.show().catch(() => {}); 
      }
    });
  },

  grantAiQuota() { const ai = this.getQuota('restore_ai_quota'); ai.extra += QUOTA_CONFIG.AI_REWARD; this.updateQuota('restore_ai_quota', ai); wx.showToast({ title: `已获得 ${QUOTA_CONFIG.AI_REWARD} 次机会`, icon: 'none' }); },
  grantSaveQuota() { const s = this.getQuota('restore_save_quota'); s.unlimited = true; this.updateQuota('restore_save_quota', s); this.saveImage(); },
  onAdError(err) { console.log('Banner Ad Error:', err); },
  
  onShareAppMessage() { return { title: 'AI画质修复神器，老照片无损翻新！', path: '/pages/restore/restore' }; },
  onShareTimeline() { return { title: 'AI画质修复神器，老照片无损翻新！' }; },

  goToWatermark() { wx.navigateTo({ url: '/pages/watermark/watermark' }); }
});
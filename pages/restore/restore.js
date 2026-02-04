// pages/restore/restore.js
const app = getApp();
const Security = require('../../utils/security.js');

// 引入本地算法
let LocalAlgo = null;
try { LocalAlgo = require('../../utils/local-algo.js'); } catch (e) {}

// 🔥 测试模式：true = 使用本地算法模拟, false = 正式调用云端API
const TEST_MODE = false; 

const LAF_RESTORE_URL = 'https://kvpoib63ld.sealosbja.site/image-restore'; 

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
    aiLeft: 0,
    saveLeft: 0,
    bannerUnitId: AD_CONFIG.BANNER_ID,
    
    // 核心布局数据 (单位 px)
    layout: {
      width: 300,  // 默认值
      height: 400
    },
    
    boxRect: null
  },

  videoAd: null,
  pendingAdType: null,
  
  // 屏幕限制参数
  maxDisplayWidth: 0,
  maxDisplayHeight: 0,

  onLoad() {
    this.initVideoAd();
    this.updateQuotaDisplay();
    this.calcMaxDisplay(); // 计算屏幕可用区域
  },

  // 1. 计算最大显示区域 (给图片留多少空间)
  calcMaxDisplay() {
    try {
      const sys = wx.getSystemInfoSync();
      // 宽度：屏幕宽度 - 左右间距 (48rpx ~= 24px)
      this.maxDisplayWidth = sys.windowWidth - (sys.windowWidth / 750 * 60); 
      // 高度：屏幕高度 * 0.65 (留出底部按钮和标题的空间)
      this.maxDisplayHeight = sys.windowHeight * 0.65;
    } catch (e) {}
  },

  // 2. 根据图片计算完美尺寸 (Fit Algorithm)
  updateImageRatio(path) {
    if (!path) return;
    wx.getImageInfo({
      src: path,
      success: (res) => {
        const imgW = res.width;
        const imgH = res.height;
        const ratio = imgW / imgH;

        // 算法：先尝试撑满宽度
        let finalW = this.maxDisplayWidth;
        let finalH = finalW / ratio;

        // 如果高度超出了最大高度，则改用高度撑满
        if (finalH > this.maxDisplayHeight) {
          finalH = this.maxDisplayHeight;
          finalW = finalH * ratio;
        }

        // 更新数据，驱动视图渲染
        this.setData({
          layout: {
            width: finalW,
            height: finalH
          }
        });
        
        // 延迟更新滑块感应区
        setTimeout(() => this.initBoxRect(), 300);
      }
    });
  },

  initBoxRect() {
    const query = wx.createSelectorQuery();
    query.select('#compareBox').boundingClientRect((rect) => {
      if (rect) this.boxRect = rect;
    }).exec();
  },

  // === 滑块交互 ===
  onTouchStart(e) {
    const query = wx.createSelectorQuery();
    query.select('#compareBox').boundingClientRect((rect) => {
      if (rect) {
        this.boxRect = rect;
        this.updateSlider(e.touches[0].clientX);
      }
    }).exec();
  },

  onTouchMove(e) {
    if (e.touches[0] && this.boxRect) {
      this.updateSlider(e.touches[0].clientX);
    }
  },

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

  updateQuota(key, val) { wx.setStorageSync(key, val); this.updateQuotaDisplay(); },
  
  updateQuotaDisplay() { 
      const ai = this.getQuota('restore_ai_quota'); 
      const save = this.getQuota('restore_save_quota');
      const aiLeft = (QUOTA_CONFIG.AI_FREE + ai.extra) - ai.count;
      const saveLeft = save.unlimited ? '无限' : (QUOTA_CONFIG.SAVE_FREE - save.count);
      this.setData({ aiLeft: Math.max(0, aiLeft), saveLeft: saveLeft });
  },

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
        Security.checkImage(path).then(isSafe => {
          if (isSafe) this.startRestoration(path);
          else wx.showToast({ title: '图片不合规', icon: 'none' });
        });
      }
    });
  },

  async startRestoration(path) {
    this.setData({ isProcessing: true, originImage: path, resultImage: '' });
    
    // 立即计算布局 (确保容器大小正确)
    this.updateImageRatio(path);

    const ai = this.getQuota('restore_ai_quota');
    ai.count++;
    this.updateQuota('restore_ai_quota', ai);

    // === 🔥 核心修改：测试模式调用本地算法 ===
    if (TEST_MODE) {
        console.log('🧪 [测试模式] 正在调用本地算法...');
        this.runLocalAlgo(path);
        return;
    }

    // === 正式模式 ===
    try {
      const compressedPath = await this.compressBeforeUpload(path);
      const fs = wx.getFileSystemManager();
      const base64 = fs.readFileSync(compressedPath, 'base64');
      
      const res = await new Promise((resolve, reject) => {
        wx.request({
          url: LAF_RESTORE_URL, method: 'POST',
          data: { base64: base64 },
          timeout: 60000,
          success: resolve, fail: reject
        });
      });

      if (typeof res.data === 'string' && res.data.trim().startsWith('<')) {
          throw new Error('Cloud Error: HTML Returned');
      }

      if (res.data?.code === 0 && res.data?.result_base64) {
        let cleanBase64 = res.data.result_base64;
        if (cleanBase64.startsWith('data:image')) cleanBase64 = cleanBase64.split('base64,')[1];
        cleanBase64 = cleanBase64.replace(/[\r\n\s]/g, "");

        const localPath = `${wx.env.USER_DATA_PATH}/restore_cloud_${Date.now()}.png`;
        fs.writeFileSync(localPath, wx.base64ToArrayBuffer(cleanBase64), 'binary');
        this.setData({ resultImage: localPath, isProcessing: false });
      } else {
        throw new Error(res.data?.msg || 'API Error');
      }
    } catch (err) {
      // 失败自动降级到本地
      if (LocalAlgo) {
         wx.showToast({ title: '网络波动，转本地增强', icon: 'none' });
         this.runLocalAlgo(path);
      } else {
         this.fallbackSuccess(path);
      }
    }
  },

  // 运行本地算法
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
      } else {
          // 如果没有算法模块，兜底显示原图
          this.fallbackSuccess(path);
      }
  },

  compressBeforeUpload(path) {
      return new Promise((resolve) => {
          wx.getFileInfo({
              filePath: path,
              success: (res) => {
                  if (res.size / 1024 / 1024 > 1.0) {
                      wx.compressImage({ src: path, quality: 60, success: (c) => resolve(c.tempFilePath), fail: () => resolve(path) });
                  } else { resolve(path); }
              },
              fail: () => resolve(path)
          });
      });
  },

  fallbackSuccess(path) {
      setTimeout(() => {
          this.setData({ resultImage: path, isProcessing: false });
          wx.showToast({ title: '模拟成功', icon: 'none' });
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
              if (!save.unlimited) { 
                  save.count++; 
                  this.updateQuota('restore_save_quota', save); 
              }
              wx.hideLoading();
              wx.navigateTo({
                  url: `/pages/success/success?path=${encodeURIComponent(filePath)}`,
                  fail: () => wx.showToast({ title: '已保存', icon: 'success' })
              });
          },
          fail: (err) => {
              wx.hideLoading();
              if (err.errMsg.includes('auth')) {
                  wx.showModal({ title: '提示', content: '需开启相册权限', success: r => r.confirm && wx.openSetting() });
              } else {
                  wx.showToast({ title: '保存失败', icon: 'none' });
              }
          }
      });
  },

  showAdModal(type) { 
    const isAi = type === 'ai';
    wx.showModal({
      title: isAi ? '免费次数已用完' : '免费保存次数已用完',
      content: isAi ? `观看视频解锁 ${QUOTA_CONFIG.AI_REWARD} 次修复机会` : '观看视频解锁今日无限次保存',
      confirmText: '去观看',
      confirmColor: '#6366f1',
      success: (res) => {
        if (res.confirm && this.videoAd) this.videoAd.show().catch(() => {});
      }
    });
  },

  grantAiQuota() { const ai = this.getQuota('restore_ai_quota'); ai.extra += QUOTA_CONFIG.AI_REWARD; this.updateQuota('restore_ai_quota', ai); wx.showToast({ title: '解锁成功', icon: 'none' }); },
  grantSaveQuota() { const s = this.getQuota('restore_save_quota'); s.unlimited = true; this.updateQuota('restore_save_quota', s); this.saveImage(); },
  onAdError(err) { },
  onShareAppMessage() { return { title: 'AI画质修复神器', path: '/pages/restore/restore' }; },
  onShareTimeline() { return { title: 'AI画质修复神器' }; }
});
// pages/matting/matting.js
const app = getApp();
const Security = require('../../utils/security.js');

// 🔥🔥🔥 测试开关：true=模拟流程(不调接口/不扣费), false=正式环境 🔥🔥🔥
const TEST_MODE = true; 

// 配置
const LAF_MATTING_URL = 'https://kvpoib63ld.sealosbja.site/idphoto-matting'; 
const AD_CONFIG = {
  BANNER_ID: 'adunit-ecfcec4c6a0c871b', 
  VIDEO_ID: 'adunit-da175a2014d3443b'
};

// 💎 商业化配置 (1次免费 + 广告奖3次)
const QUOTA_CONFIG = {
  AI_FREE: 1,      // 每日免费 1 次
  AI_REWARD: 3,    // 🔥 修改：看一次广告，奖励 3 次机会
  SAVE_FREE: 2,    // 每日免费保存次数
  SAVE_REWARD: 999 // 看广告解锁全天保存
};

Page({
  data: {
    originImage: '',
    resultImage: '',
    isProcessing: false,
    bannerUnitId: AD_CONFIG.BANNER_ID,
    previewBgColor: 'transparent',
    
    aiLeft: 0,
    saveLeft: 0
  },

  videoAd: null,
  pendingAdType: null, 

  onLoad() {
    this.initVideoAd();
    this.updateQuotaDisplay();
  },

  onShow() {
    this.updateQuotaDisplay();
  },

  onAdError(err) { console.log('Banner Ad Error', err); },

  // === 广告与额度系统 ===
  initVideoAd() {
    if (wx.createRewardedVideoAd) {
      this.videoAd = wx.createRewardedVideoAd({ adUnitId: AD_CONFIG.VIDEO_ID });
      this.videoAd.onError(err => console.error(err));
      this.videoAd.onClose(res => {
        if (res && res.isEnded) {
          if (this.pendingAdType === 'ai') this.grantAiQuota();
          if (this.pendingAdType === 'save') this.grantSaveQuota();
        } else {
          wx.showToast({ title: '需完整观看才能解锁', icon: 'none' });
        }
      });
    }
  },

  getQuota(key) {
    const today = new Date().toLocaleDateString();
    let record = wx.getStorageSync(key) || { date: today, count: 0, extra: 0, unlimited: false };
    if (record.date !== today) record = { date: today, count: 0, extra: 0, unlimited: false }; 
    return record;
  },

  updateQuota(key, record) {
    wx.setStorageSync(key, record);
    this.updateQuotaDisplay();
  },

  updateQuotaDisplay() {
    const ai = this.getQuota('matting_ai_quota');
    const save = this.getQuota('matting_save_quota');
    
    // 计算剩余次数
    const aiRemaining = (QUOTA_CONFIG.AI_FREE + ai.extra) - ai.count;
    const saveRemaining = save.unlimited ? '无限' : (QUOTA_CONFIG.SAVE_FREE - save.count);
    this.setData({ aiLeft: Math.max(0, aiRemaining), saveLeft: saveRemaining });
  },

  // === 核心流程：上传与AI处理 ===
  chooseImage() {
    const ai = this.getQuota('matting_ai_quota');
    const limit = QUOTA_CONFIG.AI_FREE + ai.extra;
    
    // 检查 AI 次数
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
          if (isSafe) this.startProcessing(path);
          else wx.showToast({ title: '图片不合规', icon: 'none' });
        });
      }
    });
  },

  async startProcessing(path) {
    this.setData({ isProcessing: true, originImage: path, resultImage: '' });
    
    // 🔥 测试模式逻辑
    if (TEST_MODE) {
        setTimeout(() => {
            this.setData({ resultImage: path, isProcessing: false });
            // 即使是测试模式，为了体验流程，也扣除一次（前端显示）
            const ai = this.getQuota('matting_ai_quota');
            ai.count++;
            this.updateQuota('matting_ai_quota', ai);
            wx.showToast({ title: '测试模式:模拟成功', icon: 'none' });
        }, 1500);
        return;
    }

    // --- 正式逻辑 ---
    // 扣除次数
    const ai = this.getQuota('matting_ai_quota');
    ai.count++;
    this.updateQuota('matting_ai_quota', ai);

    try {
      const fs = wx.getFileSystemManager();
      const base64 = fs.readFileSync(path, 'base64');
      
      const res = await new Promise((resolve, reject) => {
        wx.request({
          url: LAF_MATTING_URL, method: 'POST',
          data: { base64: base64 },
          success: resolve, fail: reject
        });
      });

      const aiData = res.data;
      if (aiData && aiData.code === 0 && aiData.result_base64) {
        let mattedBase64 = aiData.result_base64;
        if (mattedBase64.startsWith('data:image')) mattedBase64 = mattedBase64.split('base64,')[1];
        mattedBase64 = mattedBase64.replace(/[\r\n\s]/g, "");

        const localPath = `${wx.env.USER_DATA_PATH}/matting_${Date.now()}.png`;
        fs.writeFileSync(localPath, wx.base64ToArrayBuffer(mattedBase64), 'binary');
        this.setData({ resultImage: localPath, isProcessing: false });
      } else {
        throw new Error(aiData?.msg || 'API Error');
      }
    } catch (err) {
      console.error(err);
      this.setData({ isProcessing: false });
      wx.showToast({ title: '处理失败，请重试', icon: 'none' });
    }
  },

  // === 保存流程 ===
  saveImage() {
    if (!this.data.resultImage) return;

    const save = this.getQuota('matting_save_quota');
    if (!save.unlimited && save.count >= QUOTA_CONFIG.SAVE_FREE) {
      this.pendingAdType = 'save';
      this.showAdModal('save');
      return;
    }

    if (this.data.previewBgColor === 'transparent') {
        this.saveImageAndJump(this.data.resultImage);
    } else {
        wx.showModal({
            title: '提示',
            content: '当前版本仅支持保存透明背景图片',
            confirmText: '保存透明',
            showCancel: false,
            success: (res) => {
                if (res.confirm) this.saveImageAndJump(this.data.resultImage);
            }
        });
    }
  },

  saveImageAndJump(filePath) {
      wx.showLoading({ title: '保存中...' });
      wx.saveImageToPhotosAlbum({
          filePath: filePath,
          success: () => {
              const save = this.getQuota('matting_save_quota');
              if (!save.unlimited) {
                  save.count++;
                  this.updateQuota('matting_save_quota', save);
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
      // 🔥 修改：文案动态显示解锁次数
      content: isAi ? `观看视频解锁 ${QUOTA_CONFIG.AI_REWARD} 次抠图机会` : '观看视频解锁今日无限次保存',
      confirmText: '去观看',
      confirmColor: '#6366f1',
      success: (res) => {
        if (res.confirm && this.videoAd) this.videoAd.show().catch(() => {});
      }
    });
  },

  grantAiQuota() {
    const ai = this.getQuota('matting_ai_quota');
    ai.extra += QUOTA_CONFIG.AI_REWARD;
    this.updateQuota('matting_ai_quota', ai);
    // 🔥 修改：提示获得次数
    wx.showToast({ title: `已获 ${QUOTA_CONFIG.AI_REWARD} 次机会`, icon: 'none', duration: 2000 });
  },

  grantSaveQuota() {
    const save = this.getQuota('matting_save_quota');
    save.unlimited = true;
    this.updateQuota('matting_save_quota', save);
    this.saveImage(); 
  },

  changeBg(e) {
      this.setData({ previewBgColor: e.currentTarget.dataset.color });
  },

  onShareAppMessage() {
    const imageUrl = this.data.resultImage || '/assets/share-cover.png';
    return {
      title: 'AI智能抠图神器，发丝级自动去背景！',
      path: '/pages/matting/matting',
      imageUrl: imageUrl
    };
  },

  onShareTimeline() {
    const imageUrl = this.data.resultImage || '/assets/share-cover.png';
    return {
      title: 'AI智能抠图神器，发丝级自动去背景！',
      query: '',
      imageUrl: imageUrl
    };
  }
});
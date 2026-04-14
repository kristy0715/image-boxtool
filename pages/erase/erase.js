const app = getApp();

// 🌟 对接真实服务器，端口9527走proxy_service
const BASE_URL = 'https://goodgoodstudy-nb.top:9527';

const AD_CONFIG = {
  BANNER_ID: 'adunit-ecfcec4c6a0c871b',
  VIDEO_ID: 'adunit-da175a2014d3443b',
  INTERSTITIAL_ID: 'adunit-a9556a7e617c27b7'
};

const QUOTA_CONFIG = {
  SAVE_FREE: 2,
  SAVE_REWARD: 5
};

Page({
  data: {
    imagePath: '',
    resultImage: '',
    isProcessing: false,
    loadingText: 'AI 正在擦除手写字迹...',
    isComparing: false,
    bannerUnitId: AD_CONFIG.BANNER_ID
  },

  videoAd: null,
  interstitialAd: null,

  onLoad() {
    this.initAds();
    wx.setNavigationBarTitle({ title: 'AI 试卷还原' });
  },

  initAds() {
    if (wx.createRewardedVideoAd) {
      this.videoAd = wx.createRewardedVideoAd({ adUnitId: AD_CONFIG.VIDEO_ID });
      this.videoAd.onError(err => console.error('激励视频加载失败', err));
      this.videoAd.onClose(res => {
        if (res && res.isEnded) {
          this.grantSaveQuota();
        } else {
          wx.showToast({ title: '需完整观看才能解锁', icon: 'none' });
        }
      });
    }
    if (wx.createInterstitialAd) {
      this.interstitialAd = wx.createInterstitialAd({ adUnitId: AD_CONFIG.INTERSTITIAL_ID });
    }
  },

  getQuota(key) {
    const today = new Date().toLocaleDateString();
    let r = wx.getStorageSync(key) || { date: today, count: 0, extra: 0 };
    if (r.date !== today) r = { date: today, count: 0, extra: 0 };
    return r;
  },

  updateQuota(key, val) { wx.setStorageSync(key, val); },

  // ================= 🌟 选图并一键擦除 =================
  chooseImage() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sizeType: ['compressed'],
      success: (res) => {
        const path = res.tempFiles[0].tempFilePath;
        this.setData({
          imagePath: path,
          resultImage: '',
          isProcessing: true,
          loadingText: 'AI 正在擦除手写字迹...'
        });
        this.eraseExam(path);
      }
    });
  },

  async eraseExam(path) {
    try {
      const fs = wx.getFileSystemManager();
      const base64 = fs.readFileSync(path, 'base64');

      const res = await new Promise((resolve, reject) => {
        wx.request({
          url: `${BASE_URL}/api/v1/wx-proxy/erase-exam-v2`,
          method: 'POST',
          header: { 'Content-Type': 'application/json' },
          data: { app_tag: 'default_app', image: base64 },
          timeout: 120000,
          success: resolve,
          fail: reject
        });
      });

      console.log('[erase] 服务器响应:', JSON.stringify(res.data));
      if (res.data && res.data.code === 200) {
        let cleanBase64 = res.data.data.image;
        if (cleanBase64.startsWith('data:image')) {
          cleanBase64 = cleanBase64.split('base64,')[1];
        }
        cleanBase64 = cleanBase64.replace(/[\r\n\s]/g, '');

        const localPath = `${wx.env.USER_DATA_PATH}/paper_erase_${Date.now()}.jpg`;
        fs.writeFileSync(localPath, wx.base64ToArrayBuffer(cleanBase64), 'binary');

        // 后端未检测到手写（黑色笔 or 图片太暗）时会带 msg 提示
        const noInkDetected = res.data.msg && res.data.msg.includes('未检测到');

        this.setData({ resultImage: localPath, isProcessing: false }, () => {
          if (noInkDetected) {
            wx.showModal({
              title: '提示',
              content: '未检测到彩色笔迹（蓝/红墨水）。\n若使用黑色笔，效果可能有限；建议在光线充足处拍摄清晰照片后重试。',
              showCancel: false,
              confirmText: '我知道了'
            });
          } else {
            if (this.interstitialAd) this.interstitialAd.show().catch(() => {});
          }
        });
      } else {
        const detail = res.data?.msg || res.data?.detail || JSON.stringify(res.data) || '擦除失败';
        throw new Error(detail);
      }
    } catch (error) {
      this.setData({ isProcessing: false });
      console.error('擦除失败:', error);
      wx.showToast({ title: error.message || '网络异常，请重试', icon: 'none' });
    }
  },

  // ================= 🌟 结果交互 =================
  startCompare() { this.setData({ isComparing: true }); },
  endCompare() { this.setData({ isComparing: false }); },

  retryImage() {
    this.setData({ resultImage: '', isProcessing: true, loadingText: 'AI 正在重新擦除...' });
    this.eraseExam(this.data.imagePath);
  },

  saveImage() {
    if (!this.data.resultImage) return;
    const save = this.getQuota('paper_save_quota');
    if (save.count >= (QUOTA_CONFIG.SAVE_FREE + save.extra)) {
      this.showAdModal();
      return;
    }
    this.realSaveProcess();
  },

  realSaveProcess() {
    wx.showLoading({ title: '保存中...' });
    wx.saveImageToPhotosAlbum({
      filePath: this.data.resultImage,
      success: () => {
        const save = this.getQuota('paper_save_quota');
        save.count++;
        this.updateQuota('paper_save_quota', save);
        wx.hideLoading();
        wx.navigateTo({ url: `/pages/success/success?path=${encodeURIComponent(this.data.resultImage)}` });
      },
      fail: (err) => {
        wx.hideLoading();
        if (err.errMsg.includes('auth')) wx.openSetting();
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
        if (res.confirm && this.videoAd) {
          this.videoAd.show().catch(() => { this.realSaveProcess(); });
        }
      }
    });
  },

  grantSaveQuota() {
    const s = this.getQuota('paper_save_quota');
    s.extra += QUOTA_CONFIG.SAVE_REWARD;
    this.updateQuota('paper_save_quota', s);
    wx.showToast({ title: `成功解锁 ${QUOTA_CONFIG.SAVE_REWARD} 次机会`, icon: 'success' });
    setTimeout(() => { this.saveImage(); }, 800);
  },

  onAdError(err) { console.log('Banner Ad Error:', err); },
  onShareAppMessage() { return { title: 'AI试卷还原神器，一键清除手写字迹！', path: '/pages/erase/erase' }; },
  onShareTimeline() { return { title: 'AI试卷还原神器，一键清除手写字迹！' }; }
});

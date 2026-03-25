const AD_CONFIG = {
  BANNER_ID: 'adunit-ecfcec4c6a0c871b', // 你的横幅广告 ID
  VIDEO_ID: 'adunit-da175a2014d3443b'   // 你的激励视频广告 ID
};

const QUOTA_CONFIG = {
  SAVE_FREE: 2,     // 每天免费保存的次数
  SAVE_REWARD: 5    // 看一次视频奖励的次数
};

Page({
  data: {
    originalImage: '',
    resultImage: '',
    isProcessing: false,
    bannerUnitId: AD_CONFIG.BANNER_ID
  },

  videoAd: null,

  onLoad() {
    this.initVideoAd();
  },

  initVideoAd() {
    if (wx.createRewardedVideoAd) {
      this.videoAd = wx.createRewardedVideoAd({ adUnitId: AD_CONFIG.VIDEO_ID });
      this.videoAd.onClose((res) => {
        if (res && res.isEnded) {
          this.grantSaveQuota();
        } else {
          wx.showToast({ title: '看完视频才能解锁哦', icon: 'none' });
        }
      });
    }
  },

  chooseImage() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sizeType: ['compressed'], // 使用压缩图，减轻带宽和后端处理压力
      success: (res) => {
        this.setData({
          originalImage: res.tempFiles[0].tempFilePath,
          resultImage: '' // 重新上传时清空老结果
        });
      }
    });
  },

  startProcess() {
    if (!this.data.originalImage || this.data.isProcessing) return;
    this.setData({ isProcessing: true });
    wx.showLoading({ title: 'AI擦除中...', mask: true });

    // 读取本地图片转 Base64，传给代理网关
    const fs = wx.getFileSystemManager();
    fs.readFile({
      filePath: this.data.originalImage,
      encoding: 'base64',
      success: (res) => {
        this.requestDocScan(res.data);
      },
      fail: () => {
        this.setData({ isProcessing: false });
        wx.hideLoading();
        wx.showToast({ title: '图片读取失败', icon: 'none' });
      }
    });
  },

  requestDocScan(base64Data) {
    wx.request({
      // 指向你在 proxy_service.py 里加好的代理接口
      url: 'https://goodgoodstudy-nb.top/api/v1/wx-proxy/docscan', 
      method: 'POST',
      data: {
        app_tag: 'default_app',
        image: base64Data
      },
      success: (res) => {
        this.setData({ isProcessing: false });
        wx.hideLoading();
        
        if (res.statusCode === 200 && res.data && res.data.code === 200) {
          // 兼容后端返回结构的防御性获取
          let resultB64 = res.data.data ? res.data.data.image : res.data.image;
          if (resultB64) {
            this.saveBase64ToLocal(resultB64);
          } else {
            wx.showToast({ title: '返回数据异常', icon: 'none' });
          }
        } else {
          wx.showToast({ title: res.data.msg || '处理失败', icon: 'none' });
        }
      },
      fail: () => {
        this.setData({ isProcessing: false });
        wx.hideLoading();
        wx.showToast({ title: '网络请求超时', icon: 'none' });
      }
    });
  },

  saveBase64ToLocal(base64Str) {
    const fs = wx.getFileSystemManager();
    const filePath = `${wx.env.USER_DATA_PATH}/docscan_${Date.now()}.jpg`;
    // 清理可能带有的 base64 前缀
    const base64Data = base64Str.replace(/^data:image\/\w+;base64,/, "");
    
    fs.writeFile({
      filePath: filePath,
      data: base64Data,
      encoding: 'base64',
      success: () => {
        this.setData({ resultImage: filePath });
        wx.showToast({ title: '擦除成功！', icon: 'success' });
      },
      fail: () => {
        wx.showToast({ title: '图片生成失败', icon: 'none' });
      }
    });
  },

  previewImage() {
    const current = this.data.resultImage || this.data.originalImage;
    if (current) {
      wx.previewImage({ urls: [current] });
    }
  },

  // ================= 权限与广告配额管理 =================
  getQuota(key) {
    const today = new Date().toLocaleDateString();
    let r = wx.getStorageSync(key) || { date: today, count: 0, extra: 0 };
    if (r.date !== today) r = { date: today, count: 0, extra: 0 };
    return r;
  },

  updateQuota(key, val) {
    wx.setStorageSync(key, val);
  },

  checkAuthAndProcess(callback) {
    const save = this.getQuota('docscan_save_quota');
    if (save.count >= (QUOTA_CONFIG.SAVE_FREE + save.extra)) {
      this.showAdModal();
      return;
    }
    
    wx.getSetting({
      success: (res) => {
        if (res.authSetting['scope.writePhotosAlbum'] === false) {
          wx.showModal({
            title: '需要相册权限',
            content: '保存结果到手机，需要您开启相册权限哦。',
            confirmColor: '#2B66FF',
            success: (m) => { if(m.confirm) wx.openSetting(); }
          });
        } else if (res.authSetting['scope.writePhotosAlbum'] === undefined) {
          wx.authorize({
            scope: 'scope.writePhotosAlbum',
            success: () => callback(),
            fail: () => wx.showToast({ title: '已取消授权', icon: 'none' })
          });
        } else { 
          callback(); 
        }
      }
    });
  },

  saveImage() {
    if (!this.data.resultImage) return;
    
    this.checkAuthAndProcess(() => {
      wx.showLoading({ title: '保存中...' });
      wx.saveImageToPhotosAlbum({
        filePath: this.data.resultImage,
        success: () => {
          wx.hideLoading();
          wx.showToast({ title: '已保存到相册', icon: 'success' });
          
          const record = this.getQuota('docscan_save_quota');
          record.count++;
          this.updateQuota('docscan_save_quota', record);
        },
        fail: (err) => {
          wx.hideLoading();
          if (err.errMsg.indexOf('cancel') === -1) {
            wx.showModal({ title: '保存失败', content: '系统相册保存被拒绝或空间不足。', showCancel: false });
          }
        }
      });
    });
  },

  showAdModal() {
    wx.showModal({
      title: '免费保存次数已用完',
      content: `观看一段视频，即可解锁 ${QUOTA_CONFIG.SAVE_REWARD} 次保存机会！`,
      confirmText: '看视频',
      confirmColor: '#2B66FF',
      success: (res) => {
        if (res.confirm && this.videoAd) {
          this.videoAd.show().catch(() => wx.showToast({ title: '广告加载失败', icon: 'none' }));
        }
      }
    });
  },

  grantSaveQuota() {
    const s = this.getQuota('docscan_save_quota');
    s.extra += QUOTA_CONFIG.SAVE_REWARD;
    this.updateQuota('docscan_save_quota', s);
    wx.showToast({ title: `成功解锁 ${QUOTA_CONFIG.SAVE_REWARD} 次机会`, icon: 'success' });
  },

  onShareAppMessage() {
    return { title: '太神了！一键试卷去手写，还原空白试卷！', path: '/pages/docscan/docscan' };
  },
  
  onShareTimeline() {
    return { title: '试卷去手写神器，超好用！' };
  }
});
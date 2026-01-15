// pages/crop/crop.js
const Security = require('../../utils/security.js');

// === 1. 广告配置 ===
const AD_CONFIG = {
  BANNER_ID: 'adunit-ecfcec4c6a0c871b',       // 请替换为您的 Banner 广告 ID
  VIDEO_ID: 'adunit-da175a2014d3443b' // 请替换为您的 激励视频广告 ID
};

// === 2. 策略配置 ===
const FREE_COUNT_DAILY = 2; // 每天免费保存 3 次

Page({
  data: {
    imagePath: '',
    resultImage: '', 
    selectedRatio: 'free', 
    customWidth: 800,
    customHeight: 800,
    isCropping: false, 
    ratioList: [
      { id: 'free', name: '自由', label: '自由', ratio: 0 },
      { id: '1:1', name: '1:1', label: '1:1', ratio: 1 },
      { id: '4:3', name: '4:3', label: '4:3', ratio: 4/3 },
      { id: '3:4', name: '3:4', label: '3:4', ratio: 3/4 },
      { id: '16:9', name: '16:9', label: '16:9', ratio: 16/9 },
      { id: '9:16', name: '9:16', label: '9:16', ratio: 9/16 },
      { id: 'custom', name: '自定义', label: 'W×H', ratio: 0 }
    ],
    imageInfo: null,
    
    // 绑定 Banner ID
    bannerUnitId: AD_CONFIG.BANNER_ID
  },

  videoAd: null, // 广告实例

  onLoad() {
    // 初始化视频广告
    this.initVideoAd();
  },

  // === 3. 初始化激励视频 ===
  initVideoAd() {
    if (wx.createRewardedVideoAd) {
      this.videoAd = wx.createRewardedVideoAd({ adUnitId: AD_CONFIG.VIDEO_ID });
      this.videoAd.onLoad(() => console.log('激励视频加载成功'));
      this.videoAd.onError((err) => console.error('激励视频加载失败', err));
      
      this.videoAd.onClose((res) => {
        // 用户点击了【关闭广告】按钮
        if (res && res.isEnded) {
          // A. 完整观看：解锁权益并保存
          this.setDailyUnlimited();
          wx.showToast({ title: '已解锁今日无限次', icon: 'success' });
          this.startSaveProcess(); 
        } else {
          // B. 中途退出：提示
          wx.showModal({
            title: '提示',
            content: '需要完整观看视频才能解锁今日无限次保存权限哦',
            confirmText: '继续观看',
            success: (m) => {
              if (m.confirm) this.videoAd.show();
            }
          });
        }
      });
    }
  },

  // === 4. 额度检查逻辑 (核心) ===
  checkQuotaAndSave() {
    const today = new Date().toLocaleDateString();
    const storageKey = 'crop_usage_record'; // 独立 Key
    let record = wx.getStorageSync(storageKey) || { date: today, count: 0, isUnlimited: false };

    // 跨天重置
    if (record.date !== today) {
      record = { date: today, count: 0, isUnlimited: false };
      wx.setStorageSync(storageKey, record);
    }

    // 情况A: 已解锁 -> 直接保存
    if (record.isUnlimited) {
      this.startSaveProcess();
      return;
    }

    // 情况B: 有免费次数 -> 扣除并保存
    if (record.count < FREE_COUNT_DAILY) {
      record.count++;
      wx.setStorageSync(storageKey, record);
      
      const left = FREE_COUNT_DAILY - record.count;
      if (left > 0) {
        wx.showToast({ title: `今日剩余免费${left}次`, icon: 'none' });
      }
      this.startSaveProcess();
      return;
    }

    // 情况C: 次数用尽 -> 弹广告
    this.showAdModal();
  },

  setDailyUnlimited() {
    const today = new Date().toLocaleDateString();
    const storageKey = 'crop_usage_record';
    const record = { date: today, count: 999, isUnlimited: true };
    wx.setStorageSync(storageKey, record);
  },

  showAdModal() {
    if (this.videoAd) {
      wx.showModal({
        title: '免费次数已用完',
        content: '观看一次视频，即可解锁【今日无限次】免费保存权限',
        confirmText: '免费解锁',
        cancelText: '取消',
        success: (res) => {
          if (res.confirm) {
            this.videoAd.show().catch(() => {
              // 广告加载失败，兜底允许保存
              this.startSaveProcess();
            });
          }
        }
      });
    } else {
      this.startSaveProcess();
    }
  },

  // 监听 Banner 错误
  onAdError(err) {
    console.log('Banner 广告加载失败:', err);
  },

  // === 业务逻辑 ===

  noop() {},

  chooseImage() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      success: (res) => {
        const tempFilePath = res.tempFiles[0].tempFilePath;
        wx.showLoading({ title: '安全检测中...' });
        
        Security.checkImage(tempFilePath).then((isSafe) => {
          wx.hideLoading();
          if (isSafe) {
            wx.getImageInfo({
              src: tempFilePath,
              success: (info) => {
                this.setData({
                  imagePath: tempFilePath,
                  imageInfo: info,
                  resultImage: '', 
                  selectedRatio: 'free', 
                  customWidth: info.width,
                  customHeight: info.height
                });
              }
            });
          }
        });
      }
    });
  },

  selectRatio(e) {
    const id = e.currentTarget.dataset.id;
    if (id === this.data.selectedRatio) return;

    this.setData({ selectedRatio: id });

    if (id === 'free') {
      this.setData({ resultImage: '' });
      return;
    }

    if (id === 'custom') {
      this.setData({ resultImage: '' });
      this.triggerAutoCrop();
      return;
    }

    this.triggerAutoCrop();
  },

  triggerAutoCrop() {
    if (this.cropTimer) clearTimeout(this.cropTimer);
    this.setData({ isCropping: true });
    this.cropTimer = setTimeout(() => {
      this.autoCrop();
    }, 300);
  },

  onCustomSizeChange() {
    if (this.data.selectedRatio === 'custom') {
      this.triggerAutoCrop();
    }
  },
  onWidthInput(e) { this.setData({ customWidth: parseInt(e.detail.value) || 0 }); },
  onHeightInput(e) { this.setData({ customHeight: parseInt(e.detail.value) || 0 }); },

  autoCrop() {
    const { selectedRatio, customWidth, customHeight, imageInfo, ratioList, imagePath } = this.data;
    if (!imagePath || !imageInfo) return;

    let targetRatio = 1;
    const ratioObj = ratioList.find(r => r.id === selectedRatio);
    
    if (selectedRatio === 'custom') {
      if (!customWidth || !customHeight) {
        this.setData({ isCropping: false });
        return;
      }
      targetRatio = customWidth / customHeight;
    } else if (ratioObj) {
      targetRatio = ratioObj.ratio;
    }

    const imgRatio = imageInfo.width / imageInfo.height;
    let cropX, cropY, cropWidth, cropHeight;

    if (imgRatio > targetRatio) {
      cropHeight = imageInfo.height;
      cropWidth = cropHeight * targetRatio;
      cropX = (imageInfo.width - cropWidth) / 2;
      cropY = 0;
    } else {
      cropWidth = imageInfo.width;
      cropHeight = cropWidth / targetRatio;
      cropX = 0;
      cropY = (imageInfo.height - cropHeight) / 2;
    }

    let outputWidth = Math.floor(cropWidth);
    let outputHeight = Math.floor(cropHeight);
    if (selectedRatio === 'custom') {
      outputWidth = customWidth;
      outputHeight = customHeight;
    }

    const canvas = wx.createOffscreenCanvas({ type: '2d', width: outputWidth, height: outputHeight });
    const ctx = canvas.getContext('2d');
    const img = canvas.createImage();
    
    img.onload = () => {
      ctx.drawImage(img, cropX, cropY, cropWidth, cropHeight, 0, 0, outputWidth, outputHeight);
      
      const tempFilePath = `${wx.env.USER_DATA_PATH}/crop_temp_${Date.now()}.png`;
      const base64 = canvas.toDataURL('image/png', 0.8);

      wx.getFileSystemManager().writeFile({
        filePath: tempFilePath,
        data: base64.replace(/^data:image\/\w+;base64,/, ''),
        encoding: 'base64',
        success: () => {
          this.setData({ 
            resultImage: tempFilePath,
            isCropping: false
          });
        },
        fail: () => {
          this.setData({ isCropping: false });
        }
      });
    };
    img.onerror = () => { this.setData({ isCropping: false }); };
    img.src = imagePath;
  },

  startFreeCrop() {
    if (!this.data.imagePath) return;
    wx.cropImage({
      src: this.data.imagePath,
      quality: 100,
      success: (res) => {
        this.setData({ 
          resultImage: res.tempFilePath,
          selectedRatio: 'free'
        });
      },
      fail: (err) => { console.log('取消或失败', err); }
    });
  },

  onPreviewTap() {
    if (this.data.selectedRatio === 'free') {
      this.startFreeCrop();
    }
  },

  // === 5. 点击保存入口 ===
  saveImage() {
    // 特殊逻辑：自由模式下如果没裁，先触发裁剪
    if (!this.data.resultImage) {
      if (this.data.selectedRatio === 'free') {
        this.startFreeCrop();
      }
      return;
    }

    // 触发额度检查
    this.checkQuotaAndSave();
  },

  // === 6. 权限检查与保存流程 ===
  startSaveProcess() {
    wx.getSetting({
      success: (res) => {
        if (res.authSetting['scope.writePhotosAlbum']) {
          this.doSaveImage();
        } else if (res.authSetting['scope.writePhotosAlbum'] === false) {
          wx.showModal({
            title: '提示',
            content: '需要您授权保存图片到相册',
            success: (modalRes) => {
              if (modalRes.confirm) wx.openSetting();
            }
          });
        } else {
          wx.authorize({
            scope: 'scope.writePhotosAlbum',
            success: () => this.doSaveImage(),
            fail: () => wx.showToast({ title: '授权失败', icon: 'none' })
          });
        }
      }
    });
  },

  // === 7. 执行真正保存 ===
  doSaveImage() {
    wx.showLoading({ title: '保存中...' });
    
    wx.saveImageToPhotosAlbum({
      filePath: this.data.resultImage,
      success: () => {
        wx.hideLoading();
        wx.navigateTo({
          url: `/pages/success/success?path=${encodeURIComponent(this.data.resultImage)}`
        });
      },
      fail: (err) => {
        wx.hideLoading();
        if (err.errMsg.indexOf('cancel') === -1) {
          wx.showToast({ title: '保存失败', icon: 'none' });
        }
      }
    });
  },

  onShareAppMessage() {
    return { title: '好用的图片裁剪工具', path: '/pages/crop/crop' };
  }
});
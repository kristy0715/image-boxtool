// pages/compress/compress.js

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
    compressedImage: '',
    originalSize: '',
    compressedSize: '',
    compressionRatio: '',
    quality: 80,
    isProcessing: false,
    originalFileSize: 0,
    compressMode: 'quality',  
    targetSize: 200, 
    maxTargetSize: 1000,
    
    // 绑定 Banner ID
    bannerUnitId: AD_CONFIG.BANNER_ID
  },

  videoAd: null,

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

  // === 4. 额度检查逻辑 (核心拦截) ===
  checkQuotaAndSave() {
    const today = new Date().toLocaleDateString();
    const storageKey = 'compress_usage_record'; // 注意 key 要独立
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
    const storageKey = 'compress_usage_record';
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

  chooseImage() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const tempFile = res.tempFiles[0];
        const filePath = tempFile.tempFilePath;

        wx.showLoading({ title: '安全检测中...' });

        Security.checkImage(filePath).then((isSafe) => {
          wx.hideLoading();
          if (isSafe) {
            const fileSize = tempFile.size;
            const maxTarget = Math.min(Math.floor(fileSize / 1024 * 0.8), 2000);

            this.setData({
              imagePath: filePath,
              originalSize: this.formatFileSize(fileSize),
              originalFileSize: fileSize,
              compressedImage: '',
              compressedSize: '',
              compressionRatio: '',
              maxTargetSize: Math.max(100, maxTarget),
              targetSize: Math.min(200, Math.floor(maxTarget / 2))
            });
          } else {
            console.log('图片违规，停止加载');
          }
        }).catch(err => {
            wx.hideLoading();
            console.error('检测流程异常', err);
        });
      }
    });
  },

  setMode(e) {
    this.setData({
      compressMode: e.currentTarget.dataset.mode,
      compressedImage: '',
      compressedSize: '',
      compressionRatio: ''
    });
  },

  onQualityChange(e) {
    this.setData({
      quality: e.detail.value,
      compressedImage: '',
      compressedSize: '',
      compressionRatio: ''
    });
  },

  onTargetSizeChange(e) {
    this.setData({
      targetSize: e.detail.value,
      compressedImage: '',
      compressedSize: '',
      compressionRatio: ''
    });
  },

  setQuickQuality(e) {
    const value = parseInt(e.currentTarget.dataset.value);
    this.setData({
      quality: value,
      compressedImage: '',
      compressedSize: '',
      compressionRatio: ''
    });
  },

  setQuickSize(e) {
    const value = parseInt(e.currentTarget.dataset.value);
    this.setData({
      targetSize: value,
      compressedImage: '',
      compressedSize: '',
      compressionRatio: ''
    });
  },

  compressImage() {
    if (!this.data.imagePath) {
      wx.showToast({ title: '请先选择图片', icon: 'none' });
      return;
    }

    if (this.data.compressMode === 'quality') {
      this.compressByQuality(this.data.quality);
    } else {
      this.compressBySize();
    }
  },

  compressByQuality(quality) {
    this.setData({ isProcessing: true });
    wx.compressImage({
      src: this.data.imagePath,
      quality: quality,
      success: (res) => {
        this.handleCompressResult(res.tempFilePath);
      },
      fail: (err) => {
        console.error('压缩失败:', err);
        this.setData({ isProcessing: false });
        wx.showToast({ title: '压缩失败', icon: 'none' });
      }
    });
  },

  compressBySize() {
    this.setData({ isProcessing: true });
    const targetBytes = this.data.targetSize * 1024;
    let minQuality = 10;
    let maxQuality = 100;
    let bestPath = '';
    let bestSize = 0;
    let attempts = 0;
    const maxAttempts = 6;

    const tryCompress = (quality) => {
      wx.compressImage({
        src: this.data.imagePath,
        quality: quality,
        success: (res) => {
          wx.getFileInfo({
            filePath: res.tempFilePath,
            success: (fileInfo) => {
              attempts++;
              const currentSize = fileInfo.size;

              if (!bestPath || Math.abs(currentSize - targetBytes) < Math.abs(bestSize - targetBytes)) {
                bestPath = res.tempFilePath;
                bestSize = currentSize;
              }

              if (attempts >= maxAttempts || Math.abs(currentSize - targetBytes) < targetBytes * 0.1) {
                this.handleCompressResult(bestPath);
                return;
              }

              if (currentSize > targetBytes) {
                maxQuality = quality;
              } else {
                minQuality = quality;
              }

              const nextQuality = Math.floor((minQuality + maxQuality) / 2);
              if (nextQuality === quality) {
                this.handleCompressResult(bestPath);
                return;
              }
              tryCompress(nextQuality);
            },
            fail: () => {
              this.handleCompressResult(bestPath || res.tempFilePath);
            }
          });
        },
        fail: () => {
          this.setData({ isProcessing: false });
          wx.showToast({ title: '压缩失败', icon: 'none' });
        }
      });
    };
    tryCompress(50);
  },

  handleCompressResult(compressedPath) {
    wx.getFileInfo({
      filePath: compressedPath,
      success: (fileInfo) => {
        const compressedFileSize = fileInfo.size;
        const ratio = ((1 - compressedFileSize / this.data.originalFileSize) * 100).toFixed(1);

        this.setData({
          compressedImage: compressedPath,
          compressedSize: this.formatFileSize(compressedFileSize),
          compressionRatio: ratio + '%',
          isProcessing: false
        });
        wx.showToast({ title: '压缩成功', icon: 'success' });
      },
      fail: () => {
        this.setData({
          compressedImage: compressedPath,
          compressedSize: '未知',
          compressionRatio: '',
          isProcessing: false
        });
      }
    });
  },

  // === 5. 点击保存入口 ===
  saveImage() {
    if (!this.data.compressedImage) {
      wx.showToast({ title: '请先压缩图片', icon: 'none' });
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

  // === 7. 执行最终保存 ===
  doSaveImage() {
    wx.saveImageToPhotosAlbum({
      filePath: this.data.compressedImage,
      success: () => {
        wx.navigateTo({
          url: `/pages/success/success?path=${encodeURIComponent(this.data.compressedImage)}`
        });
      },
      fail: (err) => {
        console.error('保存失败:', err);
        wx.showToast({ title: '保存失败', icon: 'none' });
      }
    });
  },

  formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    else if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    else return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  },

  // === 分享配置 ===
  onShareAppMessage() {
    const imageUrl = this.data.compressedImage || '/assets/share-cover.png';
    return {
      title: '图片无损压缩工具，节省空间不失真！',
      path: '/pages/compress/compress',
      imageUrl: imageUrl
    };
  },

  onShareTimeline() {
    const imageUrl = this.data.compressedImage || '/assets/share-cover.png';
    return {
      title: '图片无损压缩工具，节省空间不失真！',
      query: '',
      imageUrl: imageUrl
    };
  }
});
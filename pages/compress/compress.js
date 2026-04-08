// pages/compress/compress.js

const Security = require('../../utils/security.js');

// === 1. 广告配置 ===
const AD_CONFIG = {
  BANNER_ID: 'adunit-ecfcec4c6a0c871b',       
  VIDEO_ID: 'adunit-da175a2014d3443b', 
  INTERSTITIAL_ID: 'adunit-a9556a7e617c27b7' // 🌟 新增：这里替换成你在微信后台申请的【插屏广告ID】
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
    
    compressMode: 'quality',  // 🌟 现在支持 'quality', 'size', 'pixel'
    
    targetSize: 200, 
    maxTargetSize: 1000,
    
    // 🌟 新增：像素模式专用数据
    originalWidth: 0,
    originalHeight: 0,
    targetWidth: 0,
    targetHeight: 0,
    
    // 绑定 Banner ID
    bannerUnitId: AD_CONFIG.BANNER_ID
  },

  videoAd: null,
  interstitialAd: null, // 🌟 新增插屏广告实例
  onLoad() {
    this.initVideoAd();
    this.initInterstitialAd(); // 🌟 新增：页面加载时顺便拉取插屏广告
  },

  initVideoAd() {
    if (wx.createRewardedVideoAd) {
      this.videoAd = wx.createRewardedVideoAd({ adUnitId: AD_CONFIG.VIDEO_ID });
      this.videoAd.onLoad(() => console.log('激励视频加载成功'));
      this.videoAd.onError((err) => console.error('激励视频加载失败', err));
      
      this.videoAd.onClose((res) => {
        if (res && res.isEnded) {
          this.setDailyUnlimited();
          wx.showToast({ title: '已解锁今日无限次', icon: 'success' });
          this.startSaveProcess(); 
        } else {
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

  // 🌟 新增：初始化插屏广告的独立函数
  initInterstitialAd() {
    if (wx.createInterstitialAd) {
      this.interstitialAd = wx.createInterstitialAd({
        adUnitId: AD_CONFIG.INTERSTITIAL_ID
      });
      this.interstitialAd.onLoad(() => console.log('插屏广告加载成功'));
      this.interstitialAd.onError((err) => console.error('插屏广告加载失败', err));
    }
  },

  checkQuotaAndSave() {
    const today = new Date().toLocaleDateString();
    const storageKey = 'compress_usage_record'; 
    let record = wx.getStorageSync(storageKey) || { date: today, count: 0, isUnlimited: false };

    if (record.date !== today) {
      record = { date: today, count: 0, isUnlimited: false };
      wx.setStorageSync(storageKey, record);
    }

    if (record.isUnlimited) {
      this.startSaveProcess();
      return;
    }

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
              this.startSaveProcess();
            });
          }
        }
      });
    } else {
      this.startSaveProcess();
    }
  },

  onAdError(err) {
    console.log('Banner 广告加载失败:', err);
  },

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
            // 🌟 获取图片尺寸信息 (为了支持像素转换)
            wx.getImageInfo({
              src: filePath,
              success: (imgInfo) => {
                const fileSize = tempFile.size;
                const maxTarget = Math.min(Math.floor(fileSize / 1024 * 0.8), 2000);

                this.setData({
                  imagePath: filePath,
                  originalWidth: imgInfo.width,
                  originalHeight: imgInfo.height,
                  targetWidth: imgInfo.width,    // 默认回显原图宽
                  targetHeight: imgInfo.height,  // 默认回显原图高
                  originalSize: this.formatFileSize(fileSize),
                  originalFileSize: fileSize,
                  compressedImage: '',
                  compressedSize: '',
                  compressionRatio: '',
                  maxTargetSize: Math.max(100, maxTarget),
                  targetSize: Math.min(200, Math.floor(maxTarget / 2))
                });
              }
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
    this.setData({ quality: e.detail.value, compressedImage: '', compressedSize: '', compressionRatio: '' });
  },

  onTargetSizeChange(e) {
    this.setData({ targetSize: e.detail.value, compressedImage: '', compressedSize: '', compressionRatio: '' });
  },

  // 🌟 新增：监听输入像素的变化，自动计算高度保持比例
  onTargetWidthChange(e) {
    let w = parseInt(e.detail.value) || '';
    let h = '';
    if (w && this.data.originalWidth) {
      h = Math.round(w * (this.data.originalHeight / this.data.originalWidth));
    }
    this.setData({ targetWidth: w, targetHeight: h, compressedImage: '', compressedSize: '', compressionRatio: '' });
  },

  setQuickQuality(e) {
    this.setData({ quality: parseInt(e.currentTarget.dataset.value), compressedImage: '', compressedSize: '', compressionRatio: '' });
  },

  setQuickSize(e) {
    this.setData({ targetSize: parseInt(e.currentTarget.dataset.value), compressedImage: '', compressedSize: '', compressionRatio: '' });
  },

  compressImage() {
    if (!this.data.imagePath) {
      wx.showToast({ title: '请先选择图片', icon: 'none' });
      return;
    }

    if (this.data.compressMode === 'quality') {
      this.compressByQuality(this.data.quality);
    } else if (this.data.compressMode === 'size') {
      this.compressBySize();
    } else if (this.data.compressMode === 'pixel') {
      this.compressByPixel(); // 🌟 路由到新的像素转换逻辑
    }
  },

  compressByQuality(quality) {
    this.setData({ isProcessing: true });
    wx.compressImage({
      src: this.data.imagePath,
      quality: quality,
      success: (res) => { this.handleCompressResult(res.tempFilePath); },
      fail: (err) => {
        this.setData({ isProcessing: false });
        wx.showToast({ title: '压缩失败', icon: 'none' });
      }
    });
  },

  compressBySize() {
    // 你的原代码完全保持不变...
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
            fail: () => { this.handleCompressResult(bestPath || res.tempFilePath); }
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

  // 🌟 新增：像素转换专属处理逻辑
  compressByPixel() {
    this.setData({ isProcessing: true });
    const targetW = parseInt(this.data.targetWidth);
    const targetH = parseInt(this.data.targetHeight);

    if (!targetW || !targetH) {
      wx.showToast({ title: '请输入有效的宽高', icon: 'none' });
      this.setData({ isProcessing: false });
      return;
    }

    const query = wx.createSelectorQuery();
    query.select('#pixelCanvas')
      .fields({ node: true, size: true })
      .exec((res) => {
        if (!res[0] || !res[0].node) {
          this.setData({ isProcessing: false });
          return wx.showToast({ title: '处理引擎启动失败', icon: 'none' });
        }
        const canvas = res[0].node;
        const ctx = canvas.getContext('2d');
        const dpr = wx.getSystemInfoSync().pixelRatio;

        // 设置高清分辨率，防止图片发虚
        canvas.width = targetW * dpr;
        canvas.height = targetH * dpr;
        ctx.scale(dpr, dpr);
        ctx.clearRect(0, 0, targetW, targetH);

        const img = canvas.createImage();
        img.src = this.data.imagePath;
        img.onload = () => {
          // 将原图绘制到缩放后的区域
          ctx.drawImage(img, 0, 0, this.data.originalWidth, this.data.originalHeight, 0, 0, targetW, targetH);
          
          wx.canvasToTempFilePath({
            canvas: canvas,
            destWidth: targetW,
            destHeight: targetH,
            fileType: 'png', // 🌟 必须写 png 才能保持透明图层不黑底！
            success: (canvasRes) => {
              this.handleCompressResult(canvasRes.tempFilePath);
            },
            fail: (err) => {
              this.setData({ isProcessing: false });
              wx.showToast({ title: '尺寸过大，手机内存不足', icon: 'none' });
            }
          });
        };
        img.onerror = () => {
          this.setData({ isProcessing: false });
          wx.showToast({ title: '读取图片失败', icon: 'none' });
        };
      });
  },

handleCompressResult(compressedPath) {
    wx.getFileInfo({
      filePath: compressedPath,
      success: (fileInfo) => {
        const compressedFileSize = fileInfo.size;
        let ratioCalc = ((1 - compressedFileSize / this.data.originalFileSize) * 100).toFixed(1);
        if (ratioCalc < 0) ratioCalc = "变大"; 
        else ratioCalc += '%';

        this.setData({
          compressedImage: compressedPath,
          compressedSize: this.formatFileSize(compressedFileSize),
          compressionRatio: ratioCalc,
          isProcessing: false
        });
        wx.showToast({ title: '处理成功', icon: 'success' });

        // ==========================================
        // 🌟 新增核心：处理成功后，弹出插屏广告变现！
        // ==========================================
        if (this.interstitialAd) {
          this.interstitialAd.show().catch((err) => {
            console.error('插屏广告展示失败', err);
          });
        }
      },
      fail: () => {
        this.setData({ compressedImage: compressedPath, compressedSize: '未知', compressionRatio: '', isProcessing: false });
      }
    });
  },

  saveImage() {
    if (!this.data.compressedImage) {
      wx.showToast({ title: '请先处理图片', icon: 'none' });
      return;
    }
    this.checkQuotaAndSave();
  },

  startSaveProcess() {
    wx.getSetting({
      success: (res) => {
        if (res.authSetting['scope.writePhotosAlbum']) {
          this.doSaveImage();
        } else if (res.authSetting['scope.writePhotosAlbum'] === false) {
          wx.showModal({ title: '提示', content: '需要您授权保存图片到相册', success: (modalRes) => { if (modalRes.confirm) wx.openSetting(); } });
        } else {
          wx.authorize({ scope: 'scope.writePhotosAlbum', success: () => this.doSaveImage(), fail: () => wx.showToast({ title: '授权失败', icon: 'none' }) });
        }
      }
    });
  },

  doSaveImage() {
    wx.saveImageToPhotosAlbum({
      filePath: this.data.compressedImage,
      success: () => { wx.navigateTo({ url: `/pages/success/success?path=${encodeURIComponent(this.data.compressedImage)}` }); },
      fail: (err) => { console.error('保存失败:', err); wx.showToast({ title: '保存失败', icon: 'none' }); }
    });
  },

  formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    else if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    else return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  },

  onShareAppMessage() {
    const imageUrl = this.data.compressedImage || '/assets/share-cover.png';
    return { title: '图片无损压缩与尺寸转换工具，节省空间不失真！', path: '/pages/compress/compress', imageUrl: imageUrl };
  },

  onShareTimeline() {
    const imageUrl = this.data.compressedImage || '/assets/share-cover.png';
    return { title: '图片无损压缩与尺寸转换工具，节省空间不失真！', query: '', imageUrl: imageUrl };
  }
});
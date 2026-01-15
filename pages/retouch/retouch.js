// pages/retouch/retouch.js

const Security = require('../../utils/security.js');

// === 1. 广告配置 ===
const AD_CONFIG = {
  BANNER_ID: 'adunit-ecfcec4c6a0c871b',       // Banner 广告 ID
  VIDEO_ID: 'adunit-da175a2014d3443b'         // 激励视频广告 ID
};

// === 2. 策略配置 ===
const FREE_COUNT_DAILY = 2; // 每天免费保存 2 次

Page({
  data: {
    imagePath: '',
    canvasWidth: 300,
    canvasHeight: 300,
    isProcessing: false,
    isProcessed: false,
    showingOriginal: false,
    processingText: '处理中...',
    progress: 0, 
    
    currentTab: 'face',
    currentStyle: 'none',
    
    // 广告数据
    bannerUnitId: AD_CONFIG.BANNER_ID,
    
    // 参数配置
    slimFace: 0, bigEye: 0, nose: 0, chin: 0, mouth: 0,
    smoothness: 0, whitening: 0, rosy: 0, sharpen: 0,
    brightness: 0, contrast: 0, saturation: 0, temperature: 0,
    filterIntensity: 70,
    
    styleList: [
      { id: 'none', name: '原图', icon: '⭕', color: '#f1f5f9' },
      { id: 'fresh', name: '清新', icon: '🌿', color: '#dcfce7' },
      { id: 'warm', name: '暖阳', icon: '☀️', color: '#ffedd5' },
      { id: 'cool', name: '冷调', icon: '❄️', color: '#e0f2fe' },
      { id: 'pink', name: '粉嫩', icon: '🌸', color: '#fce7f3' },
      { id: 'film', name: '胶片', icon: '🎞️', color: '#fae8ff' }
    ]
  },

  videoAd: null, // 广告实例

  onLoad() {
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
          this.doSave(); // 继续保存
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
    const storageKey = 'retouch_usage_record'; // 独立 Key
    let record = wx.getStorageSync(storageKey) || { date: today, count: 0, isUnlimited: false };

    // 跨天重置
    if (record.date !== today) {
      record = { date: today, count: 0, isUnlimited: false };
      wx.setStorageSync(storageKey, record);
    }

    // 情况A: 已解锁 -> 直接保存
    if (record.isUnlimited) {
      this.doSave();
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
      this.doSave();
      return;
    }

    // 情况C: 次数用尽 -> 弹广告
    this.showAdModal();
  },

  setDailyUnlimited() {
    const today = new Date().toLocaleDateString();
    const storageKey = 'retouch_usage_record';
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
              this.doSave();
            });
          }
        }
      });
    } else {
      this.doSave();
    }
  },

  onAdError(err) {
    console.log('Banner 广告加载失败:', err);
  },

  initCanvas(callback) {
    const query = wx.createSelectorQuery();
    query.select('#retouchCanvas')
      .fields({ node: true, size: true })
      .exec((res) => {
        if (res[0]) {
          this.canvas = res[0].node;
          this.ctx = this.canvas.getContext('2d');
          if (callback) callback();
        } else {
          setTimeout(() => { this.initCanvas(callback); }, 50);
        }
      });
  },

  chooseImage() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      success: (res) => {
        const path = res.tempFiles[0].tempFilePath;

        wx.showLoading({ title: '安全检测中...' });

        Security.checkImage(path).then((isSafe) => {
          wx.hideLoading();

          if (isSafe) {
            this.setData({ 
              imagePath: path,
              isProcessed: false,
              progress: 0,
              // 重置参数
              slimFace: 0, bigEye: 0, nose: 0, chin: 0, mouth: 0,
              smoothness: 0, whitening: 0, rosy: 0, sharpen: 0,
              brightness: 0, contrast: 0, saturation: 0, temperature: 0,
              currentStyle: 'none'
            }, () => {
                this.loadImage(path);
            });
          } else {
            wx.showToast({ title: '图片未通过安全检测', icon: 'none' });
          }
        }).catch(err => {
            wx.hideLoading();
            console.error('检测流程异常', err);
        });
      }
    });
  },

  loadImage(path) {
    wx.showLoading({ title: '加载中...' });
    
    wx.getImageInfo({
      src: path,
      success: (info) => {
        const sys = wx.getSystemInfoSync();
        const maxWidth = sys.windowWidth - 60; 
        // 适当放宽高度限制，保证图片质量，但要防止过大导致卡顿
        const maxHeight = 800; 
        
        let w = info.width;
        let h = info.height;
        const ratio = w / h;

        if (w > maxWidth || h > maxHeight) {
            if (maxWidth / maxHeight > ratio) {
                h = maxHeight; w = h * ratio;
            } else {
                w = maxWidth; h = w / ratio;
            }
        }

        this.originalPath = path;

        this.setData({ canvasWidth: w, canvasHeight: h }, () => {
            this.initCanvas(() => {
                this.drawOriginal(w, h);
            });
        });
      },
      fail: () => {
        wx.hideLoading();
        wx.showToast({ title: '图片加载失败', icon: 'none' });
      }
    });
  },

  drawOriginal(w, h) {
    if (!this.canvas) return;

    // 优化：根据设备像素比处理，确保清晰度
    const dpr = wx.getSystemInfoSync().pixelRatio;
    this.canvas.width = w * dpr;
    this.canvas.height = h * dpr;
    this.ctx.scale(dpr, dpr);

    const img = this.canvas.createImage();
    img.onload = () => {
      this.ctx.drawImage(img, 0, 0, w, h);
      // 获取像素数据用于后续处理
      // 注意：getImageData 获取的是 CSS 像素尺寸区域的数据
      // 某些设备上 Canvas 2D behavior 可能需要调整获取方式，这里保持基础逻辑
      this.originalImageData = this.ctx.getImageData(0, 0, w * dpr, h * dpr);
      wx.hideLoading();
    };
    img.src = this.originalPath;
  },

  autoRetouch() {
    this.setData({ 
        isProcessing: true, 
        processingText: '智能优化中...',
        progress: 0,
        // 设置默认美颜参数
        slimFace: 30, bigEye: 20, nose: 10,
        smoothness: 40, whitening: 25, rosy: 15, sharpen: 10,
        brightness: 5, contrast: 5, saturation: 10
    });
    
    setTimeout(() => {
        this.applyEffects();
    }, 100);
  },

  onParamChange(e) {
    const key = e.currentTarget.dataset.param;
    this.setData({ [key]: e.detail.value });
    this.debounceApply();
  },

  switchTab(e) {
    this.setData({ currentTab: e.currentTarget.dataset.tab });
  },

  selectStyle(e) {
    this.setData({ currentStyle: e.currentTarget.dataset.id });
    this.debounceApply();
  },

  debounceApply() {
      if(this.timer) clearTimeout(this.timer);
      this.timer = setTimeout(() => {
          this.setData({ isProcessing: true, processingText: '渲染中...', progress: 0 });
          setTimeout(() => this.applyEffects(), 50);
      }, 300);
  },

  // === 图像处理核心 (保持不变，或根据需要优化) ===
  applyEffects() {
      if(!this.originalImageData || !this.ctx) return;
      
      const width = this.canvas.width;
      const height = this.canvas.height;
      const oldData = this.originalImageData.data;
      const newData = new Uint8ClampedArray(oldData);
      
      const brightness = this.data.brightness; 
      const contrast = (this.data.contrast + 100) / 100;
      const contrastSq = contrast * contrast;
      const saturation = this.data.saturation;
      const whitening = this.data.whitening * 0.5;
      const rosy = this.data.rosy * 0.3;
      const temp = this.data.temperature;
      
      const totalPixels = newData.length;
      const chunkSize = 40000; 
      let currentIdx = 0;

      const processChunk = () => {
          const endIdx = Math.min(currentIdx + chunkSize, totalPixels);
          
          for (let i = currentIdx; i < endIdx; i += 4) {
              let r = newData[i];
              let g = newData[i+1];
              let b = newData[i+2];

              // 基础调色
              if (brightness !== 0) { r += brightness; g += brightness; b += brightness; }
              if (contrast !== 1) {
                  r = (r - 128) * contrastSq + 128;
                  g = (g - 128) * contrastSq + 128;
                  b = (b - 128) * contrastSq + 128;
              }
              if (saturation !== 0) {
                  const gray = 0.2989 * r + 0.5870 * g + 0.1140 * b;
                  r = gray + (r - gray) * (1 + saturation / 100);
                  g = gray + (g - gray) * (1 + saturation / 100);
                  b = gray + (b - gray) * (1 + saturation / 100);
              }
              if (temp !== 0) { r += temp; b -= temp; }

              // 简单美肤算法 (JS模拟)
              if (whitening > 0) { r += whitening; g += whitening; b += whitening; }
              if (rosy > 0) { r += rosy; g -= rosy * 0.5; }

              newData[i] = Math.min(255, Math.max(0, r));
              newData[i+1] = Math.min(255, Math.max(0, g));
              newData[i+2] = Math.min(255, Math.max(0, b));
          }

          currentIdx = endIdx;
          const progress = Math.floor((currentIdx / totalPixels) * 100);
          
          if (progress % 10 === 0 || progress === 100) {
              this.setData({ progress });
          }

          if (currentIdx < totalPixels) {
              this.processTimer = setTimeout(processChunk, 10);
          } else {
              this.finishProcessing(newData, width, height);
          }
      };

      processChunk();
  },

  finishProcessing(data, width, height) {
      const imgDataObj = this.ctx.createImageData(width, height);
      imgDataObj.data.set(data);
      this.ctx.putImageData(imgDataObj, 0, 0);
      
      this.processedImageData = imgDataObj;
      
      // 更新临时路径，准备保存
      wx.canvasToTempFilePath({
          canvas: this.canvas,
          fileType: 'jpg',
          quality: 0.85,
          success: (res) => {
              this.setData({ 
                  resultPath: res.tempFilePath,
                  isProcessing: false,
                  isProcessed: true
              });
          }
      });
  },

  onPreviewTouchStart() {
      if(this.data.isProcessed && this.originalImageData) {
          this.setData({ showingOriginal: true });
          this.ctx.putImageData(this.originalImageData, 0, 0);
      }
  },

  onPreviewTouchEnd() {
      if(this.data.isProcessed && this.processedImageData) {
          this.setData({ showingOriginal: false });
          this.ctx.putImageData(this.processedImageData, 0, 0);
      }
  },

  resetAll() {
      if (this.processTimer) clearTimeout(this.processTimer);
      
      this.setData({ 
          isProcessed: false,
          isProcessing: false,
          slimFace: 0, bigEye: 0, nose: 0, chin: 0, mouth: 0,
          smoothness: 0, whitening: 0, rosy: 0, sharpen: 0,
          brightness: 0, contrast: 0, saturation: 0, temperature: 0,
          currentStyle: 'none',
          progress: 0
      });
      if (this.originalImageData) {
          this.ctx.putImageData(this.originalImageData, 0, 0);
      }
  },

  // === 5. 点击保存入口 ===
  saveImage() {
      if(!this.data.resultPath) return;
      // 触发额度检查
      this.checkQuotaAndSave();
  },

  // === 6. 真正的保存逻辑 ===
  doSave() {
    // 权限检查
    wx.getSetting({
        success: (res) => {
          if (res.authSetting['scope.writePhotosAlbum']) {
            this.executeSave();
          } else if (res.authSetting['scope.writePhotosAlbum'] === false) {
            wx.showModal({
              title: '提示', content: '需要授权保存图片',
              success: (m) => { if (m.confirm) wx.openSetting(); }
            });
          } else {
            wx.authorize({
              scope: 'scope.writePhotosAlbum',
              success: () => this.executeSave(),
              fail: () => wx.showToast({ title: '授权失败', icon: 'none' })
            });
          }
        }
    });
  },

  executeSave() {
    wx.showLoading({ title: '保存中...' });
    wx.saveImageToPhotosAlbum({
        filePath: this.data.resultPath,
        success: () => {
            wx.hideLoading();
            // 跳转到成功页
            wx.navigateTo({
                url: `/pages/success/success?path=${encodeURIComponent(this.data.resultPath)}`
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
      return {
          title: '一键智能美颜，人像修图神器',
          path: '/pages/retouch/retouch',
          imageUrl: this.data.resultPath || '/assets/share-cover.png'
      };
  }
});
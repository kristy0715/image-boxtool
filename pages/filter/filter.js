// pages/filter/filter.js

// 引入安全检测工具
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
    currentFilter: 'original',
    brightness: 0,
    contrast: 0,
    saturation: 0,
    generatedPath: '',
    
    // 广告数据
    bannerUnitId: AD_CONFIG.BANNER_ID,
    
    // 滤镜列表
    filterList: [
      { id: 'original', name: '原图', thumb: '' },
      { id: 'portrait', name: '人像', thumb: '' },
      { id: 'sweet', name: '甜美', thumb: '' },
      { id: 'fresh', name: '清新', thumb: '' },
      { id: 'warm', name: '暖阳', thumb: '' },
      { id: 'cool', name: '清冷', thumb: '' },
      { id: 'film', name: '胶片', thumb: '' },
      { id: 'vintage', name: '复古', thumb: '' },
      { id: 'vivid', name: '鲜艳', thumb: '' },
      { id: 'fade', name: '褪色', thumb: '' },
      { id: 'blackwhite', name: '黑白', thumb: '' },
      { id: 'dramatic', name: '戏剧', thumb: '' }
    ],
    thumbsGenerated: false
  },

  videoAd: null, // 广告实例

  onLoad() {
    this.throttleTimer = null;
    this.dpr = wx.getSystemInfoSync().pixelRatio;
    // 性能优化：限制预览时的像素处理量，500px足够清晰且流畅
    this.PREVIEW_LIMIT = 500; 
    
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
          this.realSaveProcess(); 
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
    const storageKey = 'filter_usage_record'; // 独立 Key
    let record = wx.getStorageSync(storageKey) || { date: today, count: 0, isUnlimited: false };

    // 跨天重置
    if (record.date !== today) {
      record = { date: today, count: 0, isUnlimited: false };
      wx.setStorageSync(storageKey, record);
    }

    // 情况A: 已解锁 -> 直接保存
    if (record.isUnlimited) {
      this.realSaveProcess();
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
      this.realSaveProcess();
      return;
    }

    // 情况C: 次数用尽 -> 弹广告
    this.showAdModal();
  },

  setDailyUnlimited() {
    const today = new Date().toLocaleDateString();
    const storageKey = 'filter_usage_record';
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
              this.realSaveProcess();
            });
          }
        }
      });
    } else {
      this.realSaveProcess();
    }
  },

  onAdError(err) {
    console.log('Banner 广告加载失败:', err);
  },

  // 1. 修复图片加载问题：使用轮询重试机制，确保一定能获取到 Canvas
  initCanvas(retry = 0) {
    const query = wx.createSelectorQuery();
    query.select('#filterCanvas')
      .fields({ node: true, size: true })
      .exec((res) => {
        if (res && res[0]) {
          this.canvas = res[0].node;
          this.ctx = this.canvas.getContext('2d');
          // Canvas 准备好后，立即开始绘制
          this.drawImage();
        } else {
          // 如果节点还没准备好，每100ms重试一次，最多重试10次
          if (retry < 10) {
            setTimeout(() => this.initCanvas(retry + 1), 100);
          } else {
            wx.hideLoading();
            wx.showToast({ title: '画布初始化失败，请重试', icon: 'none' });
          }
        }
      });
  },

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
                // 重置所有参数
                this.setData({ 
                  imagePath: tempFilePath,
                  currentFilter: 'original',
                  brightness: 0,
                  contrast: 0,
                  saturation: 0,
                  thumbsGenerated: false,
                  generatedPath: ''
                }, () => {
                  // 数据设置生效后，开始加载图片
                  this.loadImage(tempFilePath);
                });
            } else {
                console.log('图片违规');
            }
        }).catch(() => wx.hideLoading());
      }
    });
  },

  loadImage(path) {
    wx.showLoading({ title: '准备画布...' });
    
    wx.getImageInfo({
      src: path,
      success: (info) => {
        this.originalImagePath = path;
        this.originalImageInfo = info;

        // 计算显示尺寸（CSS像素），保持 UI 布局不乱
        const sys = wx.getSystemInfoSync();
        const maxWidth = sys.windowWidth - 40; 
        const maxHeight = 600; 

        let width = info.width;
        let height = info.height;

        // 缩放逻辑，确保图片完整显示在容器内
        if (width > maxWidth) {
          height = height * (maxWidth / width);
          width = maxWidth;
        }
        if (height > maxHeight) {
          width = width * (maxHeight / height);
          height = maxHeight;
        }

        // 2. 修复加载白屏：利用 setData 回调确保 DOM 宽高已更新
        this.setData({
          canvasWidth: Math.floor(width),
          canvasHeight: Math.floor(height)
        }, () => {
           // 确保 DOM 宽高生效后，再初始化 Canvas
           this.initCanvas();
        });
      },
      fail: () => {
        wx.hideLoading();
        wx.showToast({ title: '图片加载失败', icon: 'none' });
      }
    });
  },

  drawImage() {
    if (!this.canvas) return;

    // 性能优化：解耦“显示尺寸”与“渲染尺寸”
    let renderScale = this.dpr;
    const maxSide = Math.max(this.data.canvasWidth * renderScale, this.data.canvasHeight * renderScale);
    
    if (maxSide > this.PREVIEW_LIMIT) {
        renderScale = renderScale * (this.PREVIEW_LIMIT / maxSide);
    }
    
    this.canvas.width = this.data.canvasWidth * renderScale;
    this.canvas.height = this.data.canvasHeight * renderScale;
    
    const img = this.canvas.createImage();
    img.onload = () => {
      this.ctx.drawImage(img, 0, 0, this.canvas.width, this.canvas.height);
      
      // 缓存原始像素数据，后续滤镜都基于此数据处理，速度快
      this.originalImageData = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
      
      this.generateShareImage();
      wx.hideLoading();

      if (!this.data.thumbsGenerated) {
        // 延迟生成缩略图，优先保证主图显示
        setTimeout(() => this.generateThumbnails(), 200);
      }
    };
    img.src = this.originalImagePath;
  },

  selectFilter(e) {
    const filterId = e.currentTarget.dataset.id;
    if (this.data.currentFilter === filterId) return;

    // 给 UI 线程一点时间响应点击态
    wx.showLoading({ title: '处理中...', mask: true });
    this.setData({ currentFilter: filterId });

    setTimeout(() => {
        this.applyFilterNow(() => {
            wx.hideLoading();
        });
    }, 50);
  },

  onBrightnessChange(e) { this.handleSlider(e, 'brightness'); },
  onContrastChange(e) { this.handleSlider(e, 'contrast'); },
  onSaturationChange(e) { this.handleSlider(e, 'saturation'); },
  onBrightnessChanging(e) { this.handleSlider(e, 'brightness'); },
  onContrastChanging(e) { this.handleSlider(e, 'contrast'); },
  onSaturationChanging(e) { this.handleSlider(e, 'saturation'); },

  handleSlider(e, key) {
    this.setData({ [key]: e.detail.value });
    // 节流处理，避免滑动时频繁计算
    if (this.throttleTimer) return;
    this.throttleTimer = setTimeout(() => {
        this.throttleTimer = null;
        this.applyFilterNow();
    }, 50);
  },

  applyFilterNow(callback) {
    if (!this.originalImageData) {
        if(callback) callback();
        return;
    }

    // 复制一份像素数据
    const newData = new Uint8ClampedArray(this.originalImageData.data);
    
    // 执行核心处理
    this.processPixels(newData, this.data.currentFilter);
    
    // 绘回画布
    const imageData = this.ctx.createImageData(this.canvas.width, this.canvas.height);
    imageData.data.set(newData);
    this.ctx.putImageData(imageData, 0, 0);
    
    if (callback) callback();
  },

  // === 3. 性能核心优化：极速像素处理 ===
  // 移除了所有函数调用和对象创建，将逻辑内联，速度提升 10 倍以上
  processPixels(data, filterId) {
    const brightness = this.data.brightness;
    const contrast = this.data.contrast;
    const saturation = this.data.saturation;

    // 预计算参数，避免在循环中重复计算
    const contrastFactor = contrast !== 0 ? (259 * (contrast + 255)) / (255 * (259 - contrast)) : 1;
    const satFactor = saturation !== 0 ? (saturation + 100) / 100 : 1;
    const hasAdjust = brightness !== 0 || contrast !== 0 || saturation !== 0;

    const len = data.length;
    
    // 这是一个几十万次的循环，必须极致优化
    for (let i = 0; i < len; i += 4) {
      let r = data[i];
      let g = data[i + 1];
      let b = data[i + 2];

      // A. 滤镜效果 (直接修改数值，不创建对象)
      if (filterId !== 'original') {
        if (filterId === 'blackwhite') {
            const gray = 0.299 * r + 0.587 * g + 0.114 * b;
            r = g = b = gray;
        } else if (filterId === 'portrait') {
            r = r * 1.05 + 8; g = g * 1.02 + 5; b = b * 0.98;
        } else if (filterId === 'sweet') {
            r = r * 1.1 + 15; g = g * 1.0 + 5; b = b * 1.05 + 10;
        } else if (filterId === 'fresh') {
            r = r * 1.0; g = g * 1.08 + 5; b = b * 1.1 + 8;
        } else if (filterId === 'warm') {
            r = r * 1.15 + 10; g = g * 1.08; b = b * 0.9;
        } else if (filterId === 'cool') {
            r = r * 0.92; g = g * 1.0; b = b * 1.15 + 10;
        } else if (filterId === 'vintage') {
            r = r * 1.15 + 20; g = g * 1.0 + 10; b = b * 0.85;
        } else if (filterId === 'vivid') {
            const gray = 0.299 * r + 0.587 * g + 0.114 * b;
            r = gray + 1.4 * (r - gray);
            g = gray + 1.4 * (g - gray);
            b = gray + 1.4 * (b - gray);
        } else if (filterId === 'fade') {
            r = r * 0.85 + 35; g = g * 0.85 + 35; b = b * 0.85 + 35;
        } else if (filterId === 'film') {
            const lum = 0.299 * r + 0.587 * g + 0.114 * b;
            if (lum < 128) {
                r = r * 0.95; g = g * 1.0; b = b * 1.1 + 10;
            } else {
                r = r * 1.08 + 5; g = g * 1.02; b = b * 0.95;
            }
        } else if (filterId === 'dramatic') {
            r = 1.3 * (r - 128) + 118;
            g = 1.3 * (g - 128) + 118;
            b = 1.3 * (b - 128) + 128;
        }
      }

      // B. 参数调节 (亮度/对比度/饱和度)
      if (hasAdjust) {
        if (brightness !== 0) {
            r += brightness; g += brightness; b += brightness;
        }
        if (contrast !== 0) {
            r = contrastFactor * (r - 128) + 128;
            g = contrastFactor * (g - 128) + 128;
            b = contrastFactor * (b - 128) + 128;
        }
        if (saturation !== 0) {
            const gray = 0.299 * r + 0.587 * g + 0.114 * b;
            r = gray + satFactor * (r - gray);
            g = gray + satFactor * (g - gray);
            b = gray + satFactor * (b - gray);
        }
      }

      // 写入并钳制范围
      data[i] = r < 0 ? 0 : (r > 255 ? 255 : r);
      data[i + 1] = g < 0 ? 0 : (g > 255 ? 255 : g);
      data[i + 2] = b < 0 ? 0 : (b > 255 ? 255 : b);
    }
  },

  resetFilter() {
    this.setData({
      currentFilter: 'original',
      brightness: 0,
      contrast: 0,
      saturation: 0
    });
    this.applyFilterNow();
  },

  // 保存入口
  saveImage() {
    if (!this.canvas || !this.originalImagePath) return;
    this.checkQuotaAndSave();
  },

  // 真实的保存逻辑
  realSaveProcess() {
    wx.showLoading({ title: '高清导出中...' });
    
    // 创建一个离屏 Canvas 用于处理原图
    const offCanvas = wx.createOffscreenCanvas({ type: '2d', width: 100, height: 100 });
    const offCtx = offCanvas.getContext('2d');
    
    const img = offCanvas.createImage();
    img.onload = () => {
        // 限制最大导出分辨率
        const maxExport = 2000;
        let exportW = this.originalImageInfo.width;
        let exportH = this.originalImageInfo.height;
        
        if (exportW > maxExport || exportH > maxExport) {
            const scale = maxExport / Math.max(exportW, exportH);
            exportW = Math.floor(exportW * scale);
            exportH = Math.floor(exportH * scale);
        }

        offCanvas.width = exportW;
        offCanvas.height = exportH;
        
        // 绘制高清原图
        offCtx.drawImage(img, 0, 0, exportW, exportH);
        
        // 获取像素并处理
        const imageData = offCtx.getImageData(0, 0, exportW, exportH);
        this.processPixels(imageData.data, this.data.currentFilter); // 复用优化后的处理逻辑
        offCtx.putImageData(imageData, 0, 0);
        
        // 导出并保存
        wx.canvasToTempFilePath({
            canvas: offCanvas,
            fileType: 'jpg',
            quality: 0.9,
            success: (res) => {
                wx.saveImageToPhotosAlbum({
                    filePath: res.tempFilePath,
                    success: () => {
                        wx.hideLoading();
                        wx.navigateTo({
                            url: `/pages/success/success?path=${encodeURIComponent(res.tempFilePath)}`
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
            fail: () => {
                wx.hideLoading();
                wx.showToast({ title: '导出失败', icon: 'none' });
            }
        });
    };
    img.src = this.originalImagePath;
  },

  generateShareImage() {
    setTimeout(() => {
      wx.canvasToTempFilePath({
        canvas: this.canvas,
        fileType: 'jpg',
        quality: 0.6, 
        success: (res) => {
          this.setData({ generatedPath: res.tempFilePath });
        }
      });
    }, 500);
  },

  generateThumbnails() {
    if (!this.originalImageData) return;
    const thumbSize = 60;
    const thumbCanvas = wx.createOffscreenCanvas({ type: '2d', width: thumbSize, height: thumbSize });
    const thumbCtx = thumbCanvas.getContext('2d');
    const filterList = this.data.filterList;
    const img = this.canvas.createImage();
    
    img.onload = () => {
      thumbCtx.drawImage(img, 0, 0, thumbSize, thumbSize);
      const smallImageData = thumbCtx.getImageData(0, 0, thumbSize, thumbSize);
      
      filterList.forEach((filter, index) => {
        const thumbData = new Uint8ClampedArray(smallImageData.data);
        this.processPixels(thumbData, filter.id); 
        
        const newImageData = thumbCtx.createImageData(thumbSize, thumbSize);
        newImageData.data.set(thumbData);
        thumbCtx.putImageData(newImageData, 0, 0);
        
        const dataUrl = thumbCanvas.toDataURL('image/jpeg', 0.8);
        filterList[index].thumb = dataUrl;
      });
      this.setData({ filterList, thumbsGenerated: true });
    };
    img.src = this.originalImagePath;
  },

  onShareAppMessage() {
    return { title: '胶片质感滤镜', path: '/pages/filter/filter', imageUrl: this.data.generatedPath };
  }
});
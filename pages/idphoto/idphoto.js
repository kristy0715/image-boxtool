// pages/idphoto/idphoto.js

const Security = require('../../utils/security.js');

// === 1. 广告与策略配置 (对齐马赛克模块) ===
const AD_CONFIG = {
  BANNER_ID: 'adunit-ecfcec4c6a0c871b',       // Banner 广告 ID
  VIDEO_ID: 'adunit-da175a2014d3443b'         // 激励视频广告 ID
};

const FREE_COUNT_DAILY = 2; // 每天免费保存 2 次

Page({
  data: {
    mode: 'normal', // normal | auto
    showCamera: false,
    cameraPosition: 'front', 
    imagePath: '',
    processedImage: '',
    selectedSize: '1inch',
    selectedColor: '#ffffff',
    selectedColorName: '白色',
    isProcessing: false,
    
    // 广告数据
    bannerUnitId: AD_CONFIG.BANNER_ID,

    // 滤镜参数
    brightness: 100, 
    contrast: 100,

    sizeList: [
      { id: '1inch', name: '一寸', dimension: '295x413px', width: 295, height: 413 },
      { id: 'small1', name: '小一寸', dimension: '260x378px', width: 260, height: 378 }, 
      { id: 'big1', name: '大一寸', dimension: '390x567px', width: 390, height: 567 }, 
      { id: '2inch', name: '二寸', dimension: '413x579px', width: 413, height: 579 },
      { id: 'small2', name: '小二寸', dimension: '390x567px', width: 390, height: 567 }, 
      { id: 'visa_us', name: '美国签证', dimension: '600x600px', width: 600, height: 600 },
      { id: 'visa_jp', name: '日本签证', dimension: '531x531px', width: 531, height: 531 }  
    ],
    colorList: [
      { name: '白色', value: '#ffffff' },
      { name: '蓝色', value: '#438edb' },
      { name: '红色', value: '#d93a49' },
      { name: '灰色', value: '#cccccc' }
    ],

    previewW: 0, 
    previewH: 0, 
    imgWidth: 0,
    imgHeight: 0,
    imgX: 0,
    imgY: 0,
    lastX: 0,
    lastY: 0,
    initialDistance: 0
  },

  videoAd: null, // 广告实例

  onLoad() {
    this.cameraContext = wx.createCameraContext();
    setTimeout(() => this.updatePreviewSize(), 200);
    this.initVideoAd();
  },

  // === 2. 初始化激励视频广告 (策略核心) ===
  initVideoAd() {
    if (wx.createRewardedVideoAd) {
      this.videoAd = wx.createRewardedVideoAd({ adUnitId: AD_CONFIG.VIDEO_ID });
      this.videoAd.onError((err) => console.error('激励视频加载失败', err));
      
      this.videoAd.onClose((res) => {
        if (res && res.isEnded) {
          // 完整观看：解锁无限次并执行保存
          this.setDailyUnlimited();
          wx.showToast({ title: '已解锁今日无限次', icon: 'success' });
          this.realSaveProcess(); 
        } else {
          // 中途退出
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

  // === 3. 额度检查逻辑 (核心) ===
  checkQuotaAndSave() {
    const today = new Date().toLocaleDateString();
    const storageKey = 'idphoto_usage_record'; // 使用独立的 key
    let record = wx.getStorageSync(storageKey) || { date: today, count: 0, isUnlimited: false };

    // 跨天重置
    if (record.date !== today) {
      record = { date: today, count: 0, isUnlimited: false };
      wx.setStorageSync(storageKey, record);
    }

    // 1. 如果已解锁无限次，直接保存
    if (record.isUnlimited) {
      this.realSaveProcess();
      return;
    }

    // 2. 如果还有免费次数
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

    // 3. 次数用完，弹出广告引导
    this.showAdModal();
  },

  // 设置为今日无限次
  setDailyUnlimited() {
    const today = new Date().toLocaleDateString();
    const storageKey = 'idphoto_usage_record';
    const record = { date: today, count: 999, isUnlimited: true };
    wx.setStorageSync(storageKey, record);
  },

  // 显示解锁弹窗
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
              // 广告加载失败兜底
              this.realSaveProcess();
            });
          }
        }
      });
    } else {
      // 无广告实例兜底
      this.realSaveProcess();
    }
  },

  onAdError(err) {
    console.log('Banner 广告加载失败:', err);
  },

  // === 业务逻辑部分 ===
  switchMode(e) {
    const mode = e.currentTarget.dataset.mode;
    if (mode === 'auto') {
      wx.showToast({ title: 'AI模型训练中...', icon: 'none' });
      return;
    }
    this.setData({ mode });
  },

  openCamera() {
    const that = this;
    wx.getSetting({
      success(res) {
        if (res.authSetting['scope.camera']) {
          that.setData({ showCamera: true, processedImage: '' });
        } else if (res.authSetting['scope.camera'] === false) {
          wx.showModal({
            title: '提示', content: '请授权使用相机',
            success: (res) => { if (res.confirm) wx.openSetting(); }
          });
        } else {
          wx.authorize({
            scope: 'scope.camera',
            success() { that.setData({ showCamera: true, processedImage: '' }); },
            fail() { wx.showToast({ title: '授权失败', icon: 'none' }); }
          });
        }
      }
    });
  },

  closeCamera() { this.setData({ showCamera: false }); },
  switchCamera() {
    this.setData({ cameraPosition: this.data.cameraPosition === 'front' ? 'back' : 'front' });
  },
  onCameraError() {
    wx.showToast({ title: '相机启动失败', icon: 'none' });
    this.setData({ showCamera: false });
  },

  takePhoto() {
    wx.showLoading({ title: '拍摄中...' });
    this.cameraContext.takePhoto({
      quality: 'high',
      success: (res) => {
        wx.hideLoading();
        this.checkAndSetImage(res.tempImagePath);
      },
      fail: () => {
        wx.hideLoading();
        wx.showToast({ title: '拍摄失败', icon: 'none' });
      }
    });
  },

  chooseFromAlbum() {
    wx.chooseMedia({
      count: 1, mediaType: ['image'], sourceType: ['album'],
      success: (res) => {
        this.checkAndSetImage(res.tempFiles[0].tempFilePath);
      }
    });
  },

  checkAndSetImage(path) {
    wx.showLoading({ title: '检测中...' });
    Security.checkImage(path).then(isSafe => {
      wx.hideLoading();
      if (isSafe) {
        this.setData({ showCamera: false, imagePath: path, processedImage: '' }, () => {
          setTimeout(() => this.initImagePosition(path), 100);
        });
      }
    }).catch(() => {
        wx.hideLoading();
        this.setData({ showCamera: false, imagePath: path, processedImage: '' }, () => {
          setTimeout(() => this.initImagePosition(path), 100);
        });
    });
  },

  initImagePosition(imagePath) {
    if (!this.data.previewW) this.updatePreviewSize();
    const containerW = this.data.previewW; 
    const containerH = this.data.previewH;
    const that = this;

    wx.getImageInfo({
      src: imagePath,
      success(imgInfo) {
        let ratio = Math.max(containerW / imgInfo.width, containerH / imgInfo.height);
        ratio = ratio * 1.05; 
        const initWidth = imgInfo.width * ratio;
        const initHeight = imgInfo.height * ratio;
        const initX = (containerW - initWidth) / 2;
        const initY = (containerH - initHeight) / 2;

        that.setData({
          imgWidth: initWidth, imgHeight: initHeight, imgX: initX, imgY: initY,
          processedImage: '', brightness: 100, contrast: 100
        });
      }
    });
  },

  onTouchStart(e) {
    if (e.touches.length === 1) {
      this.setData({ lastX: e.touches[0].clientX, lastY: e.touches[0].clientY });
    } else if (e.touches.length === 2) {
      const x = e.touches[1].clientX - e.touches[0].clientX;
      const y = e.touches[1].clientY - e.touches[0].clientY;
      this.setData({ initialDistance: Math.sqrt(x * x + y * y) });
    }
  },

  onTouchMove(e) {
    if (e.touches.length === 1) {
      const cx = e.touches[0].clientX, cy = e.touches[0].clientY;
      this.setData({
        imgX: this.data.imgX + (cx - this.data.lastX),
        imgY: this.data.imgY + (cy - this.data.lastY),
        lastX: cx, lastY: cy
      });
    } else if (e.touches.length === 2) {
      const x = e.touches[1].clientX - e.touches[0].clientX;
      const y = e.touches[1].clientY - e.touches[0].clientY;
      const dist = Math.sqrt(x * x + y * y);
      const scale = 1 + (dist - this.data.initialDistance) * 0.005;
      
      const nw = this.data.imgWidth * scale;
      const nh = this.data.imgHeight * scale;
      this.setData({
        imgWidth: nw, imgHeight: nh,
        imgX: this.data.imgX - (nw - this.data.imgWidth) / 2,
        imgY: this.data.imgY - (nh - this.data.imgHeight) / 2,
        initialDistance: dist
      });
    }
  },
  onTouchEnd() {},

  selectSize(e) {
    this.setData({ selectedSize: e.currentTarget.dataset.id, processedImage: '' }, () => {
      this.updatePreviewSize();
      if (this.data.imagePath) this.initImagePosition(this.data.imagePath);
    });
  },
  
  selectColor(e) { 
    this.setData({ selectedColor: e.currentTarget.dataset.value, selectedColorName: e.currentTarget.dataset.name, processedImage: '' }); 
  },
  
  onBrightnessChange(e) { this.setData({ brightness: e.detail.value }); },
  onContrastChange(e) { this.setData({ contrast: e.detail.value }); },

  updatePreviewSize() {
    const sizeObj = this.data.sizeList.find(item => item.id === this.data.selectedSize);
    const w = sizeObj ? sizeObj.width : 295;
    const h = sizeObj ? sizeObj.height : 413;
    const ratio = w / h;
    const sys = wx.getSystemInfoSync();
    
    const maxW = sys.windowWidth * 0.6;
    const maxH = sys.windowHeight * 0.45;

    let finalW, finalH;
    if (maxW / ratio <= maxH) {
      finalW = maxW; finalH = maxW / ratio;
    } else {
      finalH = maxH; finalW = maxH * ratio;
    }
    this.setData({ previewW: finalW, previewH: finalH });
  },

  processImage() {
    if (!this.data.imagePath) return wx.showToast({ title: '请先拍摄', icon: 'none' });
    this.setData({ isProcessing: true });
    
    const pixelRatio = 3; 
    const sizeObj = this.data.sizeList.find(item => item.id === this.data.selectedSize);
    const targetW = (sizeObj.width || 295) * pixelRatio;
    const targetH = (sizeObj.height || 413) * pixelRatio;

    const canvas = wx.createOffscreenCanvas({ type: '2d', width: targetW, height: targetH });
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = this.data.selectedColor;
    ctx.fillRect(0, 0, targetW, targetH);

    const img = canvas.createImage();
    img.onload = () => {
      const scaleX = targetW / this.data.previewW;
      const scaleY = targetH / this.data.previewH;
      const drawX = this.data.imgX * scaleX;
      const drawY = this.data.imgY * scaleY;
      const drawWidth = this.data.imgWidth * scaleX;
      const drawHeight = this.data.imgHeight * scaleY;

      ctx.filter = `brightness(${this.data.brightness}%) contrast(${this.data.contrast}%)`;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, drawX, drawY, drawWidth, drawHeight);
      ctx.filter = 'none';

      wx.canvasToTempFilePath({
        canvas: canvas, fileType: 'jpg', quality: 0.95,
        success: (res) => {
          this.setData({ processedImage: res.tempFilePath, isProcessing: false });
          wx.showToast({ title: '生成成功', icon: 'success' });
        },
        fail: (err) => {
          console.error(err);
          this.setData({ isProcessing: false });
          wx.showToast({ title: '生成失败', icon: 'none' });
        }
      });
    };
    img.onerror = () => {
        this.setData({ isProcessing: false });
        wx.showToast({ title: '图片加载失败', icon: 'none' });
    };
    img.src = this.data.imagePath;
  },

  // === 4. 点击保存按钮 -> 触发额度检查 ===
  saveImage() {
    if (!this.data.processedImage) return;
    this.checkQuotaAndSave();
  },

  // === 5. 实际保存逻辑 (获得权限后调用) ===
  realSaveProcess() {
    wx.saveImageToPhotosAlbum({
      filePath: this.data.processedImage,
      success: () => {
        wx.navigateTo({
          url: `/pages/success/success?path=${encodeURIComponent(this.data.processedImage)}`
        });
      },
      fail: (err) => {
        if (!err.errMsg.includes('cancel')) {
          wx.showModal({
            title: '提示', content: '需要授权保存图片',
            success: (res) => { if(res.confirm) wx.openSetting(); }
          });
        }
      }
    });
  },

  onShareAppMessage() {
    return { title: '在线制作证件照', path: '/pages/idphoto/idphoto' };
  }
});
// pages/watermark/watermark.js

const Security = require('../../utils/security.js');

// === 1. 广告与策略配置 ===
const AD_CONFIG = {
  BANNER_ID: 'adunit-ecfcec4c6a0c871b',       // Banner 广告 ID
  VIDEO_ID: 'adunit-da175a2014d3443b'         // 激励视频广告 ID
};

const FREE_COUNT_DAILY = 2; // 每天免费保存 2 次

Page({
  data: {
    imagePath: '',
    resultImage: '',
    isProcessing: false,
    mode: 'manual', 
    brushSize: 35, // 默认笔刷
    canvasDisplayWidth: 300,
    canvasDisplayHeight: 400,
    imageWidth: 0,
    imageHeight: 0,
    isComparing: false,

    // 广告数据
    bannerUnitId: AD_CONFIG.BANNER_ID
  },

  canvas: null,
  ctx: null,
  maskCanvas: null,
  maskCtx: null,
  originalImage: null,
  dpr: 1,
  canvasRect: { left: 0, top: 0 },
  isDrawing: false,
  lastX: 0,
  lastY: 0,
  history: [],
  
  videoAd: null, // 广告实例

  onLoad() {
    this.dpr = wx.getSystemInfoSync().pixelRatio;
    this.initVideoAd(); // 初始化广告
  },

  // === 2. 初始化激励视频广告 ===
  initVideoAd() {
    if (wx.createRewardedVideoAd) {
      this.videoAd = wx.createRewardedVideoAd({ adUnitId: AD_CONFIG.VIDEO_ID });
      this.videoAd.onError((err) => console.error('激励视频加载失败', err));
      
      this.videoAd.onClose((res) => {
        if (res && res.isEnded) {
          // 完整观看：解锁无限次并自动保存
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

  // === 3. 额度检查逻辑 (策略核心) ===
  checkQuotaAndSave() {
    const today = new Date().toLocaleDateString();
    const storageKey = 'watermark_usage_record'; // 独立的 key
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

  setDailyUnlimited() {
    const today = new Date().toLocaleDateString();
    const storageKey = 'watermark_usage_record';
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
              this.realSaveProcess(); // 广告加载失败兜底
            });
          }
        }
      });
    } else {
      this.realSaveProcess(); // 无广告实例兜底
    }
  },

  onAdError(err) {
    console.log('Banner 广告加载失败:', err);
  },

  // === 原有业务逻辑 ===

  switchMode(e) {
    const mode = e.currentTarget.dataset.mode;
    if (mode === 'auto') {
        wx.showToast({ title: 'AI 智能模型训练中...', icon: 'none' });
        return;
    }
    this.setData({ mode });
    if (mode === 'manual' && this.data.imagePath) {
      setTimeout(() => this.drawCanvas(), 50);
    }
  },

  chooseImage() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const tempFilePath = res.tempFiles[0].tempFilePath;
        wx.showLoading({ title: '安全检测中...' });

        Security.checkImage(tempFilePath).then((isSafe) => {
            wx.hideLoading();
            if (isSafe) {
                this.loadImage(tempFilePath);
            }
        }).catch((err) => {
            wx.hideLoading();
            this.loadImage(tempFilePath); // 容错放行
        });
      }
    });
  },

  loadImage(path) {
    wx.showLoading({ title: '准备画布...' });
    wx.getImageInfo({
      src: path,
      success: (info) => {
        const maxProcessSide = 2400; 
        const sysInfo = wx.getSystemInfoSync();
        const padding = 40;
        const maxWidth = sysInfo.windowWidth - padding;
        const maxHeight = sysInfo.windowHeight * 0.55;
        
        let displayWidth, displayHeight;
        const ratio = info.width / info.height;

        if (ratio > maxWidth / maxHeight) {
          displayWidth = maxWidth;
          displayHeight = maxWidth / ratio;
        } else {
          displayHeight = maxHeight;
          displayWidth = maxHeight * ratio;
        }

        this.setData({
          imagePath: path,
          canvasDisplayWidth: displayWidth,
          canvasDisplayHeight: displayHeight,
          imageWidth: info.width,
          imageHeight: info.height,
          resultImage: '',
          history: [] 
        });

        setTimeout(() => {
          this.initCanvas(path, displayWidth, displayHeight);
          wx.hideLoading();
        }, 300);
      },
      fail: () => {
        wx.hideLoading();
        wx.showToast({ title: '图片加载失败', icon: 'none' });
      }
    });
  },

  initCanvas(imagePath, displayWidth, displayHeight) {
    const query = wx.createSelectorQuery();
    query.select('#editCanvas')
      .fields({ node: true, size: true, rect: true })
      .exec((res) => {
        if (!res[0] || !res[0].node) return;

        const canvasNode = res[0].node;
        this.canvasRect = { left: res[0].left, top: res[0].top };
        this.canvas = canvasNode;
        this.ctx = this.canvas.getContext('2d');

        const width = Math.round(displayWidth * this.dpr);
        const height = Math.round(displayHeight * this.dpr);

        this.canvas.width = width;
        this.canvas.height = height;
        this.ctx.scale(this.dpr, this.dpr);

        this.maskCanvas = wx.createOffscreenCanvas({ type: '2d', width, height });
        this.maskCtx = this.maskCanvas.getContext('2d');

        this.originalImage = this.canvas.createImage();
        this.originalImage.onload = () => {
          this.drawCanvas();
        };
        this.originalImage.src = imagePath;
      });
  },

  drawCanvas() {
    if (!this.ctx || !this.originalImage) return;
    const w = this.canvas.width / this.dpr;
    const h = this.canvas.height / this.dpr;

    this.ctx.clearRect(0, 0, w, h);
    this.ctx.drawImage(this.originalImage, 0, 0, w, h);

    if (this.data.mode === 'manual') {
      this.ctx.save();
      this.ctx.globalAlpha = 0.5;
      this.ctx.drawImage(this.maskCanvas, 0, 0, this.maskCanvas.width, this.maskCanvas.height, 0, 0, w, h);
      this.ctx.restore();
    }
  },

  onTouchStart(e) {
    if (this.data.mode !== 'manual' || !this.ctx) return;
    const query = wx.createSelectorQuery();
    query.select('#editCanvas').boundingClientRect((rect) => {
      if (!rect) return;
      this.canvasRect = { left: rect.left, top: rect.top };
      const touch = e.touches[0];
      const x = touch.clientX - rect.left;
      const y = touch.clientY - rect.top;
      this.isDrawing = true;
      this.lastX = x;
      this.lastY = y;
      this.saveHistory(); 
      this.drawMaskLine(x, y, x, y);
    }).exec();
  },

  onTouchMove(e) {
    if (!this.isDrawing || this.data.mode !== 'manual') return;
    const touch = e.touches[0];
    const x = touch.clientX - this.canvasRect.left;
    const y = touch.clientY - this.canvasRect.top;
    this.drawMaskLine(this.lastX, this.lastY, x, y);
    this.lastX = x;
    this.lastY = y;
  },

  onTouchEnd() {
    this.isDrawing = false;
  },

  drawMaskLine(x1, y1, x2, y2) {
    if (!this.maskCtx) return;
    this.maskCtx.beginPath();
    this.maskCtx.lineCap = 'round';
    this.maskCtx.lineJoin = 'round';
    this.maskCtx.lineWidth = this.data.brushSize * this.dpr;
    this.maskCtx.strokeStyle = 'rgba(255, 0, 0, 1)'; 
    this.maskCtx.moveTo(x1 * this.dpr, y1 * this.dpr);
    this.maskCtx.lineTo(x2 * this.dpr, y2 * this.dpr);
    this.maskCtx.stroke();
    this.drawCanvas(); 
  },

  setBrushSize(e) {
    this.setData({ brushSize: parseInt(e.currentTarget.dataset.size) });
  },

  saveHistory() {
    if (!this.maskCtx) return;
    if (this.history.length > 5) this.history.shift();
    const imgData = this.maskCtx.getImageData(0, 0, this.maskCanvas.width, this.maskCanvas.height);
    this.history.push(imgData);
  },

  undoAction() {
    if (this.history.length === 0) return wx.showToast({ title: '已回到初始状态', icon: 'none' });
    const lastData = this.history.pop();
    this.maskCtx.putImageData(lastData, 0, 0);
    this.drawCanvas();
  },

  clearMask() {
    if (!this.maskCtx) return;
    this.saveHistory();
    this.maskCtx.clearRect(0, 0, this.maskCanvas.width, this.maskCanvas.height);
    this.drawCanvas();
  },

  startProcess() {
    if (!this.data.imagePath) return;
    if (this.data.mode === 'manual') this.processManual();
    else this.processAuto();
  },

  processManual() {
    this.setData({ isProcessing: true });
    
    setTimeout(() => {
      try {
        const offCanvas = wx.createOffscreenCanvas({ type: '2d', width: this.data.imageWidth, height: this.data.imageHeight });
        const ctx = offCanvas.getContext('2d');
        const img = offCanvas.createImage();
        
        img.onload = () => {
          ctx.drawImage(img, 0, 0, this.data.imageWidth, this.data.imageHeight);
          const imgData = ctx.getImageData(0, 0, this.data.imageWidth, this.data.imageHeight);
          
          const maskW = this.maskCanvas.width;
          const maskH = this.maskCanvas.height;
          const maskDataRaw = this.maskCtx.getImageData(0, 0, maskW, maskH).data;
          
          const width = this.data.imageWidth;
          const height = this.data.imageHeight;
          const isMask = new Uint8Array(width * height);
          
          const scaleX = maskW / width;
          const scaleY = maskH / height;
          
          let maskPixelCount = 0;
          let minX = width, minY = height, maxX = 0, maxY = 0;

          for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
              const mx = Math.floor(x * scaleX);
              const my = Math.floor(y * scaleY);
              const mi = (my * maskW + mx) * 4;
              
              if (maskDataRaw[mi] > 20) { 
                isMask[y * width + x] = 1;
                maskPixelCount++;
                if (x < minX) minX = x;
                if (x > maxX) maxX = x;
                if (y < minY) minY = y;
                if (y > maxY) maxY = y;
              }
            }
          }

          if (maskPixelCount === 0) {
            this.setData({ isProcessing: false });
            return wx.showToast({ title: '请先涂抹水印', icon: 'none' });
          }

          const padding = 10;
          minX = Math.max(0, minX - padding);
          minY = Math.max(0, minY - padding);
          maxX = Math.min(width - 1, maxX + padding);
          maxY = Math.min(height - 1, maxY + padding);

          this.dilateMask(isMask, width, height, minX, minY, maxX, maxY, 3);
          this.repairImageIDW(imgData.data, isMask, width, height, minX, minY, maxX, maxY);
          
          ctx.putImageData(imgData, 0, 0);
          
          wx.canvasToTempFilePath({
            canvas: offCanvas,
            fileType: 'jpg',
            quality: 0.95,
            success: (res) => {
                this.setData({ resultImage: res.tempFilePath, isProcessing: false });
                wx.pageScrollTo({ selector: '.result-card', duration: 300 });
            },
            fail: (err) => {
                console.error("导出失败", err);
                this.setData({ isProcessing: false });
                wx.showToast({ title: '生成失败', icon: 'none' });
            }
          });
        };
        img.src = this.data.imagePath;
      } catch (err) {
        console.error(err);
        this.setData({ isProcessing: false });
        wx.showToast({ title: '处理出错', icon: 'none' });
      }
    }, 100);
  },

  dilateMask(isMask, width, height, minX, minY, maxX, maxY, radius) {
    const tempMask = new Uint8Array(isMask.length);
    tempMask.set(isMask);

    for (let r = 0; r < radius; r++) {
      for (let y = minY; y <= maxY; y++) {
        for (let x = minX; x <= maxX; x++) {
          const i = y * width + x;
          if (isMask[i] === 0) { 
             if (
               (x > 0 && isMask[i-1]) || 
               (x < width-1 && isMask[i+1]) || 
               (y > 0 && isMask[i-width]) || 
               (y < height-1 && isMask[i+width])
             ) {
               tempMask[i] = 1;
             }
          }
        }
      }
      isMask.set(tempMask);
    }
  },

  repairImageIDW(pixels, isMask, width, height, minX, minY, maxX, maxY) {
    let remaining = 0;
    for (let y = minY; y <= maxY; y++) {
        for (let x = minX; x <= maxX; x++) {
            if (isMask[y * width + x]) remaining++;
        }
    }

    const maxLoops = 1000; 
    let loop = 0;
    
    const neighborsOffsets = [
        [-1, 0], [1, 0], [0, -1], [0, 1],
        [-1, -1], [1, -1], [-1, 1], [1, 1] 
    ];
    const weights = [1.0, 1.0, 1.0, 1.0, 0.7, 0.7, 0.7, 0.7];

    while (remaining > 0 && loop < maxLoops) {
        let repairedIndices = [];
        let repairedColors = [];

        for (let y = minY; y <= maxY; y++) {
            for (let x = minX; x <= maxX; x++) {
                const i = y * width + x;
                if (isMask[i]) {
                    let rSum = 0, gSum = 0, bSum = 0;
                    let totalWeight = 0;
                    
                    for (let k = 0; k < 8; k++) {
                        const nx = x + neighborsOffsets[k][0];
                        const ny = y + neighborsOffsets[k][1];
                        if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
                            const ni = ny * width + nx;
                            if (!isMask[ni]) { 
                                const p = ni * 4;
                                const w = weights[k];
                                rSum += pixels[p] * w;
                                gSum += pixels[p+1] * w;
                                bSum += pixels[p+2] * w;
                                totalWeight += w;
                            }
                        }
                    }

                    if (totalWeight > 0) {
                        repairedIndices.push(i);
                        repairedColors.push({
                            r: rSum / totalWeight,
                            g: gSum / totalWeight,
                            b: bSum / totalWeight
                        });
                    }
                }
            }
        }

        if (repairedIndices.length === 0) break; 

        for (let k = 0; k < repairedIndices.length; k++) {
            const idx = repairedIndices[k];
            const color = repairedColors[k];
            const p = idx * 4;
            pixels[p] = color.r;
            pixels[p+1] = color.g;
            pixels[p+2] = color.b;
            isMask[idx] = 0; 
            remaining--;
        }
        loop++;
    }
  },

  processAuto() {
    wx.showToast({ title: 'AI 自动检测功能即将上线', icon: 'none' });
    this.setData({ mode: 'manual' });
  },

  // === 4. 点击保存按钮 -> 触发额度检查 ===
  saveImage() {
    if (!this.data.resultImage) return;
    this.checkQuotaAndSave();
  },

  // === 5. 实际保存逻辑 (获得权限后调用) ===
  realSaveProcess() {
    wx.saveImageToPhotosAlbum({
      filePath: this.data.resultImage,
      success: () => {
        wx.navigateTo({ url: `/pages/success/success?path=${encodeURIComponent(this.data.resultImage)}` });
      },
      fail: (err) => {
        if (err.errMsg.includes('auth')) {
             wx.showModal({ title: '提示', content: '需要保存相册权限', success: (res) => { if (res.confirm) wx.openSetting(); } });
        } else {
            wx.showToast({ title: '保存失败', icon: 'none' });
        }
      }
    });
  },

  startCompare() { this.setData({ isComparing: true }); },
  endCompare() { this.setData({ isComparing: false }); },

  onShareAppMessage() {
    return { title: '照片去水印神器', path: '/pages/watermark/watermark' };
  }
});
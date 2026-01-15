// pages/mosaic/mosaic.js

const Security = require('../../utils/security.js');

// === 1. 广告配置 ===
const AD_CONFIG = {
  BANNER_ID: 'adunit-ecfcec4c6a0c871b',       // Banner 广告 ID
  VIDEO_ID: 'adunit-da175a2014d3443b'         // 激励视频广告 ID
};

// === 2. 策略配置 ===
const FREE_COUNT_DAILY = 2; // 每天免费保存 2 次
const MAX_HISTORY = 10;     // 最大撤销步数
const MAX_CANVAS_SIZE = 800; // Canvas最大尺寸限制

Page({
  data: {
    imagePath: '',
    canvasWidth: 300,
    canvasHeight: 300,
    mosaicSize: 15,
    brushSize: 30,
    currentTool: 'mosaic', // mosaic, blur, eraser
    canUndo: false,
    canRedo: false,
    
    // 广告数据
    bannerUnitId: AD_CONFIG.BANNER_ID,
    
    // 状态控制
    isProcessing: false,
    processingText: '加载中...',
    progress: 0,
    showProgress: false,

    sizeList: [
      { size: 10, name: '精细' },
      { size: 20, name: '标准' },
      { size: 40, name: '粗大' } 
    ]
  },

  videoAd: null, // 广告实例

  onLoad() {
    this.historyStack = [];
    this.redoStack = [];
    this.initVideoAd();
  },

  // === 3. 初始化激励视频 ===
  initVideoAd() {
    if (wx.createRewardedVideoAd) {
      this.videoAd = wx.createRewardedVideoAd({ adUnitId: AD_CONFIG.VIDEO_ID });
      this.videoAd.onLoad(() => console.log('激励视频加载成功'));
      this.videoAd.onError((err) => console.error('激励视频加载失败', err));
      
      this.videoAd.onClose((res) => {
        if (res && res.isEnded) {
          this.setDailyUnlimited();
          wx.showToast({ title: '已解锁今日无限次', icon: 'success' });
          this.realSaveProcess(); 
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

  // === 4. 额度检查逻辑 ===
  checkQuotaAndSave() {
    const today = new Date().toLocaleDateString();
    const storageKey = 'mosaic_usage_record'; 
    let record = wx.getStorageSync(storageKey) || { date: today, count: 0, isUnlimited: false };

    if (record.date !== today) {
      record = { date: today, count: 0, isUnlimited: false };
      wx.setStorageSync(storageKey, record);
    }

    if (record.isUnlimited) {
      this.realSaveProcess();
      return;
    }

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

    this.showAdModal();
  },

  setDailyUnlimited() {
    const today = new Date().toLocaleDateString();
    const storageKey = 'mosaic_usage_record';
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

  noop() {},

  initCanvas(callback) {
    const query = wx.createSelectorQuery();
    query.select('#mosaicCanvas')
      .fields({ node: true, size: true, rect: true })
      .exec((res) => {
        if (res[0]) {
          this.canvas = res[0].node;
          this.ctx = this.canvas.getContext('2d');
          this.canvasRect = res[0];
          if (callback) callback();
        } else {
          setTimeout(() => this.initCanvas(callback), 50);
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
            this.setData({ 
              imagePath: tempFilePath,
              canUndo: false,
              canRedo: false,
              isProcessing: true,
              processingText: '准备画布...',
              showProgress: false
            });
            
            this.historyStack = [];
            this.redoStack = [];
            
            setTimeout(() => this.loadImage(tempFilePath), 100);
          } else {
            wx.showToast({ title: '图片未通过安全检测', icon: 'none' });
          }
        }).catch(err => {
            wx.hideLoading();
            console.error('检测流程异常', err);
            wx.showToast({ title: '检测失败，请重试', icon: 'none' });
        });
      }
    });
  },

  loadImage(path) {
    wx.getImageInfo({
      src: path,
      success: (info) => {
        const sys = wx.getSystemInfoSync();
        const screenWidth = sys.windowWidth - 60;
        
        let w = info.width;
        let h = info.height;
        const ratio = w / h;

        if (w > MAX_CANVAS_SIZE || h > MAX_CANVAS_SIZE) {
            if (ratio > 1) { w = MAX_CANVAS_SIZE; h = MAX_CANVAS_SIZE / ratio; }
            else { h = MAX_CANVAS_SIZE; w = MAX_CANVAS_SIZE * ratio; }
        }
        
        let displayW = screenWidth;
        let displayH = screenWidth / ratio;
        
        this.pixelWidth = Math.floor(w);
        this.pixelHeight = Math.floor(h);

        this.setData({
          canvasWidth: Math.floor(displayW),
          canvasHeight: Math.floor(displayH),
          isProcessing: true,
          processingText: '初始化...'
        }, () => {
            this.initCanvas(() => {
                this.originalImagePath = path;
                this.drawImage();
            });
        });
      },
      fail: () => {
          this.setData({ isProcessing: false });
          wx.showToast({ title: '图片加载失败', icon: 'none' });
      }
    });
  },

  drawImage() {
    if (!this.canvas) return;

    this.canvas.width = this.pixelWidth;
    this.canvas.height = this.pixelHeight;
    
    const img = this.canvas.createImage();
    img.onload = () => {
      this.ctx.drawImage(img, 0, 0, this.pixelWidth, this.pixelHeight);
      
      this.originalImageData = this.ctx.getImageData(0, 0, this.pixelWidth, this.pixelHeight);
      this.imageData = this.ctx.getImageData(0, 0, this.pixelWidth, this.pixelHeight);
      
      this.saveHistory(); 
      this.updateCanvasRect(); 
      this.setData({ isProcessing: false });
    };
    img.src = this.originalImagePath;
  },

  updateCanvasRect() {
    wx.createSelectorQuery()
      .select('#mosaicCanvas')
      .boundingClientRect((rect) => {
        if (rect) {
            this.canvasRect = rect;
            this.scaleX = this.pixelWidth / rect.width;
            this.scaleY = this.pixelHeight / rect.height;
        }
      }).exec();
  },

  saveHistory() {
    if (!this.canvas) return;
    const snapshot = this.ctx.getImageData(0, 0, this.pixelWidth, this.pixelHeight);
    
    this.historyStack.push(snapshot);
    if (this.historyStack.length > MAX_HISTORY) this.historyStack.shift();
    this.redoStack = []; 
    this.updateUndoRedoState();
  },

  undo() {
    if (this.historyStack.length <= 1) return;
    const current = this.historyStack.pop();
    this.redoStack.push(current);
    
    const prev = this.historyStack[this.historyStack.length - 1];
    this.ctx.putImageData(prev, 0, 0);
    this.imageData = this.ctx.getImageData(0, 0, this.pixelWidth, this.pixelHeight); 
    this.updateUndoRedoState();
  },

  redo() {
    if (this.redoStack.length === 0) return;
    const next = this.redoStack.pop();
    this.historyStack.push(next);
    
    this.ctx.putImageData(next, 0, 0);
    this.imageData = this.ctx.getImageData(0, 0, this.pixelWidth, this.pixelHeight);
    this.updateUndoRedoState();
  },

  updateUndoRedoState() {
    this.setData({
      canUndo: this.historyStack.length > 1,
      canRedo: this.redoStack.length > 0
    });
  },

  resetImage() {
    if (this.historyStack.length > 0) {
      const initial = this.historyStack[0];
      this.ctx.putImageData(initial, 0, 0);
      this.imageData = this.ctx.getImageData(0, 0, this.pixelWidth, this.pixelHeight);
      this.historyStack = [initial];
      this.redoStack = [];
      this.updateUndoRedoState();
    }
  },

  onTouchStart(e) {
    this.isDrawing = true;
    this.hasDrawAction = false;
    this.handleTouch(e.touches[0]);
  },

  onTouchMove(e) {
    if (!this.isDrawing) return;
    this.handleTouch(e.touches[0]);
    this.hasDrawAction = true;
  },

  onTouchEnd() {
    this.isDrawing = false;
    if (this.hasDrawAction) {
      this.saveHistory();
    }
  },

  handleTouch(touch) {
    if (!this.imageData || !this.canvasRect) return;

    let x, y;
    if (touch.x !== undefined && touch.y !== undefined) {
      x = touch.x * this.scaleX;
      y = touch.y * this.scaleY;
    } else {
      x = (touch.clientX - this.canvasRect.left) * this.scaleX;
      y = (touch.clientY - this.canvasRect.top) * this.scaleY;
    }

    if (x < 0 || x >= this.pixelWidth || y < 0 || y >= this.pixelHeight) return;

    const tool = this.data.currentTool;
    const scaledBrush = this.data.brushSize * this.scaleX;
    const scaledMosaic = this.data.mosaicSize * this.scaleX;

    if (tool === 'mosaic') this.applyMosaic(x, y, scaledBrush, scaledMosaic);
    else if (tool === 'blur') this.applyBlur(x, y, scaledBrush);
    else if (tool === 'eraser') this.applyEraser(x, y, scaledBrush);
  },

  // === 涂抹算法（回归全量更新以修复错位）===
  
  applyMosaic(x, y, brushSize, mosaicSize) {
     const { width, height } = this.canvas;
     const data = this.imageData.data;
     
     const startX = Math.max(0, Math.floor((x - brushSize/2) / mosaicSize) * mosaicSize);
     const startY = Math.max(0, Math.floor((y - brushSize/2) / mosaicSize) * mosaicSize);
     const endX = Math.min(width, Math.ceil((x + brushSize/2) / mosaicSize) * mosaicSize + mosaicSize); 
     const endY = Math.min(height, Math.ceil((y + brushSize/2) / mosaicSize) * mosaicSize + mosaicSize);
     
     let hasChange = false;

     for (let blockY = startY; blockY < endY; blockY += mosaicSize) {
       for (let blockX = startX; blockX < endX; blockX += mosaicSize) {
         const centerX = blockX + mosaicSize/2;
         const centerY = blockY + mosaicSize/2;
         if (Math.hypot(centerX - x, centerY - y) > brushSize/2) continue;
         
         let r=0, g=0, b=0, count=0;
         const bMaxY = Math.min(blockY + mosaicSize, height);
         const bMaxX = Math.min(blockX + mosaicSize, width);

         // 采样优化
         for (let py = Math.floor(blockY); py < bMaxY; py+=2) {
           for (let px = Math.floor(blockX); px < bMaxX; px+=2) {
             const idx = (py * width + px) * 4;
             r += data[idx]; g += data[idx+1]; b += data[idx+2];
             count++;
           }
         }
         
         if (count === 0) continue;
         r = Math.floor(r/count); g = Math.floor(g/count); b = Math.floor(b/count);
         
         for (let py = Math.floor(blockY); py < bMaxY; py++) {
           for (let px = Math.floor(blockX); px < bMaxX; px++) {
             const idx = (py * width + px) * 4;
             data[idx] = r; data[idx+1] = g; data[idx+2] = b;
           }
         }
         hasChange = true;
       }
     }
     
     if (hasChange) {
        // 修复：改回全量更新，防止局部更新导致的错位或不刷新
        this.ctx.putImageData(this.imageData, 0, 0);
     }
  },

  applyBlur(x, y, brushSize) {
    const width = this.canvas.width;
    const height = this.canvas.height;
    const data = this.imageData.data;
    const blurRad = 4;

    const startX = Math.max(blurRad, Math.floor(x - brushSize/2));
    const startY = Math.max(blurRad, Math.floor(y - brushSize/2));
    const endX = Math.min(width - blurRad, Math.ceil(x + brushSize/2));
    const endY = Math.min(height - blurRad, Math.ceil(y + brushSize/2));
    
    let hasChange = false;

    for (let py = startY; py < endY; py += 2) {
      for (let px = startX; px < endX; px += 2) {
        if (Math.hypot(px - x, py - y) > brushSize/2) continue;

        let r=0, g=0, b=0, count=0;
        for (let dy = -blurRad; dy <= blurRad; dy+=2) {
          for (let dx = -blurRad; dx <= blurRad; dx+=2) {
            const idx = ((py + dy) * width + (px + dx)) * 4;
            r += data[idx]; g += data[idx+1]; b += data[idx+2];
            count++;
          }
        }
        if (count > 0) {
          const idx = (py * width + px) * 4;
          data[idx] = r/count; data[idx+1] = g/count; data[idx+2] = b/count;
          data[idx+4] = r/count; data[idx+5] = g/count; data[idx+6] = b/count; 
          hasChange = true;
        }
      }
    }
    
    if (hasChange) {
        this.ctx.putImageData(this.imageData, 0, 0);
    }
  },

  applyEraser(x, y, brushSize) {
     const width = this.canvas.width;
     const height = this.canvas.height;
     const data = this.imageData.data;
     const origin = this.originalImageData.data;
 
     const startX = Math.max(0, Math.floor(x - brushSize/2));
     const startY = Math.max(0, Math.floor(y - brushSize/2));
     const endX = Math.min(width, Math.ceil(x + brushSize/2));
     const endY = Math.min(height, Math.ceil(y + brushSize/2));
     
     let hasChange = false;
 
     for (let py = startY; py < endY; py++) {
       for (let px = startX; px < endX; px++) {
         if (Math.hypot(px - x, py - y) > brushSize/2) continue;
         const idx = (py * width + px) * 4;
         if (data[idx] !== origin[idx] || data[idx+1] !== origin[idx+1]) {
             data[idx] = origin[idx]; 
             data[idx+1] = origin[idx+1];
             data[idx+2] = origin[idx+2];
             hasChange = true;
         }
       }
     }
     
     if (hasChange) {
        this.ctx.putImageData(this.imageData, 0, 0);
     }
  },

  selectTool(e) { this.setData({ currentTool: e.currentTarget.dataset.tool }); },
  selectSize(e) { this.setData({ mosaicSize: e.currentTarget.dataset.size }); },
  onBrushSizeChange(e) { this.setData({ brushSize: e.detail.value }); },

  saveImage() {
    if (!this.canvas) return;
    this.checkQuotaAndSave();
  },

  realSaveProcess() {
    this.setData({ isProcessing: true, processingText: '生成中...', showProgress: true, progress: 0 });
    
    let p = 0;
    const timer = setInterval(() => {
        p += 5;
        if(p > 90) clearInterval(timer);
        this.setData({ progress: p });
    }, 50);

    wx.canvasToTempFilePath({
      canvas: this.canvas,
      fileType: 'jpg',
      quality: 0.9,
      success: (res) => {
        clearInterval(timer);
        this.setData({ progress: 100 });
        
        wx.saveImageToPhotosAlbum({
          filePath: res.tempFilePath,
          success: () => {
              this.setData({ isProcessing: false });
              wx.navigateTo({
                url: `/pages/success/success?path=${encodeURIComponent(res.tempFilePath)}`
              });
          },
          fail: (err) => {
              this.setData({ isProcessing: false });
              if (err.errMsg.indexOf('cancel') === -1) {
                wx.showToast({ title: '保存失败', icon: 'none' });
              }
          }
        });
      },
      fail: (err) => {
          console.error(err);
          clearInterval(timer);
          this.setData({ isProcessing: false });
          wx.showToast({ title: '导出失败', icon: 'none' });
      }
    });
  },

  onShareAppMessage() {
    return {
      title: '图片隐私打码工具',
      path: '/pages/mosaic/mosaic'
    };
  }
});
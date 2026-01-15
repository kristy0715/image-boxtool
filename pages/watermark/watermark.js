// pages/watermark/watermark.js

const Security = require('../../utils/security.js');

// === 1. 最小堆 (MinHeap) ===
class MinHeap {
  constructor() { this.heap = []; }
  push(node) { this.heap.push(node); this.bubbleUp(this.heap.length - 1); }
  pop() {
    if (this.heap.length === 0) return null;
    const top = this.heap[0];
    const bottom = this.heap.pop();
    if (this.heap.length > 0) { this.heap[0] = bottom; this.sinkDown(0); }
    return top;
  }
  bubbleUp(index) {
    while (index > 0) {
      const parentIndex = Math.floor((index - 1) / 2);
      if (this.heap[index].dist >= this.heap[parentIndex].dist) break;
      [this.heap[index], this.heap[parentIndex]] = [this.heap[parentIndex], this.heap[index]];
      index = parentIndex;
    }
  }
  sinkDown(index) {
    const length = this.heap.length;
    while (true) {
      let left = 2 * index + 1; let right = 2 * index + 2; let swap = null;
      if (left < length && this.heap[left].dist < this.heap[index].dist) swap = left;
      if (right < length && this.heap[right].dist < (swap === null ? this.heap[index].dist : this.heap[left].dist)) swap = right;
      if (swap === null) break;
      [this.heap[index], this.heap[swap]] = [this.heap[swap], this.heap[index]];
      index = swap;
    }
  }
  size() { return this.heap.length; }
}

// === 2. 配置项 ===
const AD_CONFIG = {
  BANNER_ID: 'adunit-ecfcec4c6a0c871b',
  VIDEO_ID: 'adunit-da175a2014d3443b'
};
const FREE_COUNT_DAILY = 2;

Page({
  data: {
    imagePath: '',
    resultImage: '',
    isProcessing: false,
    mode: 'manual', 
    brushSize: 35,
    canvasDisplayWidth: 300,
    canvasDisplayHeight: 400,
    imageWidth: 0,
    imageHeight: 0,
    isComparing: false,
    bannerUnitId: AD_CONFIG.BANNER_ID,
    
    // 移动/缩放相关状态
    isMoveMode: false,
    moveX: 0,
    moveY: 0,
    moveScale: 1
  },

  canvas: null, ctx: null,
  maskCanvas: null, maskCtx: null,
  originalImage: null,
  dpr: 1,
  canvasRect: { left: 0, top: 0 },
  isDrawing: false, lastX: 0, lastY: 0,
  history: [],
  videoAd: null,

  onLoad() {
    this.dpr = wx.getSystemInfoSync().pixelRatio;
    this.initVideoAd();
  },

  initVideoAd() {
    if (wx.createRewardedVideoAd) {
      this.videoAd = wx.createRewardedVideoAd({ adUnitId: AD_CONFIG.VIDEO_ID });
      this.videoAd.onError((err) => console.error('广告加载失败', err));
      this.videoAd.onClose((res) => {
        if (res && res.isEnded) {
          this.setDailyUnlimited();
          wx.showToast({ title: '已解锁无限次', icon: 'success' });
          this.realSaveProcess(); 
        } else {
          wx.showModal({ title: '提示', content: '完整观看才能解锁哦', confirmText: '继续观看', success: (m) => { if (m.confirm) this.videoAd.show(); } });
        }
      });
    }
  },

  checkQuotaAndSave() {
    const today = new Date().toLocaleDateString();
    const key = 'watermark_usage_record';
    let record = wx.getStorageSync(key) || { date: today, count: 0, isUnlimited: false };

    if (record.date !== today) { record = { date: today, count: 0, isUnlimited: false }; wx.setStorageSync(key, record); }
    if (record.isUnlimited) { this.realSaveProcess(); return; }

    if (record.count < FREE_COUNT_DAILY) {
      record.count++;
      wx.setStorageSync(key, record);
      const left = FREE_COUNT_DAILY - record.count;
      if (left > 0) wx.showToast({ title: `今日剩${left}次`, icon: 'none' });
      this.realSaveProcess();
    } else {
      this.showAdModal();
    }
  },

  setDailyUnlimited() {
    wx.setStorageSync('watermark_usage_record', { date: new Date().toLocaleDateString(), count: 999, isUnlimited: true });
  },

  showAdModal() {
    if (this.videoAd) {
      wx.showModal({
        title: '次数耗尽', content: '观看视频解锁今日无限次保存', confirmText: '去解锁',
        success: (res) => { if (res.confirm) this.videoAd.show().catch(() => this.realSaveProcess()); }
      });
    } else { this.realSaveProcess(); }
  },

  chooseImage() {
    wx.chooseMedia({
      count: 1, mediaType: ['image'], sourceType: ['album', 'camera'],
      success: (res) => {
        const path = res.tempFiles[0].tempFilePath;
        wx.showLoading({ title: '检测中...' });
        Security.checkImage(path).then((isSafe) => {
            wx.hideLoading();
            if (isSafe) this.loadImage(path);
        }).catch(() => { wx.hideLoading(); this.loadImage(path); });
      }
    });
  },

  loadImage(path) {
    wx.showLoading({ title: '加载中...' });
    wx.getImageInfo({
      src: path,
      success: (info) => {
        const sys = wx.getSystemInfoSync();
        const p = 40, mW = sys.windowWidth - p, mH = sys.windowHeight * 0.55;
        let dW, dH;
        const r = info.width / info.height;
        if (r > mW / mH) { dW = mW; dH = mW / r; } else { dH = mH; dW = mH * r; }

        // 1. 先重置位置数据
        this.setData({
          imagePath: path, 
          canvasDisplayWidth: dW, 
          canvasDisplayHeight: dH,
          imageWidth: info.width, 
          imageHeight: info.height, 
          resultImage: '', 
          history: [],
          isMoveMode: false,
          moveX: 0, moveY: 0, moveScale: 1 // 重置位置
        });

        // 2. 延迟初始化 Canvas，确保视图更新完毕
        setTimeout(() => { this.initCanvas(path); wx.hideLoading(); }, 300);
      },
      fail: () => { wx.hideLoading(); wx.showToast({ title: '图片加载失败', icon: 'none' }); }
    });
  },

  initCanvas(path) {
    const q = wx.createSelectorQuery();
    q.select('#editCanvas').fields({ node: true, size: true, rect: true }).exec((res) => {
        if (!res[0] || !res[0].node) return;
        const node = res[0].node;
        this.canvasRect = { left: res[0].left, top: res[0].top };
        this.canvas = node;
        this.ctx = node.getContext('2d');
        const w = Math.round(this.data.canvasDisplayWidth * this.dpr);
        const h = Math.round(this.data.canvasDisplayHeight * this.dpr);
        this.canvas.width = w; this.canvas.height = h;
        this.ctx.scale(this.dpr, this.dpr);

        this.maskCanvas = wx.createOffscreenCanvas({ type: '2d', width: w, height: h });
        this.maskCtx = this.maskCanvas.getContext('2d');

        this.originalImage = node.createImage();
        this.originalImage.onload = () => { this.drawCanvas(); };
        this.originalImage.src = path;
    });
  },

  drawCanvas() {
    if (!this.ctx || !this.originalImage) return;
    const w = this.canvas.width / this.dpr, h = this.canvas.height / this.dpr;
    this.ctx.clearRect(0, 0, w, h);
    this.ctx.drawImage(this.originalImage, 0, 0, w, h);
    if (this.data.mode === 'manual') {
      this.ctx.save(); this.ctx.globalAlpha = 0.5;
      this.ctx.drawImage(this.maskCanvas, 0, 0, this.maskCanvas.width, this.maskCanvas.height, 0, 0, w, h);
      this.ctx.restore();
    }
  },

  // === 移动/涂抹模式切换 ===
  toggleMoveMode() {
    const nextMode = !this.data.isMoveMode;
    this.setData({ isMoveMode: nextMode });
    wx.showToast({ 
      title: nextMode ? '双指缩放/拖动' : '单指涂抹', 
      icon: 'none' 
    });
  },
  
  // 【关键修复】只记录缩放比例，不setData位置，防止抖动！
  onScaleChange(e) {
    this.data.moveScale = e.detail.scale; // 直接修改数据对象，不setData，减少渲染开销
  },
  
  onTouchStart(e) {
    if (this.data.isMoveMode || this.data.mode !== 'manual' || !this.ctx) return;
    
    this.isDrawing = true;
    
    // 【关键修复】坐标除以缩放比例
    const scale = this.data.moveScale || 1;
    this.lastX = e.touches[0].x / scale;
    this.lastY = e.touches[0].y / scale;
    
    this.saveHistory();
    this.drawMaskLine(this.lastX, this.lastY, this.lastX, this.lastY);
  },
  
  onTouchMove(e) {
    if (this.data.isMoveMode || !this.isDrawing || this.data.mode !== 'manual') return;
    
    // 【关键修复】坐标除以缩放比例
    const scale = this.data.moveScale || 1;
    const x = e.touches[0].x / scale;
    const y = e.touches[0].y / scale;
    
    this.drawMaskLine(this.lastX, this.lastY, x, y);
    this.lastX = x; this.lastY = y;
  },

  onTouchEnd() { this.isDrawing = false; },

  drawMaskLine(x1, y1, x2, y2) {
    if (!this.maskCtx) return;
    this.maskCtx.beginPath();
    this.maskCtx.lineCap = 'round'; this.maskCtx.lineJoin = 'round';
    // 笔刷随图片放大而放大
    this.maskCtx.lineWidth = this.data.brushSize * this.dpr;
    this.maskCtx.strokeStyle = 'rgba(255, 0, 0, 1)';
    this.maskCtx.moveTo(x1 * this.dpr, y1 * this.dpr);
    this.maskCtx.lineTo(x2 * this.dpr, y2 * this.dpr);
    this.maskCtx.stroke();
    this.drawCanvas();
  },

  switchMode(e) {
    const targetMode = e.currentTarget.dataset.mode;
    if (targetMode === 'auto') {
      wx.showToast({ title: '功能维护中，请使用手动涂抹', icon: 'none' });
      return;
    }
    this.setData({ mode: targetMode });
    if (this.data.mode === 'manual') setTimeout(() => this.drawCanvas(), 50);
  },
  
  setBrushSize(e) { this.setData({ brushSize: parseInt(e.currentTarget.dataset.size) }); },
  
  saveHistory() {
    if (!this.maskCtx) return;
    if (this.history.length > 5) this.history.shift();
    this.history.push(this.maskCtx.getImageData(0, 0, this.maskCanvas.width, this.maskCanvas.height));
  },
  undoAction() {
    if (!this.history.length) return wx.showToast({ title: '已是最初状态', icon: 'none' });
    this.maskCtx.putImageData(this.history.pop(), 0, 0);
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
    if (this.data.mode === 'manual') {
      this.processTelea();
    } else {
      wx.showToast({ title: '请切换回手动模式', icon: 'none' });
      this.setData({ mode: 'manual' });
    }
  },

  processTelea() {
    this.setData({ isProcessing: true });
    wx.showLoading({ title: '智能消除中...' });

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
          const distMap = new Float32Array(width * height);
          const flagMap = new Uint8Array(width * height);
          
          const scaleX = maskW / width;
          const scaleY = maskH / height;
          let maskCount = 0;
          const INF = 1e6;
          for (let i = 0; i < width * height; i++) { distMap[i] = INF; flagMap[i] = 0; }

          for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
              const mx = Math.floor(x * scaleX);
              const my = Math.floor(y * scaleY);
              const mi = (my * maskW + mx) * 4;
              const idx = y * width + x;
              if (maskDataRaw[mi] > 20) { isMask[idx] = 1; flagMap[idx] = 2; maskCount++; } 
              else { distMap[idx] = 0; flagMap[idx] = 0; }
            }
          }

          if (maskCount === 0) {
            this.setData({ isProcessing: false }); wx.hideLoading();
            return wx.showToast({ title: '请先涂抹', icon: 'none' });
          }

          const heap = new MinHeap();
          const neighbors = [[-1, 0], [1, 0], [0, -1], [0, 1]];
          for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
              const idx = y * width + x;
              if (flagMap[idx] === 2) { 
                let isBoundary = false;
                for (let n of neighbors) {
                   const nx = x + n[0], ny = y + n[1];
                   if (nx>=0 && nx<width && ny>=0 && ny<height) {
                     if (flagMap[ny*width + nx] === 0) isBoundary = true;
                   }
                }
                if (isBoundary) { flagMap[idx] = 1; distMap[idx] = 0; heap.push({ x, y, dist: 0 }); }
              }
            }
          }

          const pixels = imgData.data;
          while (heap.size() > 0) {
            const p = heap.pop();
            const x = p.x, y = p.y;
            const idx = y * width + x;
            if (flagMap[idx] === 0) continue; 
            
            this.inpaintPointTelea(x, y, width, height, pixels, distMap, flagMap);
            flagMap[idx] = 0;

            for (let n of neighbors) {
              const nx = x + n[0], ny = y + n[1];
              if (nx>=0 && nx<width && ny>=0 && ny<height) {
                const nIdx = ny * width + nx;
                if (flagMap[nIdx] !== 0) {
                  const dist = Math.min(
                     this.getDist(nx-1, ny, width, height, distMap),
                     this.getDist(nx+1, ny, width, height, distMap),
                     this.getDist(nx, ny-1, width, height, distMap),
                     this.getDist(nx, ny+1, width, height, distMap)
                  ) + 1.0;
                  if (dist < distMap[nIdx]) { distMap[nIdx] = dist; flagMap[nIdx] = 1; heap.push({ x: nx, y: ny, dist: dist }); }
                }
              }
            }
          }

          ctx.putImageData(imgData, 0, 0);
          wx.canvasToTempFilePath({
            canvas: offCanvas, fileType: 'jpg', quality: 0.95,
            success: (res) => {
                this.setData({ resultImage: res.tempFilePath, isProcessing: false });
                wx.hideLoading();
                wx.pageScrollTo({ selector: '.result-card', duration: 300 });
                wx.showToast({ title: '消除完成', icon: 'success' });
            },
            fail: () => { this.setData({ isProcessing: false }); wx.hideLoading(); }
          });
        };
        img.src = this.data.imagePath;

      } catch (err) {
        console.error(err);
        this.setData({ isProcessing: false });
        wx.hideLoading();
        wx.showToast({ title: '处理异常', icon: 'none' });
      }
    }, 100);
  },

  getDist(x, y, w, h, distMap) {
    if (x < 0 || x >= w || y < 0 || y >= h) return 1e6;
    return distMap[y * w + x];
  },

  inpaintPointTelea(x, y, w, h, pixels, distMap, flagMap) {
    let wSum = 0, rSum = 0, gSum = 0, bSum = 0;
    const radius = 2; 
    const gradX = this.getDist(x+1, y, w, h, distMap) - this.getDist(x-1, y, w, h, distMap);
    const gradY = this.getDist(x, y+1, w, h, distMap) - this.getDist(x, y-1, w, h, distMap);
    const gradLen = Math.sqrt(gradX*gradX + gradY*gradY) + 0.001;

    for (let j = -radius; j <= radius; j++) {
      for (let i = -radius; i <= radius; i++) {
        if (i===0 && j===0) continue;
        const nx = x + i, ny = y + j;
        if (nx>=0 && nx<w && ny>=0 && ny<h) {
          const nIdx = ny * w + nx;
          if (flagMap[nIdx] === 0) { 
            const rx = x - nx; const ry = y - ny;
            const r2 = rx*rx + ry*ry; const rLen = Math.sqrt(r2);
            let weight = 1.0 / (r2 * rLen + 0.001);
            const dot = Math.abs(gradX * rx + gradY * ry);
            const dirWeight = dot / (gradLen * rLen);
            weight *= (dirWeight + 0.01);
            const pIdx = nIdx * 4;
            rSum += pixels[pIdx] * weight;
            gSum += pixels[pIdx+1] * weight;
            bSum += pixels[pIdx+2] * weight;
            wSum += weight;
          }
        }
      }
    }
    if (wSum > 0) {
      const idx = (y * w + x) * 4;
      pixels[idx] = rSum / wSum;
      pixels[idx+1] = gSum / wSum;
      pixels[idx+2] = bSum / wSum;
    }
  },

  saveImage() { if (this.data.resultImage) this.checkQuotaAndSave(); },
  realSaveProcess() {
    wx.saveImageToPhotosAlbum({
      filePath: this.data.resultImage,
      success: () => { wx.navigateTo({ url: `/pages/success/success?path=${encodeURIComponent(this.data.resultImage)}` }); },
      fail: (err) => {
        if (err.errMsg.includes('auth')) wx.showModal({ title: '权限', content: '需保存权限', success: (s) => { if(s.confirm) wx.openSetting(); }});
        else wx.showToast({ title: '保存失败', icon: 'none' });
      }
    });
  },

  startCompare() { this.setData({ isComparing: true }); },
  endCompare() { this.setData({ isComparing: false }); },
  onShareAppMessage() { return { title: '免费去水印', path: '/pages/watermark/watermark' }; }
});
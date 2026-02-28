// pages/watermark/watermark.js
const Security = require('../../utils/security.js'); 

const SERVER_CONFIG = {
  PROXY_API_URL: 'https://goodgoodstudy-nb.top/api/v1/wx-proxy/remove-watermark', // 请确保是您的公网IP
  APP_TAG: 'default_app' 
};

const AD_CONFIG = {
  BANNER_ID: 'adunit-ecfcec4c6a0c871b',
  VIDEO_ID: 'adunit-da175a2014d3443b'
};

const DAILY_FREE_SAVE_LIMIT = 2; 
const DAILY_FREE_AI_LIMIT = 1;   
const AD_REWARD_AI_COUNT = 3;    

// 最小堆算法 (本地 Telea 算法必备)
class MinHeap {
  constructor(){this.heap=[]}push(t){this.heap.push(t),this.bubbleUp(this.heap.length-1)}pop(){if(0===this.heap.length)return null;const t=this.heap[0],e=this.heap.pop();return this.heap.length>0&&(this.heap[0]=e,this.sinkDown(0)),t}bubbleUp(t){for(;t>0;){const e=Math.floor((t-1)/2);if(this.heap[t].dist>=this.heap[e].dist)break;[this.heap[t],this.heap[e]]=[this.heap[e],this.heap[t]],t=e}}sinkDown(t){const e=this.heap.length;for(;;){let s=2*t+1,h=2*t+2,i=null;if(s<e&&this.heap[s].dist<this.heap[t].dist&&(i=s),h<e&&this.heap[h].dist<(null===i?this.heap[t].dist:this.heap[s].dist)&&(i=h),null===i)break;[this.heap[t],this.heap[i]]=[this.heap[i],this.heap[t]],t=i}}size(){return this.heap.length}
}

Page({
  data: {
    imagePath: '', resultImage: '', isProcessing: false, mode: 'manual', 
    brushSize: 35, canvasDisplayWidth: 300, canvasDisplayHeight: 400,
    imageWidth: 0, imageHeight: 0, isComparing: false, bannerUnitId: AD_CONFIG.BANNER_ID,
    isMoveMode: false, moveX: 0, moveY: 0, moveScale: 1,
    leftTabTitle: '普通去水印', rightTabTitle: 'AI去水印', pendingAdType: '' 
  },

  canvas: null, ctx: null, maskCanvas: null, maskCtx: null, originalImage: null,
  dpr: 1, videoAd: null, history: [], canvasRect: { left: 0, top: 0 },

  onLoad() {
    this.dpr = wx.getSystemInfoSync().pixelRatio;
    this.history = []; this.canvasRect = { left: 0, top: 0 };
    this.initVideoAd();
  },

  onShow() { this.updateAiTabTitle(); },

  initVideoAd() {
    if (wx.createRewardedVideoAd) {
      this.videoAd = wx.createRewardedVideoAd({ adUnitId: AD_CONFIG.VIDEO_ID });
      this.videoAd.onError((err) => console.error('广告加载失败', err));
      this.videoAd.onClose((res) => {
        if (res && res.isEnded) {
          if (this.data.pendingAdType === 'ai') {
            this.addAiBalance(AD_REWARD_AI_COUNT);
            wx.showToast({ title: `到账 ${AD_REWARD_AI_COUNT} 次`, icon: 'success' });
            setTimeout(() => this.startProcess(), 500);
          } else if (this.data.pendingAdType === 'save') {
            this.setDailyUnlimitedSave();
            wx.showToast({ title: '保存已解锁', icon: 'success' });
            setTimeout(() => this.realSaveProcess(), 500);
          }
        } else {
          wx.showModal({ title: '提示', content: '完整观看才能获取奖励哦', confirmText: '继续观看', success: (m) => { if (m.confirm) this.videoAd.show(); } });
        }
      });
    }
  },

  getAiStock() {
    const today = new Date().toLocaleDateString();
    let dailyRecord = wx.getStorageSync('watermark_ai_daily_v12') || { date: today, used: 0 };
    if (dailyRecord.date !== today) { dailyRecord = { date: today, used: 0 }; wx.setStorageSync('watermark_ai_daily_v12', dailyRecord); }
    let balance = wx.getStorageSync('watermark_ai_balance_v12') || 0;
    const freeLeft = Math.max(0, DAILY_FREE_AI_LIMIT - dailyRecord.used);
    return { total: freeLeft + balance, freeLeft, balance, dailyRecord };
  },

  consumeAiStock() {
    const stock = this.getAiStock();
    if (stock.freeLeft > 0) {
      stock.dailyRecord.used++;
      wx.setStorageSync('watermark_ai_daily_v12', stock.dailyRecord);
    } else if (stock.balance > 0) {
      wx.setStorageSync('watermark_ai_balance_v12', stock.balance - 1);
    }
    this.updateAiTabTitle();
  },

  addAiBalance(count) {
    let balance = wx.getStorageSync('watermark_ai_balance_v12') || 0;
    wx.setStorageSync('watermark_ai_balance_v12', balance + count);
    this.updateAiTabTitle();
  },

  updateAiTabTitle() {
    const stock = this.getAiStock();
    this.setData({ rightTabTitle: `AI去水印(余${stock.total})` });
  },

  checkSaveQuota() {
    const today = new Date().toLocaleDateString();
    const key = 'watermark_save_record_v12';
    let record = wx.getStorageSync(key) || { date: today, count: 0, isUnlimited: false };
    if (record.date !== today) { record = { date: today, count: 0, isUnlimited: false }; wx.setStorageSync(key, record); }
    return record;
  },

  useSaveQuota() {
    const record = this.checkSaveQuota();
    if (!record.isUnlimited) { record.count++; wx.setStorageSync('watermark_save_record_v12', record); }
  },

  setDailyUnlimitedSave() {
    const today = new Date().toLocaleDateString();
    wx.setStorageSync('watermark_save_record_v12', { date: today, count: 999, isUnlimited: true });
  },

  // ==========================================
  // 🔥 核心加载与反馈控制
  // ==========================================
  showDynamicLoading(type) {
    let progress = 0;
    wx.showLoading({ title: '准备中 0%', mask: true });
    
    if (this.loadingTimer) clearInterval(this.loadingTimer);
    
    this.loadingTimer = setInterval(() => {
      progress += Math.floor(Math.random() * 10) + 3;
      if (progress >= 99) progress = 99; 
      
      let text = '准备中';
      if (progress < 25) {
        text = '安全检测中';
      } else if (progress < 50) {
        text = type === 'ai' ? '智能切片中' : '图像解析中';
      } else if (progress < 85) {
        text = type === 'ai' ? 'AI重绘细节' : '本地消除中';
      } else {
        text = '合成原画质';
      }

      wx.showLoading({ title: `${text} ${progress}%`, mask: true });
    }, 600); 
  },

  hideDynamicLoading() {
    if (this.loadingTimer) {
      clearInterval(this.loadingTimer);
      this.loadingTimer = null;
    }
    wx.hideLoading();
  },

  // ==========================================
  // 🔥 核心重构：统一入口管理
  // ==========================================
  startProcess() {
    if (!this.data.imagePath) return;
    if (this.data.isProcessing) return;

    if (this.data.mode === 'manual') {
      this.startManualPipeline(); 
    } else {
      const stock = this.getAiStock();
      if (stock.total > 0) {
        this.startAiPipeline(); 
      } else {
        this.setData({ pendingAdType: 'ai' });
        this.showAdModal('ai');
      }
    }
  },

  async startManualPipeline() {
    this.setData({ isProcessing: true });
    this.showDynamicLoading('manual'); 

    try {
      const { width, height } = this.getOptimalSize(this.data.imageWidth, this.data.imageHeight);
      const imgBase64ForCheck = await this.getResizedImageBase64(width, height);

      await this.processWithProxyApi(imgBase64ForCheck, "", "normal");
      this.processTelea(); 

    } catch (err) {
      this.handleError(err);
    }
  },

  async startAiPipeline() {
    this.setData({ isProcessing: true });
    this.showDynamicLoading('ai');

    try {
      const { imgBase64, maskBase64 } = await this.prepareAiData();
      const filePath = await this.processWithProxyApi(imgBase64, maskBase64, "ai");
      
      this.consumeAiStock();
      this.handleSuccess(filePath);

    } catch (err) {
      this.handleError(err);
    }
  },

// 核心中转请求函数（正式生产版：移除调试日志，柔化报错文案）
processWithProxyApi(imgBase64, maskBase64, reqMode) {
  return new Promise((resolve, reject) => {
    wx.request({
      url: SERVER_CONFIG.PROXY_API_URL,
      method: 'POST',
      data: {
        app_tag: SERVER_CONFIG.APP_TAG,
        mode: reqMode, 
        image: imgBase64,
        mask: maskBase64 || ""
      },
      timeout: 60000,
      success: (res) => {
        if (res.statusCode === 200) {
          let responseData = res.data;
          if (typeof responseData === 'string') {
            try { responseData = JSON.parse(responseData); } catch (e) {}
          }

          // 拦截违规图片
          if (responseData.code === 403 || responseData.errcode === 403) {
            return reject(new Error('图片包含违规内容，请更换图片后重试哦'));
          }

          if (reqMode === 'ai') {
            let resultB64 = responseData.data?.image || responseData.image || responseData.data || "";
            
            if (!resultB64) {
              return reject(new Error('生成图片时遇到点小问题，请重新尝试'));
            }
            
            if (resultB64.startsWith('data:image')) {
              resultB64 = resultB64.split('base64,')[1];
            }
            
            this.base64ToTempFile(resultB64).then(resolve).catch((err) => reject(err));
          } else {
            resolve(); 
          }
        } else {
          // 掩盖 Nginx 502/413 等底层错误
          reject(new Error('当前使用人数较多，服务器正在排队，请稍后再试'));
        }
      },
      fail: () => {
        reject(new Error('网络似乎开小差了，请检查网络连接后重试'));
      }
    });
  });
},

  // ==========================================
  // 工具与算法实现
  // ==========================================
  readFileToBase64(filePath) {
    return new Promise((resolve, reject) => {
      wx.getFileSystemManager().readFile({
        filePath: filePath,
        encoding: 'base64',
        success: res => resolve(res.data),
        fail: reject
      });
    });
  },

  async prepareAiData() {
    const { width, height } = this.getOptimalSize(this.data.imageWidth, this.data.imageHeight);
    const imgBase64 = await this.getResizedImageBase64(width, height);
    const maskBase64 = await this.getMaskBase64PureWhite(width, height);
    return { imgBase64, maskBase64 };
  },

  getMaskBase64PureWhite(targetW, targetH) {
    return new Promise((resolve, reject) => {
      const w = targetW; const h = targetH;
      const tempCanvas = wx.createOffscreenCanvas({ type: '2d', width: w, height: h });
      const ctx = tempCanvas.getContext('2d');
      ctx.clearRect(0, 0, w, h);
      ctx.drawImage(this.maskCanvas, 0, 0, w, h);
      const offset = 2; 
      ctx.drawImage(this.maskCanvas, -offset, 0, w, h);
      ctx.drawImage(this.maskCanvas, offset, 0, w, h);
      ctx.drawImage(this.maskCanvas, 0, -offset, w, h);
      ctx.drawImage(this.maskCanvas, 0, offset, w, h);
      ctx.globalCompositeOperation = 'source-in';
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = 'destination-over';
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, w, h);
      
      wx.canvasToTempFilePath({
        canvas: tempCanvas, 
        fileType: 'jpg', 
        quality: 0.5, 
        success: (res) => {
          const fs = wx.getFileSystemManager();
          fs.readFile({ filePath: res.tempFilePath, encoding: 'base64', success: (r) => resolve(r.data), fail: reject });
        },
        fail: reject
      });
    });
  },

  processTelea() {
    setTimeout(() => {
      try {
        const { width, height } = this.getOptimalSize(this.data.imageWidth, this.data.imageHeight);
        const imgCanvas = wx.createOffscreenCanvas({ type: '2d', width: width, height: height });
        const imgCtx = imgCanvas.getContext('2d');
        const img = imgCanvas.createImage();
        img.onload = () => {
          imgCtx.drawImage(img, 0, 0, width, height);
          const imgData = imgCtx.getImageData(0, 0, width, height);
          const maskCanvas = wx.createOffscreenCanvas({ type: '2d', width: width, height: height });
          const maskCtx = maskCanvas.getContext('2d');
          maskCtx.drawImage(this.maskCanvas, 0, 0, width, height); 
          const maskData = maskCtx.getImageData(0, 0, width, height).data;
          const distMap = new Float32Array(width * height);
          const flagMap = new Uint8Array(width * height);
          const INF = 1e6;
          let maskCount = 0;
          for (let i = 0; i < width * height; i++) { distMap[i] = INF; flagMap[i] = 0; }
          for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
              const i = (y * width + x) * 4;
              const idx = y * width + x;
              if (maskData[i+3] > 0) { flagMap[idx] = 2; maskCount++; } 
              else { distMap[idx] = 0; flagMap[idx] = 0; }
            }
          }
          if (maskCount === 0) {
            this.setData({ isProcessing: false }); 
            this.hideDynamicLoading();
            return wx.showToast({ title: '请先涂抹', icon: 'none' });
          }
          this.performTeleaCalculation(width, height, flagMap, distMap, imgData.data);
          imgCtx.putImageData(imgData, 0, 0);
          wx.canvasToTempFilePath({
            canvas: imgCanvas, fileType: 'jpg', quality: 0.95,
            success: (res) => { this.handleSuccess(res.tempFilePath); },
            fail: () => { this.setData({ isProcessing: false }); this.hideDynamicLoading(); }
          });
        };
        img.src = this.data.imagePath;
      } catch (err) { this.handleError(err); }
    }, 100);
  },

  performTeleaCalculation(width, height, flagMap, distMap, pixels) {
      const heap = new MinHeap();
      const neighbors = [[-1, 0], [1, 0], [0, -1], [0, 1]];
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const idx = y * width + x;
          if (flagMap[idx] === 2) { 
            let isBoundary = false;
            for (let n of neighbors) {
               const nx = x + n[0], ny = y + n[1];
               if (nx>=0 && nx<width && ny>=0 && ny<height) { if (flagMap[ny*width + nx] === 0) isBoundary = true; }
            }
            if (isBoundary) { flagMap[idx] = 1; distMap[idx] = 0; heap.push({ x, y, dist: 0 }); }
          }
        }
      }
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
      pixels[idx] = rSum / wSum; pixels[idx+1] = gSum / wSum; pixels[idx+2] = bSum / wSum;
    }
  },

  chooseImage() {
    wx.chooseMedia({
      count: 1, mediaType: ['image'], sourceType: ['album', 'camera'], sizeType: ['compressed'],
      success: (res) => { this.loadImage(res.tempFiles[0].tempFilePath); }
    });
  },

  loadImage(path) {
    wx.showLoading({ title: '加载中...' });
    this.history = []; 
    this.setData({ moveScale: 1, moveX: 0, moveY: 0, isMoveMode: false, resultImage: '' });
    wx.getImageInfo({
      src: path,
      success: (info) => {
        const sys = wx.getSystemInfoSync();
        const p = 60, mW = sys.windowWidth - p, mH = sys.windowHeight * 0.55;
        let dW, dH;
        const r = info.width / info.height;
        if (r > mW / mH) { dW = mW; dH = mW / r; } else { dH = mH; dW = mH * r; }
        this.setData({
          imagePath: path, canvasDisplayWidth: dW, canvasDisplayHeight: dH,
          imageWidth: info.width, imageHeight: info.height
        });
        setTimeout(() => { this.initCanvas(path); wx.hideLoading(); }, 300);
      },
      fail: () => { wx.hideLoading(); wx.showToast({ title: '图片解析失败', icon: 'none' }); }
    });
  },

  initCanvas(path) {
    const q = wx.createSelectorQuery();
    q.select('#editCanvas').fields({ node: true, size: true, rect: true }).exec((res) => {
        if (!res[0] || !res[0].node) return;
        const node = res[0].node;
        if (res[0].rect) this.canvasRect = res[0].rect;
        this.canvas = node; this.ctx = node.getContext('2d');
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
    this.ctx.save(); this.ctx.globalAlpha = 0.6; 
    this.ctx.drawImage(this.maskCanvas, 0, 0, this.maskCanvas.width, this.maskCanvas.height, 0, 0, w, h);
    this.ctx.restore();
  },

  toggleMoveMode() { this.setData({ isMoveMode: !this.data.isMoveMode }); },
  onScaleChange(e) { this.data.moveScale = e.detail.scale; },
  
  onTouchStart(e) {
    if (this.data.isMoveMode || !this.ctx) return;
    this.isDrawing = true;
    const scale = this.data.moveScale || 1;
    this.lastX = e.touches[0].x / scale; this.lastY = e.touches[0].y / scale;
    this.saveHistory();
    this.drawMaskLine(this.lastX, this.lastY, this.lastX, this.lastY);
  },
  
  onTouchMove(e) {
    if (this.data.isMoveMode || !this.isDrawing) return;
    const scale = this.data.moveScale || 1;
    const x = e.touches[0].x / scale; const y = e.touches[0].y / scale;
    this.drawMaskLine(this.lastX, this.lastY, x, y);
    this.lastX = x; this.lastY = y;
  },
  onTouchEnd() { this.isDrawing = false; },

  drawMaskLine(x1, y1, x2, y2) {
    if (!this.maskCtx) return;
    this.maskCtx.beginPath();
    this.maskCtx.lineCap = 'round'; this.maskCtx.lineJoin = 'round';
    this.maskCtx.lineWidth = this.data.brushSize * this.dpr;
    this.maskCtx.strokeStyle = '#6366f1'; 
    this.maskCtx.moveTo(x1 * this.dpr, y1 * this.dpr);
    this.maskCtx.lineTo(x2 * this.dpr, y2 * this.dpr);
    this.maskCtx.stroke();
    this.drawCanvas(); 
  },

  switchMode(e) {
    const targetMode = e.currentTarget.dataset.mode;
    if (this.data.mode === targetMode) return;
    this.setData({ mode: targetMode, resultImage: '' });
    this.clearMask(); 
    this.setData({ moveX: 0, moveY: 0, moveScale: 1, isMoveMode: false });
    if (this.data.mode === 'manual') setTimeout(() => this.drawCanvas(), 50);
  },
  
  setBrushSize(e) { this.setData({ brushSize: parseInt(e.currentTarget.dataset.size) }); },
  saveHistory() {
    if (!this.maskCtx) return;
    if (!this.history) this.history = [];
    if (this.history.length > 5) this.history.shift();
    this.history.push(this.maskCtx.getImageData(0, 0, this.maskCanvas.width, this.maskCanvas.height));
  },
  undoAction() {
    if (!this.history || !this.history.length) return wx.showToast({ title: '已是最初状态', icon: 'none' });
    this.maskCtx.putImageData(this.history.pop(), 0, 0);
    this.drawCanvas();
  },
  clearMask() {
    if (!this.maskCtx) return;
    this.saveHistory();
    this.maskCtx.clearRect(0, 0, this.maskCanvas.width, this.maskCanvas.height);
    this.drawCanvas();
    this.setData({ moveX: 0, moveY: 0, moveScale: 1 });
  },

  handleSuccess(filePath) {
    this.setData({ resultImage: filePath, isProcessing: false });
    this.setData({ moveScale: 1, moveX: 0, moveY: 0, isMoveMode: false });
    this.clearMask(); 
    this.hideDynamicLoading();
    wx.pageScrollTo({ selector: '.result-card', duration: 300 });
    wx.showToast({ title: '处理成功', icon: 'success' });
  },

// 全局错误捕获（正式生产版：柔和弹窗）
handleError(err) {
  this.setData({ isProcessing: false });
  this.hideDynamicLoading();
  // 使用上一步传递过来的温和提示语，如果没有则显示保底文案
  wx.showModal({ 
    title: '温馨提示', 
    content: err.message || '系统繁忙，请稍后再试', 
    showCancel: false,
    confirmColor: '#6366f1' // 用一个好看的主题色按钮代替默认的绿色
  });
},

  getOptimalSize(w, h) {
    const MAX_SIDE = 1536; 
    let ratio = 1;
    if (w > MAX_SIDE || h > MAX_SIDE) {
      ratio = Math.min(MAX_SIDE / w, MAX_SIDE / h);
    }
    return { 
      width: Math.round(w * ratio), 
      height: Math.round(h * ratio) 
    };
  },

  getResizedImageBase64(targetW, targetH) {
    return new Promise((resolve, reject) => {
      const tempCanvas = wx.createOffscreenCanvas({ type: '2d', width: targetW, height: targetH });
      const ctx = tempCanvas.getContext('2d');
      const img = tempCanvas.createImage();
      img.onload = () => {
        ctx.drawImage(img, 0, 0, targetW, targetH);
        wx.canvasToTempFilePath({
          canvas: tempCanvas, 
          fileType: 'jpg', 
          quality: 0.8, 
          success: (res) => {
            const fs = wx.getFileSystemManager();
            fs.readFile({ filePath: res.tempFilePath, encoding: 'base64', success: (r) => resolve(r.data), fail: reject });
          },
          fail: reject
        });
      };
      img.src = this.data.imagePath;
    });
  },

// 本地文件写入与静默清理（正式生产版：隐蔽吸尘器，友好提示内存不足）
base64ToTempFile(base64Data) {
  return new Promise((resolve, reject) => {
    const fs = wx.getFileSystemManager();
    const basePath = wx.env.USER_DATA_PATH;
    const fileName = `${basePath}/ai_result_${Date.now()}.jpg`; 
    
    try {
      // 静默清理历史文件，不留下任何报错痕迹
      try {
        const files = fs.readdirSync(basePath);
        files.forEach(file => {
          if (file.endsWith('.jpg') || file.includes('res_') || file.includes('ai_result_')) {
            try { fs.unlinkSync(`${basePath}/${file}`); } catch (e) {}
          }
        });
      } catch (e) {}

      let cleanBase64 = base64Data.replace(/^data:image\/\w+;base64,/, '')
                                  .replace(/[\r\n\s]/g, '');

      fs.writeFile({ 
        filePath: fileName, 
        data: cleanBase64, 
        encoding: 'base64', 
        success: () => resolve(fileName), 
        fail: () => {
          reject(new Error('手机存储空间好像不够了，清理一下微信缓存再来吧'));
        } 
      });
    } catch (err) {
      reject(new Error('图片渲染失败，请再试一次'));
    }
  });
},

  saveImage() {
    if (!this.data.resultImage) return;
    const record = this.checkSaveQuota();
    if (record.isUnlimited) { this.realSaveProcess(); return; }
    if (record.count < DAILY_FREE_SAVE_LIMIT) {
      this.useSaveQuota();
      this.realSaveProcess();
      return;
    }
    this.setData({ pendingAdType: 'save' });
    this.showAdModal('save');
  },

  realSaveProcess() {
    wx.saveImageToPhotosAlbum({
      filePath: this.data.resultImage,
      success: () => { wx.navigateTo({ url: `/pages/success/success?path=${encodeURIComponent(this.data.resultImage)}` }); },
      fail: (err) => { if (err.errMsg.includes('auth')) wx.openSetting(); else wx.showToast({ title: '保存失败', icon: 'none' }); }
    });
  },

  showAdModal(type) {
    let title = type === 'ai' ? 'AI 次数不足' : '保存次数不足';
    let content = type === 'ai' ? `看视频获 ${AD_REWARD_AI_COUNT} 次机会` : '看视频解锁无限保存';
    if (this.videoAd) {
      wx.showModal({ title, content, confirmText: '去观看', success: (res) => { if (res.confirm) this.videoAd.show().catch(() => { if(type==='save') this.realSaveProcess(); }); } });
    } else { if(type==='save') this.realSaveProcess(); }
  },

  startCompare() { this.setData({ isComparing: true }); },
  endCompare() { this.setData({ isComparing: false }); },
  onShareAppMessage() {
    const imageUrl = this.data.resultImage || '/assets/share-cover.png';
    return { title: '免费一键去水印，消除笔无痕修复！', path: '/pages/watermark/watermark', imageUrl: imageUrl };
  },
  onShareTimeline() {
    const imageUrl = this.data.resultImage || '/assets/share-cover.png';
    return { title: '免费一键去水印，消除笔无痕修复！', query: '', imageUrl: imageUrl };
  }
});
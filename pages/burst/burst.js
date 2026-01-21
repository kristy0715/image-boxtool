const Security = require('../../utils/security.js');
const AD_CONFIG = { BANNER_ID: 'adunit-ecfcec4c6a0c871b', VIDEO_ID: 'adunit-da175a2014d3443b' };
const FREE_COUNT_DAILY = 2;

Page({
  data: {
    imagePath: '',
    maskType: 'burst-circle',
    tipText: '圆形破格 (适合人像)',
    cropW: 0, cropH: 0, imgW: 0, imgH: 0, x: 0, y: 0, scale: 1, initialX: 0, initialY: 0,
    isProcessing: false, loadingText: '处理中...', bannerUnitId: AD_CONFIG.BANNER_ID
  },
  
  _pixelRatio: 1, _sys: null, _imgInfo: null,

  onLoad() {
    this.initSystem();
    this.initVideoAd();
  },

  initSystem() {
    const sys = wx.getSystemInfoSync();
    this._sys = sys;
    this._pixelRatio = sys.windowWidth / 750;
  },

  initVideoAd() {
    if (wx.createRewardedVideoAd) {
      this.videoAd = wx.createRewardedVideoAd({ adUnitId: AD_CONFIG.VIDEO_ID });
      this.videoAd.onError((err) => console.error(err));
      this.videoAd.onClose((res) => {
        if (res && res.isEnded) {
          this.setDailyUnlimited();
          wx.showToast({ title: '已解锁', icon: 'success' });
          this.realSaveAction();
        } else {
          wx.showModal({ title: '提示', content: '需完整观看视频才能解锁', confirmText: '继续', success: (m) => { if (m.confirm) this.videoAd.show(); } });
        }
      });
    }
  },

  chooseImage() {
    wx.chooseMedia({
      count: 1, mediaType: ['image'], sizeType: ['original'],
      success: (res) => {
        const path = res.tempFiles[0].tempFilePath;
        wx.showLoading({ title: '加载中...' });
        Security.checkImage(path).then(isSafe => {
          if (isSafe) this.initCropper(path);
          else { wx.hideLoading(); wx.showToast({ title: '图片不合规', icon: 'none' }); }
        }).catch(() => this.initCropper(path));
      }
    });
  },

  initCropper(path) {
    wx.getImageInfo({
      src: path,
      success: (info) => {
        this._imgInfo = info;
        const size = 600 * this._pixelRatio;
        this.resetLayout(size, path);
        wx.hideLoading();
      }
    });
  },

  setMaskType(e) {
    const { type, text } = e.currentTarget.dataset;
    if (this.data.maskType === type) return;
    this.setData({ maskType: type, tipText: text });
  },

  resetLayout(boxW, newPath) {
    if (!this._imgInfo) return;
    const info = this._imgInfo;
    const ratio = info.width / info.height;
    let viewW, viewH;
    if (ratio > 1) { viewH = boxW; viewW = boxW * ratio; } 
    else { viewW = boxW; viewH = boxW / ratio; }
    
    const cx = (boxW - viewW) / 2;
    const cy = (boxW - viewH) / 2;
    const dataUpdate = { cropW: boxW, cropH: boxW, imgW: viewW, imgH: viewH, scale: 1, initialX: cx, initialY: cy };
    if (newPath) dataUpdate.imagePath = newPath;
    this.setData(dataUpdate, () => { setTimeout(() => { this.setData({ x: cx, y: cy }); }, 100); });
  },

  resetView() {
    this.setData({ x: this.data.initialX, y: this.data.initialY, scale: 1 });
  },

  saveToAlbum() {
    if (!this.data.imagePath) return;
    wx.showLoading({ title: '准备中...' });
    this.checkQuotaAndSave();
  },

  checkQuotaAndSave() {
    const today = new Date().toLocaleDateString();
    const key = 'burst_usage_record';
    let record = wx.getStorageSync(key) || { date: today, count: 0, isUnlimited: false };
    if (record.date !== today) { record = { date: today, count: 0, isUnlimited: false }; wx.setStorageSync(key, record); }
    if (record.isUnlimited || record.count < FREE_COUNT_DAILY) {
      if (!record.isUnlimited) { record.count++; wx.setStorageSync(key, record); }
      this.realSaveAction();
    } else {
      wx.hideLoading();
      if (this.videoAd) {
        wx.showModal({ title: '次数不足', content: '看视频解锁无限次', success: (res) => { if (res.confirm) this.videoAd.show().catch(() => this.realSaveAction()); } });
      } else { this.realSaveAction(); }
    }
  },

  setDailyUnlimited() {
    wx.setStorageSync('burst_usage_record', { date: new Date().toLocaleDateString(), count: 999, isUnlimited: true });
  },

  realSaveAction() {
    this.setData({ isProcessing: true, loadingText: '正在处理...' });
    wx.hideLoading();
    
    const query = wx.createSelectorQuery();
    query.select('.crop-area').boundingClientRect();
    query.select('.crop-img').boundingClientRect();
    query.exec((res) => {
      if (!res || !res[0] || !res[1]) { this.setData({ isProcessing: false }); return; }
      
      const boxRect = res[0];
      const imgRect = res[1];
      const canvasW = 2400; const canvasH = 2400;
      const mapScale = canvasW / boxRect.width;

      try {
        const canvas = wx.createOffscreenCanvas({ type: '2d', width: canvasW, height: canvasH });
        const ctx = canvas.getContext('2d');
        const img = canvas.createImage();

        img.onload = async () => {
          // 1. 底层：白色背景
          ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvasW, canvasH);
          
          // 2. 绘制图片
          const drawX = (imgRect.left - boxRect.left) * mapScale;
          const drawY = (imgRect.top - boxRect.top) * mapScale;
          const drawW = imgRect.width * mapScale;
          const drawH = imgRect.height * mapScale;
          ctx.drawImage(img, drawX, drawY, drawW, drawH);

          // 3. 制作遮罩 (白色覆盖，挖空露出图片)
          const maskCanvas = wx.createOffscreenCanvas({ type: '2d', width: canvasW, height: canvasH });
          const mCtx = maskCanvas.getContext('2d');
          
          // 铺满白色
          mCtx.fillStyle = '#ffffff'; mCtx.fillRect(0, 0, canvasW, canvasH);
          
          // 擦除 (挖洞)
          mCtx.globalCompositeOperation = 'destination-out';
          mCtx.fillStyle = '#000000';
          this.drawBurstMask(mCtx, canvasW, canvasH, this.data.maskType);
          mCtx.fill();

          // 叠加遮罩
          ctx.drawImage(maskCanvas, 0, 0, canvasW, canvasH);

          const previewPath = await new Promise(resolve => {
            wx.canvasToTempFilePath({ canvas: canvas, fileType: 'jpg', quality: 0.9, success: res => resolve(res.tempFilePath) });
          });

          // 切片保存
          const saveLoop = async (index) => {
            if (index >= 9) {
              this.setData({ isProcessing: false });
              wx.navigateTo({ url: `/pages/success/success?path=${encodeURIComponent(previewPath)}` });
              return;
            }
            const r = Math.floor(index / 3);
            const c = index % 3;
            const cellW = canvasW / 3;
            const cellH = canvasH / 3;
            const x1 = Math.floor(c * cellW);
            const y1 = Math.floor(r * cellH);
            
            const cellData = ctx.getImageData(x1, y1, cellW, cellH);
            const cellCan = wx.createOffscreenCanvas({ type: '2d', width: cellW, height: cellH });
            const cCtx = cellCan.getContext('2d');
            cCtx.putImageData(cellData, 0, 0);
            
            this.setData({ loadingText: `保存中 ${index+1}/9` });
            const tempFilePath = await new Promise(resolve => {
              wx.canvasToTempFilePath({ canvas: cellCan, fileType: 'jpg', quality: 1.0, success: res => resolve(res.tempFilePath) });
            });
            wx.saveImageToPhotosAlbum({
              filePath: tempFilePath,
              success: () => setTimeout(() => saveLoop(index + 1), 200),
              fail: () => saveLoop(index + 1)
            });
          };
          saveLoop(0);
        };
        img.src = this.data.imagePath;
      } catch (err) { this.setData({ isProcessing: false }); }
    });
  },

  drawBurstMask(ctx, w, h, type) {
    const cellW = w / 3; const cellH = h / 3; const gap = w * 0.015;
    // 挖9个格子
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        const cx = c * cellW + gap; const cy = r * cellH + gap;
        const cw = cellW - 2 * gap; const ch = cellH - 2 * gap;
        ctx.beginPath(); this.roundRect(ctx, cx, cy, cw, ch, 20); ctx.fill();
      }
    }
    // 挖中间大形状
    const center = { x: w / 2, y: h / 2 };
    const scale = w / 2400;
    ctx.beginPath();
    if (type === 'burst-circle') {
      ctx.arc(center.x, center.y, 450 * scale, 0, 2 * Math.PI);
    } else if (type === 'burst-heart') {
      const t = (x, y) => ({ x: center.x + (x - 50) * 11 * scale, y: center.y + (y - 50) * 11 * scale });
      ctx.moveTo(t(50, 28).x, t(50, 28).y);
      ctx.bezierCurveTo(t(10, 5).x, t(10, 5).y, t(0, 30).x, t(0, 30).y, t(0, 50).x, t(0, 50).y);
      ctx.bezierCurveTo(t(0, 72).x, t(0, 72).y, t(25, 88).x, t(25, 88).y, t(50, 95).x, t(50, 95).y);
      ctx.bezierCurveTo(t(75, 88).x, t(75, 88).y, t(100, 72).x, t(100, 72).y, t(100, 50).x, t(100, 50).y);
      ctx.bezierCurveTo(t(100, 30).x, t(100, 30).y, t(90, 5).x, t(90, 5).y, t(50, 28).x, t(50, 28).y);
    } else if (type === 'burst-star') {
      const R = 480 * scale; const r = 220 * scale;
      for (let i = 0; i < 10; i++) {
        const angle = Math.PI / 5 * i - Math.PI / 2;
        const len = i % 2 === 0 ? R : r;
        const px = center.x + Math.cos(angle) * len;
        const py = center.y + Math.sin(angle) * len;
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath();
    }
    ctx.fill();
  },

  roundRect(ctx, x, y, w, h, r) {
    if (w < 2 * r) r = w / 2; if (h < 2 * r) r = h / 2;
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  },

  onShareAppMessage() { return { title: '酷！冲出九宫格特效', path: '/pages/burst/burst', imageUrl: '/assets/share-cover.png' }; }
});
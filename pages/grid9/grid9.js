// pages/grid9/grid9.js
const Security = require('../../utils/security.js');

const AD_CONFIG = {
  BANNER_ID: 'adunit-ecfcec4c6a0c871b',
  VIDEO_ID: 'adunit-da175a2014d3443b'
};
const FREE_COUNT_DAILY = 2;

Page({
  data: {
    imagePath: '',
    gridType: 9, 
    maskType: 'none', 
    cols: 3, rows: 3,
    tipText: '标准九宫格 (3x3)',
    cropW: 0,  cropH: 0,
    imgW: 0,   imgH: 0,
    x: 0, y: 0, scale: 1,
    initialX: 0, initialY: 0,
    isProcessing: false,
    loadingText: '处理中...',
    bannerUnitId: AD_CONFIG.BANNER_ID
  },

  _pixelRatio: 1, 
  _sys: null,
  _imgInfo: null, 

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
      this.videoAd.onLoad(() => console.log('激励视频加载成功'));
      this.videoAd.onError((err) => console.error('激励视频加载失败', err));
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
  onAdError(err) { console.log('Banner err:', err); },

  chooseImage() {
    wx.chooseMedia({
      count: 1, mediaType: ['image'], sizeType: ['original'],
      success: (res) => {
        const path = res.tempFiles[0].tempFilePath;
        wx.showLoading({ title: '加载中...' });
        Security.checkImage(path).then(isSafe => {
          if (isSafe) {
            this.initCropper(path);
          } else {
            wx.hideLoading(); wx.showToast({ title: '不合规', icon: 'none' });
          }
        }).catch(() => { this.initCropper(path); });
      }
    });
  },

  initCropper(path) {
    wx.getImageInfo({
      src: path,
      success: (info) => {
        this._imgInfo = info;
        const size = 600 * this._pixelRatio;
        this.resetLayout(9, 3, 3, '标准九宫格 (3x3)', size, size, path);
        wx.hideLoading();
      }
    });
  },

  setGridType(e) {
    const type = parseInt(e.currentTarget.dataset.type);
    if (this.data.gridType === type) return;

    let c, r, txt;
    const baseSize = 600 * this._pixelRatio;

    if (type === 9) { c=3; r=3; txt='标准九宫格 (3x3)'; }
    else if (type === 4) { c=2; r=2; txt='四宫格 (2x2)'; }
    else if (type === 6) { c=3; r=2; txt='六宫格 (3x2)'; } 
    else { c=3; r=3; txt='标准九宫格 (3x3)'; }
    
    this.resetLayout(type, c, r, txt, baseSize, baseSize);
  },

  setMaskType(e) {
      const type = e.currentTarget.dataset.type;
      if (this.data.maskType === type) return;
      this.setData({ maskType: type });
  },

  resetLayout(type, cols, rows, tip, boxW, boxH, newPath) {
    if (!this._imgInfo) return; 
    
    const info = this._imgInfo;
    const ratio = info.width / info.height;
    const boxRatio = boxW / boxH; 
    
    let viewW, viewH;
    
    if (ratio > boxRatio) {
        viewH = boxH; viewW = boxH * ratio;
    } else {
        viewW = boxW; viewH = boxW / ratio;
    }

    const cx = (boxW - viewW) / 2;
    const cy = (boxH - viewH) / 2;

    const dataUpdate = {
        gridType: type, cols, rows, tipText: tip,
        cropW: boxW, cropH: boxH,
        imgW: viewW, imgH: viewH,
        scale: 1, 
        initialX: cx, initialY: cy
    };
    if (newPath) dataUpdate.imagePath = newPath;

    this.setData(dataUpdate, () => {
        setTimeout(() => { this.setData({ x: cx, y: cy }); }, 100);
    });
  },

  resetView() {
      this.setData({ x: this.data.initialX, y: this.data.initialY, scale: 1 });
      wx.showToast({ title: '已还原', icon: 'none' });
  },

  saveToAlbum() {
    if (!this.data.imagePath) return;
    wx.showLoading({ title: '准备中...' });
    this.checkQuotaAndSave();
  },

  checkQuotaAndSave() {
    const today = new Date().toLocaleDateString();
    const key = 'grid9_usage_record';
    let record = wx.getStorageSync(key) || { date: today, count: 0, isUnlimited: false };
    if (record.date !== today) { record = { date: today, count: 0, isUnlimited: false }; wx.setStorageSync(key, record); }
    
    if (record.isUnlimited || record.count < FREE_COUNT_DAILY) {
      if(!record.isUnlimited) {
          record.count++; wx.setStorageSync(key, record);
      }
      this.realSaveAction();
    } else {
      wx.hideLoading();
      this.showAdModal();
    }
  },

  setDailyUnlimited() { wx.setStorageSync('grid9_usage_record', { date: new Date().toLocaleDateString(), count: 999, isUnlimited: true }); },
  
  showAdModal() {
    if (this.videoAd) {
      wx.showModal({ title: '次数不足', content: '看视频解锁无限次', success: (res) => { if (res.confirm) this.videoAd.show().catch(() => this.realSaveAction()); } });
    } else { this.realSaveAction(); }
  },

  realSaveAction() {
    this.setData({ isProcessing: true, loadingText: '正在处理...' });
    wx.hideLoading(); 

    const query = wx.createSelectorQuery();
    query.select('.crop-area').boundingClientRect(); 
    query.select('.crop-img').boundingClientRect();  
    
    query.exec((res) => {
        if (!res || !res[0] || !res[1]) {
            this.setData({ isProcessing: false });
            wx.showToast({ title: '请稍后再试', icon: 'none' });
            return;
        }

        const boxRect = res[0];
        const imgRect = res[1];
        const { cols, rows } = this.data;

        // 基础画布宽度 2400
        let canvasW = 2400; 
        // 动态高度
        let canvasH = (canvasW / cols) * rows;
        
        const mapScale = canvasW / boxRect.width;

        try {
            const canvas = wx.createOffscreenCanvas({ type: '2d', width: canvasW, height: canvasH });
            const ctx = canvas.getContext('2d');
            const img = canvas.createImage();

            img.onload = async () => {
                try {
                    ctx.clearRect(0, 0, canvasW, canvasH);
                    ctx.fillStyle = '#ffffff';
                    ctx.fillRect(0, 0, canvasW, canvasH);

                    const drawX = (imgRect.left - boxRect.left) * mapScale;
                    const drawY = (imgRect.top - boxRect.top) * mapScale;
                    const drawW = imgRect.width * mapScale;
                    const drawH = imgRect.height * mapScale;
                    ctx.imageSmoothingEnabled = true;
                    ctx.imageSmoothingQuality = 'high';
                    ctx.drawImage(img, drawX, drawY, drawW, drawH);
                    
                    if (this.data.maskType !== 'none') {
                        const maskCanvas = wx.createOffscreenCanvas({ type: '2d', width: canvasW, height: canvasH });
                        const mCtx = maskCanvas.getContext('2d');

                        mCtx.fillStyle = '#ffffff'; 
                        mCtx.fillRect(0, 0, canvasW, canvasH);

                        mCtx.globalCompositeOperation = 'destination-out';
                        mCtx.fillStyle = '#000000'; 
                        this.drawMaskPath(mCtx, canvasW, canvasH, this.data.maskType);
                        mCtx.fill(); 

                        ctx.drawImage(maskCanvas, 0, 0, canvasW, canvasH);
                    }

                    const previewPath = await new Promise(resolve => {
                        wx.canvasToTempFilePath({
                            canvas: canvas, fileType: 'jpg', quality: 0.8,
                            success: res => resolve(res.tempFilePath),
                            fail: () => resolve(this.data.imagePath)
                        });
                    });

                    const total = cols * rows;
                    const saveLoop = async (index) => {
                        if (index >= total) {
                            this.setData({ isProcessing: false });
                            wx.navigateTo({ url: `/pages/success/success?path=${encodeURIComponent(previewPath)}` });
                            return;
                        }
                        
                        const r = Math.floor(index / cols);
                        const c = index % cols;
                        const cellW = canvasW / cols;
                        const cellH = canvasH / rows;
                        const x1 = Math.floor(c * cellW);
                        const y1 = Math.floor(r * cellH);
                        
                        const cellData = ctx.getImageData(x1, y1, cellW, cellH);
                        const cellCan = wx.createOffscreenCanvas({ type: '2d', width: cellW, height: cellH });
                        const cCtx = cellCan.getContext('2d');
                        cCtx.putImageData(cellData, 0, 0);
                        
                        this.setData({ loadingText: `保存中 ${index+1}/${total}` });
                        
                        const tempFilePath = await new Promise(resolve => {
                            wx.canvasToTempFilePath({
                                canvas: cellCan, fileType: 'jpg', quality: 1.0, 
                                success: res => resolve(res.tempFilePath)
                            });
                        });
                        
                        wx.saveImageToPhotosAlbum({
                            filePath: tempFilePath,
                            success: () => { setTimeout(() => saveLoop(index + 1), 200); },
                            fail: () => { saveLoop(index + 1); }
                        });
                    };
                    saveLoop(0);

                } catch (e) {
                    console.error(e);
                    this.setData({ isProcessing: false });
                    wx.showToast({ title: '处理出错', icon: 'none' });
                }
            };
            img.src = this.data.imagePath;
        } catch (err) {
            console.error(err);
            this.setData({ isProcessing: false });
            wx.showToast({ title: '系统不支持', icon: 'none' });
        }
    });
  },

  drawMaskPath(ctx, w, h, type) {
      ctx.beginPath();
      // 基于 min(w, h) 居中绘制，确保不变形
      const size = Math.min(w, h);
      const scale = (size / 100) * 0.995; 
      
      const startX = (w - size) / 2;
      const startY = (h - size) / 2;

      const t = (x, y) => ({
          x: startX + (x + 0.25) * scale, 
          y: startY + (y + 0.25) * scale
      });

      if (type === 'circle') {
          const center = t(50, 50);
          ctx.arc(center.x, center.y, 49.5 * scale, 0, 2 * Math.PI);
          ctx.fill();
      
      } else if (type === 'heart') {
          // === 最终修正版：仿照参考图 (高瘦 + 直线收缩) ===
          const pTop = t(50, 30); // 顶部起搏点，V字明显
          const pBot = t(50, 95); // 底部尖端
          
          ctx.moveTo(pTop.x, pTop.y);
          
          // 左半边：
          // 1. 顶部圆弧：从 (50,30) 向上向外，到 (0,40) 最宽
          // 控制点 (30,0) 拉高，(0,15) 拉宽
          ctx.bezierCurveTo(t(30, 0).x, t(30, 0).y, t(0, 15).x, t(0, 15).y, t(0, 40).x, t(0, 40).y);
          
          // 2. 下部收缩：从 (0,40) 到 (50,95)
          // 关键：控制点 x 值较小，让线条更直，不向外凸
          // (0,60) 保持一点弧度，(20,85) 快速对齐到底部
          ctx.bezierCurveTo(t(0, 60).x, t(0, 60).y, t(20, 85).x, t(20, 85).y, pBot.x, pBot.y);
          
          // 右半边 (对称)
          ctx.bezierCurveTo(t(80, 85).x, t(80, 85).y, t(100, 60).x, t(100, 60).y, t(100, 40).x, t(100, 40).y);
          ctx.bezierCurveTo(t(100, 15).x, t(100, 15).y, t(70, 0).x, t(70, 0).y, pTop.x, pTop.y);
          
          ctx.fill();

      } else if (type === 'star') {
          const cx = startX + 50 * scale; const cy = startY + 50 * scale;
          const R = 49 * scale; const r = R * 0.4;
          const rot = Math.PI / 2 * 3; const step = Math.PI / 5;
          let x = cx + Math.cos(rot) * R; let y = cy + Math.sin(rot) * R;
          ctx.moveTo(x, y);
          for (let i = 1; i < 11; i++) {
              const currentR = i % 2 === 0 ? R : r;
              x = cx + Math.cos(rot + i * step) * currentR;
              y = cy + Math.sin(rot + i * step) * currentR;
              ctx.lineTo(x, y);
          }
          ctx.fill();

      } else if (type === 'bear') {
          const faceC = t(50, 55); const faceR = 40 * scale; 
          const leftEarC = t(18, 20); const rightEarC = t(82, 20); const earR = 15 * scale; 
          ctx.beginPath(); ctx.arc(leftEarC.x, leftEarC.y, earR, 0, 2 * Math.PI); ctx.fill();
          ctx.beginPath(); ctx.arc(rightEarC.x, rightEarC.y, earR, 0, 2 * Math.PI); ctx.fill();
          ctx.beginPath(); ctx.arc(faceC.x, faceC.y, faceR, 0, 2 * Math.PI); ctx.fill();

      } else if (type === 'maple') {
          ctx.moveTo(t(50, 2).x, t(50, 2).y);
          ctx.lineTo(t(60, 22).x, t(60, 22).y); ctx.lineTo(t(85, 18).x, t(85, 18).y);
          ctx.lineTo(t(72, 42).x, t(72, 42).y); ctx.lineTo(t(100, 45).x, t(100, 45).y);
          ctx.lineTo(t(78, 62).x, t(78, 62).y); ctx.lineTo(t(88, 85).x, t(88, 85).y);
          ctx.lineTo(t(58, 80).x, t(58, 80).y); ctx.lineTo(t(52, 98).x, t(52, 98).y);
          ctx.lineTo(t(48, 98).x, t(48, 98).y); ctx.lineTo(t(42, 80).x, t(42, 80).y);
          ctx.lineTo(t(12, 85).x, t(12, 85).y); ctx.lineTo(t(22, 62).x, t(22, 62).y);
          ctx.lineTo(t(0, 45).x, t(0, 45).y); ctx.lineTo(t(28, 42).x, t(28, 42).y);
          ctx.lineTo(t(15, 18).x, t(15, 18).y); ctx.lineTo(t(40, 22).x, t(40, 22).y);
          ctx.lineTo(t(50, 2).x, t(50, 2).y);
          ctx.fill();

      } else if (type === 'flower') {
          const cx = startX + 50 * scale; const cy = startY + 50 * scale;
          const petalR = 25 * scale; const spreadR = 25 * scale; 
          for(let i=0; i<5; i++) {
              ctx.beginPath();
              const angle = (Math.PI * 2 * i) / 5 - Math.PI/2;
              const px = cx + Math.cos(angle) * spreadR; const py = cy + Math.sin(angle) * spreadR;
              ctx.arc(px, py, petalR, 0, 2 * Math.PI);
              ctx.fill();
          }
          ctx.beginPath(); ctx.arc(cx, cy, 20*scale, 0, 2 * Math.PI); ctx.fill();

      } else if (type === 'cat') {
          const p1 = t(15, 5); 
          ctx.moveTo(p1.x, p1.y);
          ctx.lineTo(t(15, 50).x, t(15, 50).y); ctx.lineTo(t(50, 40).x, t(50, 40).y); 
          ctx.lineTo(t(85, 50).x, t(85, 50).y); ctx.lineTo(t(85, 5).x, t(85, 5).y); 
          const faceCx = t(50, 60).x; const faceCy = t(50, 60).y; const faceR = 38 * scale;
          ctx.moveTo(faceCx + faceR, faceCy); ctx.arc(faceCx, faceCy, faceR, 0, 2*Math.PI);
          ctx.fill();
      }
  },
  
  onShareAppMessage() { return { title: '朋友圈九宫格切图神器', path: '/pages/grid9/grid9', imageUrl: '/assets/share-cover.png' }; },
  onShareTimeline() { return { title: '朋友圈九宫格切图神器', imageUrl: '/assets/share-cover.png' }; }
});
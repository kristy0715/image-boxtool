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

    let c, r, txt, w_px, h_px;
    const baseSize = 600 * this._pixelRatio;

    if (type === 3) {
        c = 1; r = 3; txt = '竖长图 (全宽)';
        if (this._imgInfo) {
            const imgRatio = this._imgInfo.width / this._imgInfo.height;
            h_px = baseSize; w_px = baseSize * imgRatio;
        } else {
            w_px = 200 * this._pixelRatio; h_px = baseSize;
        }
    } else {
        switch(type) {
            case 9: c=3; r=3; txt='标准九宫格 (3x3)'; w_px=baseSize; h_px=baseSize; break;
            case 4: c=2; r=2; txt='四宫格 (2x2)'; w_px=baseSize; h_px=baseSize; break;
            case 6: c=3; r=2; txt='六宫格 (适合横版)'; w_px=baseSize; h_px=400 * this._pixelRatio; break; 
        }
    }
    
    this.resetLayout(type, c, r, txt, w_px, h_px);
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
      this.setData({
          x: this.data.initialX,
          y: this.data.initialY,
          scale: 1
      });
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

        let baseW = 1800;
        baseW = Math.ceil(baseW / cols) * cols;

        let canvasW, canvasH;
        const boxRatio = boxRect.width / boxRect.height;
        
        if (boxRatio >= 1) { 
            canvasW = baseW; 
            let tempH = baseW / boxRatio;
            canvasH = Math.ceil(tempH / rows) * rows;
        } else { 
            let baseH = 1800;
            baseH = Math.ceil(baseH / rows) * rows;
            canvasH = baseH;
            let tempW = baseH * boxRatio;
            canvasW = Math.ceil(tempW / cols) * cols;
        }

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

                    ctx.save();
                    if (this.data.maskType !== 'none') {
                        this.drawMaskPath(ctx, canvasW, canvasH, this.data.maskType);
                        ctx.clip(); 
                    }
                    
                    const drawX = (imgRect.left - boxRect.left) * mapScale;
                    const drawY = (imgRect.top - boxRect.top) * mapScale;
                    const drawW = imgRect.width * mapScale;
                    const drawH = imgRect.height * mapScale;
                    ctx.drawImage(img, drawX, drawY, drawW, drawH);
                    
                    ctx.restore();

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
                        
                        const x1 = Math.floor(c * canvasW / cols);
                        const x2 = Math.floor((c + 1) * canvasW / cols);
                        const w = x2 - x1;

                        const y1 = Math.floor(r * canvasH / rows);
                        const y2 = Math.floor((r + 1) * canvasH / rows);
                        const h = y2 - y1;
                        
                        const cellData = ctx.getImageData(x1, y1, w, h);
                        const cellCan = wx.createOffscreenCanvas({ type: '2d', width: w, height: h });
                        const cCtx = cellCan.getContext('2d');
                        cCtx.putImageData(cellData, 0, 0);
                        
                        this.setData({ loadingText: `保存中 ${index+1}/${total}` });
                        
                        const tempFilePath = await new Promise(resolve => {
                            wx.canvasToTempFilePath({
                                canvas: cellCan, fileType: 'jpg', quality: 0.9,
                                success: res => resolve(res.tempFilePath)
                            });
                        });
                        
                        wx.saveImageToPhotosAlbum({
                            filePath: tempFilePath,
                            success: () => {
                                setTimeout(() => saveLoop(index + 1), 200);
                            },
                            fail: (err) => {
                                if (err.errMsg && err.errMsg.includes('cancel')) {
                                    this.setData({ isProcessing: false });
                                    wx.showToast({ title: '已取消', icon: 'none' });
                                } else {
                                    saveLoop(index + 1);
                                }
                            }
                        });
                    };
                    
                    saveLoop(0);

                } catch (e) {
                    console.error(e);
                    this.setData({ isProcessing: false });
                    wx.showToast({ title: '处理出错', icon: 'none' });
                }
            };
            img.onerror = () => {
                this.setData({ isProcessing: false });
                wx.showToast({ title: '图片加载失败', icon: 'none' });
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
      const cx = w / 2;
      const cy = h / 2;
      const size = Math.min(w, h);
      
      if (type === 'circle') {
          ctx.arc(cx, cy, size * 0.49, 0, 2 * Math.PI);
      } else if (type === 'heart') {
          const r = size / 4.2; 
          const offsetY = r * 0.3; 
          ctx.moveTo(cx, cy - r + offsetY);
          ctx.bezierCurveTo(cx - r, cy - r * 2.8 + offsetY, cx - r * 3.5, cy - r * 0.5 + offsetY, cx, cy + r * 1.8 + offsetY);
          ctx.moveTo(cx, cy - r + offsetY);
          ctx.bezierCurveTo(cx + r, cy - r * 2.8 + offsetY, cx + r * 3.5, cy - r * 0.5 + offsetY, cx, cy + r * 1.8 + offsetY);
          ctx.beginPath();
          ctx.moveTo(cx, cy - r * 0.8 + offsetY);
          ctx.bezierCurveTo(cx - r, cy - r * 2.8 + offsetY, cx - r * 3.8, cy - r * 0.3 + offsetY, cx, cy + r * 1.8 + offsetY);
          ctx.bezierCurveTo(cx + r * 3.8, cy - r * 0.3 + offsetY, cx + r, cy - r * 2.8 + offsetY, cx, cy - r * 0.8 + offsetY);
      } else if (type === 'star') {
          // 五角星
          const R = size * 0.48;
          const r = R * 0.4;
          const rot = Math.PI / 2 * 3;
          const step = Math.PI / 5;
          let x = cx + Math.cos(rot) * R;
          let y = cy + Math.sin(rot) * R;
          ctx.moveTo(x, y);
          for (let i = 1; i < 11; i++) {
              const currentR = i % 2 === 0 ? R : r;
              x = cx + Math.cos(rot + i * step) * currentR;
              y = cy + Math.sin(rot + i * step) * currentR;
              ctx.lineTo(x, y);
          }
      } else if (type === 'bear') {
          // === 猫咪 (修正版：更小巧，防止切耳) ===
          // 整体缩小比例，从 0.36 -> 0.33
          const faceR = size * 0.33; 
          // 整体向下移，防止耳朵顶到边界
          const faceCy = cy + size * 0.05;
          
          const earOffset = faceR * 0.8;
          const earTopY = faceCy - faceR * 0.9 - earOffset * 0.8; // 耳尖Y坐标
          
          // 左耳 (更圆润的三角形)
          ctx.moveTo(cx - earOffset * 0.8, faceCy - faceR * 0.6);
          ctx.quadraticCurveTo(cx - earOffset * 1.2, earTopY, cx - earOffset * 0.2, faceCy - faceR * 0.9);
          
          // 右耳
          ctx.moveTo(cx + earOffset * 0.8, faceCy - faceR * 0.6);
          ctx.quadraticCurveTo(cx + earOffset * 1.2, earTopY, cx + earOffset * 0.2, faceCy - faceR * 0.9);
          
          // 脸
          ctx.moveTo(cx + faceR, faceCy);
          ctx.arc(cx, faceCy, faceR, 0, 2 * Math.PI);
      } else if (type === 'flower') {
          // === 花朵 (修正版：大幅缩小，防止爆框) ===
          // 缩小花瓣半径
          const petalR = size * 0.18; 
          const centerR = size * 0.15;
          const spreadR = petalR * 1.2; // 花瓣离中心的距离
          
          for(let i=0; i<5; i++) {
              const angle = (Math.PI * 2 * i) / 5 - Math.PI/2;
              const px = cx + Math.cos(angle) * spreadR;
              const py = cy + Math.sin(angle) * spreadR;
              ctx.moveTo(px + petalR, py);
              ctx.arc(px, py, petalR, 0, 2 * Math.PI);
          }
          ctx.moveTo(cx + centerR, cy);
          ctx.arc(cx, cy, centerR, 0, 2 * Math.PI);
      }
      ctx.closePath();
  },
  
  onShareAppMessage() { return { title: '朋友圈九宫格切图还可以带形状', path: '/pages/grid9/grid9' }; }
});
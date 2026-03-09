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
    
    const boxH = baseSize * (r / c);
    this.resetLayout(type, c, r, txt, baseSize, boxH);
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
        viewH = boxH; 
        viewW = boxH * ratio;
    } else {
        viewW = boxW; 
        viewH = boxW / ratio;
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

        let canvasW = 2400; 
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
                        // ⭐ 核心改变：我们已经在 drawMaskPath 内部接管了独立的 fill() 操作
                        this.drawMaskPath(mCtx, canvasW, canvasH, this.data.maskType);

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

  // ⭐ 终极大一统版切割坐标系：1比1严格复刻 CSS 坐标，彻底告别“重叠挖空”和“长得不像”Bug！
  drawMaskPath(ctx, w, h, type) {
      const size = Math.min(w, h);
      const scale = size / 100; // 严谨地与 CSS viewBox 的 0~100 完全贴合，抛弃旧版的微小偏移
      const startX = (w - size) / 2;
      const startY = (h - size) / 2;

      const t = (x, y) => ({
          x: startX + x * scale, 
          y: startY + y * scale
      });

      if (type === 'circle') {
          ctx.beginPath();
          ctx.arc(t(50, 50).x, t(50, 50).y, 49.5 * scale, 0, 2 * Math.PI);
          ctx.fill();
          
      } else if (type === 'heart') {
          ctx.beginPath();
          ctx.moveTo(t(50,30).x, t(50,30).y);
          ctx.bezierCurveTo(t(30,5).x, t(30,5).y, t(0,20).x, t(0,20).y, t(0,50).x, t(0,50).y);
          ctx.bezierCurveTo(t(0,75).x, t(0,75).y, t(45,90).x, t(45,90).y, t(50,95).x, t(50,95).y);
          ctx.bezierCurveTo(t(55,90).x, t(55,90).y, t(100,75).x, t(100,75).y, t(100,50).x, t(100,50).y);
          ctx.bezierCurveTo(t(100,20).x, t(100,20).y, t(70,5).x, t(70,5).y, t(50,30).x, t(50,30).y);
          ctx.fill();

      } else if (type === 'star') {
          ctx.beginPath();
          const pts = [[50,0],[63,38],[100,38],[70,60],[82,100],[50,75],[18,100],[30,60],[0,38],[37,38]];
          ctx.moveTo(t(pts[0][0], pts[0][1]).x, t(pts[0][0], pts[0][1]).y);
          for(let i=1; i<pts.length; i++) ctx.lineTo(t(pts[i][0], pts[i][1]).x, t(pts[i][0], pts[i][1]).y);
          ctx.closePath();
          ctx.fill();

      } else if (type === 'bear') {
          ctx.beginPath(); ctx.arc(t(20,20).x, t(20,20).y, 15*scale, 0, 2*Math.PI); ctx.fill();
          ctx.beginPath(); ctx.arc(t(80,20).x, t(80,20).y, 15*scale, 0, 2*Math.PI); ctx.fill();
          ctx.beginPath(); ctx.arc(t(50,55).x, t(50,55).y, 42*scale, 0, 2*Math.PI); ctx.fill();

      } else if (type === 'cat') {
          // 左耳、右耳、脸部分别独立 beginPath 和 fill，防止耳朵交界处被掏空缺口
          ctx.beginPath();
          ctx.moveTo(t(15,10).x, t(15,10).y); ctx.lineTo(t(35,40).x, t(35,40).y); ctx.lineTo(t(5,45).x, t(5,45).y); ctx.closePath(); 
          ctx.fill();
          
          ctx.beginPath();
          ctx.moveTo(t(85,10).x, t(85,10).y); ctx.lineTo(t(65,40).x, t(65,40).y); ctx.lineTo(t(95,45).x, t(95,45).y); ctx.closePath(); 
          ctx.fill();
          
          ctx.beginPath();
          const fc = t(50,55);
          if(ctx.ellipse) {
              ctx.ellipse(fc.x, fc.y, 45*scale, 38*scale, 0, 0, 2*Math.PI);
          } else {
              ctx.save(); ctx.translate(fc.x, fc.y); ctx.scale(1, 38/45); ctx.arc(0,0, 45*scale, 0, 2*Math.PI); ctx.restore();
          }
          ctx.fill();

      } else if (type === 'maple') {
          ctx.beginPath();
          const mPts = [[50,0],[62,25],[85,20],[72,42],[100,45],[78,62],[88,85],[58,80],[52,100],[48,100],[42,80],[12,85],[22,62],[0,45],[28,42],[15,20],[38,25]];
          ctx.moveTo(t(mPts[0][0], mPts[0][1]).x, t(mPts[0][0], mPts[0][1]).y);
          for(let i=1; i<mPts.length; i++) ctx.lineTo(t(mPts[i][0], mPts[i][1]).x, t(mPts[i][0], mPts[i][1]).y);
          ctx.closePath();
          ctx.fill();

      } else if (type === 'flower') {
          const circles = [[50,25,25], [74,42,25], [65,70,25], [35,70,25], [26,42,25], [50,50,18]];
          circles.forEach(c => {
              ctx.beginPath();
              ctx.arc(t(c[0], c[1]).x, t(c[0], c[1]).y, c[2]*scale, 0, 2*Math.PI);
              ctx.fill();
          });
      }
  },
  
 onShareAppMessage() {
  const imageUrl = this.data.imagePath || '/assets/share-cover.png';
  return {
    title: '朋友圈九宫格切图神器，心形拼图太好看了！',
    path: '/pages/grid9/grid9',
    imageUrl: imageUrl
  };
},

onShareTimeline() {
  const imageUrl = this.data.imagePath || '/assets/share-cover.png';
  return {
    title: '朋友圈九宫格切图神器，心形拼图太好看了！',
    query: '',
    imageUrl: imageUrl
  };
}
});
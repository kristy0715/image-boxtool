// pages/burst/burst.js
const app = getApp();
const Security = require('../../utils/security.js');

const TEST_MODE = false; 
const LAF_MATTING_URL = 'https://kvpoib63ld.sealosbja.site/idphoto-matting'; 

const AD_CONFIG = {
  BANNER_ID: 'adunit-ecfcec4c6a0c871b',
  VIDEO_ID: 'adunit-da175a2014d3443b'
};

const FREE_COUNT_DAILY = 2;
const BASE_HD_SIZE = 2400; 
// 🔥 新增：Canvas 最大安全尺寸 (防止 buffer exceed error)
const MAX_CANVAS_DIMENSION = 4096; 

Page({
  data: {
    bgPath: '',       
    mattePath: '',    
    editorSize: 300,  
    gapSize: 5,       
    fgX: 0, fgY: 0, fgScale: 1,
    isProcessing: false,
    loadingText: '处理中...',
    bannerUnitId: AD_CONFIG.BANNER_ID,
    
    // 格子替换数据
    gridOverrides: {}, 
    gridIndices: [0,1,2,3,4,5,6,7,8] 
  },

  _fgX: 0, _fgY: 0, _fgScale: 1,
  _adAction: null, _pendingPath: '', videoAd: null,

  onLoad() {
    this.initVideoAd();
    const sys = wx.getSystemInfoSync();
    const size = sys.windowWidth * 0.94;
    const offset = size * 2; 
    const fgW = size * 0.5;
    const initialPos = offset + (size - fgW) / 2;
    
    this.setData({ 
      editorSize: size,
      fgX: initialPos, fgY: initialPos
    });
    
    this._fgX = initialPos; this._fgY = initialPos; this._fgScale = 1;
  },

  resetEditor() {
    const size = this.data.editorSize;
    const offset = size * 2; 
    const fgW = size * 0.5;
    const initialPos = offset + (size - fgW) / 2;

    this.setData({
      gapSize: 5,
      fgX: initialPos, fgY: initialPos, fgScale: 1,
      gridOverrides: {}
    });

    this._fgX = initialPos; this._fgY = initialPos; this._fgScale = 1;
    wx.showToast({ title: '已还原', icon: 'none' });
  },

  initVideoAd() {
    if (wx.createRewardedVideoAd) {
      this.videoAd = wx.createRewardedVideoAd({ adUnitId: AD_CONFIG.VIDEO_ID });
      this.videoAd.onError((err) => console.error(err));
      this.videoAd.onClose((res) => {
        if (res && res.isEnded) {
          if (this._adAction === 'save') this.handleSaveUnlockSuccess();
          else if (this._adAction === 'matting') this.handleMattingUnlockSuccess();
        } else {
          wx.showToast({ title: '需完整观看才能解锁', icon: 'none' });
        }
        this._adAction = null; this._pendingPath = '';
      });
    }
  },
  onAdError(err) { console.log(err); },

  chooseBgImage() {
    wx.chooseMedia({
      count: 1, mediaType: ['image'], sizeType: ['original'],
      success: (res) => {
        const path = res.tempFiles[0].tempFilePath;
        Security.checkImage(path).then(isSafe => {
          if (isSafe) this.setData({ bgPath: path, gridOverrides: {} });
          else wx.showToast({ title: '图片不合规', icon: 'none' });
        }).catch(() => this.setData({ bgPath: path, gridOverrides: {} }));
      }
    });
  },

  chooseCellImage(e) {
    const index = e.currentTarget.dataset.index;
    wx.chooseMedia({
      count: 1, mediaType: ['image'], sizeType: ['original'],
      success: (res) => {
        const path = res.tempFiles[0].tempFilePath;
        const key = `gridOverrides.${index}`;
        this.setData({ [key]: path });
      }
    });
  },

  chooseFgImage() {
    wx.chooseMedia({
      count: 1, mediaType: ['image'], sizeType: ['original'],
      success: (res) => {
        const path = res.tempFiles[0].tempFilePath;
        wx.showModal({
          title: '图片处理方式',
          content: '是否需要 AI 智能抠图去除背景？\n(抠图功能需观看一次广告)',
          cancelText: '原图使用',
          cancelColor: '#666666',
          confirmText: 'AI抠图',
          confirmColor: '#6366f1',
          success: (modalRes) => {
            if (modalRes.confirm) this.triggerMattingAd(path);
            else this.setMatteImage(path);
          }
        });
      }
    });
  },

  triggerMattingAd(path) {
      this._adAction = 'matting';
      this._pendingPath = path;
      if (this.videoAd) this.videoAd.show().catch(() => this.startAiMatting(path));
      else this.startAiMatting(path);
  },

  handleMattingUnlockSuccess() {
      if (this._pendingPath) this.startAiMatting(this._pendingPath);
  },

  async startAiMatting(path) {
    if (TEST_MODE) {
      wx.showToast({ title: '测试模式', icon: 'none' });
      this.setMatteImage(path); return;
    }
    this.setData({ isProcessing: true, loadingText: '优化图片中...' });
    try {
      const imgInfo = await new Promise((r, j) => { wx.getImageInfo({ src: path, success: r, fail: j }); });
      const { width, height } = this.getOptimalSize(imgInfo.width, imgInfo.height);
      this.setData({ loadingText: 'AI 智能抠图中...' });
      let base64 = await this.getResizedImageBase64(path, width, height);
      base64 = base64.replace(/^data:image\/\w+;base64,/, '').replace(/[\r\n]/g, '');
      const res = await new Promise((r, j) => {
        wx.request({ url: LAF_MATTING_URL, method: 'POST', data: { base64: base64 }, success: r, fail: j });
      });
      const aiData = res.data;
      if (aiData && aiData.code === 0 && aiData.result_base64) {
        let mattedBase64 = aiData.result_base64;
        if (mattedBase64.startsWith('data:image')) mattedBase64 = mattedBase64.split('base64,')[1];
        mattedBase64 = mattedBase64.replace(/[\r\n\s]/g, "");
        const localPath = `${wx.env.USER_DATA_PATH}/burst_matted_${Date.now()}.png`;
        await new Promise((r, j) => {
          const fs = wx.getFileSystemManager();
          fs.writeFile({ filePath: localPath, data: wx.base64ToArrayBuffer(mattedBase64), encoding: 'binary', success: r, fail: j });
        });
        this.setMatteImage(localPath);
      } else { throw new Error(aiData?.msg || '抠图服务异常'); }
    } catch (err) {
      console.error(err);
      this.setData({ isProcessing: false });
      wx.showModal({ title: '处理失败', content: '是否使用原图继续？', success: (r) => { if (r.confirm) this.setMatteImage(path); } });
    }
  },

  getOptimalSize(w, h) {
    const MAX = 1500; let r = 1;
    if (w > MAX || h > MAX) r = Math.min(MAX / w, MAX / h);
    return { width: Math.round(w * r), height: Math.round(h * r) };
  },

  getResizedImageBase64(path, w, h) {
    return new Promise((r, j) => {
      const cvs = wx.createOffscreenCanvas({ type: '2d', width: w, height: h });
      const ctx = cvs.getContext('2d');
      const img = cvs.createImage();
      img.onload = () => {
        ctx.drawImage(img, 0, 0, w, h);
        wx.canvasToTempFilePath({ canvas: cvs, fileType: 'jpg', quality: 0.85, success: res => {
            wx.getFileSystemManager().readFile({ filePath: res.tempFilePath, encoding: 'base64', success: d => r(d.data), fail: j });
        }, fail: j });
      };
      img.onerror = j; img.src = path;
    });
  },
  
  setMatteImage(path) {
      const size = this.data.editorSize;
      const offset = size * 2; 
      const fgW = size * 0.5;
      const initialPos = offset + (size - fgW) / 2;
      this.setData({ mattePath: path, isProcessing: false, fgScale: 1, fgX: initialPos, fgY: initialPos });
      this._fgScale = 1; this._fgX = initialPos; this._fgY = initialPos;
  },

  onFgChange(e) { this._fgX = e.detail.x; this._fgY = e.detail.y; if(e.detail.scale) this._fgScale = e.detail.scale; },
  onFgScale(e) { this._fgScale = e.detail.scale; },
  onGapChange(e) { this.setData({ gapSize: e.detail.value }); },

  saveToAlbum() {
    if (!this.data.bgPath || !this.data.mattePath) return;
    this.checkQuotaAndSave();
  },

  checkQuotaAndSave() {
    const key = 'burst_usage_record';
    const today = new Date().toLocaleDateString();
    let record = wx.getStorageSync(key) || { date: today, count: 0, isUnlimited: false };
    if (record.date !== today) { record = { date: today, count: 0, isUnlimited: false }; wx.setStorageSync(key, record); }
    if (record.isUnlimited || record.count < FREE_COUNT_DAILY) {
      if(!record.isUnlimited) { record.count++; wx.setStorageSync(key, record); }
      this.realSaveAction();
    } else { this.triggerSaveAd(); }
  },

  triggerSaveAd() {
      wx.showModal({
          title: '次数不足', content: '观看视频解锁今日无限保存', 
          success: (res) => { if (res.confirm) { this._adAction = 'save'; if (this.videoAd) this.videoAd.show().catch(() => this.realSaveAction()); else this.realSaveAction(); } }
      });
  },

  handleSaveUnlockSuccess() {
      this.setDailyUnlimited();
      wx.showToast({ title: '已解锁', icon: 'success' });
      this.realSaveAction();
  },

  setDailyUnlimited() { wx.setStorageSync('burst_usage_record', { date: new Date().toLocaleDateString(), count: 999, isUnlimited: true }); },

  // === 🔥 修复版：限制最大分辨率，防止崩溃 ===
  realSaveAction() {
    this.setData({ isProcessing: true, loadingText: '正在合成...' });

    const pixelRatio = BASE_HD_SIZE / this.data.editorSize; 
    const offset = this.data.editorSize * 2; 

    const fgScreenX = (this._fgX || offset) - offset;
    const fgScreenY = (this._fgY || offset) - offset;
    const fgScale = (this._fgScale || 1);
    const baseFgW = this.data.editorSize * 0.5; 
    
    const canvas = wx.createOffscreenCanvas({ type: '2d', width: 100, height: 100 });
    const imgBg = canvas.createImage();
    const imgFg = canvas.createImage();
    
    const mainTasks = [
        new Promise((r, j) => { imgBg.onload = r; imgBg.onerror = j; }),
        new Promise((r, j) => { imgFg.onload = r; imgFg.onerror = j; })
    ];
    imgBg.src = this.data.bgPath;
    imgFg.src = this.data.mattePath;

    const overrides = this.data.gridOverrides;
    const overrideIndices = Object.keys(overrides);
    const overrideImages = {};
    const overrideTasks = overrideIndices.map(idx => {
        return new Promise((resolve) => {
            const img = canvas.createImage();
            img.onload = () => { overrideImages[idx] = img; resolve(); };
            img.onerror = resolve; 
            img.src = overrides[idx];
        });
    });

    Promise.all([...mainTasks, ...overrideTasks]).then(() => {
        // 1. 计算理论尺寸
        const fgRatio = imgFg.height / imgFg.width;
        const fgCanvasW = baseFgW * fgScale * pixelRatio;
        const fgCanvasH = fgCanvasW * fgRatio;
        const fgCanvasX = fgScreenX * pixelRatio;
        const fgCanvasY = fgScreenY * pixelRatio;

        const overflowLeft = Math.max(0, -fgCanvasX);
        const overflowRight = Math.max(0, (fgCanvasX + fgCanvasW) - BASE_HD_SIZE);
        const overflowTop = Math.max(0, -fgCanvasY);
        const overflowBottom = Math.max(0, (fgCanvasY + fgCanvasH) - BASE_HD_SIZE);

        const marginX = Math.max(overflowLeft, overflowRight);
        const marginY = Math.max(overflowTop, overflowBottom);

        let targetW = BASE_HD_SIZE + marginX * 2;
        let targetH = BASE_HD_SIZE + marginY * 2;

        // 🔥 2. 检查尺寸限制，计算缩放比
        let exportScale = 1;
        if (targetW > MAX_CANVAS_DIMENSION || targetH > MAX_CANVAS_DIMENSION) {
            const maxSide = Math.max(targetW, targetH);
            exportScale = MAX_CANVAS_DIMENSION / maxSide;
            // 提示用户
            console.warn(`Canvas尺寸过大(${targetW}x${targetH})，自动缩放 ${exportScale.toFixed(2)}倍`);
        }

        // 应用缩放后的物理尺寸
        const finalW = Math.floor(targetW * exportScale);
        const finalH = Math.floor(targetH * exportScale);

        const finalCanvas = wx.createOffscreenCanvas({ type: '2d', width: finalW, height: finalH });
        const ctx = finalCanvas.getContext('2d');
        
        // 🔥 3. 关键：设置全局缩放，后续绘图坐标不需要变，自动缩小
        ctx.scale(exportScale, exportScale);

        // 填充背景
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, targetW, targetH); // 注意这里填的是逻辑尺寸，scale会自动处理

        const offsetX = marginX;
        const offsetY = marginY;

        // Layer 1: 底图
        const bgRatio = imgBg.width / imgBg.height;
        let sWidth, sHeight, sX, sY;
        if (bgRatio > 1) {
            sHeight = imgBg.height; sWidth = sHeight; sX = (imgBg.width - sWidth) / 2; sY = 0;
        } else {
            sWidth = imgBg.width; sHeight = sWidth; sX = 0; sY = (imgBg.height - sHeight) / 2;
        }
        ctx.drawImage(imgBg, sX, sY, sWidth, sHeight, offsetX, offsetY, BASE_HD_SIZE, BASE_HD_SIZE);

        // Layer 2: 替换格子
        const cellW = BASE_HD_SIZE / 3;
        const cellH = BASE_HD_SIZE / 3;
        overrideIndices.forEach(idx => {
            const img = overrideImages[idx];
            if (img) {
                const row = Math.floor(idx / 3);
                const col = idx % 3;
                const drawX = offsetX + col * cellW;
                const drawY = offsetY + row * cellH;
                const r = img.width / img.height;
                const tr = cellW / cellH;
                let sw, sh, sx, sy;
                if (r > tr) { sh = img.height; sw = sh * tr; sx = (img.width - sw)/2; sy = 0; }
                else { sw = img.width; sh = sw / tr; sx = 0; sy = (img.height - sh)/2; }
                ctx.drawImage(img, sx, sy, sw, sh, drawX, drawY, cellW, cellH);
            }
        });

        // Layer 3: 网格线
        const gap = this.data.gapSize * pixelRatio;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(offsetX, offsetY + cellH - gap/2, BASE_HD_SIZE, gap);
        ctx.fillRect(offsetX, offsetY + cellH * 2 - gap/2, BASE_HD_SIZE, gap);
        ctx.fillRect(offsetX + cellW - gap/2, offsetY, gap, BASE_HD_SIZE);
        ctx.fillRect(offsetX + cellW * 2 - gap/2, offsetY, gap, BASE_HD_SIZE);

        // Layer 4: 人物
        ctx.drawImage(imgFg, offsetX + fgCanvasX, offsetY + fgCanvasY, fgCanvasW, fgCanvasH);

        // 导出
        wx.canvasToTempFilePath({
            canvas: finalCanvas, fileType: 'jpg', quality: 0.9,
            success: (res) => {
                this.setData({ isProcessing: false });
                this.saveImageAndJump(res.tempFilePath);
            },
            fail: (err) => {
                console.error(err);
                this.setData({ isProcessing: false });
                wx.showToast({ title: '导出失败', icon: 'none' });
            }
        });

    }).catch(err => {
        console.error(err);
        this.setData({ isProcessing: false });
        wx.showToast({ title: '加载失败', icon: 'none' });
    });
  },

  saveImageAndJump(filePath) {
      wx.saveImageToPhotosAlbum({
          filePath: filePath,
          success: () => {
              setTimeout(() => {
                  wx.navigateTo({
                      url: `/pages/success/success?path=${encodeURIComponent(filePath)}`,
                      fail: () => wx.showToast({ title: '已保存', icon: 'success' })
                  });
              }, 500);
          },
          fail: (err) => {
              this.setData({ isProcessing: false });
              if (err.errMsg && err.errMsg.indexOf('auth') > -1) {
                  wx.showModal({ title: '提示', content: '需开启相册权限', success: r => r.confirm && wx.openSetting() });
              } else {
                  wx.navigateTo({ url: `/pages/success/success?path=${encodeURIComponent(filePath)}` });
              }
          }
      });
  },

  // === 分享配置 ===
  onShareAppMessage() {
    // 3D特效没有中间结果图变量，优先用底图(bgPath)展示，或者默认封面
    const imageUrl = this.data.bgPath || '/assets/share-cover.png';
    return {
      title: '朋友圈3D冲出九宫格特效，这也太酷了吧！',
      path: '/pages/burst/burst',
      imageUrl: imageUrl
    };
  },

  onShareTimeline() {
    const imageUrl = this.data.bgPath || '/assets/share-cover.png';
    return {
      title: '快看！我做了一个3D冲出九宫格特效，超震撼！',
      query: '',
      imageUrl: imageUrl
    };
  }
});
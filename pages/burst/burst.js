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
const MAX_CANVAS_DIMENSION = 4096; 

Page({
  data: {
    bgPath: '',       
    mattePath: '',    
    editorSize: 300,  
    gapSize: 5,       
    
    // 前景拖拽
    fgX: 0, fgY: 0, fgScale: 1,
    // 底图拖拽
    bgX: 0, bgY: 0, bgScale: 1, bgImgW: 0, bgImgH: 0, initialBgX: 0, initialBgY: 0,

    isProcessing: false,
    loadingText: '处理中...',
    bannerUnitId: AD_CONFIG.BANNER_ID,
    
    gridOverrides: {}, 
    gridIndices: [0,1,2,3,4,5,6,7,8] 
  },

  _fgX: 0, _fgY: 0, _fgScale: 1,
  _bgX: undefined, _bgY: undefined, _bgScale: 1,
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
      bgX: this.data.initialBgX, bgY: this.data.initialBgY, bgScale: 1,
      gridOverrides: {}
    });

    this._fgX = initialPos; this._fgY = initialPos; this._fgScale = 1;
    this._bgX = this.data.initialBgX; this._bgY = this.data.initialBgY; this._bgScale = 1;
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
          if (isSafe) this.initBg(path);
          else wx.showToast({ title: '图片不合规', icon: 'none' });
        }).catch(() => this.initBg(path));
      }
    });
  },

  // 初始化底图
  initBg(path) {
      wx.showLoading({ title: '加载中...' });
      wx.getImageInfo({
          src: path,
          success: (info) => {
              const ratio = info.width / info.height;
              const boxSize = this.data.editorSize;
              let viewW, viewH;
              if (ratio > 1) { 
                  viewH = boxSize; viewW = boxSize * ratio; 
              } else { 
                  viewW = boxSize; viewH = boxSize / ratio; 
              }
              const cx = (boxSize - viewW) / 2;
              const cy = (boxSize - viewH) / 2;

              this.setData({ 
                  bgPath: path, gridOverrides: {},
                  bgImgW: viewW, bgImgH: viewH,
                  initialBgX: cx, initialBgY: cy, bgScale: 1
              }, () => {
                  setTimeout(() => {
                      this.setData({ bgX: cx, bgY: cy });
                      this._bgX = cx; this._bgY = cy; this._bgScale = 1;
                      wx.hideLoading();
                  }, 50);
              });
          },
          fail: () => { wx.hideLoading(); wx.showToast({ title: '加载失败', icon: 'none'}); }
      });
  },

  // 精确计算点击了哪个格子
  onEditorTap(e) {
      if (!this.data.bgPath) return;
      const query = wx.createSelectorQuery();
      query.select('.bg-container').boundingClientRect();
      query.exec((res) => {
          if (!res || !res[0]) return;
          const rect = res[0];
          const clickX = e.touches[0].clientX - rect.left;
          const clickY = e.touches[0].clientY - rect.top;
          const cellW = rect.width / 3;
          const cellH = rect.height / 3;
          const col = Math.floor(clickX / cellW);
          const row = Math.floor(clickY / cellH);
          const index = row * 3 + col;
          if (index >= 0 && index <= 8) {
              this.chooseCellImageByIndex(index);
          }
      });
  },

  chooseCellImageByIndex(index) {
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

  onBgChange(e) { this._bgX = e.detail.x; this._bgY = e.detail.y; },
  onBgScale(e) { this._bgScale = e.detail.scale; },

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

  // 🌟 终极渲染算法
  realSaveAction() {
    this.setData({ isProcessing: true, loadingText: '正在合成高清大图...' });

    // 利用原生选择器获取真实的物理排版边界，彻底消灭偏移量计算失误！
    const query = wx.createSelectorQuery();
    query.select('.editor-frame').boundingClientRect();
    query.select('.bg-img-view').boundingClientRect();
    if (this.data.mattePath) query.select('.fg-view').boundingClientRect();
    
    query.exec((res) => {
        if (!res || !res[0] || !res[1]) {
            this.setData({ isProcessing: false });
            wx.showToast({ title: '画面提取失败', icon: 'none' }); return;
        }

        const frameRect = res[0];
        const bgRect = res[1];
        const fgRect = this.data.mattePath ? res[2] : null;

        const pixelRatio = BASE_HD_SIZE / frameRect.width;

        // 🌟 核心修复1：严格计算并集包围盒
        let minX = 0, minY = 0, maxX = BASE_HD_SIZE, maxY = BASE_HD_SIZE;
        let fgDrawX = 0, fgDrawY = 0, fgDrawW = 0, fgDrawH = 0;

        if (fgRect) {
            fgDrawX = (fgRect.left - frameRect.left) * pixelRatio;
            fgDrawY = (fgRect.top - frameRect.top) * pixelRatio;
            fgDrawW = fgRect.width * pixelRatio;
            fgDrawH = fgRect.height * pixelRatio;

            minX = Math.min(0, fgDrawX);
            minY = Math.min(0, fgDrawY);
            maxX = Math.max(BASE_HD_SIZE, fgDrawX + fgDrawW);
            maxY = Math.max(BASE_HD_SIZE, fgDrawY + fgDrawH);
        }

        const targetW = maxX - minX;
        const targetH = maxY - minY;
        
        // 算出九宫格本身相对于新画布应该偏移的距离
        const offsetX = -minX;
        const offsetY = -minY;

        let exportScale = 1;
        if (targetW > MAX_CANVAS_DIMENSION || targetH > MAX_CANVAS_DIMENSION) {
            exportScale = MAX_CANVAS_DIMENSION / Math.max(targetW, targetH);
        }

        const finalW = Math.floor(targetW * exportScale);
        const finalH = Math.floor(targetH * exportScale);

        const finalCanvas = wx.createOffscreenCanvas({ type: '2d', width: finalW, height: finalH });
        const ctx = finalCanvas.getContext('2d');
        
        ctx.scale(exportScale, exportScale);
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';

        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, targetW, targetH); 

        const imgBg = finalCanvas.createImage();
        const imgFg = finalCanvas.createImage();
        
        const mainTasks = [
            new Promise(r => { imgBg.onload = r; imgBg.onerror = r; imgBg.src = this.data.bgPath; }),
            new Promise(r => { imgFg.onload = r; imgFg.onerror = r; imgFg.src = this.data.mattePath; })
        ];

        const overrides = this.data.gridOverrides;
        const overrideIndices = Object.keys(overrides);
        const overrideImages = {};
        const overrideTasks = overrideIndices.map(idx => {
            return new Promise((resolve) => {
                const img = finalCanvas.createImage();
                img.onload = () => { overrideImages[idx] = img; resolve(); };
                img.onerror = resolve; 
                img.src = overrides[idx];
            });
        });

        Promise.all([...mainTasks, ...overrideTasks]).then(() => {
            
            // 🌟 核心修复2：死死裁剪住背景区域，防止溢出污染白线！
            const bgDrawX = (bgRect.left - frameRect.left) * pixelRatio;
            const bgDrawY = (bgRect.top - frameRect.top) * pixelRatio;
            const bgDrawW = bgRect.width * pixelRatio;
            const bgDrawH = bgRect.height * pixelRatio;

            ctx.save();
            ctx.beginPath();
            ctx.rect(offsetX, offsetY, BASE_HD_SIZE, BASE_HD_SIZE);
            ctx.clip(); // 这一行是解决“格子被拉长错觉”的关键！

            ctx.drawImage(imgBg, offsetX + bgDrawX, offsetY + bgDrawY, bgDrawW, bgDrawH);

            // 绘制独立替换的格子
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
            ctx.restore(); // 释放裁剪区

            // 绘制永远完整的九宫格白线
            const gap = this.data.gapSize * pixelRatio;
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(offsetX, offsetY + cellH - gap/2, BASE_HD_SIZE, gap);
            ctx.fillRect(offsetX, offsetY + cellH * 2 - gap/2, BASE_HD_SIZE, gap);
            ctx.fillRect(offsetX + cellW - gap/2, offsetY, gap, BASE_HD_SIZE);
            ctx.fillRect(offsetX + cellW * 2 - gap/2, offsetY, gap, BASE_HD_SIZE);

            // 最后画悬浮人物
            if (fgRect) {
                ctx.drawImage(imgFg, offsetX + fgDrawX, offsetY + fgDrawY, fgDrawW, fgDrawH);
            }

            // 极清导出
            wx.canvasToTempFilePath({
                canvas: finalCanvas, fileType: 'jpg', quality: 1.0,
                destWidth: finalW, destHeight: finalH,
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

  onShareAppMessage() {
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
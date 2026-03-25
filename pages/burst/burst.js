// pages/burst/burst.js
const app = getApp();
const Security = require('../../utils/security.js');

const TEST_MODE = false; 
const SERVER_MATTING_URL = 'https://goodgoodstudy-nb.top/api/v1/wx-proxy/remove-bg'; 
const APP_TAG = 'default_app'; 

const AD_CONFIG = {
  BANNER_ID: 'adunit-ecfcec4c6a0c871b',
  VIDEO_ID: 'adunit-da175a2014d3443b',
  INTERSTITIAL_ID: 'adunit-a9556a7e617c27b7' 
};

const QUOTA_CONFIG = {
  SAVE_FREE: 2,    
  SAVE_REWARD: 5   
};

const BASE_HD_SIZE = 2400; 
const MAX_CANVAS_DIMENSION = 4096; 

Page({
  data: {
    bgPath: '',       
    mattePath: '',    
    editorSize: 300,  
    gapSize: 5,       
    
    fgX: 0, fgY: 0, fgScale: 1,
    bgX: 0, bgY: 0, bgScale: 1, bgImgW: 0, bgImgH: 0, initialBgX: 0, initialBgY: 0,

    isProcessing: false,
    loadingText: '处理中...',
    bannerUnitId: AD_CONFIG.BANNER_ID,
    
    gridOverrides: {}, 
    gridIndices: [0,1,2,3,4,5,6,7,8] 
  },

  _fgX: 0, _fgY: 0, _fgScale: 1,
  _bgX: undefined, _bgY: undefined, _bgScale: 1,
  videoAd: null, 
  interstitialAd: null, 

  onLoad() {
    this.initAds();
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

  initAds() {
    if (wx.createRewardedVideoAd) {
      this.videoAd = wx.createRewardedVideoAd({ adUnitId: AD_CONFIG.VIDEO_ID });
      this.videoAd.onError((err) => console.error(err));
      this.videoAd.onClose((res) => {
        if (res && res.isEnded) {
          this.handleSaveUnlockSuccess();
        } else {
          wx.showToast({ title: '需完整观看才能解锁', icon: 'none' });
        }
      });
    }
    if (wx.createInterstitialAd) {
      this.interstitialAd = wx.createInterstitialAd({ adUnitId: AD_CONFIG.INTERSTITIAL_ID });
      this.interstitialAd.onLoad(() => console.log('插屏已准备就绪'));
    }
  },

  getQuota(key) {
    const today = new Date().toLocaleDateString();
    let r = wx.getStorageSync(key) || { date: today, count: 0, extra: 0 };
    if (r.date !== today) r = { date: today, count: 0, extra: 0 };
    return r;
  },

  updateQuota(key, val) { 
    wx.setStorageSync(key, val); 
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
      count: 1, mediaType: ['image'], sizeType: ['compressed'],
      success: (res) => {
        const path = res.tempFiles[0].tempFilePath;
        wx.showModal({
          title: '图片处理方式',
          content: '是否需要 AI 智能抠图去除背景？',
          cancelText: '原图使用',
          cancelColor: '#666666',
          confirmText: 'AI抠图',
          confirmColor: '#6366f1',
          success: (modalRes) => {
            if (modalRes.confirm) this.startAiMatting(path); 
            else this.setMatteImage(path);
          }
        });
      }
    });
  },

  isUrl(str) {
    if (!str) return false;
    let s = String(str).replace(/\\/g, "");
    if (s.length < 2000) return true; 
    if (s.startsWith('http') || s.includes('://') || s.startsWith('//')) return true;
    return false;
  },

  cleanBase64(str) {
    if (!str) return '';
    let clean = String(str);
    if (clean.includes(',')) clean = clean.split(',').pop();
    try { clean = decodeURIComponent(clean); } catch(e) {}
    clean = clean.replace(/[^a-zA-Z0-9+/]/g, ""); 
    const remainder = clean.length % 4;
    if (remainder > 0) clean += '='.repeat(4 - remainder);
    return clean;
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

      const res = await new Promise((resolve, reject) => {
        wx.request({ 
          url: SERVER_MATTING_URL, 
          method: 'POST', 
          data: { image: base64, app_tag: APP_TAG }, 
          success: resolve, 
          fail: reject 
        });
      });

      const aiData = res.data;
      if (aiData && aiData.code === 200 && aiData.data && aiData.data.image) {
        
        let currentImgData = aiData.data.image;
        const localPath = `${wx.env.USER_DATA_PATH}/burst_matted_${Date.now()}.png`;

        if (this.isUrl(currentImgData)) {
          let fixedUrl = String(currentImgData).replace(/\\/g, "");
          if (!fixedUrl.startsWith('http') && !fixedUrl.startsWith('//')) {
            if (fixedUrl.startsWith('/')) fixedUrl = 'https://goodgoodstudy-nb.top' + fixedUrl;
            else fixedUrl = 'https://' + fixedUrl;
          }
          if (fixedUrl.startsWith('//')) fixedUrl = 'https:' + fixedUrl;

          await new Promise((resolve, reject) => {
            wx.downloadFile({
              url: fixedUrl,
              filePath: localPath, 
              success: (dlRes) => {
                if (dlRes.statusCode === 200) resolve();
                else reject(new Error('云端图片下载失败'));
              },
              fail: (err) => {
                console.error("Download Error:", err);
                reject(new Error('云端图片请求被拦截，请检查网络配置'));
              }
            });
          });

        } else {
          let finalBase64 = this.cleanBase64(currentImgData);
          if (!finalBase64 || finalBase64.length < 100) throw new Error('解析图片数据异常');
          try {
            wx.getFileSystemManager().writeFileSync(localPath, finalBase64, 'base64');
          } catch (writeErr) {
            let buffer = wx.base64ToArrayBuffer(finalBase64);
            wx.getFileSystemManager().writeFileSync(localPath, buffer, 'binary');
          }
        }

        this.setMatteImage(localPath);
        
        if (this.interstitialAd) {
          this.interstitialAd.show().catch(e => console.warn('插屏展示失败:', e));
        }

      } else { 
        throw new Error(aiData?.msg || '抠图服务异常'); 
      }
    } catch (err) {
      console.error(err);
      this.setData({ isProcessing: false });
      wx.showModal({ 
        title: '处理失败', 
        content: (err.message || '网络或接口异常') + '\n\n是否直接使用原图继续制作？', 
        success: (r) => { if (r.confirm) this.setMatteImage(path); } 
      });
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

  tuneFgMove(e) {
    const dir = e.currentTarget.dataset.dir;
    let step = 0.5; 
    let x = this._fgX !== undefined ? this._fgX : this.data.fgX;
    let y = this._fgY !== undefined ? this._fgY : this.data.fgY;

    if (dir === 'up') y -= step;
    if (dir === 'down') y += step;
    if (dir === 'left') x -= step;
    if (dir === 'right') x += step;

    this._fgX = x; this._fgY = y;
    this.setData({ fgX: x, fgY: y });
  },

  saveToAlbum() {
    if (!this.data.bgPath || !this.data.mattePath) return;
    this.checkQuotaAndSave();
  },

  checkQuotaAndSave() {
    const save = this.getQuota('burst_save_quota');
    if (save.count >= (QUOTA_CONFIG.SAVE_FREE + save.extra)) {
      this.triggerSaveAd();
    } else {
      this.realSaveAction();
    }
  },

  triggerSaveAd() {
      wx.showModal({
          title: '免费保存次数已用完', 
          content: `观看一段视频，即可解锁 ${QUOTA_CONFIG.SAVE_REWARD} 次保存机会！`, 
          confirmText: '看视频',
          confirmColor: '#6366f1',
          success: (res) => { 
            if (res.confirm && this.videoAd) {
                this.videoAd.show().catch(() => {}); 
            } 
          }
      });
  },

  handleSaveUnlockSuccess() {
      const s = this.getQuota('burst_save_quota'); 
      s.extra += QUOTA_CONFIG.SAVE_REWARD; 
      this.updateQuota('burst_save_quota', s); 
      wx.showToast({ title: `成功解锁 ${QUOTA_CONFIG.SAVE_REWARD} 次机会`, icon: 'success' }); 
      setTimeout(() => { this.realSaveAction(); }, 800); 
  },

  realSaveAction() {
    this.setData({ isProcessing: true, loadingText: '正在生成高清大图...' });

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

        // ================= 🌟 核心算法修复：只让左右对称，拒绝无脑加白边 =================
        // 为了保证朋友圈九宫格的物理重心在中间，仅强行对齐 X 轴（左右扩展量一致）
        let maxPadX = Math.max(0 - minX, maxX - BASE_HD_SIZE);
        minX = -maxPadX;
        maxX = BASE_HD_SIZE + maxPadX;

        // Y 轴（上下）保留最真实的截断边界！头和脚不再强制加出多余的白边，防止图片变得很小！
        // ====================================================================

        const targetW = maxX - minX;
        const targetH = maxY - minY;
        
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
            
            const bgDrawX = (bgRect.left - frameRect.left) * pixelRatio;
            const bgDrawY = (bgRect.top - frameRect.top) * pixelRatio;
            const bgDrawW = bgRect.width * pixelRatio;
            const bgDrawH = bgRect.height * pixelRatio;

            ctx.save();
            ctx.beginPath();
            ctx.rect(offsetX, offsetY, BASE_HD_SIZE, BASE_HD_SIZE);
            ctx.clip(); 

            ctx.drawImage(imgBg, offsetX + bgDrawX, offsetY + bgDrawY, bgDrawW, bgDrawH);

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
            ctx.restore(); 

            const gap = this.data.gapSize * pixelRatio;
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(offsetX, offsetY + cellH - gap/2, BASE_HD_SIZE, gap);
            ctx.fillRect(offsetX, offsetY + cellH * 2 - gap/2, BASE_HD_SIZE, gap);
            ctx.fillRect(offsetX + cellW - gap/2, offsetY, gap, BASE_HD_SIZE);
            ctx.fillRect(offsetX + cellW * 2 - gap/2, offsetY, gap, BASE_HD_SIZE);

            if (fgRect) {
                ctx.drawImage(imgFg, offsetX + fgDrawX, offsetY + fgDrawY, fgDrawW, fgDrawH);
            }

            // 🌟 导出为【一张】完美中心对齐的完整大图
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

  // 🌟 真实存相册成功后，才扣除配额
  saveImageAndJump(filePath) {
      wx.saveImageToPhotosAlbum({
          filePath: filePath,
          success: () => {
              const save = this.getQuota('burst_save_quota');
              save.count++;
              this.updateQuota('burst_save_quota', save);

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
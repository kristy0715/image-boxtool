const Security = require('../../utils/security.js');

const AD_CONFIG = {
  BANNER_ID: 'adunit-ecfcec4c6a0c871b',       
  VIDEO_ID: 'adunit-da175a2014d3443b'         
};

const QUOTA_CONFIG = {
  SAVE_FREE: 2,    
  SAVE_REWARD: 5 
};

Page({
  data: {
    imagePath: '',
    canvasWidth: 300,
    canvasHeight: 300,
    isProcessing: false,
    isProcessed: false,
    showingOriginal: false,
    processingText: '处理中...',
    progress: 0, 
    
    bannerUnitId: AD_CONFIG.BANNER_ID,
    
    // 🌟 核心保留：仅留下纯正的 Canvas 调色参数
    brightness: 0, 
    contrast: 0, 
    saturation: 0, 
    temperature: 0
  },

  videoAd: null,
  pureOriginalImageData: null, 

  onLoad() {
    this.initVideoAd();
  },

  initVideoAd() {
    if (wx.createRewardedVideoAd) {
      this.videoAd = wx.createRewardedVideoAd({ adUnitId: AD_CONFIG.VIDEO_ID });
      this.videoAd.onClose((res) => {
        if (res && res.isEnded) {
          this.grantSaveQuota(); 
        } else {
          wx.showToast({ title: '需看完视频才能解锁保存哦', icon: 'none' });
        }
      });
    }
  },

  getQuota(key) {
    const today = new Date().toLocaleDateString();
    let r = wx.getStorageSync(key) || { date: today, count: 0, extra: 0 };
    if (r.date !== today) r = { date: today, count: 0, extra: 0 };
    return r;
  },

  updateQuota(key, val) { wx.setStorageSync(key, val); },

  saveImage() {
    if(!this.data.resultPath) return;
    
    const save = this.getQuota('retouch_save_quota_v2'); // 加个后缀重置今天的老配额
    if (save.count >= (QUOTA_CONFIG.SAVE_FREE + save.extra)) {
      this.showAdModal(); 
      return;
    }
    
    this.doSave();
  },

  showAdModal() {
    wx.showModal({ 
      title: '免费保存次数已用完', 
      content: `观看一段视频，即可解锁 ${QUOTA_CONFIG.SAVE_REWARD} 次保存机会！`, 
      confirmText: '看视频', 
      confirmColor: '#6366f1',
      success: (res) => { 
        if (res.confirm && this.videoAd) {
          this.videoAd.show().catch(() => { this.doSave(); }); 
        } 
      } 
    });
  },

  grantSaveQuota() {
    const s = this.getQuota('retouch_save_quota_v2');
    s.extra += QUOTA_CONFIG.SAVE_REWARD;
    this.updateQuota('retouch_save_quota_v2', s);
    wx.showToast({ title: `成功解锁 ${QUOTA_CONFIG.SAVE_REWARD} 次机会 🎉`, icon: 'none' });
    setTimeout(() => { this.doSave(); }, 800);
  },

  initCanvas(callback) {
    const query = wx.createSelectorQuery();
    query.select('#retouchCanvas')
      .fields({ node: true, size: true })
      .exec((res) => {
        if (res[0]) {
          this.canvas = res[0].node;
          this.ctx = this.canvas.getContext('2d');
          if (callback) callback();
        } else {
          setTimeout(() => { this.initCanvas(callback); }, 50);
        }
      });
  },

  chooseImage() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      success: (res) => {
        const path = res.tempFiles[0].tempFilePath;
        wx.showLoading({ title: '安全检测中...' });

        Security.checkImage(path).then((isSafe) => {
          wx.hideLoading();
          if (isSafe) {
            this.pureOriginalImageData = null; 
            this.setData({ 
              imagePath: path,
              isProcessed: false,
              progress: 0,
              brightness: 0, contrast: 0, saturation: 0, temperature: 0
            }, () => {
                this.loadImage(path);
            });
          } else {
            wx.showToast({ title: '图片未通过安全检测', icon: 'none' });
          }
        }).catch(err => {
            wx.hideLoading();
            console.error('检测异常', err);
        });
      }
    });
  },

  loadImage(path) {
    wx.showLoading({ title: '加载中...' });
    
    wx.getImageInfo({
      src: path,
      success: (info) => {
        const sys = wx.getSystemInfoSync();
        const maxWidth = sys.windowWidth - 60; 
        const maxHeight = 800; 
        
        let w = info.width;
        let h = info.height;
        const ratio = w / h;

        if (w > maxWidth || h > maxHeight) {
            if (maxWidth / maxHeight > ratio) {
                h = maxHeight; w = h * ratio;
            } else {
                w = maxWidth; h = w / ratio;
            }
        }

        this.originalPath = path;

        this.setData({ canvasWidth: w, canvasHeight: h }, () => {
            this.initCanvas(() => {
                this.drawOriginal(w, h);
            });
        });
      },
      fail: () => {
        wx.hideLoading();
        wx.showToast({ title: '图片加载失败', icon: 'none' });
      }
    });
  },

  drawOriginal(w, h) {
    if (!this.canvas) return;

    const dpr = wx.getSystemInfoSync().pixelRatio;
    this.canvas.width = w * dpr;
    this.canvas.height = h * dpr;
    this.ctx.scale(dpr, dpr);

    const img = this.canvas.createImage();
    img.onload = () => {
      this.ctx.drawImage(img, 0, 0, w, h);
      this.originalImageData = this.ctx.getImageData(0, 0, w * dpr, h * dpr);
      wx.hideLoading();
    };
    img.src = this.originalPath;
  },

  autoRetouch() {
    this.setData({ 
        isProcessing: true, 
        processingText: 'AI 引擎重绘中...',
        progress: 0,
        brightness: 0, contrast: 0, saturation: 0, temperature: 0
    });
    
    const fs = wx.getFileSystemManager();
    const base64Str = fs.readFileSync(this.originalPath, 'base64');

    wx.request({
      url: 'https://goodgoodstudy-nb.top/api/v1/wx-proxy/hd-fix',
      method: 'POST',
      header: { 'Content-Type': 'application/json' },
      data: { 
        app_tag: 'default_app', 
        image: base64Str 
      },
      success: (res) => {
        if (res.data && res.data.code === 200) {
          const aiBase64 = res.data.data.image.replace(/^data:image\/\w+;base64,/, "");
          const aiPath = `${wx.env.USER_DATA_PATH}/ai_retouch_${Date.now()}.jpg`;

          fs.writeFileSync(aiPath, aiBase64, 'base64');

          // 备份纯正原图
          if (!this.pureOriginalImageData) {
              this.pureOriginalImageData = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
          }

          const img = this.canvas.createImage();
          img.onload = () => {
              this.ctx.drawImage(img, 0, 0, this.canvas.width / wx.getSystemInfoSync().pixelRatio, this.canvas.height / wx.getSystemInfoSync().pixelRatio);
              
              this.originalImageData = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
              this.processedImageData = this.originalImageData;

              wx.canvasToTempFilePath({
                  canvas: this.canvas,
                  fileType: 'jpg',
                  quality: 0.95,
                  success: (resTemp) => {
                      this.setData({
                          resultPath: resTemp.tempFilePath,
                          isProcessing: false,
                          isProcessed: true
                      });
                  }
              });
          };
          img.src = aiPath;
        } else {
          this.setData({ isProcessing: false });
          wx.showToast({ title: res.data.msg || 'AI 处理失败', icon: 'none' });
        }
      },
      fail: () => {
        this.setData({ isProcessing: false });
        wx.showToast({ title: '网络异常，请重试', icon: 'none' });
      }
    });
  },

  // === 色彩微调滑动交互 ===
  onParamChange(e) {
    const key = e.currentTarget.dataset.param;
    this.setData({ [key]: e.detail.value });
    this.debounceApply();
  },

  debounceApply() {
      if(this.timer) clearTimeout(this.timer);
      this.timer = setTimeout(() => {
          this.setData({ isProcessing: true, processingText: '渲染中...', progress: 0 });
          setTimeout(() => this.applyEffects(), 50);
      }, 300);
  },

  applyEffects() {
      if(!this.originalImageData || !this.ctx) return;
      
      const width = this.canvas.width;
      const height = this.canvas.height;
      const oldData = this.originalImageData.data;
      const newData = new Uint8ClampedArray(oldData);
      
      const brightness = this.data.brightness; 
      const contrast = (this.data.contrast + 100) / 100;
      const contrastSq = contrast * contrast;
      const saturation = this.data.saturation;
      const temp = this.data.temperature;
      
      const totalPixels = newData.length;
      const chunkSize = 40000; 
      let currentIdx = 0;

      const processChunk = () => {
          const endIdx = Math.min(currentIdx + chunkSize, totalPixels);
          
          for (let i = currentIdx; i < endIdx; i += 4) {
              let r = newData[i];
              let g = newData[i+1];
              let b = newData[i+2];

              if (brightness !== 0) { r += brightness; g += brightness; b += brightness; }
              if (contrast !== 1) {
                  r = (r - 128) * contrastSq + 128;
                  g = (g - 128) * contrastSq + 128;
                  b = (b - 128) * contrastSq + 128;
              }
              if (saturation !== 0) {
                  const gray = 0.2989 * r + 0.5870 * g + 0.1140 * b;
                  r = gray + (r - gray) * (1 + saturation / 100);
                  g = gray + (g - gray) * (1 + saturation / 100);
                  b = gray + (b - gray) * (1 + saturation / 100);
              }
              if (temp !== 0) { r += temp; b -= temp; }

              newData[i] = Math.min(255, Math.max(0, r));
              newData[i+1] = Math.min(255, Math.max(0, g));
              newData[i+2] = Math.min(255, Math.max(0, b));
          }

          currentIdx = endIdx;
          const progress = Math.floor((currentIdx / totalPixels) * 100);
          if (progress % 10 === 0 || progress === 100) this.setData({ progress });

          if (currentIdx < totalPixels) {
              this.processTimer = setTimeout(processChunk, 10);
          } else {
              this.finishProcessing(newData, width, height);
          }
      };

      processChunk();
  },

  finishProcessing(data, width, height) {
      const imgDataObj = this.ctx.createImageData(width, height);
      imgDataObj.data.set(data);
      this.ctx.putImageData(imgDataObj, 0, 0);
      
      this.processedImageData = imgDataObj;
      
      wx.canvasToTempFilePath({
          canvas: this.canvas,
          fileType: 'jpg',
          quality: 0.85,
          success: (res) => {
              this.setData({ 
                  resultPath: res.tempFilePath,
                  isProcessing: false,
                  isProcessed: true
              });
          }
      });
  },

  // 长按对比回看原图
  onPreviewTouchStart() {
      if(this.data.isProcessed) {
          this.setData({ showingOriginal: true });
          const orig = this.pureOriginalImageData || this.originalImageData;
          if (orig) this.ctx.putImageData(orig, 0, 0);
      }
  },

  onPreviewTouchEnd() {
      if(this.data.isProcessed && this.processedImageData) {
          this.setData({ showingOriginal: false });
          this.ctx.putImageData(this.processedImageData, 0, 0);
      }
  },

  resetAll() {
      if (this.processTimer) clearTimeout(this.processTimer);
      
      this.setData({ 
          isProcessed: false,
          isProcessing: false,
          brightness: 0, contrast: 0, saturation: 0, temperature: 0,
          progress: 0
      });

      if (this.pureOriginalImageData && this.ctx) {
          this.originalImageData = this.pureOriginalImageData;
          this.pureOriginalImageData = null;
      }
      
      if (this.originalImageData && this.ctx) {
          this.ctx.putImageData(this.originalImageData, 0, 0);
      }
  },

  doSave() {
    wx.getSetting({
        success: (res) => {
          if (res.authSetting['scope.writePhotosAlbum']) {
            this.executeSave();
          } else if (res.authSetting['scope.writePhotosAlbum'] === false) {
            wx.showModal({
              title: '提示', content: '需要授权保存图片',
              success: (m) => { if (m.confirm) wx.openSetting(); }
            });
          } else {
            wx.authorize({
              scope: 'scope.writePhotosAlbum',
              success: () => this.executeSave(),
              fail: () => wx.showToast({ title: '授权失败', icon: 'none' })
            });
          }
        }
    });
  },

  executeSave() {
    wx.showLoading({ title: '保存中...' });
    wx.saveImageToPhotosAlbum({
        filePath: this.data.resultPath,
        success: () => {
            wx.hideLoading();
            
            const record = this.getQuota('retouch_save_quota_v2');
            record.count++;
            this.updateQuota('retouch_save_quota_v2', record);

            wx.navigateTo({
                url: `/pages/success/success?type=image&path=${encodeURIComponent(this.data.resultPath)}`
            });
        },
        fail: (err) => {
            wx.hideLoading();
            if (err.errMsg.indexOf('cancel') === -1) {
                wx.showToast({ title: '保存失败', icon: 'none' });
            }
        }
    });
  },

  onShareAppMessage() {
    const imageUrl = this.data.resultPath || '/assets/share-cover.png';
    return { title: '一键人像精修，智能美颜磨皮！', path: '/pages/retouch/retouch', imageUrl: imageUrl };
  },

  onShareTimeline() {
    const imageUrl = this.data.resultPath || '/assets/share-cover.png';
    return { title: '一键人像精修，智能美颜磨皮！', query: '', imageUrl: imageUrl };
  }
});
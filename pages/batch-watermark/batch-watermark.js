const SERVER_CONFIG = {
  MANUAL_URL: 'https://goodgoodstudy-nb.top/api/v1/wx-proxy/remove-watermark',
  AUTO_URL:   'https://goodgoodstudy-nb.top/api/v1/wx-proxy/watermark-remove-auto',
  APP_TAG:    'default_app'
};

const AD_CONFIG = {
  BANNER_ID:       'adunit-ecfcec4c6a0c871b',
  VIDEO_ID:        'adunit-da175a2014d3443b',
  INTERSTITIAL_ID: 'adunit-a9556a7e617c27b7'
};

const QUOTA_CONFIG = {
  SAVE_FREE:  1,                       // 每日免费保存次数
  QUOTA_KEY: 'batchrmwm_save_quota'    // 本地存储 key
};

Page({
  data: {
    modeList: [
      { id: 'bottomBand', name: '去底部水印条(推荐)', hot: true },
      { id: 'manual',      name: '手动(水印位置相同)', hot: true },
      { id: 'bottomRight', name: '去右下角水印', hot: true },
      { id: 'topRight',    name: '去右上角水印' },
      { id: 'bottomLeft',  name: '去左下角水印' },
      { id: 'topLeft',     name: '去左上角水印' },
      { id: 'topBand',     name: '去顶部水印条' },
      { id: 'text',        name: '去全图文字水印' },
    ],
    currentMode: 'bottomBand',

    imageList: [],
    activeImgIdx: 0,

    isMoveMode: false,
    moveX: 0, moveY: 0, moveScale: 1, displayScale: '1.0',
    canvasWidth: 300, canvasHeight: 400, brushSize: 30,

    bannerUnitId: AD_CONFIG.BANNER_ID,
    isProcessing: false,
    loadingText: '初始化...',
    loadingSubText: '即将分配算力',
    progressPercent: 0
  },

  canvas: null, ctx: null, maskCanvas: null, maskCtx: null, originalImage: null,
  dpr: 1, videoAd: null, interstitialAd: null, history: [],
  _currentScale: 1,

  onLoad() {
    this.dpr = wx.getSystemInfoSync().pixelRatio;
    this.history = [];
    this.initAds();
  },

  initAds() {
    // 激励视频广告：完整观看后解锁本次保存
    if (wx.createRewardedVideoAd) {
      this.videoAd = wx.createRewardedVideoAd({ adUnitId: AD_CONFIG.VIDEO_ID });
      this.videoAd.onClose((res) => {
        if (res && res.isEnded) {
          wx.showToast({ title: '解锁成功！', icon: 'success' });
          setTimeout(() => this.executePipeline(), 500);
        } else {
          wx.showModal({
            title: '提示',
            content: '完整观看广告才能解锁本次保存哦',
            confirmText: '继续观看',
            success: (m) => { if (m.confirm) this.videoAd.show(); }
          });
        }
      });
      this.videoAd.onError((err) => console.log('激励视频加载失败', err));
    }

    // 插屏广告：处理完成后展示
    if (wx.createInterstitialAd) {
      this.interstitialAd = wx.createInterstitialAd({ adUnitId: AD_CONFIG.INTERSTITIAL_ID });
      this.interstitialAd.onLoad(() => console.log('插屏广告已就绪'));
    }
  },

  // ---------- 配额工具 ----------
  getQuota(key) {
    const today = new Date().toLocaleDateString();
    let r = wx.getStorageSync(key) || { date: today, count: 0 };
    if (r.date !== today) r = { date: today, count: 0 };
    return r;
  },
  updateQuota(key, val) { wx.setStorageSync(key, val); },

  switchMode(e) {
    const mode = e.currentTarget.dataset.id;
    this.setData({ currentMode: mode });
    if (mode === 'manual' && this.data.imageList.length > 0) {
      setTimeout(() => this.initCanvas(this.data.imageList[this.data.activeImgIdx]), 100);
    }
  },

  addImages() {
    const len = this.data.imageList.length;
    if (len >= 3) return wx.showToast({ title: '最多只能选3张', icon: 'none' });
    wx.chooseMedia({
      count: 3 - len, mediaType: ['image'], sizeType: ['compressed'],
      success: (res) => {
        const newPaths = res.tempFiles.map(f => f.tempFilePath);
        const newList = [...this.data.imageList, ...newPaths];
        const shouldInitCanvas = len === 0;
        this.setData({ imageList: newList, activeImgIdx: 0 });
        if (shouldInitCanvas && this.data.currentMode === 'manual') {
          this.initCanvas(newList[0]);
        }
      }
    });
  },

  removeImage(e) {
    const idx = e.currentTarget.dataset.index;
    let list = [...this.data.imageList];
    list.splice(idx, 1);
    if (list.length === 0) {
      this.setData({ imageList: [], activeImgIdx: 0 });
      this.clearMask();
      return;
    }
    let newActiveIdx = this.data.activeImgIdx;
    if (idx === newActiveIdx) {
      newActiveIdx = 0;
      this.setData({ imageList: list, activeImgIdx: newActiveIdx });
      this.clearMask();
      if (this.data.currentMode === 'manual') this.initCanvas(list[0]);
    } else {
      if (idx < newActiveIdx) newActiveIdx--;
      this.setData({ imageList: list, activeImgIdx: newActiveIdx });
    }
  },

  selectActiveImage(e) {
    const idx = e.currentTarget.dataset.index;
    if (idx === this.data.activeImgIdx) return;
    this.setData({ activeImgIdx: idx });
    this.clearMask();
    wx.showToast({ title: '已切换参照底图', icon: 'none' });
    if (this.data.currentMode === 'manual') {
      this.initCanvas(this.data.imageList[idx]);
    }
  },

  onBrushChange(e) { this.setData({ brushSize: e.detail.value }); },

  resetMoveState(extraData = {}) {
    const targetState = { moveScale: 1, displayScale: '1.0', moveX: 0, moveY: 0, ...extraData };
    if (this._currentScale !== 1) {
      this.setData({ moveScale: 0.999 });
      setTimeout(() => { this.setData(targetState); }, 30);
    } else {
      this.setData(targetState);
    }
    this._currentScale = 1;
  },

  initCanvas(path) {
    this.history = [];
    this.resetMoveState({ isMoveMode: false });
    wx.getImageInfo({
      src: path,
      success: (info) => {
        const sys = wx.getSystemInfoSync();
        const p = 60, mW = sys.windowWidth - p, mH = sys.windowHeight * 0.55;
        let dW, dH;
        const r = info.width / info.height;
        if (r > mW / mH) { dW = mW; dH = mW / r; } else { dH = mH; dW = mH * r; }
        this.setData({ canvasWidth: dW, canvasHeight: dH });
        setTimeout(() => {
          const q = wx.createSelectorQuery();
          q.select('#editCanvas').fields({ node: true, size: true }).exec((res) => {
            if (!res[0] || !res[0].node) return;
            const node = res[0].node;
            this.canvas = node; this.ctx = node.getContext('2d');
            const w = Math.round(dW * this.dpr), h = Math.round(dH * this.dpr);
            this.canvas.width = w; this.canvas.height = h;
            this.ctx.scale(this.dpr, this.dpr);
            this.maskCanvas = wx.createOffscreenCanvas({ type: '2d', width: w, height: h });
            this.maskCtx = this.maskCanvas.getContext('2d');
            this.originalImage = node.createImage();
            this.originalImage.onload = () => { this.drawCanvas(); };
            this.originalImage.src = path;
          });
        }, 300);
      }
    });
  },

  drawCanvas() {
    if (!this.ctx || !this.originalImage) return;
    const w = this.canvas.width / this.dpr, h = this.canvas.height / this.dpr;
    this.ctx.clearRect(0, 0, w, h);
    this.ctx.drawImage(this.originalImage, 0, 0, w, h);
    this.ctx.save();
    this.ctx.globalAlpha = 0.6;
    this.ctx.drawImage(this.maskCanvas, 0, 0, this.maskCanvas.width, this.maskCanvas.height, 0, 0, w, h);
    this.ctx.restore();
  },

  toggleMoveMode(e) {
    const isMove = e.currentTarget.dataset.move === 'true';
    this.setData({ isMoveMode: isMove });
  },

  onScaleChange(e) {
    this._currentScale = e.detail.scale;
    this.setData({ displayScale: Number(e.detail.scale).toFixed(1) });
  },

  onTouchStart(e) {
    if (this.data.isMoveMode || !this.ctx) return;
    this.isDrawing = true;
    const scale = this._currentScale || 1;
    this.lastX = e.touches[0].x / scale;
    this.lastY = e.touches[0].y / scale;
    this.saveHistory();
    this.drawMaskLine(this.lastX, this.lastY, this.lastX, this.lastY);
  },

  onTouchMove(e) {
    if (this.data.isMoveMode || !this.isDrawing) return;
    const scale = this._currentScale || 1;
    const x = e.touches[0].x / scale, y = e.touches[0].y / scale;
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
    this.resetMoveState();
  },

  batchProcess() {
    if (this.data.imageList.length === 0) return wx.showToast({ title: '请先添加图片', icon: 'none' });
    if (this.data.currentMode === 'manual' && (!this.history || this.history.length === 0)) {
      return wx.showToast({ title: '请在图片上涂抹要去除的水印', icon: 'none' });
    }

    const quota = this.getQuota(QUOTA_CONFIG.QUOTA_KEY);

    if (quota.count < QUOTA_CONFIG.SAVE_FREE) {
      // 每日首次免费
      quota.count++;
      this.updateQuota(QUOTA_CONFIG.QUOTA_KEY, quota);
      this.executePipeline();
    } else {
      // 免费次数已用完，需看激励视频
      if (this.videoAd) {
        wx.showModal({
          title: '今日免费次数已用完',
          content: '观看一段完整视频广告，即可解锁本次保存机会。',
          confirmText: '看广告',
          confirmColor: '#6366f1',
          success: (res) => {
            if (res.confirm) {
              this.videoAd.show().catch(() => {
                wx.showToast({ title: '广告加载失败，免费为您放行', icon: 'none' });
                this.executePipeline();
              });
            }
          }
        });
      } else {
        // 设备不支持广告时免费放行
        this.executePipeline();
      }
    }
  },

  // ================= 🌟 批量执行核心队列 =================
  async executePipeline() {
    this.setData({ isProcessing: true, progressPercent: 5, loadingText: '准备就绪', loadingSubText: '正在生成遮罩参数...' });

    let maskBase64 = "";
    // 只有手动涂抹模式才需要前端生成 Mask，其余模式后端自动处理
    if (this.data.currentMode === 'manual') {
      maskBase64 = await this.exportMaskBase64('manual');
      if (!maskBase64) return this.abortProcess('遮罩生成失败，请重试');
    }

    const total = this.data.imageList.length;
    let successCount = 0;
    let targetSuccessPath = '';

    for (let i = 0; i < total; i++) {
      this.setData({
        loadingText: `处理中 (${i + 1}/${total})`,
        loadingSubText: '引擎修复中，请勿退出小程序',
        progressPercent: 10 + (i / total) * 90
      });
      try {
        const imgB64 = await this.readFileBase64(this.data.imageList[i]);
        const resB64 = await this.callApi(imgB64, maskBase64, this.data.currentMode);
        const tmpPath = await this.saveTempFile(resB64);
        if (i === this.data.activeImgIdx) { targetSuccessPath = tmpPath; }
        await this.saveToAlbum(tmpPath, i !== this.data.activeImgIdx);
        successCount++;
      } catch (e) {
        console.error('单张处理失败', e);
      }
    }

    this.setData({ isProcessing: false, progressPercent: 100 });
    if (successCount > 0) {
      // 处理完成后展示插屏广告
      if (this.interstitialAd) {
        this.interstitialAd.show().catch(err => console.warn('插屏广告展示失败', err));
      }
      wx.showToast({ title: '全部保存成功', icon: 'success' });
      setTimeout(() => wx.navigateTo({ url: `/pages/success/success?path=${encodeURIComponent(targetSuccessPath)}` }), 800);
    } else {
      wx.showModal({ title: '处理中断', content: '可能图片结构过于复杂或无效遮罩，请重试', showCancel: false });
    }
  },

  saveToAlbum(p, shouldUnlink) {
    return new Promise((r) => {
      wx.saveImageToPhotosAlbum({
        filePath: p, success: r, fail: r,
        complete: () => {
          if (shouldUnlink) wx.getFileSystemManager().unlink({ filePath: p, success: () => {} });
        }
      });
    });
  },

  // ================= 🌟 Mask 生成：仅手动涂抹模式 =================
  exportMaskBase64(mode) {
    return new Promise((resolve) => {
      if (mode !== 'manual') return resolve("");
      if (!this.maskCanvas) return resolve("");
      const w = this.maskCanvas.width, h = this.maskCanvas.height;
      const tmpC = wx.createOffscreenCanvas({ type: '2d', width: w, height: h });
      const ctx = tmpC.getContext('2d');
      // 将蓝色笔迹 → 白色，背景 → 黑色
      ctx.drawImage(this.maskCanvas, 0, 0, w, h);
      ctx.globalCompositeOperation = 'source-in';
      ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = 'destination-over';
      ctx.fillStyle = '#000000'; ctx.fillRect(0, 0, w, h);
      wx.canvasToTempFilePath({
        canvas: tmpC, fileType: 'jpg', quality: 1,
        success: r => this.readFileBase64(r.tempFilePath).then(resolve).catch(() => resolve("")),
        fail: () => resolve("")
      });
    });
  },

  readFileBase64(path) {
    return new Promise((r, j) => wx.getFileSystemManager().readFile({
      filePath: path, encoding: 'base64', success: res => r(res.data), fail: j
    }));
  },

  // ================= 🌟 接口调用：统一模式映射 =================
  callApi(imgBase64, maskBase64, wmType) {
    // 前端模式 ID → 后端 mode 参数映射
    const autoModeMap = {
      text:        'full_text',
      topLeft:     'top_left',
      topRight:    'top_right',
      bottomLeft:  'bottom_left',
      bottomRight: 'bottom_right',
      bottomBand:  'bottom_band',
      topBand:     'top_band',
      leftBand:    'left_band',
      rightBand:   'right_band',
    };

    const parseResp = (resolve, reject, r) => {
      let d = r.data;
      if (typeof d === 'string') { try { d = JSON.parse(d); } catch (e) {} }
      if (r.statusCode === 200 && d && d.code === 200) {
        resolve(d.data?.image || d.image);
      } else {
        reject(d?.msg || d?.detail || '处理失败');
      }
    };

    return new Promise((resolve, reject) => {
      const backendMode = autoModeMap[wmType];

      if (backendMode) {
        // 文字水印 / 四角水印：后端自动生成 Mask
        wx.request({
          url: SERVER_CONFIG.AUTO_URL,
          method: 'POST',
          header: { 'Content-Type': 'application/json' },
          timeout: 120000,
          data: { app_tag: SERVER_CONFIG.APP_TAG, image: imgBase64, mode: backendMode },
          success: r => parseResp(resolve, reject, r),
          fail: () => reject('网络请求超时')
        });
      } else {
        // 手动涂抹：前端提供 Mask
        wx.request({
          url: SERVER_CONFIG.MANUAL_URL,
          method: 'POST',
          header: { 'Content-Type': 'application/json' },
          timeout: 90000,
          data: { app_tag: SERVER_CONFIG.APP_TAG, image: imgBase64, mask: maskBase64, mode: 'ai', wm_type: wmType },
          success: r => parseResp(resolve, reject, r),
          fail: () => reject('网络请求超时')
        });
      }
    });
  },

  saveTempFile(b64) {
    return new Promise((r, j) => {
      const p = `${wx.env.USER_DATA_PATH}/b_res_${Date.now()}.jpg`;
      wx.getFileSystemManager().writeFile({
        filePath: p,
        data: b64.replace(/^data:image\/\w+;base64,/, ''),
        encoding: 'base64', success: () => r(p), fail: j
      });
    });
  },

  abortProcess(msg) { this.setData({ isProcessing: false }); wx.showToast({ title: msg, icon: 'none' }); },
  onShareAppMessage() { return { title: '太好用了！批量消除图文水印神器', path: '/pages/batchrmwm/batchrmwm' }; },
  onShareTimeline() { return { title: '太好用了！批量消除图文水印神器', query: '' }; }
});

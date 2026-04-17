// pages/meme/meme.js
const Security = require('../../utils/security.js');
const Audit = require('../../utils/audit.js'); 

// === 1. 广告配置 ===
const AD_CONFIG = {
  BANNER_ID: 'adunit-ecfcec4c6a0c871b',       // Banner 广告 ID
  VIDEO_ID: 'adunit-da175a2014d3443b'         // 激励视频广告 ID
};

// === 2. 策略配置 ===
const FREE_COUNT_DAILY = 2; // 每天免费保存 2 次

Page({
  data: {
    isAllowed: false, // 🔥 审核隔离锁
    canvasWidth: 300,
    canvasHeight: 300,
    imagePath: '',
    
    textList: [], 
    currentTextId: null,
    currentText: null,

    colorList: ['#ffffff', '#000000', '#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#6366f1'],
    
    // 广告数据
    bannerUnitId: AD_CONFIG.BANNER_ID,

    touchState: {
      type: null, 
      startX: 0,
      startY: 0,
      centerX: 0,
      centerY: 0,
      startAngle: 0,
      initialItemAngle: 0
    }
  },

  videoAd: null, // 广告实例

  onLoad() {
    // 🌟 修复：使用标准的 checkAccess() 拦截
    Audit.checkAccess().then(isAllowed => {
      if (!isAllowed) return; // 命中黑名单会被 audit.js 直接踢走
      
      this.setData({ isAllowed: true });
      this.initCanvas();
      this.initVideoAd();
    });
  },

  initCanvas() {
    const sys = wx.getSystemInfoSync();
    // 限制画布最大宽度，留出 padding
    const width = sys.windowWidth - 30;
    this.setData({
      canvasWidth: width,
      canvasHeight: width
    });

    const query = wx.createSelectorQuery();
    query.select('#memeCanvas')
      .fields({ node: true, size: true })
      .exec((res) => {
        if (!res[0]) return;
        const canvas = res[0].node;
        const ctx = canvas.getContext('2d');

        const dpr = sys.pixelRatio;
        canvas.width = res[0].width * dpr;
        canvas.height = res[0].height * dpr;
        ctx.scale(dpr, dpr);

        this.canvas = canvas;
        this.ctx = ctx;
        this.dpr = dpr;
      });
  },

  // === 广告与配额逻辑 ===
  initVideoAd() {
    if (wx.createRewardedVideoAd) {
      this.videoAd = wx.createRewardedVideoAd({ adUnitId: AD_CONFIG.VIDEO_ID });
      this.videoAd.onClose((res) => {
        if (res && res.isEnded) {
          this.setDailyUnlimited();
          this.realSaveProcess();
        }
      });
    }
  },

  setDailyUnlimited() {
    const today = new Date().toLocaleDateString();
    wx.setStorageSync('meme_usage_record', {
      date: today,
      count: 999,
      isUnlimited: true
    });
  },

  checkQuotaAndSave() {
    const today = new Date().toLocaleDateString();
    const key = 'meme_usage_record';
    let record = wx.getStorageSync(key) || { date: today, count: 0, isUnlimited: false };

    if (record.date !== today) {
      record = { date: today, count: 0, isUnlimited: false };
      wx.setStorageSync(key, record);
    }

    if (record.isUnlimited || record.count < FREE_COUNT_DAILY) {
      if (!record.isUnlimited) {
        record.count++;
        wx.setStorageSync(key, record);
      }
      this.realSaveProcess();
    } else {
      this.showAdModal();
    }
  },

  showAdModal() {
    if (this.videoAd) {
      wx.showModal({
        title: '免费次数已用完',
        content: '观看视频即可解锁今日无限次保存权限',
        confirmText: '去观看',
        success: (res) => {
          if (res.confirm) {
            this.videoAd.show().catch(() => {
              wx.showToast({ title: '广告拉取失败，请重试', icon: 'none' });
            });
          }
        }
      });
    } else {
      this.realSaveProcess();
    }
  },

  // === 交互与编辑逻辑 ===
  chooseImage() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      success: (res) => {
        this.setData({
          imagePath: res.tempFiles[0].tempFilePath,
          textList: [] 
        });
        this.addText(); 
      }
    });
  },

  addText() {
    const id = Date.now();
    const newItem = {
      id: id,
      text: '点击输入文字',
      x: this.data.canvasWidth / 2,
      top: this.data.canvasHeight / 2,
      size: 30,
      color: '#ffffff',
      angle: 0,
      stroke: true,
      strokeColor: '#000000'
    };
    
    const newList = [...this.data.textList, newItem];
    this.setData({
      textList: newList,
      currentTextId: id,
      currentText: newItem
    });
  },

  selectText(e) {
    const id = e.currentTarget.dataset.id;
    const text = this.data.textList.find(t => t.id === id);
    this.setData({
      currentTextId: id,
      currentText: text
    });
  },

  onTextInput(e) {
    const val = e.detail.value;
    const list = this.data.textList.map(t => {
      if (t.id === this.data.currentTextId) {
        t.text = val;
      }
      return t;
    });
    this.setData({
      textList: list,
      'currentText.text': val
    });
  },

  onSizeChange(e) {
    const val = e.detail.value;
    const list = this.data.textList.map(t => {
      if (t.id === this.data.currentTextId) {
        t.size = val;
      }
      return t;
    });
    this.setData({
      textList: list,
      'currentText.size': val
    });
  },

  selectColor(e) {
    const color = e.currentTarget.dataset.color;
    const list = this.data.textList.map(t => {
      if (t.id === this.data.currentTextId) {
        t.color = color;
      }
      return t;
    });
    this.setData({
      textList: list,
      'currentText.color': color
    });
  },

  onStrokeChange(e) {
    const val = e.detail.value;
    const list = this.data.textList.map(t => {
      if (t.id === this.data.currentTextId) {
        t.stroke = val;
      }
      return t;
    });
    this.setData({
      textList: list,
      'currentText.stroke': val
    });
  },

  removeText() {
    const list = this.data.textList.filter(t => t.id !== this.data.currentTextId);
    this.setData({
      textList: list,
      currentTextId: null,
      currentText: null
    });
  },

  // === 手势逻辑 ===
  onTouchStart(e) {
    if (!this.data.currentTextId) return;
    const touch = e.touches[0];
    const item = this.data.currentText;
    
    this.setData({
      'touchState.startX': touch.clientX,
      'touchState.startY': touch.clientY,
      'touchState.centerX': item.x,
      'touchState.centerY': item.top
    });
  },

  onTouchMove(e) {
    if (!this.data.currentTextId) return;
    const touch = e.touches[0];
    const { startX, startY, centerX, centerY } = this.data.touchState;
    
    const dx = touch.clientX - startX;
    const dy = touch.clientY - startY;

    const list = this.data.textList.map(t => {
      if (t.id === this.data.currentTextId) {
        t.x = centerX + dx;
        t.top = centerY + dy;
      }
      return t;
    });

    this.setData({ textList: list });
  },

  // === 保存逻辑 ===
  saveMeme() {
    if (!this.canvas) return;
    this.checkQuotaAndSave();
  },

  realSaveProcess() {
    wx.showLoading({ title: '保存中...' });
    const ctx = this.ctx;
    
    // 1. 绘制底图
    const img = this.canvas.createImage();
    img.onload = () => {
      ctx.clearRect(0, 0, this.data.canvasWidth, this.data.canvasHeight);
      ctx.drawImage(img, 0, 0, this.data.canvasWidth, this.data.canvasHeight);

      // 2. 绘制文字
      this.data.textList.forEach(item => {
        ctx.save();
        ctx.translate(item.x, item.top);
        ctx.rotate(item.angle * Math.PI / 180);
        ctx.font = `${item.size}px Arial`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        
        if (item.stroke) {
          ctx.strokeStyle = item.strokeColor;
          ctx.lineWidth = 4;
          ctx.strokeText(item.text, 0, 0);
        }
        
        ctx.fillStyle = item.color;
        ctx.fillText(item.text, 0, 0);
        ctx.restore();
      });

      // 3. 生成图片
      setTimeout(() => {
        wx.canvasToTempFilePath({
          canvas: this.canvas,
          fileType: 'jpg',
          quality: 0.9,
          success: (res) => {
            wx.saveImageToPhotosAlbum({
              filePath: res.tempFilePath,
              success: () => {
                wx.hideLoading();
                wx.navigateTo({
                  url: `/pages/success/success?path=${encodeURIComponent(res.tempFilePath)}`
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
          fail: () => {
            wx.hideLoading();
            wx.showToast({ title: '生成失败', icon: 'none' });
          }
        });
      }, 200);
    };
    img.src = this.data.imagePath;
  },

  onShareAppMessage() {
    const imageUrl = this.data.imagePath || '/assets/share-cover.png';
    return {
      title: 'DIY专属表情包，斗图从此没输过！',
      path: '/pages/meme/meme',
      imageUrl: imageUrl
    };
  },

  onShareTimeline() {
    return {
      title: '快来制作你的专属斗图表情包吧！'
    };
  }
});
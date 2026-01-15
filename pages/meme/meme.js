// pages/meme/meme.js
const Security = require('../../utils/security.js');

// === 1. 广告配置 ===
const AD_CONFIG = {
  BANNER_ID: 'adunit-ecfcec4c6a0c871b',       // Banner 广告 ID
  VIDEO_ID: 'adunit-da175a2014d3443b'         // 激励视频广告 ID
};

// === 2. 策略配置 ===
const FREE_COUNT_DAILY = 2; // 每天免费保存 2 次

Page({
  data: {
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
    this.initCanvas();
    this.initVideoAd();
  },

  initCanvas() {
    const sys = wx.getSystemInfoSync();
    const width = sys.windowWidth - 40; 
    this.setData({
      canvasWidth: width,
      canvasHeight: width 
    });
  },

  // === 3. 初始化激励视频 ===
  initVideoAd() {
    if (wx.createRewardedVideoAd) {
      this.videoAd = wx.createRewardedVideoAd({ adUnitId: AD_CONFIG.VIDEO_ID });
      this.videoAd.onLoad(() => console.log('激励视频加载成功'));
      this.videoAd.onError((err) => console.error('激励视频加载失败', err));
      
      this.videoAd.onClose((res) => {
        // 用户点击了【关闭广告】按钮
        if (res && res.isEnded) {
          // A. 完整观看：解锁权益并保存
          this.setDailyUnlimited();
          wx.showToast({ title: '已解锁今日无限次', icon: 'success' });
          this.startSaveProcess(); 
        } else {
          // B. 中途退出：提示
          wx.showModal({
            title: '提示',
            content: '需要完整观看视频才能解锁今日无限次保存权限哦',
            confirmText: '继续观看',
            success: (m) => {
              if (m.confirm) this.videoAd.show();
            }
          });
        }
      });
    }
  },

  // === 4. 额度检查逻辑 (核心) ===
  checkQuotaAndSave() {
    const today = new Date().toLocaleDateString();
    const storageKey = 'meme_usage_record'; // 独立 Key
    let record = wx.getStorageSync(storageKey) || { date: today, count: 0, isUnlimited: false };

    // 跨天重置
    if (record.date !== today) {
      record = { date: today, count: 0, isUnlimited: false };
      wx.setStorageSync(storageKey, record);
    }

    // 情况A: 已解锁 -> 直接保存
    if (record.isUnlimited) {
      this.startSaveProcess();
      return;
    }

    // 情况B: 有免费次数 -> 扣除并保存
    if (record.count < FREE_COUNT_DAILY) {
      record.count++;
      wx.setStorageSync(storageKey, record);
      
      const left = FREE_COUNT_DAILY - record.count;
      if (left > 0) {
        wx.showToast({ title: `今日剩余免费${left}次`, icon: 'none' });
      }
      this.startSaveProcess();
      return;
    }

    // 情况C: 次数用尽 -> 弹广告
    this.showAdModal();
  },

  setDailyUnlimited() {
    const today = new Date().toLocaleDateString();
    const storageKey = 'meme_usage_record';
    const record = { date: today, count: 999, isUnlimited: true };
    wx.setStorageSync(storageKey, record);
  },

  showAdModal() {
    if (this.videoAd) {
      wx.showModal({
        title: '免费次数已用完',
        content: '观看一次视频，即可解锁【今日无限次】免费保存权限',
        confirmText: '免费解锁',
        cancelText: '取消',
        success: (res) => {
          if (res.confirm) {
            this.videoAd.show().catch(() => {
              // 广告加载失败，兜底允许保存
              this.startSaveProcess();
            });
          }
        }
      });
    } else {
      this.startSaveProcess();
    }
  },

  onAdError(err) {
    console.log('Banner 广告加载失败:', err);
  },

  chooseImage() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      success: (res) => {
        const path = res.tempFiles[0].tempFilePath;
        wx.showLoading({ title: '加载中...' });
        
        Security.checkImage(path).then(isSafe => {
          wx.hideLoading();
          if (isSafe) {
            wx.getImageInfo({
              src: path,
              success: (info) => {
                const ratio = info.height / info.width;
                const newHeight = this.data.canvasWidth * ratio;
                this.setData({
                  imagePath: path,
                  canvasHeight: newHeight,
                  textList: [],
                  currentTextId: null,
                  currentText: null
                }, () => {
                  this.drawCanvas(true);
                });
              }
            });
          } else {
            console.log('图片违规，停止处理');
          }
        }).catch(err => {
            wx.hideLoading();
            console.error('检测流程异常', err);
        });
      }
    });
  },

  drawCanvas(isForDisplay = false) {
    if (!this.data.imagePath) return;

    const query = wx.createSelectorQuery();
    query.select('#memeCanvas')
      .fields({ node: true, size: true })
      .exec((res) => {
        if (!res[0]) return;
        const canvas = res[0].node;
        const ctx = canvas.getContext('2d');
        
        const dpr = wx.getSystemInfoSync().pixelRatio;
        canvas.width = this.data.canvasWidth * dpr;
        canvas.height = this.data.canvasHeight * dpr;
        ctx.scale(dpr, dpr);

        const img = canvas.createImage();
        img.onload = () => {
          ctx.clearRect(0, 0, this.data.canvasWidth, this.data.canvasHeight);
          ctx.drawImage(img, 0, 0, this.data.canvasWidth, this.data.canvasHeight);
        };
        img.src = this.data.imagePath;
        
        this.canvas = canvas; 
        this.ctx = ctx;
      });
  },

  // === 文本操作 ===

  addText() {
    if (!this.data.imagePath) return wx.showToast({ title: '请先选择底图', icon: 'none' });
    
    const id = Date.now();
    const newText = {
      id: id,
      text: '点击编辑',
      x: this.data.canvasWidth / 2,
      top: this.data.canvasHeight / 2,
      size: 40,
      color: '#ffffff',
      stroke: true,
      strokeColor: '#000000',
      angle: 0,
      zIndex: this.data.textList.length + 1
    };

    const list = [...this.data.textList, newText];
    this.setData({
      textList: list,
      currentTextId: id,
      currentText: newText
    });
  },

  deleteText(e) {
    const id = e.currentTarget.dataset.id;
    this.setData({
      textList: this.data.textList.filter(item => item.id !== id),
      currentTextId: null,
      currentText: null
    });
  },

  onTextTouchStart(e) {
    const id = e.currentTarget.dataset.id;
    const touch = e.touches[0];
    const item = this.data.textList.find(t => t.id === id);
    
    this.setData({
      currentTextId: id,
      currentText: item,
      touchState: {
        type: 'drag',
        startX: touch.clientX,
        startY: touch.clientY
      }
    });
  },

  onRotateStart(e) {
    const touch = e.touches[0];
    const current = this.data.currentText;
    if (!current) return;
    
    wx.createSelectorQuery().select('.canvas-box').boundingClientRect(rect => {
      if (!rect) return;
      
      const centerX = rect.left + current.x;
      const centerY = rect.top + current.top;
      
      const dx = touch.clientX - centerX;
      const dy = touch.clientY - centerY;
      
      const startAngle = Math.atan2(dy, dx) * 180 / Math.PI;

      this.setData({
        touchState: {
          type: 'rotate',
          centerX: centerX,
          centerY: centerY,
          startAngle: startAngle,
          initialItemAngle: current.angle
        }
      });
    }).exec();
  },

  onTouchMove(e) {
    const state = this.data.touchState;
    const touch = e.touches[0];
    const current = this.data.currentText;
    
    if (!current || !state.type) return;
    
    if (state.type === 'drag') {
      const dx = touch.clientX - state.startX;
      const dy = touch.clientY - state.startY;
      
      const newItem = {
        ...current,
        x: current.x + dx,
        top: current.top + dy
      };

      this.updateSingleText(newItem);
      
      state.startX = touch.clientX;
      state.startY = touch.clientY;

    } else if (state.type === 'rotate') {
      const dx = touch.clientX - state.centerX;
      const dy = touch.clientY - state.centerY;
      
      const currentAngle = Math.atan2(dy, dx) * 180 / Math.PI;
      const angleDiff = currentAngle - state.startAngle;
      
      const newItem = {
        ...current,
        angle: state.initialItemAngle + angleDiff
      };
      
      this.updateSingleText(newItem);
    }
  },

  onTouchEnd() {
    this.setData({ 'touchState.type': null });
  },

  onTouchStart(e) {
    if (!e.target.dataset.id) {
      this.setData({ 
        currentTextId: null,
        currentText: null
      });
    }
  },

  updateSingleText(newItem) {
    const list = this.data.textList.map(item => 
      item.id === newItem.id ? newItem : item
    );
    this.setData({
      textList: list,
      currentText: newItem
    });
  },

  onTextInput(e) { this.updateSingleText({ ...this.data.currentText, text: e.detail.value }); },
  onSizeChange(e) { this.updateSingleText({ ...this.data.currentText, size: e.detail.value }); },
  selectColor(e) { this.updateSingleText({ ...this.data.currentText, color: e.currentTarget.dataset.color }); },
  onStrokeChange(e) { this.updateSingleText({ ...this.data.currentText, stroke: e.detail.value }); },

  // === 5. 点击保存入口 ===
  saveImage() {
    if (!this.data.imagePath) return;
    // 触发额度检查
    this.checkQuotaAndSave();
  },

  // === 6. 权限检查与保存流程 ===
  startSaveProcess() {
    // 取消选中，去掉编辑框和手柄
    this.setData({ currentTextId: null, currentText: null });

    // 延时等待 UI 更新
    setTimeout(() => {
        wx.getSetting({
            success: (res) => {
              if (res.authSetting['scope.writePhotosAlbum']) {
                this.doSave();
              } else if (res.authSetting['scope.writePhotosAlbum'] === false) {
                wx.showModal({
                  title: '提示', content: '需要您授权保存图片到相册',
                  success: (m) => { if (m.confirm) wx.openSetting(); }
                });
              } else {
                wx.authorize({
                  scope: 'scope.writePhotosAlbum',
                  success: () => this.doSave(),
                  fail: () => wx.showToast({ title: '授权失败', icon: 'none' })
                });
              }
            }
        });
    }, 100);
  },

  // === 7. 真正的保存逻辑 ===
  doSave() {
    wx.showLoading({ title: '正在保存...' });
    const ctx = this.ctx;
    
    // 1. 重新绘制底图
    const img = this.canvas.createImage();
    img.onload = () => {
      ctx.clearRect(0, 0, this.data.canvasWidth, this.data.canvasHeight);
      ctx.drawImage(img, 0, 0, this.data.canvasWidth, this.data.canvasHeight);
      
      // 2. 绘制所有文字
      this.data.textList.forEach(item => {
        if (!item.text) return;

        ctx.save(); 
        ctx.translate(item.x, item.top);
        ctx.rotate(item.angle * Math.PI / 180);

        ctx.font = `bold ${item.size}px sans-serif`;
        ctx.textAlign = 'center'; 
        ctx.textBaseline = 'middle';

        if (item.stroke) {
          ctx.strokeStyle = item.strokeColor;
          ctx.lineWidth = item.size / 15; 
          ctx.strokeText(item.text, 0, 0); 
        }

        ctx.fillStyle = item.color;
        ctx.fillText(item.text, 0, 0);
        ctx.restore(); 
      });

      // 3. 生成图片文件
      setTimeout(() => {
        wx.canvasToTempFilePath({
          canvas: this.canvas,
          fileType: 'jpg',
          quality: 0.9,
          success: (res) => {
            
            // 4. 保存到系统相册
            wx.saveImageToPhotosAlbum({
              filePath: res.tempFilePath,
              success: () => {
                wx.hideLoading();
                // 5. 跳转到成功页
                wx.navigateTo({
                  url: `/pages/success/success?path=${encodeURIComponent(res.tempFilePath)}`
                });
              },
              fail: (err) => {
                wx.hideLoading();
                if (err.errMsg.indexOf('cancel') === -1) {
                  wx.showToast({ title: '保存到相册失败', icon: 'none' });
                }
              }
            });

          },
          fail: () => {
            wx.hideLoading();
            wx.showToast({ title: '生成图片失败', icon: 'none' });
          }
        });
      }, 200);
    };
    img.src = this.data.imagePath;
  },

  onShareAppMessage() {
    return { title: '表情包制作神器', path: '/pages/meme/meme' };
  }
});
// pages/text/text.js
const Security = require('../../utils/security.js'); 

const AD_CONFIG = {
  BANNER_ID: 'adunit-ecfcec4c6a0c871b', 
  VIDEO_ID: 'adunit-da175a2014d3443b'
};
const FREE_COUNT_DAILY = 2; 

Page({
  data: {
    imagePath: '', 
    viewWidth: 300,
    viewHeight: 300,
    rawWidth: 0,
    rawHeight: 0,
    
    currentTab: 'text',   
    activeTarget: 'text', 
    
    isTextDragging: false,
    isStickerDragging: false,

    // === 文字参数 ===
    text: '点击输入\n文字',
    fontSize: 24,         
    textColor: '#ffffff',
    fontWeight: 'normal',
    hasStroke: true,      
    textX: 150,
    textY: 150,
    textAngle: 0,
    
    // === 贴纸参数 ===
    stickerPath: '', 
    stickerX: 150,
    stickerY: 150,
    stickerSize: 100, 
    stickerAngle: 0,
    
    bannerUnitId: AD_CONFIG.BANNER_ID,

    colorList: [
      { color: '#ffffff', name: '白' }, 
      { color: '#000000', name: '黑' },
      { color: '#ef4444', name: '红' }, 
      { color: '#f59e0b', name: '黄' },
      { color: '#10b981', name: '绿' }, 
      { color: '#3b82f6', name: '蓝' },
      { color: '#6366f1', name: '紫' },
      { color: '#ec4899', name: '粉' }
    ],
    
    stickerTabs: ['热门', '表情', '装饰'],
    currentStickerTab: 0,
    currentStickerList: [],
    
    // === 修复：使用 Base64 和 稳定图床 替代本地不存在的图片 ===
    allStickers: {
        // 0: 热门 (使用 Base64 确保 100% 显示)
        0: [
            'data:image/png;base64,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',
            'data:image/png;base64,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',
            'data:image/png;base64,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'
        ],
        // 1: 表情 (Icons8 稳定 CDN)
        1: [
            'https://img.icons8.com/emoji/96/grinning-face-with-smiling-eyes--v2.png', 
            'https://img.icons8.com/emoji/96/smiling-face-with-heart-eyes.png',
            'https://img.icons8.com/emoji/96/clown-face.png',
            'https://img.icons8.com/emoji/96/party-popper.png'
        ],
        // 2: 装饰 (Icons8 稳定 CDN)
        2: [
            'https://img.icons8.com/fluency/96/fire-element.png', 
            'https://img.icons8.com/fluency/96/star--v1.png',
            'https://img.icons8.com/fluency/96/sparkling.png',
            'https://img.icons8.com/fluency/96/heart-balloon.png'
        ]
    }
  },

  videoAd: null, 

  onLoad() {
    this.initVideoAd();
    this.updateStickerList(); 
  },

  // === 1. 选图逻辑 (带安全检测) ===
  chooseImage() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sizeType: ['compressed'], 
      sourceType: ['album', 'camera'],
      success: (res) => {
        const path = res.tempFiles[0].tempFilePath;
        this.loadImage(path);
        // 安全检测（静默）
        Security.checkImage(path).then(isSafe => {
          if (!isSafe) {
             this.setData({ imagePath: '', currentTab: 'text' });
             wx.showModal({ title: '提示', content: '图片包含敏感信息，请更换', showCancel: false });
          }
        }).catch(()=> console.log('Check skip'));
      }
    });
  },

  loadImage(path) {
    wx.showLoading({ title: '加载中...', mask: true });

    wx.getImageInfo({
      src: path,
      success: (info) => {
        const sys = wx.getSystemInfoSync();
        const screenWidth = sys.windowWidth;
        const pad = 30; 
        
        const maxViewWidth = screenWidth - (pad * 2);
        let viewW = maxViewWidth;
        let viewH = viewW / (info.width / info.height);

        const MAX_VIEW_HEIGHT = sys.windowHeight * 0.65; 
        if (viewH > MAX_VIEW_HEIGHT) {
            viewH = MAX_VIEW_HEIGHT;
            viewW = viewH * (info.width / info.height);
        }

        this.setData({
          imagePath: path,
          viewWidth: viewW,
          viewHeight: viewH,
          rawWidth: info.width,
          rawHeight: info.height,
          textX: viewW / 2,
          textY: viewH / 2,
          stickerX: viewW / 2,
          stickerY: viewH / 2,
          activeTarget: 'text',
          currentTab: 'text'
        }, () => {
            wx.hideLoading();
        });
      },
      fail: () => {
          wx.hideLoading();
          wx.showToast({ title: '图片读取失败', icon: 'none' });
      }
    });
  },

  // === 2. 交互逻辑 ===
  onTextTouchStart(e) {
      this.setData({ isTextDragging: true, activeTarget: 'text' });
      this.touchStartX = e.touches[0].clientX;
      this.touchStartY = e.touches[0].clientY;
      this.eleStartX = this.data.textX;
      this.eleStartY = this.data.textY;
  },
  onTextTouchMove(e) {
      if (!this.data.isTextDragging) return;
      const dx = e.touches[0].clientX - this.touchStartX;
      const dy = e.touches[0].clientY - this.touchStartY;
      this.setData({ textX: this.eleStartX + dx, textY: this.eleStartY + dy });
  },
  onTextTouchEnd() { this.setData({ isTextDragging: false }); },

  onStickerTouchStart(e) {
      this.setData({ isStickerDragging: true, activeTarget: 'sticker' });
      this.touchStartX = e.touches[0].clientX;
      this.touchStartY = e.touches[0].clientY;
      this.eleStartX = this.data.stickerX;
      this.eleStartY = this.data.stickerY;
  },
  onStickerTouchMove(e) {
      if (!this.data.isStickerDragging) return;
      const dx = e.touches[0].clientX - this.touchStartX;
      const dy = e.touches[0].clientY - this.touchStartY;
      this.setData({ stickerX: this.eleStartX + dx, stickerY: this.eleStartY + dy });
  },
  onStickerTouchEnd() { this.setData({ isStickerDragging: false }); },

  activateText() { this.setData({ activeTarget: 'text', currentTab: 'text' }); },
  activateSticker() { this.setData({ activeTarget: 'sticker', currentTab: 'sticker' }); },

  // === 3. 属性设置 ===
  switchTab(e) { this.setData({ currentTab: e.currentTarget.dataset.tab }); },
  
  switchStickerTab(e) {
      const idx = e.currentTarget.dataset.idx;
      this.setData({ currentStickerTab: idx }, () => this.updateStickerList());
  },
  updateStickerList() {
      const list = this.data.allStickers[this.data.currentStickerTab] || [];
      this.setData({ currentStickerList: list });
  },

  onTextInput(e) { this.setData({ text: e.detail.value }); },
  onFontSizeChange(e) { this.setData({ fontSize: e.detail.value }); },
  selectColor(e) { this.setData({ textColor: e.currentTarget.dataset.color }); },
  onStrokeChange(e) { this.setData({ hasStroke: e.detail.value }); },
  
  selectSticker(e) { 
      this.setData({ 
          stickerPath: e.currentTarget.dataset.path,
          activeTarget: 'sticker',
          currentTab: 'sticker'
      }); 
  },
  onStickerSizeChange(e) { this.setData({ stickerSize: e.detail.value }); },
  removeSticker() { this.setData({ stickerPath: '' }); },

  // === 4. 保存核心逻辑 ===
  saveImage() { this.checkQuotaAndSave(); },

  checkQuotaAndSave() {
    const today = new Date().toLocaleDateString();
    const storageKey = 'text_usage_record';
    let record = wx.getStorageSync(storageKey) || { date: today, count: 0, isUnlimited: false };

    if (record.date !== today) {
      record = { date: today, count: 0, isUnlimited: false };
      wx.setStorageSync(storageKey, record);
    }

    if (record.isUnlimited || record.count < FREE_COUNT_DAILY) {
      if (!record.isUnlimited) {
         record.count++;
         wx.setStorageSync(storageKey, record);
      }
      this.realSaveProcess();
    } else {
      this.showAdModal();
    }
  },

  async realSaveProcess() {
    wx.showLoading({ title: '合成中...', mask: true });

    try {
      const canvasRes = await new Promise(resolve => {
        wx.createSelectorQuery().select('#exportCanvas')
          .fields({ node: true, size: true })
          .exec(res => resolve(res[0]));
      });

      if (!canvasRes) throw new Error('Canvas not found');
      const canvas = canvasRes.node;
      const ctx = canvas.getContext('2d');

      const MAX_SIZE = 1500;
      let { rawWidth, rawHeight, viewWidth } = this.data;
      
      let exportW = rawWidth;
      let exportH = rawHeight;
      
      if (rawWidth > MAX_SIZE || rawHeight > MAX_SIZE) {
          const ratio = rawWidth / rawHeight;
          if (rawWidth > rawHeight) {
              exportW = MAX_SIZE; exportH = MAX_SIZE / ratio;
          } else {
              exportH = MAX_SIZE; exportW = MAX_SIZE * ratio;
          }
      }

      canvas.width = exportW;
      canvas.height = exportH;
      
      const scale = exportW / viewWidth;

      const loadTasks = [this.loadImageResource(canvas, this.data.imagePath)];
      if (this.data.stickerPath) {
          loadTasks.push(this.loadImageResource(canvas, this.data.stickerPath));
      }

      const results = await Promise.all(loadTasks);
      const bgImg = results[0];
      const stickerImg = this.data.stickerPath ? results[1] : null;

      // 绘制流程
      ctx.drawImage(bgImg, 0, 0, exportW, exportH);

      if (stickerImg) {
          const { stickerX, stickerY, stickerSize, stickerAngle } = this.data;
          const sx = stickerX * scale;
          const sy = stickerY * scale;
          const ss = stickerSize * scale;
          
          ctx.save();
          ctx.translate(sx, sy);
          ctx.rotate(stickerAngle * Math.PI / 180);
          ctx.drawImage(stickerImg, -ss/2, -ss/2, ss, ss);
          ctx.restore();
      }

      const { text, fontSize, textColor, fontWeight, hasStroke, textX, textY, textAngle } = this.data;
      const tx = textX * scale;
      const ty = textY * scale;
      const fs = fontSize * scale; 

      ctx.save();
      ctx.translate(tx, ty);
      ctx.rotate(textAngle * Math.PI / 180);
      
      ctx.font = `normal ${fontWeight} ${fs}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      const lines = text.split('\n');
      const lh = fs * 1.2; 
      const startY = -((lines.length - 1) * lh) / 2;

      lines.forEach((line, i) => {
          const ly = startY + i * lh;
          if (hasStroke) {
              ctx.strokeStyle = textColor === '#ffffff' ? '#000000' : '#ffffff';
              ctx.lineWidth = Math.max(2, 3 * scale);
              ctx.strokeText(line, 0, ly);
          }
          ctx.fillStyle = textColor;
          ctx.fillText(line, 0, ly);
      });
      ctx.restore();

      // 导出与跳转
      wx.canvasToTempFilePath({
          canvas: canvas,
          fileType: 'jpg',
          quality: 0.85,
          destWidth: exportW,
          destHeight: exportH,
          success: (res) => {
              wx.hideLoading();
              wx.saveImageToPhotosAlbum({
                  filePath: res.tempFilePath,
                  success: () => {
                      // 核心修复：跳转到成功页面
                      wx.navigateTo({
                          url: `/pages/success/success?path=${encodeURIComponent(res.tempFilePath)}`
                      });
                  },
                  fail: (e) => {
                      if(e.errMsg.includes('auth')) {
                          wx.showModal({ 
                              title:'权限提示', 
                              content:'请开启相册权限', 
                              success: s=>{ if(s.confirm) wx.openSetting() }
                          });
                      } else {
                          wx.showToast({ title: '保存取消', icon: 'none' });
                      }
                  }
              });
          },
          fail: (err) => {
              console.error('导出失败', err);
              wx.hideLoading();
              wx.showToast({ title: '导出失败', icon: 'none' });
          }
      });

    } catch (e) {
      console.error('合成过程异常', e);
      wx.hideLoading();
      wx.showToast({ title: '合成出错', icon: 'none' });
    }
  },

  loadImageResource(canvas, src) {
      return new Promise((resolve, reject) => {
          if (!src) return reject(new Error('no src'));
          
          if (src.startsWith('http')) {
              wx.downloadFile({
                  url: src,
                  success: res => {
                      if(res.statusCode === 200) {
                          const img = canvas.createImage();
                          img.onload = () => resolve(img);
                          img.onerror = reject;
                          img.src = res.tempFilePath; 
                      } else {
                          reject(new Error('Download failed'));
                      }
                  },
                  fail: reject
              });
          } else if (src.startsWith('data:image')) {
               // Base64 处理
               const img = canvas.createImage();
               img.onload = () => resolve(img);
               img.onerror = reject;
               img.src = src;
          } else {
              const img = canvas.createImage();
              img.onload = () => resolve(img);
              img.onerror = reject;
              img.src = src;
          }
      });
  },

  initVideoAd() {
    if (wx.createRewardedVideoAd) {
      this.videoAd = wx.createRewardedVideoAd({ adUnitId: AD_CONFIG.VIDEO_ID });
      this.videoAd.onClose((res) => {
        if (res && res.isEnded) {
          this.setDailyUnlimited();
          wx.showToast({ title: '已解锁', icon: 'success' });
          this.realSaveProcess(); 
        }
      });
    }
  },
  
  setDailyUnlimited() {
    const today = new Date().toLocaleDateString();
    wx.setStorageSync('text_usage_record', { date: today, count: 999, isUnlimited: true });
  },

  showAdModal() {
    if (this.videoAd) {
      wx.showModal({
        title: '免费次数用完',
        content: '观看视频解锁无限次',
        success: (res) => {
          if (res.confirm) {
            this.videoAd.show().catch(() => this.realSaveProcess());
          }
        }
      });
    } else {
      this.realSaveProcess();
    }
  },
  
  onAdError(err) { console.log(err); },
  onShareAppMessage() { return { title: '图片个性化加字', path: '/pages/text/text' }; }
});
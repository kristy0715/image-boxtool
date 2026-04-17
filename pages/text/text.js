// pages/text/text.js
const Audit = require('../../utils/audit.js'); 

const AD_CONFIG = {
  BANNER_ID: 'adunit-ecfcec4c6a0c871b', 
  VIDEO_ID: 'adunit-da175a2014d3443b'
};
const FREE_COUNT_DAILY = 2; 

const STICKERS = {
  EMOJI: [
    '😂', '🥰', '😎', '🤔', '😭', '😡', '🥳', '🤮', '🙄', '👻', '🤡', '💩',
    '🙏', '👍', '👌', '❤️', '💔', '🎉', '🔥', '✨', '🌟', '🌈', '☀️', '🌙',
    '🐷', '🐶', '🐱', '🙈', '🌹', '🍺'
  ],
  DECOR: [
    '💢', '💤', '💨', '💦', '💬', '💭', '💯', '🈲', '⚠️', '🚫', '✅', '❌',
    '‼️', '⁉️', '🎵', '❤️‍🔥', '👑', '💎', '🎀', '🎈', '🎁', '🧨', '🧧', '🔔'
  ]
};

const uuid = () => 'id-' + Math.random().toString(36).substr(2, 9);

Page({
  data: {
    isAllowed: false, // 🔥 审核隔离锁
    
    imagePath: '', 
    viewWidth: 300, viewHeight: 300,
    rawWidth: 0, rawHeight: 0,
    
    elements: [], 
    activeId: null, 
    
    currentTab: 'text',
    stickerTabs: ['表情', '装饰'],
    currentStickerTab: 0,
    currentStickerList: [],
    allStickers: { 0: STICKERS.EMOJI, 1: STICKERS.DECOR },
    
    tempText: '',
    tempFontSize: 30,
    tempColor: '#ffffff',
    tempStroke: true,
    tempBgColor: 'transparent',
    tempStickerSize: 80,

    bannerUnitId: AD_CONFIG.BANNER_ID,
    colorList: [
      { color: '#ffffff', name: '白' }, { color: '#000000', name: '黑' },
      { color: '#ef4444', name: '红' }, { color: '#f59e0b', name: '黄' },
      { color: '#10b981', name: '绿' }, { color: '#3b82f6', name: '蓝' },
      { color: '#6366f1', name: '紫' }, { color: '#ec4899', name: '粉' }
    ],
    bgColorList: [
      { color: 'transparent', name: '无' },
      { color: '#000000', name: '纯黑' }, { color: 'rgba(0,0,0,0.5)', name: '半透黑' },
      { color: '#ffffff', name: '纯白' }, { color: 'rgba(255,255,255,0.7)', name: '半透白' },
      { color: '#ef4444', name: '红' }, { color: '#f59e0b', name: '黄' },
      { color: '#10b981', name: '绿' }, { color: '#3b82f6', name: '蓝' },
      { color: '#6366f1', name: '紫' }, { color: '#ec4899', name: '粉' }
    ]
  },

  videoAd: null, 

  onLoad() {
    // 🌟 核心修复：纯净版 checkAccess 拦截，剔除冗余标题闪烁逻辑
    Audit.checkAccess().then(isAllowed => {
      if (!isAllowed) return; // 黑名单直接中断，等待 kickOut 踢回首页

      this.setData({ isAllowed: true });
      this.initVideoAd();
      this.updateStickerList(); 
    });
  },

  chooseImage() {
    wx.chooseMedia({
      count: 1, mediaType: ['image'], sizeType: ['compressed'], sourceType: ['album', 'camera'],
      success: (res) => {
        const path = res.tempFiles[0].tempFilePath;
        this.loadImage(path);
      }
    });
  },

  loadImage(path) {
    wx.showLoading({ title: '加载中...' });
    wx.getImageInfo({
      src: path,
      success: (info) => {
        const sys = wx.getSystemInfoSync();
        const maxW = sys.windowWidth - 60;
        let vW = maxW, vH = maxW / (info.width / info.height);
        
        if (vH > sys.windowHeight * 0.6) {
            vH = sys.windowHeight * 0.6;
            vW = vH * (info.width / info.height);
        }

        this.setData({
          imagePath: path, viewWidth: vW, viewHeight: vH,
          rawWidth: info.width, rawHeight: info.height,
          elements: [], activeId: null
        }, () => wx.hideLoading());
      },
      fail: () => { wx.hideLoading(); wx.showToast({ title: '加载失败', icon: 'none' }); }
    });
  },

  syncPanelData(item, forceTab = null) {
    if (!item) return;
    const targetTab = forceTab || item.type;
    const updates = { activeId: item.id, currentTab: targetTab };

    if (item.type === 'text') {
      updates.tempText = item.content;
      updates.tempFontSize = item.fontSize;
      updates.tempColor = item.color;
      updates.tempStroke = item.hasStroke;
      updates.tempBgColor = item.bgColor || 'transparent';
    } else if (item.type === 'sticker') {
      updates.tempStickerSize = item.size;
    }
    this.setData(updates);
  },

  addNewText() {
    const id = uuid();
    const newText = {
      id, type: 'text', content: '双击修改',
      x: this.data.viewWidth / 2, y: this.data.viewHeight / 2,
      fontSize: 30, color: '#ffffff', hasStroke: true, angle: 0,
      bgColor: 'transparent'
    };
    
    this.setData({ elements: [...this.data.elements, newText] }, () => {
      this.syncPanelData(newText);
    });
  },

  selectSticker(e) {
    const content = e.currentTarget.dataset.content;
    const id = uuid();
    const newSticker = {
      id, type: 'sticker', content: content,
      x: this.data.viewWidth / 2, y: this.data.viewHeight / 2,
      size: 80, angle: 0
    };

    this.setData({ elements: [...this.data.elements, newSticker] }, () => {
      this.syncPanelData(newSticker);
    });
  },

  addImageLayer() {
    wx.chooseMedia({
      count: 1, mediaType: ['image'], sizeType: ['compressed'],
      success: (res) => {
        const path = res.tempFiles[0].tempFilePath;
        wx.getImageInfo({
          src: path,
          success: (info) => {
            let w = info.width, h = info.height;
            const maxDim = 120; 
            if (w > maxDim || h > maxDim) {
              const r = w / h;
              if (w > h) { w = maxDim; h = maxDim / r; } else { h = maxDim; w = maxDim * r; }
            }
            const id = uuid();
            const newImg = {
              id, type: 'image', path,
              x: this.data.viewWidth / 2, y: this.data.viewHeight / 2,
              width: w, height: h, angle: 0
            };
            this.setData({ elements: [...this.data.elements, newImg] }, () => {
              this.syncPanelData(newImg);
            });
          }
        });
      }
    });
  },

  onCanvasTap() {
    this.setData({ activeId: null });
  },

  deleteElement(e) {
    const id = e.currentTarget.dataset.id;
    const newElements = this.data.elements.filter(el => el.id !== id);
    this.setData({ elements: newElements });
    if (this.data.activeId === id) this.setData({ activeId: null });
  },

  updateActiveElement(prop, value) {
    if (!this.data.activeId) return;
    const elements = this.data.elements.map(el => el.id === this.data.activeId ? { ...el, [prop]: value } : el);
    this.setData({ elements });
  },

  onTextInput(e) { this.setData({ tempText: e.detail.value }); this.updateActiveElement('content', e.detail.value); },
  onFontSizeChange(e) { this.setData({ tempFontSize: e.detail.value }); this.updateActiveElement('fontSize', e.detail.value); },
  selectColor(e) { const color = e.currentTarget.dataset.color; this.setData({ tempColor: color }); this.updateActiveElement('color', color); },
  selectBgColor(e) { 
    const color = e.currentTarget.dataset.color; 
    this.setData({ tempBgColor: color }); 
    this.updateActiveElement('bgColor', color); 
  },
  onStrokeChange(e) { this.setData({ tempStroke: e.detail.value }); this.updateActiveElement('hasStroke', e.detail.value); },
  onStickerSizeChange(e) { this.setData({ tempStickerSize: e.detail.value }); this.updateActiveElement('size', e.detail.value); },

  onTouchStart(e) {
    const id = e.currentTarget.dataset.id;
    const item = this.data.elements.find(el => el.id === id);
    if (!item) return;

    this.syncPanelData(item);

    this.touchStartX = e.touches[0].clientX;
    this.touchStartY = e.touches[0].clientY;
    this.eleStartX = item.x;
    this.eleStartY = item.y;
    this.isDragging = true;
  },

  onTouchMove(e) {
    if (!this.isDragging || !this.data.activeId) return;
    const dx = e.touches[0].clientX - this.touchStartX;
    const dy = e.touches[0].clientY - this.touchStartY;
    let x = this.eleStartX + dx; let y = this.eleStartY + dy;
    const margin = 20;
    x = Math.max(margin, Math.min(x, this.data.viewWidth - margin));
    y = Math.max(margin, Math.min(y, this.data.viewHeight - margin));
    const elements = this.data.elements.map(el => el.id === this.data.activeId ? { ...el, x, y } : el);
    this.setData({ elements });
  },

  onTouchEnd() { this.isDragging = false; },

  onTransformStart(e) {
    const id = e.currentTarget.dataset.id;
    const item = this.data.elements.find(el => el.id === id);
    if (!item) return;
    
    this.syncPanelData(item);
    
    wx.createSelectorQuery().select('.preview-wrapper').boundingClientRect(rect => {
      if (!rect) return;
      this.tfCenter = { x: rect.left + item.x, y: rect.top + item.y };
      this.tfInitTouch = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      this.tfInitAngle = item.angle || 0;
      this.tfInitState = { ...item };
      this.isTransforming = true;
    }).exec();
  },

  onTransformMove(e) {
    if (!this.isTransforming || !this.tfCenter) return;
    const touch = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    const dx1 = this.tfInitTouch.x - this.tfCenter.x;
    const dy1 = this.tfInitTouch.y - this.tfCenter.y;
    const dx2 = touch.x - this.tfCenter.x;
    const dy2 = touch.y - this.tfCenter.y;

    const angle1 = Math.atan2(dy1, dx1) * 180 / Math.PI;
    const angle2 = Math.atan2(dy2, dx2) * 180 / Math.PI;
    let newAngle = this.tfInitAngle + (angle2 - angle1);

    const dist1 = Math.hypot(dx1, dy1) || 1;
    const dist2 = Math.hypot(dx2, dy2);
    const ratio = dist2 / dist1;

    const elements = this.data.elements.map(el => {
      if (el.id === this.data.activeId) {
        let updates = { angle: newAngle };
        if (el.type === 'text') {
           updates.fontSize = Math.max(10, this.tfInitState.fontSize * ratio);
           this.setData({ tempFontSize: updates.fontSize });
        } else if (el.type === 'sticker') {
           updates.size = Math.max(20, this.tfInitState.size * ratio);
           this.setData({ tempStickerSize: updates.size });
        } else if (el.type === 'image') {
           updates.width = Math.max(20, this.tfInitState.width * ratio);
           updates.height = Math.max(20, this.tfInitState.height * ratio);
        }
        return { ...el, ...updates };
      }
      return el;
    });
    this.setData({ elements });
  },

  onTransformEnd() { this.isTransforming = false; },

  switchTab(e) { 
    const tab = e.currentTarget.dataset.tab;
    let activeId = this.data.activeId;
    
    if (activeId) {
      const item = this.data.elements.find(el => el.id === activeId);
      if (item && item.type !== tab) activeId = null;
    }
    
    if (!activeId) {
      const sameTypeElements = this.data.elements.filter(el => el.type === tab);
      if (sameTypeElements.length > 0) {
        const lastItem = sameTypeElements[sameTypeElements.length - 1];
        this.syncPanelData(lastItem, tab);
        return; 
      }
    }
    
    this.setData({ currentTab: tab, activeId });
  },

  switchStickerTab(e) { this.setData({ currentStickerTab: e.currentTarget.dataset.idx }, () => this.updateStickerList()); },
  updateStickerList() { this.setData({ currentStickerList: this.data.allStickers[this.data.currentStickerTab] }); },
  resetAll() {
    wx.showModal({ title: '清空', content: '确定移除所有内容吗？', success: (r) => { if(r.confirm) this.setData({ elements: [], activeId: null }); }});
  },

  saveImage() {
    if (this.data.elements.length === 0) return wx.showToast({ title: '没加东西哦', icon: 'none' });
    this.setData({ activeId: null }); 
    this.checkQuotaAndSave();
  },

  checkQuotaAndSave() {
    const today = new Date().toLocaleDateString();
    const key = 'text_usage_record';
    let record = wx.getStorageSync(key) || { date: today, count: 0, isUnlimited: false };
    if (record.date !== today) { record = { date: today, count: 0, isUnlimited: false }; wx.setStorageSync(key, record); }

    if (record.isUnlimited || record.count < FREE_COUNT_DAILY) {
      if (!record.isUnlimited) { record.count++; wx.setStorageSync(key, record); }
      this.realSaveProcess();
    } else {
      this.showAdModal();
    }
  },

  async realSaveProcess() {
    wx.showLoading({ title: '合成中...' });
    try {
      const canvasRes = await new Promise(resolve => {
        wx.createSelectorQuery().select('#exportCanvas').fields({ node: true, size: true }).exec(res => resolve(res[0]));
      });
      const canvas = canvasRes.node;
      const ctx = canvas.getContext('2d');

      const MAX = 1500;
      let { rawWidth, rawHeight, viewWidth } = this.data;
      let eW = rawWidth, eH = rawHeight;
      if (rawWidth > MAX || rawHeight > MAX) {
        const r = rawWidth / rawHeight;
        if (rawWidth > rawHeight) { eW = MAX; eH = MAX / r; } else { eH = MAX; eW = MAX * r; }
      }

      canvas.width = eW; canvas.height = eH;
      const scale = eW / viewWidth;

      const bgImg = await this.loadImageResource(canvas, this.data.imagePath);
      ctx.drawImage(bgImg, 0, 0, eW, eH);

      for (const el of this.data.elements) {
        ctx.save();
        const tx = el.x * scale;
        const ty = el.y * scale;
        ctx.translate(tx, ty);
        ctx.rotate((el.angle || 0) * Math.PI / 180); 
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        if (el.type === 'sticker') {
          const fs = el.size * scale;
          ctx.font = `${fs}px sans-serif`;
          ctx.fillText(el.content, 0, 0);
        } else if (el.type === 'text') {
          const fs = el.fontSize * scale;
          ctx.font = `normal normal ${fs}px sans-serif`;
          const lines = el.content.split('\n');
          const lh = fs * 1.2;
          
          if (el.bgColor && el.bgColor !== 'transparent') {
            const textHeight = lines.length * lh;
            let maxLineWidth = 0;
            lines.forEach(line => {
              const w = ctx.measureText(line).width;
              if (w > maxLineWidth) maxLineWidth = w;
            });
            
            const padX = fs * 0.7; 
            const padY = fs * 0.4;
            const bgW = maxLineWidth + padX * 2;
            const bgH = textHeight + padY * 2;
            const bgX = -bgW / 2;
            const bgY = -bgH / 2;
            const radius = fs * 0.3; 
            
            ctx.fillStyle = el.bgColor;
            ctx.beginPath();
            ctx.moveTo(bgX + radius, bgY);
            ctx.lineTo(bgX + bgW - radius, bgY);
            ctx.arcTo(bgX + bgW, bgY, bgX + bgW, bgY + bgH, radius);
            ctx.lineTo(bgX + bgW, bgY + bgH - radius);
            ctx.arcTo(bgX + bgW, bgY + bgH, bgX, bgY + bgH, radius);
            ctx.lineTo(bgX + radius, bgY + bgH);
            ctx.arcTo(bgX, bgY + bgH, bgX, bgY, radius);
            ctx.lineTo(bgX, bgY + radius);
            ctx.arcTo(bgX, bgY, bgX + radius, bgY, radius);
            ctx.closePath();
            ctx.fill();
          }

          const startY = -((lines.length - 1) * lh) / 2;
          lines.forEach((line, i) => {
            const ly = startY + i * lh;
            if (el.hasStroke) {
              ctx.strokeStyle = el.color === '#ffffff' ? '#000000' : '#ffffff';
              ctx.lineWidth = Math.max(2, 3 * scale);
              ctx.strokeText(line, 0, ly);
            }
            ctx.fillStyle = el.color;
            ctx.fillText(line, 0, ly);
          });
        } else if (el.type === 'image') {
          const elImg = await this.loadImageResource(canvas, el.path);
          const w = el.width * scale;
          const h = el.height * scale;
          ctx.drawImage(elImg, -w / 2, -h / 2, w, h);
        }
        ctx.restore();
      }

      wx.canvasToTempFilePath({
        canvas, fileType: 'jpg', quality: 0.9, destWidth: eW, destHeight: eH,
        success: (res) => {
          wx.hideLoading();
          wx.saveImageToPhotosAlbum({
            filePath: res.tempFilePath,
            success: () => { wx.navigateTo({ url: `/pages/success/success?path=${encodeURIComponent(res.tempFilePath)}` }); },
            fail: (e) => { if(e.errMsg.includes('auth')) wx.showModal({ title:'提示', content:'需相册权限', success:s=>{if(s.confirm)wx.openSetting()}}); }
          });
        },
        fail: () => { wx.hideLoading(); wx.showToast({ title: '失败', icon: 'none' }); }
      });

    } catch (e) { console.error(e); wx.hideLoading(); wx.showToast({ title: '出错', icon: 'none' }); }
  },

  loadImageResource(canvas, src) {
    return new Promise((resolve, reject) => {
        const img = canvas.createImage();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = src;
    });
  },

  initVideoAd() {
    if (wx.createRewardedVideoAd) {
      this.videoAd = wx.createRewardedVideoAd({ adUnitId: AD_CONFIG.VIDEO_ID });
      this.videoAd.onClose((res) => {
        if (res && res.isEnded) { this.setDailyUnlimited(); this.realSaveProcess(); }
      });
    }
  },
  setDailyUnlimited() { wx.setStorageSync('text_usage_record', { date: new Date().toLocaleDateString(), count: 999, isUnlimited: true }); },
  showAdModal() {
    if (this.videoAd) wx.showModal({ title: '次数不足', content: '看视频解锁无限次', success: r => r.confirm && this.videoAd.show() });
    else this.realSaveProcess();
  },
  onAdError() {},
  
  onShareAppMessage() {
    const imageUrl = this.data.imagePath || '/assets/share-cover.png';
    return { title: '宝藏P图神器！一键自制专属表情包，图片加字加水印超方便！', path: '/pages/text/text', imageUrl: imageUrl };
  },
  onShareTimeline() {
    const imageUrl = this.data.imagePath || '/assets/share-cover.png';
    return { title: '神仙P图工具：自制表情包 / 图片加字 / 无痕加水印 ✨', query: '', imageUrl: imageUrl };
  }
});
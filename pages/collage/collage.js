// pages/collage/collage.js
const Security = require('../../utils/security.js');

// === 1. 广告配置 ===
const AD_CONFIG = {
  BANNER_ID: 'adunit-ecfcec4c6a0c871b',
  VIDEO_ID: 'adunit-da175a2014d3443b'
};

// === 2. 策略配置 ===
const FREE_COUNT_DAILY = 2; 

Page({
  data: {
    imageList: [], 
    imageInfos: [], 
    
    layoutType: 'grid', 
    spacing: 15, 
    bgColor: '#ffffff',
    bgColors: ['#ffffff', '#000000', '#f5f5f5', '#ffe4e6', '#dbeafe', '#dcfce7', '#fef3c7'],
    showNumber: false,
    
    // === 修正：将宽度收缩到 670，预留足够安全边距防止截断 ===
    previewWidth: 670,
    previewHeight: 670,
    previewItems: [], 
    
    isProcessing: false,
    loadingText: '处理中...',
    
    bannerUnitId: AD_CONFIG.BANNER_ID
  },

  videoAd: null, 

  onLoad() {
    this.initVideoAd();
  },

  initVideoAd() {
    if (wx.createRewardedVideoAd) {
      this.videoAd = wx.createRewardedVideoAd({ adUnitId: AD_CONFIG.VIDEO_ID });
      this.videoAd.onLoad(() => console.log('激励视频加载成功'));
      this.videoAd.onError((err) => console.error('激励视频加载失败', err));
      
      this.videoAd.onClose((res) => {
        if (res && res.isEnded) {
          this.setDailyUnlimited();
          wx.showToast({ title: '已解锁今日无限次', icon: 'success' });
          this.startSaveProcess(); 
        } else {
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

  checkQuotaAndSave() {
    const today = new Date().toLocaleDateString();
    const storageKey = 'collage_usage_record'; 
    let record = wx.getStorageSync(storageKey) || { date: today, count: 0, isUnlimited: false };

    if (record.date !== today) {
      record = { date: today, count: 0, isUnlimited: false };
      wx.setStorageSync(storageKey, record);
    }

    if (record.isUnlimited) {
      this.startSaveProcess();
      return;
    }

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

    this.showAdModal();
  },

  setDailyUnlimited() {
    const today = new Date().toLocaleDateString();
    const storageKey = 'collage_usage_record';
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

  startSaveProcess() {
    wx.getSetting({
      success: (res) => {
        if (res.authSetting['scope.writePhotosAlbum']) {
          this.generateAndSave();
        } else if (res.authSetting['scope.writePhotosAlbum'] === false) {
          wx.showModal({
            title: '提示',
            content: '需要您授权保存图片到相册',
            success: (modalRes) => {
              if (modalRes.confirm) wx.openSetting();
            }
          });
        } else {
          wx.authorize({
            scope: 'scope.writePhotosAlbum',
            success: () => this.generateAndSave(),
            fail: () => wx.showToast({ title: '授权失败', icon: 'none' })
          });
        }
      }
    });
  },

  addImages() {
    const remaining = 9 - this.data.imageList.length;
    if (remaining <= 0) return wx.showToast({ title: '最多9张', icon: 'none' });

    wx.chooseMedia({
      count: remaining,
      mediaType: ['image'],
      success: async (res) => {
        wx.showLoading({ title: '处理中...', mask: true });
        
        const newPaths = [];
        for (const file of res.tempFiles) {
          try {
            const isSafe = await Security.checkImage(file.tempFilePath);
            if (isSafe) newPaths.push(file.tempFilePath);
          } catch (e) {
            newPaths.push(file.tempFilePath); 
          }
        }

        if (newPaths.length > 0) {
          const newInfos = await this.getImagesInfo(newPaths);
          
          this.setData({
            imageList: [...this.data.imageList, ...newPaths],
            imageInfos: [...this.data.imageInfos, ...newInfos]
          });
          
          this.updatePreview();
        }
        
        wx.hideLoading();
      }
    });
  },

  getImagesInfo(paths) {
    return Promise.all(paths.map(path => new Promise(resolve => {
        wx.getImageInfo({
            src: path,
            success: (res) => resolve({ path, width: res.width, height: res.height, ratio: res.width / res.height }),
            fail: () => resolve({ path, width: 1000, height: 1000, ratio: 1 }) 
        });
    })));
  },

  removeImage(e) {
    const idx = e.currentTarget.dataset.index;
    const list = [...this.data.imageList];
    const infos = [...this.data.imageInfos];
    list.splice(idx, 1);
    infos.splice(idx, 1);
    
    this.setData({ imageList: list, imageInfos: infos });
    this.updatePreview();
  },

  selectLayout(e) {
    this.setData({ layoutType: e.currentTarget.dataset.type });
    this.updatePreview();
  },

  onSpacingChange(e) {
    this.setData({ spacing: e.detail.value });
    this.updatePreview();
  },

  selectBgColor(e) {
    this.setData({ bgColor: e.currentTarget.dataset.color });
  },

  toggleNumber(e) {
    this.setData({ showNumber: e.detail.value });
  },

  calculateLayout(imageInfos, baseWidth, spacing) {
    const type = this.data.layoutType;
    const positions = [];
    let totalW = 0, totalH = 0;

    if (imageInfos.length === 0) return { w: baseWidth, h: baseWidth, items: [] };

    if (type === 'horizontal') {
        const fixedHeight = baseWidth; 
        let currentX = spacing;
        imageInfos.forEach(info => {
            const w = fixedHeight * info.ratio;
            positions.push({ x: currentX, y: spacing, w: w, h: fixedHeight, path: info.path });
            currentX += w + spacing;
        });
        totalW = currentX;
        totalH = fixedHeight + spacing * 2;

    } else if (type === 'vertical') {
        const fixedWidth = baseWidth - spacing * 2; 
        let currentY = spacing;
        imageInfos.forEach(info => {
            const h = fixedWidth / info.ratio;
            positions.push({ x: spacing, y: currentY, w: fixedWidth, h: h, path: info.path });
            currentY += h + spacing;
        });
        totalW = baseWidth;
        totalH = currentY;

    } else {
        const count = imageInfos.length;
        const cols = count <= 4 ? 2 : 3; 
        if (count === 1) { 
            const w = baseWidth - spacing * 2;
            const h = w / imageInfos[0].ratio;
            positions.push({ x: spacing, y: spacing, w: w, h: h, path: imageInfos[0].path });
            totalW = baseWidth;
            totalH = h + spacing * 2;
        } else {
            const rows = Math.ceil(count / cols);
            const cellSize = (baseWidth - (cols + 1) * spacing) / cols;
            for (let i = 0; i < count; i++) {
                const col = i % cols;
                const row = Math.floor(i / cols);
                const x = spacing + col * (cellSize + spacing);
                const y = spacing + row * (cellSize + spacing);
                positions.push({ x, y, w: cellSize, h: cellSize, path: imageInfos[i].path });
            }
            totalW = baseWidth;
            totalH = spacing + rows * (cellSize + spacing);
        }
    }
    return { w: totalW, h: totalH, items: positions };
  },

  updatePreview() {
    // === 修正：基准宽度改为 670 ===
    const layout = this.calculateLayout(this.data.imageInfos, 670, this.data.spacing);
    this.setData({
        previewWidth: layout.w,
        previewHeight: layout.h,
        previewItems: layout.items
    });
  },

  saveImage() {
    if (this.data.imageList.length < 2 && this.data.layoutType !== 'grid') {
        return wx.showToast({ title: '至少需要2张图', icon: 'none' });
    }
    this.checkQuotaAndSave();
  },

  async generateAndSave() {
    this.setData({ isProcessing: true, loadingText: '生成中...' });

    try {
        const MAX_SIDE = 4096; 
        let baseSize = 2400; 

        const { layoutType, imageInfos, spacing } = this.data;

        if (layoutType === 'horizontal') {
            const sumRatio = imageInfos.reduce((acc, img) => acc + img.ratio, 0);
            const estWidth = baseSize * sumRatio;
            if (estWidth > MAX_SIDE) {
                baseSize = MAX_SIDE / sumRatio; 
            }
            baseSize = Math.min(baseSize, MAX_SIDE);

        } else if (layoutType === 'vertical') {
            const sumInvRatio = imageInfos.reduce((acc, img) => acc + (1/img.ratio), 0);
            const estHeight = baseSize * sumInvRatio;
            if (estHeight > MAX_SIDE) {
                baseSize = MAX_SIDE / sumInvRatio;
            }
            baseSize = Math.min(baseSize, MAX_SIDE);
        } else {
            const cols = imageInfos.length <= 4 ? 2 : 3;
            const rows = Math.ceil(imageInfos.length / cols);
            const ratio = rows / cols; 
            if (baseSize * ratio > MAX_SIDE) {
                baseSize = MAX_SIDE / ratio;
            }
        }
        
        baseSize = Math.floor(baseSize);

        // === 修正：计算导出比例时使用 670 ===
        const scale = baseSize / 670; 
        const exportSpacing = spacing * scale;
        const layout = this.calculateLayout(imageInfos, baseSize, exportSpacing);

        const canvas = wx.createOffscreenCanvas({ type: '2d', width: Math.ceil(layout.w), height: Math.ceil(layout.h) });
        const ctx = canvas.getContext('2d');

        ctx.fillStyle = this.data.bgColor;
        ctx.fillRect(0, 0, layout.w, layout.h);

        for (let i = 0; i < layout.items.length; i++) {
            const item = layout.items[i];
            const img = canvas.createImage();
            await new Promise((resolve) => {
                img.onload = () => {
                    if (this.data.layoutType === 'grid' && this.data.imageInfos.length > 1) {
                        this.drawAspectFill(ctx, img, item.x, item.y, item.w, item.h);
                    } else {
                        ctx.drawImage(img, item.x, item.y, item.w, item.h);
                    }
                    resolve();
                };
                img.onerror = resolve; 
                img.src = item.path;
            });
            
            if (this.data.showNumber) {
                this.drawNumber(ctx, i + 1, item.x, item.y, item.w, item.h);
            }
        }

        wx.canvasToTempFilePath({
            canvas: canvas,
            fileType: 'jpg',
            quality: 0.85,
            success: (res) => {
                const tempFilePath = res.tempFilePath;
                
                wx.saveImageToPhotosAlbum({
                    filePath: tempFilePath,
                    success: () => {
                        this.setData({ isProcessing: false });
                        wx.navigateTo({
                            url: `/pages/success/success?path=${encodeURIComponent(tempFilePath)}`
                        });
                    },
                    fail: (err) => {
                        this.setData({ isProcessing: false });
                        if (err.errMsg.indexOf('cancel') === -1) {
                            wx.showToast({ title: '保存失败', icon: 'none' });
                        }
                    }
                });
            },
            fail: (err) => {
                console.error("导出失败", err);
                this.setData({ isProcessing: false });
                wx.showToast({ title: '生成失败', icon: 'none' });
            }
        });

    } catch (err) {
        console.error(err);
        this.setData({ isProcessing: false });
        wx.showToast({ title: '程序异常', icon: 'none' });
    }
  },

  drawAspectFill(ctx, img, x, y, w, h) {
      const imgRatio = img.width / img.height;
      const targetRatio = w / h;
      let sx, sy, sw, sh;
      if (imgRatio > targetRatio) {
          sh = img.height; sw = sh * targetRatio;
          sy = 0; sx = (img.width - sw) / 2;
      } else {
          sw = img.width; sh = sw / targetRatio;
          sx = 0; sy = (img.height - sh) / 2;
      }
      ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
  },

  drawNumber(ctx, num, x, y, w, h) {
      const size = Math.min(w, h) * 0.2; 
      const fontSize = size * 0.6;
      const padding = size * 0.2;
      const cx = x + padding + size/2;
      const cy = y + padding + size/2;

      ctx.beginPath();
      ctx.arc(cx, cy, size/2, 0, 2*Math.PI);
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fill();

      ctx.font = `bold ${fontSize}px sans-serif`;
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(num), cx, cy + fontSize*0.1); 
  },

  onShareAppMessage() {
      return { title: '拼图神器', path: '/pages/collage/collage' };
  }
});
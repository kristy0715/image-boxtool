// pages/collage/collage.js
const Security = require('../../utils/security.js');

// === 1. 广告配置 ===
const AD_CONFIG = {
  BANNER_ID: 'adunit-ecfcec4c6a0c871b',       // 请替换为您的 Banner 广告 ID
  VIDEO_ID: 'adunit-da175a2014d3443b' // 请替换为您的 激励视频广告 ID
};

// === 2. 策略配置 ===
const FREE_COUNT_DAILY = 2; // 每天免费保存 3 次

Page({
  data: {
    imageList: [], 
    imageInfos: [], 
    
    layoutType: 'grid', 
    spacing: 15, 
    bgColor: '#ffffff',
    bgColors: ['#ffffff', '#000000', '#f5f5f5', '#ffe4e6', '#dbeafe', '#dcfce7', '#fef3c7'],
    showNumber: false,
    
    previewWidth: 700,
    previewHeight: 700,
    previewItems: [], 
    
    isProcessing: false,
    loadingText: '处理中...',
    
    // 绑定 Banner ID
    bannerUnitId: AD_CONFIG.BANNER_ID
  },

  videoAd: null, // 广告实例

  onLoad() {
    // 初始化视频广告
    this.initVideoAd();
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
          // A. 完整观看：解锁权益并执行保存流程
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

  // === 4. 额度检查逻辑 (核心入口) ===
  checkQuotaAndSave() {
    const today = new Date().toLocaleDateString();
    const storageKey = 'collage_usage_record'; // 独立 Key
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

  // 监听 Banner 错误
  onAdError(err) {
    console.log('Banner 广告加载失败:', err);
  },

  // === 5. 权限检查流程 ===
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

  // === 业务逻辑 ===

  // 1. 添加图片
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
    const layout = this.calculateLayout(this.data.imageInfos, 700, this.data.spacing);
    this.setData({
        previewWidth: layout.w,
        previewHeight: layout.h,
        previewItems: layout.items
    });
  },

  // === 6. 点击保存入口 ===
  saveImage() {
    if (this.data.imageList.length < 2 && this.data.layoutType !== 'grid') {
        return wx.showToast({ title: '至少需要2张图', icon: 'none' });
    }
    // 触发额度检查
    this.checkQuotaAndSave();
  },

  // === 7. 真正的高清生成与保存逻辑 ===
  async generateAndSave() {
    this.setData({ isProcessing: true, loadingText: '生成中...' });

    try {
        const EXPORT_WIDTH = 2400; 
        const scale = EXPORT_WIDTH / 700;
        const exportSpacing = this.data.spacing * scale;

        const layout = this.calculateLayout(this.data.imageInfos, EXPORT_WIDTH, exportSpacing);

        const canvas = wx.createOffscreenCanvas({ type: '2d', width: layout.w, height: layout.h });
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
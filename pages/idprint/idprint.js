// pages/idprint/idprint.js

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
    imagePath: '',
    selectedSize: '1inch',
    resultImage: '',
    isProcessing: false,
    // 绑定 Banner ID 到 data
    bannerUnitId: AD_CONFIG.BANNER_ID,
    
    sizeList: [
      { id: '1inch', name: '一寸', desc: '常规证件/简历', width: 295, height: 413, cols: 4, rows: 2, count: 8 },
      { id: 'small1', name: '小一寸', desc: '驾驶证/社保', width: 260, height: 378, cols: 5, rows: 3, count: 15 },
      { id: 'big1', name: '大一寸', desc: '护照/港澳通', width: 390, height: 567, cols: 4, rows: 2, count: 8 },
      { id: '2inch', name: '二寸', desc: '常规/财务证', width: 413, height: 579, cols: 4, rows: 2, count: 8 },
      { id: 'small2', name: '小二寸', desc: '多国签证(35x45)', width: 413, height: 531, cols: 4, rows: 2, count: 8 },
      { id: 'visa_us', name: '美国签证', desc: '51x51mm', width: 602, height: 602, cols: 2, rows: 1, count: 2 },
      { id: 'visa_jp', name: '日本签证', desc: '45x45mm', width: 531, height: 531, cols: 3, rows: 2, count: 6 }
    ]
  },

  videoAd: null, // 视频广告实例

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
          // A. 完整观看：解锁权益并保存
          this.setDailyUnlimited();
          wx.showToast({ title: '已解锁今日无限次', icon: 'success' });
          this.doSaveImage(); 
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
    const storageKey = 'idprint_usage_record'; // 注意 key 要和其他模块区分开
    let record = wx.getStorageSync(storageKey) || { date: today, count: 0, isUnlimited: false };

    // 跨天重置
    if (record.date !== today) {
      record = { date: today, count: 0, isUnlimited: false };
      wx.setStorageSync(storageKey, record);
    }

    // 情况A: 已解锁 -> 直接保存
    if (record.isUnlimited) {
      this.doSaveImage();
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
      this.doSaveImage();
      return;
    }

    // 情况C: 次数用尽 -> 弹广告
    this.showAdModal();
  },

  setDailyUnlimited() {
    const today = new Date().toLocaleDateString();
    const storageKey = 'idprint_usage_record';
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
              this.doSaveImage();
            });
          }
        }
      });
    } else {
      this.doSaveImage();
    }
  },

  // === 5. 监听 Banner 错误 ===
  onAdError(err) {
    console.log('Banner 广告加载失败:', err);
  },

  // === 业务逻辑 ===

  chooseImage() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      success: (res) => {
        const tempFilePath = res.tempFiles[0].tempFilePath;
        wx.showLoading({ title: '检测中...' });

        Security.checkImage(tempFilePath).then((isSafe) => {
          wx.hideLoading();
          if (isSafe) {
            this.setData({
              imagePath: tempFilePath,
              resultImage: ''
            });
          }
        }).catch(err => {
            wx.hideLoading();
            // 容错
            this.setData({ imagePath: tempFilePath, resultImage: '' });
        });
      }
    });
  },

  selectSize(e) {
    this.setData({ 
      selectedSize: e.currentTarget.dataset.id,
      resultImage: ''
    });
  },

  generateLayout() {
    if (!this.data.imagePath) {
      wx.showToast({ title: '请先选择照片', icon: 'none' });
      return;
    }

    this.setData({ isProcessing: true });
    wx.showLoading({ title: '排版中...', mask: true });

    const sizeInfo = this.data.sizeList.find(s => s.id === this.data.selectedSize);
    
    // 6寸照片标准尺寸：1800x1200像素 (300dpi)
    const canvasWidth = 1800;
    const canvasHeight = 1200;

    const canvas = wx.createOffscreenCanvas({ type: '2d', width: canvasWidth, height: canvasHeight });
    const ctx = canvas.getContext('2d');

    // 1. 白色背景
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);

    const img = canvas.createImage();
    img.onload = () => {
      try {
        const { width: photoWidth, height: photoHeight, cols, rows } = sizeInfo;
        
        // 2. 计算布局 (留白策略优化)
        const gap = 20; 
        const contentWidth = photoWidth * cols + gap * (cols - 1);
        const contentHeight = photoHeight * rows + gap * (rows - 1);
        const safeMargin = 40; 

        let scale = Math.min(
          (canvasWidth - safeMargin) / contentWidth, 
          (canvasHeight - safeMargin) / contentHeight
        );
        
        if (scale > 1) scale = 1;

        const scaledWidth = photoWidth * scale;
        const scaledHeight = photoHeight * scale;
        const scaledGap = gap * scale;

        const totalWidth = scaledWidth * cols + scaledGap * (cols - 1);
        const totalHeight = scaledHeight * rows + scaledGap * (rows - 1);
        const startX = (canvasWidth - totalWidth) / 2;
        const startY = (canvasHeight - totalHeight) / 2;

        // 3. 绘制
        for (let row = 0; row < rows; row++) {
          for (let col = 0; col < cols; col++) {
            const x = startX + col * (scaledWidth + scaledGap);
            const y = startY + row * (scaledHeight + scaledGap);
            
            ctx.drawImage(img, x, y, scaledWidth, scaledHeight);
            
            // 辅助线
            ctx.strokeStyle = '#e5e7eb';
            ctx.lineWidth = 2;
            ctx.strokeRect(x, y, scaledWidth, scaledHeight);
          }
        }

        // 4. 导出
        wx.canvasToTempFilePath({
            canvas: canvas,
            fileType: 'jpg',
            quality: 0.9,
            success: (res) => {
                this.setData({ resultImage: res.tempFilePath, isProcessing: false });
                wx.hideLoading();
            },
            fail: (err) => {
                console.error("导出失败", err);
                this.setData({ isProcessing: false });
                wx.hideLoading();
                wx.showToast({ title: '生成失败', icon: 'none' });
            }
        });

      } catch (err) {
        console.error(err);
        this.setData({ isProcessing: false });
        wx.hideLoading();
      }
    };

    img.onerror = () => {
      this.setData({ isProcessing: false });
      wx.hideLoading();
      wx.showToast({ title: '图片加载失败', icon: 'none' });
    };

    img.src = this.data.imagePath;
  },

  // === 6. 保存按钮点击入口 ===
  saveImage() {
    if (!this.data.resultImage) return;
    // 先检查额度
    this.checkQuotaAndSave();
  },

  // === 7. 真正的保存操作 ===
  doSaveImage() {
    wx.saveImageToPhotosAlbum({
      filePath: this.data.resultImage,
      success: () => {
        wx.navigateTo({
          url: `/pages/success/success?path=${encodeURIComponent(this.data.resultImage)}`
        });
      },
      fail: (err) => {
        if (err.errMsg.indexOf('cancel') === -1) {
            wx.showModal({
                title: '提示', content: '需要授权保存图片',
                success: (res) => { if (res.confirm) wx.openSetting(); }
            });
        }
      }
    });
  },

  onShareAppMessage() {
    return { title: '证件照自动排版', path: '/pages/idprint/idprint', imageUrl: this.data.resultImage || '' };
  },
  onShareTimeline() {
    return { title: '证件照排版工具', imageUrl: this.data.resultImage || '' };
  },
});
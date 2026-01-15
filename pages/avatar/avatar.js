// pages/avatar/avatar.js

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
    imagePath: '',
    selectedFrame: 'flag',
    frameColor: '#ff0000',
    generatedPath: '',
    
    // 广告数据
    bannerUnitId: AD_CONFIG.BANNER_ID,
    
    frameList: [
      { id: 'none', name: '无', icon: '⭕', preview: '#f1f5f9' },
      { id: 'flag', name: '国旗', icon: '🇨🇳', preview: '#ffebeb' },
      { id: 'heart', name: '爱心', icon: '❤️', preview: '#ffe0e6' },
      { id: 'star', name: '星星', icon: '⭐', preview: '#fff8e0' },
      { id: 'rainbow', name: '彩虹', icon: '🌈', preview: 'linear-gradient(135deg, #ff6b6b, #feca57, #48dbfb, #ff9ff3)' },
      { id: 'christmas', name: '圣诞', icon: '🎄', preview: '#e8f5e9' },
      { id: 'newyear', name: '新年', icon: '🧧', preview: '#ffebee' },
      { id: 'birthday', name: '生日', icon: '🎂', preview: '#fff3e0' }
    ],
    colorList: ['#ff0000', '#ff6b6b', '#feca57', '#1dd1a1', '#48dbfb', '#5f27cd', '#ff9ff3', '#222222']
  },

  videoAd: null, // 广告实例

  onLoad() {
    this.dpr = wx.getSystemInfoSync().pixelRatio;
    this.initVideoAd();
  },

  onReady() {
    this.initCanvas();
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
          this.realSaveProcess(); 
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
    const storageKey = 'avatar_usage_record'; // 独立 Key
    let record = wx.getStorageSync(storageKey) || { date: today, count: 0, isUnlimited: false };

    // 跨天重置
    if (record.date !== today) {
      record = { date: today, count: 0, isUnlimited: false };
      wx.setStorageSync(storageKey, record);
    }

    // 情况A: 已解锁 -> 直接保存
    if (record.isUnlimited) {
      this.realSaveProcess();
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
      this.realSaveProcess();
      return;
    }

    // 情况C: 次数用尽 -> 弹广告
    this.showAdModal();
  },

  setDailyUnlimited() {
    const today = new Date().toLocaleDateString();
    const storageKey = 'avatar_usage_record';
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
              this.realSaveProcess();
            });
          }
        }
      });
    } else {
      this.realSaveProcess();
    }
  },

  onAdError(err) {
    console.log('Banner 广告加载失败:', err);
  },

  initCanvas() {
    const query = wx.createSelectorQuery();
    query.select('#avatarCanvas')
      .fields({ node: true, size: true })
      .exec((res) => {
        if (res[0]) {
          this.canvas = res[0].node;
          this.ctx = this.canvas.getContext('2d');
          
          const dpr = this.dpr;
          this.canvas.width = 300 * dpr;
          this.canvas.height = 300 * dpr;
          this.ctx.scale(dpr, dpr);
        }
      });
  },

  chooseImage() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      success: (res) => {
        const tempFilePath = res.tempFiles[0].tempFilePath;

        wx.showLoading({ title: '安全检测中...' });

        Security.checkImage(tempFilePath).then((isSafe) => {
          wx.hideLoading();

          if (isSafe) {
            this.setData({ imagePath: tempFilePath });
            setTimeout(() => {
              if (!this.canvas) this.initCanvas();
              setTimeout(() => this.drawAvatar(), 150);
            }, 100);
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

  selectFrame(e) {
    this.setData({ selectedFrame: e.currentTarget.dataset.id });
    this.drawAvatar();
  },

  selectColor(e) {
    this.setData({ frameColor: e.currentTarget.dataset.color });
    this.drawAvatar();
  },

  drawAvatar() {
    if (!this.canvas || !this.data.imagePath) return;

    const ctx = this.ctx;
    const size = 300; 
    const { selectedFrame, frameColor } = this.data;

    ctx.clearRect(0, 0, size, size);

    const img = this.canvas.createImage();
    img.onload = () => {
      ctx.save();
      ctx.beginPath();
      ctx.arc(size / 2, size / 2, size / 2 - 15, 0, Math.PI * 2);
      ctx.clip();

      const imgRatio = img.width / img.height;
      let sx, sy, sw, sh;
      if (imgRatio > 1) {
        sh = img.height;
        sw = sh;
        sx = (img.width - sw) / 2;
        sy = 0;
      } else {
        sw = img.width;
        sh = sw;
        sx = 0;
        sy = (img.height - sh) / 2;
      }

      ctx.drawImage(img, sx, sy, sw, sh, 15, 15, size - 30, size - 30);
      ctx.restore();

      if (selectedFrame !== 'none') {
        this.drawFrame(ctx, size, selectedFrame, frameColor);
      }

      setTimeout(() => {
        wx.canvasToTempFilePath({
          canvas: this.canvas,
          width: 300,
          height: 300,
          destWidth: 300 * this.dpr, 
          destHeight: 300 * this.dpr,
          success: (res) => {
            this.setData({ generatedPath: res.tempFilePath });
          }
        });
      }, 100);
    };
    img.src = this.data.imagePath;
  },

  drawFrame(ctx, size, frameType, color) {
    const centerX = size / 2;
    const centerY = size / 2;
    const radius = size / 2 - 8;

    ctx.lineWidth = 12;

    switch (frameType) {
      case 'flag':
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, 0.3 * Math.PI, 0.7 * Math.PI);
        ctx.strokeStyle = '#ff0000';
        ctx.stroke();
        ctx.fillStyle = '#ffde00';
        this.drawStar(ctx, size * 0.2, size * 0.75, 8);
        break;

      case 'heart':
        ctx.fillStyle = color;
        for (let i = 0; i < 8; i++) {
          const angle = (i / 8) * Math.PI * 2 - Math.PI / 2;
          const x = centerX + Math.cos(angle) * (radius + 5);
          const y = centerY + Math.sin(angle) * (radius + 5);
          this.drawHeart(ctx, x, y, 12);
        }
        break;

      case 'star':
        ctx.fillStyle = color;
        for (let i = 0; i < 8; i++) {
          const angle = (i / 8) * Math.PI * 2 - Math.PI / 2;
          const x = centerX + Math.cos(angle) * (radius + 5);
          const y = centerY + Math.sin(angle) * (radius + 5);
          this.drawStar(ctx, x, y, 10);
        }
        break;

      case 'rainbow':
        const colors = ['#ff6b6b', '#feca57', '#48dbfb', '#1dd1a1', '#5f27cd'];
        colors.forEach((c, i) => {
          ctx.beginPath();
          ctx.arc(centerX, centerY, radius - i * 2, 0, Math.PI * 2);
          ctx.strokeStyle = c;
          ctx.lineWidth = 3;
          ctx.stroke();
        });
        break;

      case 'christmas':
        ctx.strokeStyle = '#2ecc71';
        ctx.lineWidth = 10;
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = '#e74c3c';
        for (let i = 0; i < 6; i++) {
          const angle = (i / 6) * Math.PI * 2;
          const x = centerX + Math.cos(angle) * radius;
          const y = centerY + Math.sin(angle) * radius;
          ctx.beginPath();
          ctx.arc(x, y, 8, 0, Math.PI * 2);
          ctx.fill();
        }
        break;

      case 'newyear':
        ctx.strokeStyle = '#e74c3c';
        ctx.lineWidth = 12;
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
        ctx.stroke();
        break;

      case 'birthday':
        const bdColors = ['#ff6b6b', '#feca57', '#48dbfb', '#ff9ff3', '#1dd1a1'];
        ctx.lineWidth = 12;
        for (let i = 0; i < 10; i++) {
          ctx.beginPath();
          ctx.arc(centerX, centerY, radius, (i / 10) * Math.PI * 2, ((i + 1) / 10) * Math.PI * 2);
          ctx.strokeStyle = bdColors[i % bdColors.length];
          ctx.stroke();
        }
        break;
    }
  },

  drawStar(ctx, x, y, r) {
    ctx.beginPath();
    for (let i = 0; i < 5; i++) {
      const angle = (i * 4 * Math.PI) / 5 - Math.PI / 2;
      const px = x + r * Math.cos(angle);
      const py = y + r * Math.sin(angle);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
  },

  drawHeart(ctx, x, y, s) {
    ctx.beginPath();
    ctx.moveTo(x, y + s / 4);
    ctx.bezierCurveTo(x, y, x - s / 2, y, x - s / 2, y + s / 4);
    ctx.bezierCurveTo(x - s / 2, y + s / 2, x, y + s * 0.75, x, y + s);
    ctx.bezierCurveTo(x, y + s * 0.75, x + s / 2, y + s / 2, x + s / 2, y + s / 4);
    ctx.bezierCurveTo(x + s / 2, y, x, y, x, y + s / 4);
    ctx.fill();
  },

  // === 5. 点击保存入口 ===
  saveImage() {
    if (!this.canvas) return;
    this.checkQuotaAndSave();
  },

  // === 6. 真正的保存逻辑 ===
  realSaveProcess() {
    wx.showLoading({ title: '保存中...' });
    
    wx.canvasToTempFilePath({
      canvas: this.canvas,
      width: 300,
      height: 300,
      destWidth: 300 * this.dpr,
      destHeight: 300 * this.dpr,
      success: (res) => {
        wx.saveImageToPhotosAlbum({
          filePath: res.tempFilePath,
          success: () => {
            wx.hideLoading();
            // 跳转到统一成功页
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
        wx.showToast({ title: '导出失败', icon: 'none' });
      }
    });
  },

  onShareAppMessage() {
    return {
      title: '一键生成节日头像，快来试试！',
      path: '/pages/avatar/avatar',
      imageUrl: this.data.generatedPath || '' 
    };
  },

  onShareTimeline() {
    return {
      title: '我的头像新挂件，好看吗？',
      imageUrl: this.data.generatedPath || ''
    };
  }
});
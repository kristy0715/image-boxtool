// pages/text2img/text2img.js

const Security = require('../../utils/security.js');

// === 1. 广告配置 ===
const AD_CONFIG = {
  BANNER_ID: 'adunit-ecfcec4c6a0c871b',       // 请替换为您的 Banner 广告 ID
  VIDEO_ID: 'adunit-da175a2014d3443b' // 请替换为您的 激励视频广告 ID
};

// === 2. 策略配置 ===
const FREE_COUNT_DAILY = 2; // 每天免费保存 2 次

Page({
  data: {
    content: '',
    author: '',
    bgColor: '#ffffff',
    textColor: '#333333',
    fontSize: 28,
    fontWeight: 'normal',
    lineHeightScale: 1.6,
    textAlign: 'left',
    padding: 60,
    showWatermark: false, // 默认关闭，或者保留作为开关但暂时不绘制
    previewImage: '',
    
    // 绑定 Banner ID
    bannerUnitId: AD_CONFIG.BANNER_ID,

    bgColors: [{ value: '#ffffff', name: '纯白' }, { value: '#f6f7f9', name: '米白' }, { value: '#fff1f0', name: '信纸' }, { value: '#fffbe6', name: '暖黄' }, { value: '#2d3436', name: '夜间' }, { value: '#000000', name: '纯黑' }],
    textColors: ['#2d3436', '#57606f', '#000000', '#1e90ff', '#ff4757', '#2ed573', '#ffffff']
  },

  videoAd: null, // 广告实例

  onLoad() {
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
    const storageKey = 'text2img_usage_record'; // 独立 Key
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
    const storageKey = 'text2img_usage_record';
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

  // === 业务逻辑 ===

  onContentInput(e) { this.setData({ content: e.detail.value }); },
  onAuthorInput(e) { this.setData({ author: e.detail.value }); },
  selectBgColor(e) {
    const bg = e.currentTarget.dataset.color;
    let text = this.data.textColor;
    if ((bg === '#2d3436' || bg === '#000000') && text === '#333333') text = '#ffffff';
    else if (bg === '#ffffff' && text === '#ffffff') text = '#333333';
    this.setData({ bgColor: bg, textColor: text });
  },
  selectTextColor(e) { this.setData({ textColor: e.currentTarget.dataset.color }); },
  onFontSizeChange(e) { this.setData({ fontSize: e.detail.value }); },
  onLineHeightChange(e) { this.setData({ lineHeightScale: e.detail.value }); },
  
  toggleAlign() { this.setData({ textAlign: this.data.textAlign === 'left' ? 'center' : 'left' }); },
  toggleBold() { this.setData({ fontWeight: this.data.fontWeight === 'normal' ? 'bold' : 'normal' }); },
  toggleWatermark() { this.setData({ showWatermark: !this.data.showWatermark }); },

  generateImage() {
    if (!this.data.content.trim()) return wx.showToast({ title: '请输入内容', icon: 'none' });
    wx.showLoading({ title: '生成中...' });

    Security.checkText(this.data.content + this.data.author).then(isSafe => {
      if (!isSafe) {
        wx.hideLoading();
        return; 
      }
      this.createCanvas();
    }).catch(() => {
      wx.hideLoading(); // 容错
      this.createCanvas();
    });
  },

  createCanvas() {
    const sys = wx.getSystemInfoSync();
    const width = 750; // 固定画布宽度
    const padding = this.data.padding;
    
    // 字体设置
    const fontSize = this.data.fontSize;
    const ctx = wx.createOffscreenCanvas({ type: '2d', width: 100, height: 100 }).getContext('2d');
    ctx.font = `${this.data.fontWeight} ${fontSize}px sans-serif`;
    const lineHeight = fontSize * this.data.lineHeightScale;
    
    // 计算正文高度
    const textWidth = width - padding * 2;
    const lines = this.getLines(ctx, this.data.content, textWidth);
    let contentHeight = lines.length * lineHeight;
    
    // 计算总高度
    let totalHeight = padding + contentHeight + padding;
    if (this.data.author) totalHeight += 60; // 署名区
    // 【修改点】移除了水印的高度计算
    // if (this.data.showWatermark) totalHeight += 40; 

    // 创建正式画布
    const canvas = wx.createOffscreenCanvas({ type: '2d', width, height: totalHeight });
    const drawCtx = canvas.getContext('2d');

    // 1. 绘制背景
    drawCtx.fillStyle = this.data.bgColor;
    drawCtx.fillRect(0, 0, width, totalHeight);

    // 2. 绘制正文
    drawCtx.fillStyle = this.data.textColor;
    drawCtx.font = `${this.data.fontWeight} ${fontSize}px sans-serif`;
    drawCtx.textBaseline = 'top';
    drawCtx.textAlign = this.data.textAlign;

    let y = padding;
    lines.forEach(line => {
      let x = this.data.textAlign === 'center' ? width / 2 : padding;
      drawCtx.fillText(line, x, y);
      y += lineHeight;
    });

    // 3. 绘制署名
    if (this.data.author) {
      y += 20;
      drawCtx.font = `italic ${fontSize * 0.9}px sans-serif`;
      drawCtx.textAlign = 'right';
      drawCtx.globalAlpha = 0.8;
      drawCtx.fillText('—— ' + this.data.author, width - padding, y);
      drawCtx.globalAlpha = 1.0;
      y += 40;
    }

    // 4. 【修改点】移除了底部水印绘制代码
    /* if (this.data.showWatermark) {
      y += 20;
      drawCtx.font = '24px sans-serif';
      drawCtx.fillStyle = '#999999';
      drawCtx.textAlign = 'center';
      drawCtx.fillText('Created by 实用工具箱', width / 2, totalHeight - 30);
    }
    */

    // 5. 导出
    const base64 = canvas.toDataURL('image/png', 0.9);
    const tempFilePath = `${wx.env.USER_DATA_PATH}/text_${Date.now()}.png`;

    wx.getFileSystemManager().writeFile({
      filePath: tempFilePath, data: base64.replace(/^data:image\/\w+;base64,/, ''), encoding: 'base64',
      success: () => {
        this.setData({ previewImage: tempFilePath }); 
        wx.hideLoading();
        // 自动滚动到底部
        setTimeout(() => { wx.pageScrollTo({ selector: '.bottom-bar', duration: 300 }); }, 100);
      },
      fail: (err) => { console.error(err); wx.hideLoading(); wx.showToast({ title: '生成失败', icon: 'none' }); }
    });
  },

  getLines(ctx, text, maxWidth) {
    const lines = []; const paragraphs = text.split('\n');
    paragraphs.forEach(para => {
      if (para === '') { lines.push(''); return; }
      let currentLine = '';
      for (let i = 0; i < para.length; i++) {
        const char = para[i]; const testLine = currentLine + char;
        const metrics = ctx.measureText(testLine);
        if (metrics.width > maxWidth && i > 0) { lines.push(currentLine); currentLine = char; }
        else { currentLine = testLine; }
      }
      lines.push(currentLine);
    });
    return lines;
  },

  // === 5. 点击保存入口 ===
  saveImage() {
    // 【修改点】增加安全检查
    if (!this.data.previewImage) {
        return wx.showToast({ title: '请先点击生成预览', icon: 'none' });
    }
    // 触发额度检查
    this.checkQuotaAndSave();
  },

  // === 6. 权限检查与保存流程 ===
  startSaveProcess() {
    wx.getSetting({
      success: (res) => {
        if (res.authSetting['scope.writePhotosAlbum']) {
          this.doSaveImage();
        } else if (res.authSetting['scope.writePhotosAlbum'] === false) {
          wx.showModal({
            title: '提示', content: '需要授权保存图片',
            success: (res) => { if (res.confirm) wx.openSetting(); }
          });
        } else {
          wx.authorize({
            scope: 'scope.writePhotosAlbum',
            success: () => this.doSaveImage(),
            fail: () => wx.showToast({ title: '授权失败', icon: 'none' })
          });
        }
      }
    });
  },

  // === 7. 真正的保存逻辑 ===
  doSaveImage() {
    wx.saveImageToPhotosAlbum({
      filePath: this.data.previewImage,
      success: () => {
        wx.navigateTo({
          url: `/pages/success/success?path=${encodeURIComponent(this.data.previewImage)}`
        });
      },
      fail: (err) => {
        if (err.errMsg.indexOf('cancel') === -1) {
            wx.showToast({ title: '保存失败', icon: 'none' });
        }
      }
    });
  },

  // === 分享配置 ===
  onShareAppMessage() {
    const imageUrl = this.data.previewImage || '/assets/share-cover.png';
    return {
      title: '长文转图片防折叠，朋友圈发文神器！',
      path: '/pages/text2img/text2img',
      imageUrl: imageUrl
    };
  },

  onShareTimeline() {
    const imageUrl = this.data.previewImage || '/assets/share-cover.png';
    return {
      title: '长文转图片防折叠，朋友圈发文神器！',
      query: '',
      imageUrl: imageUrl
    };
  }
});
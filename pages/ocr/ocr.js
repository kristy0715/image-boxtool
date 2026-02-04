// pages/ocr/ocr.js
const app = getApp();
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
    recognizedText: '',
    showGuide: false, // 是否显示引导弹窗
    shareImagePath: '', 
    canvasWidth: 600,   
    canvasHeight: 800,
    isProcessing: false,
    
    // 绑定 Banner ID
    bannerUnitId: AD_CONFIG.BANNER_ID
  },

  videoAd: null, 
  ctx: null,
  canvas: null,

  onLoad() {
    // 读取上次缓存
    const lastText = wx.getStorageSync('ocr_history');
    if (lastText) {
      this.setData({ recognizedText: lastText });
    }
    this.initVideoAd();
  },

  onReady() {
    // 延迟初始化画布，确保节点已渲染
    setTimeout(() => this.initCanvas(), 500);
  },

  // === 3. 初始化激励视频 ===
  initVideoAd() {
    if (wx.createRewardedVideoAd) {
      this.videoAd = wx.createRewardedVideoAd({ adUnitId: AD_CONFIG.VIDEO_ID });
      this.videoAd.onLoad(() => console.log('激励视频加载成功'));
      this.videoAd.onError((err) => console.error('激励视频加载失败', err));
      
      this.videoAd.onClose((res) => {
        if (res && res.isEnded) {
          this.setDailyUnlimited();
          wx.showToast({ title: '已解锁今日无限次', icon: 'success' });
          this.doSaveCard(); 
        } else {
          wx.showModal({
            title: '提示',
            content: '完整观看视频才能解锁保存权限哦',
            confirmText: '继续观看',
            success: (m) => { if (m.confirm) this.videoAd.show(); }
          });
        }
      });
    }
  },

  // === 4. 额度检查逻辑 ===
  checkQuotaAndSave() {
    if (!this.data.recognizedText) return wx.showToast({ title: '内容为空', icon: 'none' });

    const today = new Date().toLocaleDateString();
    const storageKey = 'ocr_usage_record';
    let record = wx.getStorageSync(storageKey) || { date: today, count: 0, isUnlimited: false };

    if (record.date !== today) {
      record = { date: today, count: 0, isUnlimited: false };
      wx.setStorageSync(storageKey, record);
    }

    if (record.isUnlimited) {
      this.doSaveCard();
      return;
    }

    if (record.count < FREE_COUNT_DAILY) {
      record.count++;
      wx.setStorageSync(storageKey, record);
      const left = FREE_COUNT_DAILY - record.count;
      if (left > 0) wx.showToast({ title: `今日剩余免费${left}次`, icon: 'none' });
      this.doSaveCard();
      return;
    }

    this.showAdModal();
  },

  setDailyUnlimited() {
    const today = new Date().toLocaleDateString();
    const storageKey = 'ocr_usage_record';
    const record = { date: today, count: 999, isUnlimited: true };
    wx.setStorageSync(storageKey, record);
  },

  showAdModal() {
    if (this.videoAd) {
      wx.showModal({
        title: '免费次数已用完',
        content: '观看视频解锁无限次保存权限',
        confirmText: '免费解锁',
        cancelText: '取消',
        success: (res) => {
          if (res.confirm) {
            this.videoAd.show().catch(() => this.doSaveCard());
          }
        }
      });
    } else {
      this.doSaveCard();
    }
  },

  onAdError(err) { console.log('Banner广告错误:', err); },

  // === 业务逻辑 ===

  initCanvas() {
    const query = wx.createSelectorQuery();
    query.select('#cardCanvas')
      .fields({ node: true, size: true })
      .exec((res) => {
        if (res[0]) {
          this.canvas = res[0].node;
          this.ctx = this.canvas.getContext('2d');
          // 初始化画布尺寸，防止导出空白
          const dpr = wx.getSystemInfoSync().pixelRatio;
          this.canvas.width = res[0].width * dpr;
          this.canvas.height = res[0].height * dpr;
          this.ctx.scale(dpr, dpr);
        }
      });
  },

  chooseImage() {
    wx.chooseMedia({
      count: 1, mediaType: ['image'],
      success: (res) => {
        const tempFilePath = res.tempFiles[0].tempFilePath;
        wx.showLoading({ title: '安全检测中...' });
        Security.checkImage(tempFilePath).then((isSafe) => {
          wx.hideLoading();
          if (isSafe) {
            this.setData({ imagePath: tempFilePath, showGuide: true });
          }
        }).catch(() => {
            wx.hideLoading();
            this.setData({ imagePath: tempFilePath, showGuide: true });
        });
      }
    });
  },

  // 点击预览图
  previewAndRecognize() {
    if (this.data.imagePath) {
      this.setData({ showGuide: false }); // 关闭弹窗
      wx.previewImage({
        urls: [this.data.imagePath],
        current: this.data.imagePath
      });
      // 延迟提示
      setTimeout(() => {
          wx.showToast({ title: '长按图片->提取文字', icon: 'none', duration: 3000 });
      }, 800);
    }
  },

  // 粘贴逻辑
  pasteFromClipboard() {
    wx.getClipboardData({
      success: (res) => {
        if (res.data) {
          this.setData({ recognizedText: res.data });
          wx.setStorageSync('ocr_history', res.data); // 存缓存
          wx.showToast({ title: '已粘贴', icon: 'success' });
        } else {
          wx.showToast({ title: '剪贴板为空', icon: 'none' });
        }
      }
    });
  },

  // 【修复】清空逻辑
  clearText() {
    wx.showModal({
        title: '提示',
        content: '确定清空当前文字吗？',
        success: (res) => {
            if (res.confirm) {
                this.setData({ recognizedText: '' });
                wx.removeStorageSync('ocr_history');
            }
        }
    });
  },

  onTextInput(e) {
    this.setData({ recognizedText: e.detail.value });
    wx.setStorageSync('ocr_history', e.detail.value);
  },

  copyText() {
    if (!this.data.recognizedText) return;
    wx.setClipboardData({
      data: this.data.recognizedText,
      success: () => wx.showToast({ title: '已复制', icon: 'success' })
    });
  },

  // 引导弹窗控制
  closeGuide() {
      this.setData({ showGuide: false });
  },

  // === 保存入口 ===
  onSaveCard() {
    this.checkQuotaAndSave();
  },

  // === 核心：生成并保存 (修复跳转) ===
  doSaveCard() {
    if (!this.ctx) return wx.showToast({ title: '画布初始化中...', icon: 'none' });
    this.setData({ isProcessing: true });
    wx.showLoading({ title: '生成卡片...' });

    this.generateShareCard()
      .then(tempFilePath => {
        // 1. 保存到相册
        wx.saveImageToPhotosAlbum({
            filePath: tempFilePath,
            success: () => {
                this.setData({ isProcessing: false });
                wx.hideLoading();
                // 2. 【修复】成功后跳转
                wx.navigateTo({
                    url: `/pages/success/success?path=${encodeURIComponent(tempFilePath)}`
                });
            },
            fail: (err) => {
                this.setData({ isProcessing: false });
                wx.hideLoading();
                if (err.errMsg.indexOf('cancel') === -1) {
                    wx.showModal({ title: '提示', content: '需要相册权限', success: (res) => { if (res.confirm) wx.openSetting(); } });
                }
            }
        });
      })
      .catch((err) => {
        console.error(err);
        this.setData({ isProcessing: false });
        wx.hideLoading();
        wx.showToast({ title: '生成失败', icon: 'none' });
      });
  },

  // 绘制卡片
  generateShareCard() {
    return new Promise((resolve, reject) => {
        const text = this.data.recognizedText;
        const width = 600; // 卡片宽度
        const padding = 40;
        const fontSize = 28;
        const lineHeight = 44;
        const headerHeight = 120;
        const footerHeight = 100;
        
        // 计算高度
        this.ctx.font = `${fontSize}px sans-serif`; // 必须先设置字体才能计算宽度
        const lines = this.breakLines(text, width - padding * 2, fontSize);
        const contentHeight = lines.length * lineHeight;
        const totalHeight = headerHeight + contentHeight + footerHeight;
        
        // 重置画布大小（不影响 dpr）
        this.setData({ canvasWidth: width, canvasHeight: totalHeight }, () => {
            // 等待 setData 生效，重新获取 context 确保尺寸更新
            const query = wx.createSelectorQuery();
            query.select('#cardCanvas').fields({ node: true, size: true }).exec((res) => {
                if (!res[0]) return reject('Canvas not found');
                
                const canvas = res[0].node;
                const ctx = canvas.getContext('2d');
                const dpr = wx.getSystemInfoSync().pixelRatio;
                
                canvas.width = width * dpr;
                canvas.height = totalHeight * dpr;
                ctx.scale(dpr, dpr);

                // 开始绘制
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(0, 0, width, totalHeight);
                
                // 装饰条
                ctx.fillStyle = '#6366f1';
                ctx.fillRect(padding, 40, 8, 40);

                // 标题
                ctx.fillStyle = '#1e293b';
                ctx.font = 'bold 36px sans-serif';
                ctx.textBaseline = 'top';
                ctx.fillText('文字卡片', padding + 24, 40);
                
                // 正文
                ctx.fillStyle = '#334155';
                ctx.font = `${fontSize}px sans-serif`;
                let y = headerHeight;
                lines.forEach(line => {
                  ctx.fillText(line, padding, y);
                  y += lineHeight;
                });
                
                // 分割线
                ctx.strokeStyle = '#f1f5f9';
                ctx.beginPath();
                ctx.moveTo(padding, totalHeight - 80);
                ctx.lineTo(width - padding, totalHeight - 80);
                ctx.stroke();

                // 底部
                ctx.fillStyle = '#94a3b8';
                ctx.font = '24px sans-serif';
                ctx.fillText('Created by 实用工具箱', padding, totalHeight - 50);
                
                // 导出
                setTimeout(() => {
                    wx.canvasToTempFilePath({
                      canvas: canvas,
                      fileType: 'jpg',
                      quality: 0.9,
                      success: (res) => resolve(res.tempFilePath),
                      fail: reject
                    });
                }, 100);
            });
        });
    });
  },

  // 换行计算
  breakLines(text, maxWidth, fontSize) {
    // 模拟计算，ctx 已经在外面设置了字体
    const arr = [];
    let line = '';
    
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      if (char === '\n') {
          arr.push(line);
          line = '';
          continue;
      }
      const testLine = line + char;
      const metrics = this.ctx.measureText(testLine);
      if (metrics.width > maxWidth && i > 0) {
        arr.push(line);
        line = char;
      } else {
        line = testLine;
      }
    }
    arr.push(line);
    return arr;
  },

  // === 分享配置 ===
  onShareAppMessage() {
    const imageUrl = this.data.imagePath || '/assets/share-cover.png';
    return {
      title: '免费图片转文字OCR，拍照一键提取！',
      path: '/pages/ocr/ocr',
      imageUrl: imageUrl
    };
  },

  onShareTimeline() {
    const imageUrl = this.data.imagePath || '/assets/share-cover.png';
    return {
      title: '免费图片转文字OCR，拍照一键提取！',
      query: '',
      imageUrl: imageUrl
    };
  }
});
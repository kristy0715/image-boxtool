// pages/batchwm/batchwm.js

const Security = require('../../utils/security.js');

// === 1. 广告配置 ===
const AD_CONFIG = {
  BANNER_ID: 'adunit-ecfcec4c6a0c871b',       // Banner 广告 ID
  VIDEO_ID: 'adunit-da175a2014d3443b'         // 激励视频广告 ID
};

// === 2. 策略配置 ===
const FREE_COUNT_DAILY = 2; // 每天免费保存 2 次 (每次批量算1次)

Page({
  data: {
    imageList: [],
    watermarkText: '我的水印',
    fontSize: 40,
    opacity: 80,
    textColor: '#ffffff',
    position: 'bottomRight',
    
    isProcessing: false,
    loadingText: '处理中...',
    
    // 颜色配置
    colorList: ['#ffffff', '#000000', '#ff0000', '#ffff00', '#00ff00', '#0000ff'],
    // 位置配置
    positionList: [
      { id: 'topLeft', name: '左上' },
      { id: 'topRight', name: '右上' },
      { id: 'center', name: '居中' },
      { id: 'bottomLeft', name: '左下' },
      { id: 'bottomRight', name: '右下' }
    ],
    
    // 广告数据
    bannerUnitId: AD_CONFIG.BANNER_ID
  },

  videoAd: null, 

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

  // === 4. 额度检查 ===
  checkQuotaAndSave() {
    const today = new Date().toLocaleDateString();
    const storageKey = 'batchwm_usage_record';
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
    const storageKey = 'batchwm_usage_record';
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

  // === 业务逻辑 ===

  addImages() {
    const currentLen = this.data.imageList.length;
    if (currentLen >= 20) return wx.showToast({ title: '最多添加20张', icon: 'none' });

    wx.chooseMedia({
      count: 20 - currentLen,
      mediaType: ['image'],
      sizeType: ['original'], // 尽量原图
      success: (res) => {
        const newPaths = res.tempFiles.map(f => f.tempFilePath);
        
        // 简单安全检测（取第一张检测，避免太慢）
        wx.showLoading({ title: '检测中...' });
        Security.checkImage(newPaths[0]).then(isSafe => {
            wx.hideLoading();
            if(isSafe) {
                this.setData({
                    imageList: [...this.data.imageList, ...newPaths]
                });
            } else {
                wx.showToast({ title: '图片未通过检测', icon: 'none' });
            }
        }).catch(() => {
            wx.hideLoading();
            // 兜底允许
            this.setData({ imageList: [...this.data.imageList, ...newPaths] });
        });
      }
    });
  },

  removeImage(e) {
    const index = e.currentTarget.dataset.index;
    const list = this.data.imageList;
    list.splice(index, 1);
    this.setData({ imageList: list });
  },

  onTextInput(e) { this.setData({ watermarkText: e.detail.value }); },
  onFontSizeChange(e) { this.setData({ fontSize: e.detail.value }); },
  onOpacityChange(e) { this.setData({ opacity: e.detail.value }); },
  selectColor(e) { this.setData({ textColor: e.currentTarget.dataset.color }); },
  selectPosition(e) { this.setData({ position: e.currentTarget.dataset.id }); },

  // === 保存流程 ===

  batchSave() {
    if (this.data.imageList.length === 0) return;
    if (!this.data.watermarkText.trim()) return wx.showToast({ title: '请输入水印文字', icon: 'none' });
    
    this.checkQuotaAndSave();
  },

  startSaveProcess() {
    // 授权检查
    wx.getSetting({
      success: (res) => {
        if (res.authSetting['scope.writePhotosAlbum']) {
          this.doBatchSave();
        } else if (res.authSetting['scope.writePhotosAlbum'] === false) {
          wx.showModal({
            title: '提示', content: '需要授权保存到相册',
            success: (m) => { if (m.confirm) wx.openSetting(); }
          });
        } else {
          wx.authorize({
            scope: 'scope.writePhotosAlbum',
            success: () => this.doBatchSave(),
            fail: () => wx.showToast({ title: '授权失败', icon: 'none' })
          });
        }
      }
    });
  },

  // === 核心：队列式批量处理 ===
  async doBatchSave() {
    this.setData({ isProcessing: true });
    
    const total = this.data.imageList.length;
    let successCount = 0;
    let lastResultPath = '';

    try {
        // 使用 for 循环 + await 实现串行处理，防止并发过多导致内存溢出
        for (let i = 0; i < total; i++) {
            this.setData({ loadingText: `正在处理 ${i + 1}/${total}` });
            
            const src = this.data.imageList[i];
            
            // 1. 生成带水印图片
            const tempPath = await this.processSingleImage(src);
            
            // 2. 保存到相册
            await this.saveToAlbum(tempPath);
            
            lastResultPath = tempPath;
            successCount++;
        }

        // 全部完成后
        this.setData({ isProcessing: false });
        
        // === 修复点：跳转到成功页 ===
        // 将最后一张图的路径传过去作为预览
        wx.navigateTo({
            url: `/pages/success/success?path=${encodeURIComponent(lastResultPath)}`
        });

    } catch (err) {
        console.error(err);
        this.setData({ isProcessing: false });
        wx.showToast({ title: '部分图片处理失败', icon: 'none' });
    }
  },

  // 处理单张图片 (生成水印)
  processSingleImage(src) {
    return new Promise((resolve, reject) => {
        wx.getImageInfo({
            src: src,
            success: (info) => {
                // 创建离屏 Canvas (性能更好)
                const canvas = wx.createOffscreenCanvas({ type: '2d', width: info.width, height: info.height });
                const ctx = canvas.getContext('2d');
                const img = canvas.createImage();
                
                img.onload = () => {
                    const width = info.width;
                    const height = info.height;
                    
                    // 1. 绘制原图
                    ctx.drawImage(img, 0, 0, width, height);
                    
                    // 2. 绘制水印
                    const fontSize = Math.max(20, width * (this.data.fontSize / 300)); // 动态计算字号，避免大图字太小
                    ctx.font = `bold ${fontSize}px sans-serif`;
                    ctx.fillStyle = this.data.textColor;
                    ctx.globalAlpha = this.data.opacity / 100;
                    ctx.textBaseline = 'middle';
                    
                    const text = this.data.watermarkText;
                    const metrics = ctx.measureText(text);
                    const textWidth = metrics.width;
                    
                    let x = 0, y = 0;
                    const padding = width * 0.05; // 5% 边距

                    switch (this.data.position) {
                        case 'topLeft': x = padding; y = padding + fontSize/2; ctx.textAlign = 'left'; break;
                        case 'topRight': x = width - padding; y = padding + fontSize/2; ctx.textAlign = 'right'; break;
                        case 'bottomLeft': x = padding; y = height - padding - fontSize/2; ctx.textAlign = 'left'; break;
                        case 'bottomRight': x = width - padding; y = height - padding - fontSize/2; ctx.textAlign = 'right'; break;
                        case 'center': x = width / 2; y = height / 2; ctx.textAlign = 'center'; break;
                    }
                    
                    // 文字阴影
                    ctx.shadowColor = 'rgba(0,0,0,0.5)';
                    ctx.shadowBlur = 4;
                    ctx.fillText(text, x, y);
                    
                    // 3. 导出临时文件
                    wx.canvasToTempFilePath({
                        canvas,
                        fileType: 'jpg',
                        quality: 0.85,
                        success: (res) => resolve(res.tempFilePath),
                        fail: reject
                    });
                };
                img.onerror = reject;
                img.src = src;
            },
            fail: reject
        });
    });
  },

  // 保存单张到相册 (封装为 Promise)
  saveToAlbum(filePath) {
      return new Promise((resolve, reject) => {
          wx.saveImageToPhotosAlbum({
              filePath: filePath,
              success: resolve,
              fail: reject
          });
      });
  },

  // === 分享配置 ===
  onShareAppMessage() {
    // 如果有生成结果预览图(resultImage)，则使用，否则用默认封面
    const imageUrl = this.data.resultImage || '/assets/share-cover.png';
    return {
      title: '微商必备！图片批量加水印，效率翻倍！',
      path: '/pages/batchwm/batchwm',
      imageUrl: imageUrl
    };
  },

  onShareTimeline() {
    const imageUrl = this.data.resultImage || '/assets/share-cover.png';
    return {
      title: '微商必备！图片批量加水印，效率翻倍！',
      query: '',
      imageUrl: imageUrl
    };
  }
});
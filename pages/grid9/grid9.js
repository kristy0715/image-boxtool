// pages/grid9/grid9.js

const Security = require('../../utils/security.js');

// === 广告配置 ===
const AD_CONFIG = {
  BANNER_ID: 'adunit-ecfcec4c6a0c871b',       // 请替换为您的 Banner 广告 ID
  VIDEO_ID: 'adunit-da175a2014d3443b' // 请替换为您的 激励视频广告 ID
};

// === 策略配置 ===
const FREE_COUNT_DAILY = 2; // 每天免费保存 3 次

Page({
  data: {
    imagePath: '',
    gridType: 9, 
    gridImages: [],
    isProcessing: false,
    loadingText: '处理中...',
    // 原始尺寸信息
    originalInfo: null,
    // 【新增】将配置的 ID 绑定到 data 中，供 WXML 使用
    bannerUnitId: AD_CONFIG.BANNER_ID
  },

  videoAd: null, // 广告实例

  onLoad() {
    this.initVideoAd();
  },

  // 【新增】广告错误监听（方便调试）
  onAdError(err) {
    console.log('Banner 广告加载失败:', err);
  },
  
  // === 1. 初始化激励视频广告 ===
  initVideoAd() {
    if (wx.createRewardedVideoAd) {
      this.videoAd = wx.createRewardedVideoAd({ adUnitId: AD_CONFIG.VIDEO_ID });
      this.videoAd.onLoad(() => console.log('激励视频加载成功'));
      this.videoAd.onError((err) => console.error('激励视频加载失败', err));
      
      this.videoAd.onClose((res) => {
        // 用户点击了【关闭广告】按钮
        if (res && res.isEnded) {
          // A. 正常播放结束，下发奖励（解锁当天无限次）
          this.setDailyUnlimited();
          wx.showToast({ title: '已解锁今日无限次', icon: 'success' });
          // 继续执行刚才被中断的保存
          this.doRealSave(); 
        } else {
          // B. 播放中途退出
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

  // === 2. 核心：额度检查逻辑 ===
  checkQuotaAndSave() {
    const today = new Date().toLocaleDateString();
    const storageKey = 'grid9_usage_record';
    let record = wx.getStorageSync(storageKey) || { date: today, count: 0, isUnlimited: false };

    // 如果日期跨天了，重置数据
    if (record.date !== today) {
      record = { date: today, count: 0, isUnlimited: false };
      wx.setStorageSync(storageKey, record);
    }

    // 场景 A：已经解锁无限次 -> 直接保存
    if (record.isUnlimited) {
      this.doRealSave();
      return;
    }

    // 场景 B：还有免费次数 -> 扣除次数并保存
    if (record.count < FREE_COUNT_DAILY) {
      record.count++;
      wx.setStorageSync(storageKey, record);
      // 提示剩余次数（增强体验）
      const left = FREE_COUNT_DAILY - record.count;
      if (left > 0) {
        wx.showToast({ title: `今日剩余免费${left}次`, icon: 'none' });
      }
      this.doRealSave();
      return;
    }

    // 场景 C：次数用尽 -> 弹窗引导看广告
    this.showAdModal();
  },

  // 记录无限次权益
  setDailyUnlimited() {
    const today = new Date().toLocaleDateString();
    const storageKey = 'grid9_usage_record';
    const record = { date: today, count: 999, isUnlimited: true };
    wx.setStorageSync(storageKey, record);
  },

  // 弹出广告引导
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
              // 广告加载失败（如网络问题），兜底直接允许保存
              this.doRealSave();
            });
          }
        }
      });
    } else {
      // 没广告实例，直接保存
      this.doRealSave();
    }
  },

  // === 业务逻辑部分 ===

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
            this.setData({ imagePath: tempFilePath, gridImages: [] });
            setTimeout(() => { this.cutImage(tempFilePath); }, 100);
          }
        }).catch(err => {
            wx.hideLoading();
            // 容错处理
            this.setData({ imagePath: tempFilePath, gridImages: [] });
            setTimeout(() => { this.cutImage(tempFilePath); }, 100);
        });
      }
    });
  },

  setGridType(e) {
    if (this.data.isProcessing) return;
    const type = parseInt(e.currentTarget.dataset.type);
    if (this.data.gridType === type) return;

    this.setData({ gridType: type, gridImages: [] });
    if (this.data.imagePath) {
      this.cutImage(this.data.imagePath);
    }
  },

  cutImage(path) {
    this.setData({ isProcessing: true, loadingText: '准备切割...' });

    wx.getImageInfo({
      src: path,
      success: async (info) => {
        try {
            const gridCount = this.data.gridType === 9 ? 3 : 2;
            const size = Math.min(info.width, info.height);
            const startX = Math.floor((info.width - size) / 2);
            const startY = Math.floor((info.height - size) / 2);
            
            let cellSize = Math.floor(size / gridCount);
            if (cellSize > 2000) cellSize = 2000; 

            // 缓存信息用于生成预览图
            this.originalInfo = { width: info.width, height: info.height, path: path };

            const canvas = wx.createOffscreenCanvas({ type: '2d', width: cellSize, height: cellSize });
            const ctx = canvas.getContext('2d');
            
            const img = canvas.createImage();
            await new Promise((resolve, reject) => {
                img.onload = resolve;
                img.onerror = reject;
                img.src = path;
            });

            this.setData({ loadingText: '生成切片中...' });
            
            const tempImages = [];
            const totalCells = gridCount * gridCount;

            for (let row = 0; row < gridCount; row++) {
                for (let col = 0; col < gridCount; col++) {
                    const index = row * gridCount + col;
                    // this.setData({ loadingText: `生成中 ${index + 1}/${totalCells}` }); // 减少setData频率

                    const sourceCellSize = size / gridCount;
                    const sx = startX + col * sourceCellSize;
                    const sy = startY + row * sourceCellSize;

                    ctx.clearRect(0, 0, cellSize, cellSize);
                    ctx.drawImage(img, sx, sy, sourceCellSize, sourceCellSize, 0, 0, cellSize, cellSize);

                    const tempFilePath = `${wx.env.USER_DATA_PATH}/grid_${Date.now()}_${index}.png`;
                    const base64 = canvas.toDataURL('image/png', 0.9);

                    await new Promise((resolve, reject) => {
                        wx.getFileSystemManager().writeFile({
                            filePath: tempFilePath,
                            data: base64.replace(/^data:image\/\w+;base64,/, ''),
                            encoding: 'base64',
                            success: resolve,
                            fail: reject
                        });
                    });
                    tempImages.push(tempFilePath);
                }
            }

            this.setData({ gridImages: tempImages, isProcessing: false });

        } catch (err) {
            console.error(err);
            wx.showToast({ title: '处理失败', icon: 'none' });
            this.setData({ isProcessing: false });
        }
      },
      fail: () => {
        wx.showToast({ title: '读取图片失败', icon: 'none' });
        this.setData({ isProcessing: false });
      }
    });
  },

  // === 3. 触发保存（入口） ===
  saveAllImages() {
    if (this.data.gridImages.length === 0) return;
    
    // 点击按钮时，先走额度检查
    this.checkQuotaAndSave();
  },

  // === 4. 真正的保存逻辑 ===
  doRealSave() {
    wx.getSetting({
      success: (res) => {
        if (res.authSetting['scope.writePhotosAlbum']) {
          this.startSavingProcess();
        } else if (res.authSetting['scope.writePhotosAlbum'] === false) {
          wx.showModal({
            title: '提示', content: '需要授权保存图片到相册',
            success: (res) => { if (res.confirm) wx.openSetting(); }
          });
        } else {
          wx.authorize({
            scope: 'scope.writePhotosAlbum',
            success: () => this.startSavingProcess(),
            fail: () => wx.showToast({ title: '授权失败', icon: 'none' })
          });
        }
      }
    });
  },

  startSavingProcess() {
    this.setData({ isProcessing: true, loadingText: '保存中...' });

    let savedCount = 0;
    const total = this.data.gridImages.length;

    const saveNext = (index) => {
      if (index >= total) {
        if (savedCount > 0) {
            // 生成预览图并跳转成功页
            this.generateGridPreview().then(previewPath => {
                this.setData({ isProcessing: false });
                wx.navigateTo({
                    url: `/pages/success/success?path=${encodeURIComponent(previewPath)}`
                });
            }).catch(() => {
                this.setData({ isProcessing: false });
                wx.navigateTo({
                    url: `/pages/success/success?path=${encodeURIComponent(this.data.imagePath)}`
                });
            });
        } else {
          this.setData({ isProcessing: false });
          wx.showToast({ title: '保存失败', icon: 'none' });
        }
        return;
      }

      this.setData({ loadingText: `保存中 ${index + 1}/${total}` });

      wx.saveImageToPhotosAlbum({
        filePath: this.data.gridImages[index],
        success: () => {
          savedCount++;
          setTimeout(() => saveNext(index + 1), 100);
        },
        fail: (err) => {
          saveNext(index + 1);
        }
      });
    };

    saveNext(0);
  },

  generateGridPreview() {
      return new Promise((resolve, reject) => {
          this.setData({ loadingText: '生成预览...' });
          
          if (!this.originalInfo) return reject();

          const { width, height, path } = this.originalInfo;
          const previewSize = 800;
          
          const canvas = wx.createOffscreenCanvas({ type: '2d', width: previewSize, height: previewSize });
          const ctx = canvas.getContext('2d');
          
          const img = canvas.createImage();
          img.onload = () => {
              const size = Math.min(width, height);
              const sx = Math.floor((width - size) / 2);
              const sy = Math.floor((height - size) / 2);
              
              ctx.drawImage(img, sx, sy, size, size, 0, 0, previewSize, previewSize);
              
              ctx.strokeStyle = '#ffffff';
              ctx.lineWidth = 4; 
              
              const gridCount = this.data.gridType === 9 ? 3 : 2;
              const cellSize = previewSize / gridCount;
              
              ctx.beginPath();
              for (let i = 1; i < gridCount; i++) {
                  const pos = i * cellSize;
                  ctx.moveTo(0, pos); ctx.lineTo(previewSize, pos);
                  ctx.moveTo(pos, 0); ctx.lineTo(pos, previewSize);
              }
              ctx.stroke();
              
              wx.canvasToTempFilePath({
                  canvas,
                  fileType: 'jpg',
                  quality: 0.8,
                  success: (res) => resolve(res.tempFilePath),
                  fail: reject
              });
          };
          img.onerror = reject;
          img.src = path;
      });
  },

  onShareAppMessage() {
    return { title: '朋友圈九宫格神器', path: '/pages/grid9/grid9', imageUrl: this.data.imagePath || '' };
  },
  onShareTimeline() {
    return { title: '朋友圈九宫格神器', imageUrl: this.data.imagePath || '' };
  },
});
// pages/grid9/grid9.js

const Security = require('../../utils/security.js');

// === 广告配置 ===
const AD_CONFIG = {
  BANNER_ID: 'adunit-ecfcec4c6a0c871b',       // Banner 广告 ID
  VIDEO_ID: 'adunit-da175a2014d3443b'         // 激励视频广告 ID
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
    originalInfo: null,
    bannerUnitId: AD_CONFIG.BANNER_ID
  },

  videoAd: null, 

  onLoad() {
    this.initVideoAd();
  },

  onAdError(err) {
    console.log('Banner 广告加载失败:', err);
  },
  
  // === 1. 初始化激励视频 ===
  initVideoAd() {
    if (wx.createRewardedVideoAd) {
      this.videoAd = wx.createRewardedVideoAd({ adUnitId: AD_CONFIG.VIDEO_ID });
      this.videoAd.onLoad(() => console.log('激励视频加载成功'));
      this.videoAd.onError((err) => console.error('激励视频加载失败', err));
      
      this.videoAd.onClose((res) => {
        if (res && res.isEnded) {
          this.setDailyUnlimited();
          wx.showToast({ title: '已解锁今日无限次', icon: 'success' });
          this.doRealSave(); 
        } else {
          wx.showModal({
            title: '提示',
            content: '需要完整观看视频才能解锁今日无限次保存权限哦',
            confirmText: '继续观看',
            success: (m) => { if (m.confirm) this.videoAd.show(); }
          });
        }
      });
    }
  },

  // === 2. 额度检查逻辑 ===
  checkQuotaAndSave() {
    const today = new Date().toLocaleDateString();
    const storageKey = 'grid9_usage_record';
    let record = wx.getStorageSync(storageKey) || { date: today, count: 0, isUnlimited: false };

    if (record.date !== today) {
      record = { date: today, count: 0, isUnlimited: false };
      wx.setStorageSync(storageKey, record);
    }

    if (record.isUnlimited) {
      this.doRealSave();
      return;
    }

    if (record.count < FREE_COUNT_DAILY) {
      record.count++;
      wx.setStorageSync(storageKey, record);
      const left = FREE_COUNT_DAILY - record.count;
      if (left > 0) {
        wx.showToast({ title: `今日剩余免费${left}次`, icon: 'none' });
      }
      this.doRealSave();
      return;
    }

    this.showAdModal();
  },

  setDailyUnlimited() {
    const today = new Date().toLocaleDateString();
    const storageKey = 'grid9_usage_record';
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
            this.videoAd.show().catch(() => this.doRealSave());
          }
        }
      });
    } else {
      this.doRealSave();
    }
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
            this.setData({ imagePath: tempFilePath, gridImages: [] });
            setTimeout(() => { this.cutImage(tempFilePath); }, 200);
          }
        }).catch(err => {
            wx.hideLoading();
            this.setData({ imagePath: tempFilePath, gridImages: [] });
            setTimeout(() => { this.cutImage(tempFilePath); }, 200);
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

  // === 核心修复：切图逻辑重构 ===
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
            
            // 限制单张切片最大像素，防止内存溢出
            let cellSize = Math.floor(size / gridCount);
            if (cellSize > 1500) cellSize = 1500; 

            this.originalInfo = { width: info.width, height: info.height, path: path };

            // 创建离屏画布
            const canvas = wx.createOffscreenCanvas({ type: '2d', width: cellSize, height: cellSize });
            const ctx = canvas.getContext('2d');
            
            const img = canvas.createImage();
            await new Promise((resolve, reject) => {
                img.onload = resolve;
                img.onerror = reject;
                img.src = path;
            });

            this.setData({ loadingText: '正在生成切片...' });
            
            const tempImages = [];
            const totalCells = gridCount * gridCount;

            // 循环切图 (串行执行，确保不崩)
            for (let row = 0; row < gridCount; row++) {
                for (let col = 0; col < gridCount; col++) {
                    const index = row * gridCount + col;
                    
                    const sourceCellSize = size / gridCount;
                    const sx = startX + col * sourceCellSize;
                    const sy = startY + row * sourceCellSize;

                    // 清空画布并绘制当前格子
                    ctx.clearRect(0, 0, cellSize, cellSize);
                    ctx.drawImage(img, sx, sy, sourceCellSize, sourceCellSize, 0, 0, cellSize, cellSize);

                    // 核心修改：使用 canvasToTempFilePath 直接生成文件，不再用 base64
                    const tempFilePath = await new Promise((resolve, reject) => {
                        wx.canvasToTempFilePath({
                            canvas: canvas,
                            x: 0,
                            y: 0,
                            width: cellSize,
                            height: cellSize,
                            destWidth: cellSize,
                            destHeight: cellSize,
                            fileType: 'jpg', // 使用 jpg 兼容性更好
                            quality: 0.9,
                            success: (res) => resolve(res.tempFilePath),
                            fail: (err) => reject(err)
                        });
                    });
                    
                    tempImages.push(tempFilePath);
                }
            }

            this.setData({ gridImages: tempImages, isProcessing: false });

        } catch (err) {
            console.error(err);
            wx.showToast({ title: '切图失败，请重试', icon: 'none' });
            this.setData({ isProcessing: false });
        }
      },
      fail: () => {
        wx.showToast({ title: '图片读取失败', icon: 'none' });
        this.setData({ isProcessing: false });
      }
    });
  },

  saveAllImages() {
    if (this.data.gridImages.length === 0) return;
    this.checkQuotaAndSave();
  },

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
    this.setData({ isProcessing: true, loadingText: '正在保存...' });

    let savedCount = 0;
    const total = this.data.gridImages.length;

    const saveNext = (index) => {
      if (index >= total) {
        if (savedCount > 0) {
            // 所有图片保存完毕，生成预览图并跳转
            this.generateGridPreview().then(previewPath => {
                this.setData({ isProcessing: false });
                wx.navigateTo({
                    url: `/pages/success/success?path=${encodeURIComponent(previewPath)}`
                });
            }).catch((err) => {
                console.error('预览生成失败', err);
                this.setData({ isProcessing: false });
                // 即使预览图生成失败，也跳到原图作为成功的标志
                wx.navigateTo({
                    url: `/pages/success/success?path=${encodeURIComponent(this.data.imagePath)}`
                });
            });
        } else {
          this.setData({ isProcessing: false });
          wx.showToast({ title: '保存全部失败', icon: 'none' });
        }
        return;
      }

      this.setData({ loadingText: `保存中 ${index + 1}/${total}` });

      wx.saveImageToPhotosAlbum({
        filePath: this.data.gridImages[index],
        success: () => {
          savedCount++;
          // 增加 200ms 间隔，防止写入相册太快导致系统报错
          setTimeout(() => saveNext(index + 1), 200);
        },
        fail: (err) => {
          console.error(`第 ${index+1} 张保存失败`, err);
          saveNext(index + 1); // 失败也继续下一张
        }
      });
    };

    saveNext(0);
  },

  generateGridPreview() {
      return new Promise((resolve, reject) => {
          this.setData({ loadingText: '生成预览...' });
          
          if (!this.originalInfo) return reject('No original info');

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
              
              // 画分割线
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
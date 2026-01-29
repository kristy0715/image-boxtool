// pages/crop/crop.js
const Security = require('../../utils/security.js');

const AD_CONFIG = {
  BANNER_ID: 'adunit-ecfcec4c6a0c871b', 
  VIDEO_ID: 'adunit-da175a2014d3443b'
};

const FREE_COUNT_DAILY = 2;

// 预览区最大宽高 (需与 WXSS .crop-container 配合)
const MAX_PREVIEW_W = 320; // px (假设屏幕宽375，留边距)
const MAX_PREVIEW_H = 300; // px (600rpx)

Page({
  data: {
    imagePath: '',
    resultImage: '', 
    selectedRatio: '1:1', // 默认选中 1:1
    isCropping: false,
    
    // 裁剪框 (movable-area) 尺寸
    cropWidth: 300,
    cropHeight: 300,
    
    // 图片显示 (movable-view) 初始尺寸
    imgDisplayW: 300,
    imgDisplayH: 300,
    
    // 交互状态 (绑定到 movable-view)
    imgX: 0,
    imgY: 0,
    imgScale: 1,
    
    ratioList: [
      { id: 'free', name: '自由', label: '自由', ratio: 0 },
      { id: '1:1', name: '1:1', label: '1:1', ratio: 1 },
      { id: '4:3', name: '4:3', label: '4:3', ratio: 4/3 },
      { id: '3:4', name: '3:4', label: '3:4', ratio: 3/4 },
      { id: '16:9', name: '16:9', label: '16:9', ratio: 16/9 },
      { id: '9:16', name: '9:16', label: '9:16', ratio: 9/16 }
    ],
    
    bannerUnitId: AD_CONFIG.BANNER_ID
  },

  // 内部变量，不用于渲染
  imageInfo: null, // 原图信息 {width, height}
  currentX: 0,
  currentY: 0,
  currentScale: 1,

  videoAd: null, 

  onLoad() {
    this.initVideoAd();
    // 获取屏幕宽度，用于计算自适应尺寸
    const sys = wx.getSystemInfoSync();
    this.screenWidth = sys.windowWidth;
    this.maxPreviewW = this.screenWidth - 40; // 左右留边
  },

  initVideoAd() {
    if (wx.createRewardedVideoAd) {
      this.videoAd = wx.createRewardedVideoAd({ adUnitId: AD_CONFIG.VIDEO_ID });
      this.videoAd.onError((err) => console.error(err));
      this.videoAd.onClose((res) => {
        if (res && res.isEnded) {
          this.setDailyUnlimited();
          wx.showToast({ title: '已解锁', icon: 'success' });
          this.manualCrop(); // 广告后继续保存
        }
      });
    }
  },

  chooseImage() {
    wx.chooseMedia({
      count: 1, mediaType: ['image'],
      success: (res) => {
        const tempFilePath = res.tempFiles[0].tempFilePath;
        wx.showLoading({ title: '加载中...' });
        
        Security.checkImage(tempFilePath).then(isSafe => {
          if(isSafe) {
            wx.getImageInfo({
              src: tempFilePath,
              success: (info) => {
                wx.hideLoading();
                this.setData({
                  imagePath: tempFilePath,
                  selectedRatio: '1:1', // 重置为默认
                  resultImage: ''
                });
                this.imageInfo = info;
                // 初始化 1:1 布局
                this.updateCropLayout(1);
              }
            });
          } else {
            wx.hideLoading();
            wx.showToast({ title: '图片违规', icon: 'none' });
          }
        });
      }
    });
  },

  selectRatio(e) {
    const id = e.currentTarget.dataset.id;
    if (id === this.data.selectedRatio) return;

    this.setData({ selectedRatio: id });

    // 自由模式走特殊逻辑
    if (id === 'free') {
      // 这里的逻辑依然可以是跳转微信原生裁剪，或者不做变化
      return; 
    }

    // 固定比例模式：重新计算裁剪框
    const ratioObj = this.data.ratioList.find(r => r.id === id);
    if (ratioObj) {
      this.updateCropLayout(ratioObj.ratio);
    }
  },

  // === 🔥 核心：计算布局 ===
  updateCropLayout(ratio) {
    if (!this.imageInfo) return;

    // 1. 计算裁剪框尺寸 (cropWidth/Height)
    // 目标：在 maxPreviewW x MAX_PREVIEW_H 的区域内，放入一个符合 ratio 的最大矩形
    let cW, cH;
    const containerRatio = this.maxPreviewW / MAX_PREVIEW_H;

    if (ratio > containerRatio) {
      // 比较宽，以宽为准
      cW = this.maxPreviewW;
      cH = cW / ratio;
    } else {
      // 比较高，以高为准
      cH = MAX_PREVIEW_H;
      cW = cH * ratio;
    }

    // 2. 计算图片初始显示尺寸 (imgDisplayW/H)
    // 逻辑：Object-fit: cover (让图片短边填满裁剪框)
    // 或者 contain (让图片完整显示在框内)。这里选 contain 方便用户自己放大。
    // 为了体验更好，我们选 "Cover" 逻辑稍作修改：让图片稍微大一点点填满框
    const imgRatio = this.imageInfo.width / this.imageInfo.height;
    let dW, dH;

    if (imgRatio > ratio) {
      // 图片比框更宽 -> 高度适配框高度
      dH = cH;
      dW = dH * imgRatio;
    } else {
      // 图片比框更高 -> 宽度适配框宽度
      dW = cW;
      dH = dW / imgRatio;
    }

    this.setData({
      cropWidth: cW,
      cropHeight: cH,
      imgDisplayW: dW,
      imgDisplayH: dH,
      // 重置位置到居中
      imgX: (cW - dW) / 2, 
      imgY: (cH - dH) / 2,
      imgScale: 1
    });
    
    // 更新内部状态
    this.currentX = (cW - dW) / 2;
    this.currentY = (cH - dH) / 2;
    this.currentScale = 1;
  },

  // === 🔥 还原按钮 ===
  resetPosition() {
    if (this.data.selectedRatio === 'free') return;
    
    const { cropWidth, cropHeight, imgDisplayW, imgDisplayH } = this.data;
    this.setData({
      imgX: (cropWidth - imgDisplayW) / 2,
      imgY: (cropHeight - imgDisplayH) / 2,
      imgScale: 1
    });
  },

  // === 交互监听 ===
  onInteractionChange(e) {
    // 这里的 x, y 是 movable-view 相对于 movable-area 的偏移
    // detail: {x, y, scale, source}
    if (e.detail.source) { // 只有用户操作才记录
      this.currentX = e.detail.x;
      this.currentY = e.detail.y;
      this.currentScale = e.detail.scale;
    }
  },

  startFreeCrop() {
    if (!this.data.imagePath) return;
    wx.cropImage({
      src: this.data.imagePath,
      quality: 100,
      success: (res) => {
        // 自由裁剪直接去保存
        this.setData({ resultImage: res.tempFilePath });
        this.checkQuotaAndSave(true); // true 表示跳过裁剪步骤直接保存
      }
    });
  },

  // === 点击保存 ===
  saveImage() {
    if (this.data.selectedRatio === 'free') {
      this.startFreeCrop();
    } else {
      this.checkQuotaAndSave();
    }
  },

  checkQuotaAndSave(skipManualCrop = false) {
    const today = new Date().toLocaleDateString();
    const storageKey = 'crop_usage_record';
    let record = wx.getStorageSync(storageKey) || { date: today, count: 0, isUnlimited: false };

    if (record.date !== today) {
      record = { date: today, count: 0, isUnlimited: false };
      wx.setStorageSync(storageKey, record);
    }

    if (record.isUnlimited || record.count < FREE_COUNT_DAILY) {
      if (!record.isUnlimited) {
        record.count++;
        wx.setStorageSync(storageKey, record);
      }
      if (skipManualCrop) this.doSaveImage();
      else this.manualCrop();
    } else {
      this.showAdModal();
    }
  },

  setDailyUnlimited() {
    wx.setStorageSync('crop_usage_record', { date: new Date().toLocaleDateString(), count: 999, isUnlimited: true });
  },

  showAdModal() {
    if (this.videoAd) {
      wx.showModal({
        title: '免费次数已用完',
        content: '观看视频解锁今日无限次保存',
        success: (res) => { if (res.confirm) this.videoAd.show(); }
      });
    } else {
      this.manualCrop();
    }
  },

  // === 🔥 核心：执行 Canvas 裁剪 ===
  manualCrop() {
    this.setData({ isCropping: true });
    wx.showLoading({ title: '处理中...' });

    // 1. 获取当前参数
    const { cropWidth, cropHeight, imgDisplayW, imgDisplayH } = this.data;
    const { currentX, currentY, currentScale } = this;

    // 2. 计算原图与屏幕显示的比例
    // 原图 1000px，屏幕显示 200px，则 ratio = 5
    const pixelRatio = this.imageInfo.width / imgDisplayW;

    // 3. Canvas 尺寸 (为了清晰度，可以使用原图分辨率，或者限制最大 2000px)
    // 这里我们希望能导出高清图，所以基于裁剪框 * pixelRatio
    let canvasW = cropWidth * pixelRatio;
    let canvasH = cropHeight * pixelRatio;

    // 安全限制，防止 Canvas 过大崩溃
    const MAX_CANVAS_DIM = 2048;
    let exportScale = 1;
    if (canvasW > MAX_CANVAS_DIM || canvasH > MAX_CANVAS_DIM) {
      const maxSide = Math.max(canvasW, canvasH);
      exportScale = MAX_CANVAS_DIM / maxSide;
      canvasW *= exportScale;
      canvasH *= exportScale;
    }

    const canvas = wx.createOffscreenCanvas({ type: '2d', width: canvasW, height: canvasH });
    const ctx = canvas.getContext('2d');
    const img = canvas.createImage();

    img.onload = () => {
      // 4. 绘图参数计算
      // movable-view 的 x,y 是相对于框左上角的（通常是负数或0）
      // 我们要画的是：图片被缩放、移动后的样子
      
      // 这里的逻辑是：
      // ctx.drawImage(img, dx, dy, dWidth, dHeight)
      // dx, dy 是图片在 Canvas 上的起始位置
      // dWidth, dHeight 是图片在 Canvas 上的绘制大小
      
      // 屏幕上：图片位置 x=currentX, 宽=imgDisplayW * scale
      // 映射到 Canvas (乘以 pixelRatio 和 exportScale)
      const finalRatio = pixelRatio * exportScale;
      
      const drawX = currentX * finalRatio;
      const drawY = currentY * finalRatio;
      const drawW = imgDisplayW * currentScale * finalRatio;
      const drawH = imgDisplayH * currentScale * finalRatio;

      // 绘制背景 (白色)
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvasW, canvasH);

      // 绘制图片
      ctx.drawImage(img, drawX, drawY, drawW, drawH);

      // 导出
      wx.canvasToTempFilePath({
        canvas: canvas,
        width: canvasW,
        height: canvasH,
        destWidth: canvasW,
        destHeight: canvasH,
        fileType: 'jpg',
        quality: 0.9,
        success: (res) => {
          this.setData({ 
            resultImage: res.tempFilePath,
            isCropping: false 
          });
          wx.hideLoading();
          this.doSaveImage(); // 直接保存到相册
        },
        fail: (err) => {
          console.error(err);
          this.setData({ isCropping: false });
          wx.hideLoading();
          wx.showToast({ title: '裁剪失败', icon: 'none' });
        }
      });
    };

    img.src = this.data.imagePath;
  },

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
          wx.showModal({ title: '提示', content: '需开启相册权限', success: s => s.confirm && wx.openSetting() });
        }
      }
    });
  },

  onShareAppMessage() {
    return { title: '好用的图片裁剪工具', path: '/pages/crop/crop' };
  }
});
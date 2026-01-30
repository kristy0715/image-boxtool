// pages/crop/crop.js
const Security = require('../../utils/security.js');

const AD_CONFIG = {
  BANNER_ID: 'adunit-ecfcec4c6a0c871b', 
  VIDEO_ID: 'adunit-da175a2014d3443b'
};

const FREE_COUNT_DAILY = 2;

// 预览区最大宽高
const MAX_PREVIEW_W = 320; 
const MAX_PREVIEW_H = 300; 

Page({
  data: {
    imagePath: '',
    resultImage: '', 
    selectedRatio: '1:1',
    isCropping: false,
    
    // 裁剪框 (movable-area) 尺寸
    cropWidth: 300,
    cropHeight: 300,
    
    // 图片显示 (movable-view) 初始尺寸
    imgDisplayW: 300,
    imgDisplayH: 300,
    
    // 交互状态
    imgX: 0,
    imgY: 0,
    imgScale: 1,
    
    // 🔥 12个比例，完美填满3行
    ratioList: [
      { id: 'free', name: '自由', label: '自由', ratio: 0 },
      { id: '1:1', name: '1:1', label: '1:1', ratio: 1 },
      { id: '3:4', name: '3:4', label: '3:4', ratio: 3/4 },
      { id: '4:3', name: '4:3', label: '4:3', ratio: 4/3 },
      { id: '9:16', name: '9:16', label: '9:16', ratio: 9/16 },
      { id: '16:9', name: '16:9', label: '16:9', ratio: 16/9 },
      { id: '2:3', name: '2:3', label: '2:3', ratio: 2/3 },
      { id: '3:2', name: '3:2', label: '3:2', ratio: 3/2 },
      { id: '2:1', name: '2:1', label: '2:1', ratio: 2 },
      { id: '1:2', name: '1:2', label: '1:2', ratio: 0.5 },
      { id: '2.35:1', name: '电影', label: '2.35', ratio: 2.35 },
      { id: 'A4', name: 'A4', label: 'A4', ratio: 210/297 }
    ],
    
    bannerUnitId: AD_CONFIG.BANNER_ID
  },

  // 内部变量
  imageInfo: null, 
  currentX: 0,
  currentY: 0,
  currentScale: 1,

  videoAd: null, 

  onLoad() {
    this.initVideoAd();
    const sys = wx.getSystemInfoSync();
    this.screenWidth = sys.windowWidth;
    this.maxPreviewW = this.screenWidth - 40; 
  },

  initVideoAd() {
    if (wx.createRewardedVideoAd) {
      this.videoAd = wx.createRewardedVideoAd({ adUnitId: AD_CONFIG.VIDEO_ID });
      this.videoAd.onError((err) => console.error(err));
      this.videoAd.onClose((res) => {
        if (res && res.isEnded) {
          this.setDailyUnlimited();
          wx.showToast({ title: '已解锁', icon: 'success' });
          this.manualCrop(); 
        }
      });
    }
  },

  chooseImage() {
    wx.chooseMedia({
      count: 1, mediaType: ['image'],
      success: (res) => {
        const tempFilePath = res.tempFiles[0].tempFilePath;
        wx.showLoading({ title: '解析中...' });
        
        Security.checkImage(tempFilePath).then(isSafe => {
          if(isSafe) {
            wx.getImageInfo({
              src: tempFilePath,
              success: (info) => {
                wx.hideLoading();
                this.setData({
                  imagePath: tempFilePath,
                  selectedRatio: '1:1',
                  resultImage: ''
                });
                this.imageInfo = info;
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

    if (id === 'free') return; 

    const ratioObj = this.data.ratioList.find(r => r.id === id);
    if (ratioObj) {
      this.updateCropLayout(ratioObj.ratio);
    }
  },

  updateCropLayout(ratio) {
    if (!this.imageInfo) return;

    let cW, cH;
    const containerRatio = this.maxPreviewW / MAX_PREVIEW_H;

    if (ratio > containerRatio) {
      cW = this.maxPreviewW;
      cH = cW / ratio;
    } else {
      cH = MAX_PREVIEW_H;
      cW = cH * ratio;
    }

    const imgRatio = this.imageInfo.width / this.imageInfo.height;
    let dW, dH;

    if (imgRatio > ratio) {
      dH = cH;
      dW = dH * imgRatio;
    } else {
      dW = cW;
      dH = dW / imgRatio;
    }

    // 取整
    cW = Math.floor(cW); cH = Math.floor(cH);
    dW = Math.floor(dW); dH = Math.floor(dH);

    const initX = (cW - dW) / 2;
    const initY = (cH - dH) / 2;

    this.setData({
      cropWidth: cW,
      cropHeight: cH,
      imgDisplayW: dW,
      imgDisplayH: dH,
      imgX: initX, 
      imgY: initY,
      imgScale: 1
    });
    
    this.currentX = initX;
    this.currentY = initY;
    this.currentScale = 1;
  },

  resetPosition() {
    if (this.data.selectedRatio === 'free') return;
    
    const { cropWidth, cropHeight, imgDisplayW, imgDisplayH } = this.data;
    const resetX = (cropWidth - imgDisplayW) / 2;
    const resetY = (cropHeight - imgDisplayH) / 2;

    this.setData({
      imgX: resetX,
      imgY: resetY,
      imgScale: 1
    });

    this.currentX = resetX;
    this.currentY = resetY;
    this.currentScale = 1;
  },

  onInteractionChange(e) {
    // 仅记录状态，不直接用于计算，计算交给 getBoundingClientRect
    if (e.detail.source) {
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
        this.setData({ resultImage: res.tempFilePath });
        this.checkQuotaAndSave(true);
      }
    });
  },

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

  // === 🔥🔥🔥 终极修复：物理测量绘图法 🔥🔥🔥 ===
  manualCrop() {
    this.setData({ isCropping: true });
    wx.showLoading({ title: '高清处理中...' });

    // 1. 使用 SelectorQuery 获取屏幕上真实的物理位置
    // 这比依赖 bindchange 的数学计算要靠谱得多！所见即所得。
    const query = wx.createSelectorQuery();
    query.select('.crop-area').boundingClientRect();   // 获取裁剪框的位置
    query.select('.target-image').boundingClientRect(); // 获取图片的实际位置（含缩放）
    
    query.exec((res) => {
      if (!res || !res[0] || !res[1]) {
        this.setData({ isCropping: false });
        wx.hideLoading();
        wx.showToast({ title: '定位失败，请重试', icon: 'none' });
        return;
      }

      const areaRect = res[0]; // 裁剪窗口
      const imgRect = res[1];  // 实际图片（已缩放）

      // 2. 计算相对位置（图片相对于裁剪框的偏移）
      const relativeX = imgRect.left - areaRect.left;
      const relativeY = imgRect.top - areaRect.top;
      const relativeW = imgRect.width;
      const relativeH = imgRect.height;

      // 3. 确定导出倍率 (Quality Ratio)
      // 我们希望导出图足够清晰，所以需要映射回原图尺寸
      // 比例 = 原图真实宽度 / 屏幕上看到的图片宽度
      const pixelRatio = this.imageInfo.width / relativeW;

      // 4. 计算 Canvas 尺寸 (裁剪结果尺寸)
      // Canvas尺寸 = 屏幕裁剪框尺寸 * 倍率
      let canvasW = Math.round(areaRect.width * pixelRatio);
      let canvasH = Math.round(areaRect.height * pixelRatio);

      // 5. 安全限制 (防止 4096px 崩溃)
      const MAX_CANVAS_DIM = 2048;
      let exportScale = 1;
      if (canvasW > MAX_CANVAS_DIM || canvasH > MAX_CANVAS_DIM) {
        const maxSide = Math.max(canvasW, canvasH);
        exportScale = MAX_CANVAS_DIM / maxSide;
        canvasW = Math.round(canvasW * exportScale);
        canvasH = Math.round(canvasH * exportScale);
      }

      // 6. 最终绘制参数
      const finalRatio = pixelRatio * exportScale;
      const drawX = Math.round(relativeX * finalRatio);
      const drawY = Math.round(relativeY * finalRatio);
      const drawW = Math.round(relativeW * finalRatio);
      const drawH = Math.round(relativeH * finalRatio);

      // 7. 绘图
      const canvas = wx.createOffscreenCanvas({ type: '2d', width: canvasW, height: canvasH });
      const ctx = canvas.getContext('2d');
      const img = canvas.createImage();

      img.onload = () => {
        ctx.fillStyle = '#ffffff'; // 白底防止透明
        ctx.fillRect(0, 0, canvasW, canvasH);
        
        try {
          // 5参数模式：把图按计算好的位置贴上去，超出画布的部分自动被剪裁
          // 这是解决“位置偏移”和“白屏”最稳的方法
          ctx.drawImage(img, drawX, drawY, drawW, drawH);
        } catch (e) { console.error(e); }

        // 8. 延时导出 (给GPU缓冲时间)
        setTimeout(() => {
          wx.canvasToTempFilePath({
            canvas: canvas,
            width: canvasW, height: canvasH,
            destWidth: canvasW, destHeight: canvasH,
            fileType: 'jpg', quality: 0.95,
            success: (r) => {
              this.setData({ resultImage: r.tempFilePath, isCropping: false });
              wx.hideLoading();
              this.doSaveImage(); 
            },
            fail: () => {
              this.setData({ isCropping: false });
              wx.hideLoading();
              wx.showToast({ title: '保存失败', icon: 'none' });
            }
          });
        }, 300);
      };
      
      img.onerror = () => {
        this.setData({ isCropping: false });
        wx.hideLoading();
        wx.showToast({ title: '加载失败', icon: 'none' });
      };

      img.src = this.data.imagePath;
    });
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
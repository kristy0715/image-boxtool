// pages/idphoto/idphoto.js
const Security = require('../../utils/security.js');

// 🔴 配置区域
const SERVER_CONFIG = {
  LAF_MATTING_URL: 'https://kvpoib63ld.sealosbja.site/idphoto-matting' 
};

const AD_CONFIG = {
  BANNER_ID: 'adunit-ecfcec4c6a0c871b',
  VIDEO_ID: 'adunit-da175a2014d3443b'
};

// 🔵 额度配置
const DAILY_FREE_AI_LIMIT = 1; // AI 每日免费次数
const AD_REWARD_COUNT = 3;     // 看广告奖励次数
const DAILY_FREE_SAVE_LIMIT = 2; // 保存每日免费次数

Page({
  data: {
    mode: 'normal', 
    showCamera: false,
    cameraPosition: 'front', 
    
    // 图片数据
    rawImagePath: '',        
    transparentImagePath: '', 
    processedImage: '',      
    
    selectedSize: '1inch',
    selectedColor: '#ffffff',
    selectedColorName: '白色',
    isProcessing: false,
    
    // 广告与额度
    bannerUnitId: AD_CONFIG.BANNER_ID,
    aiQuota: 0,      // AI 剩余次数
    saveQuota: 0,    // 保存剩余次数
    pendingAdType: '', 
    
    // 🔥 新增：保存目标 ('save': 去成功页, 'layout': 去排版页)
    saveTarget: 'save', 

    // 美化参数
    brightness: 100, 
    contrast: 100,

    // 尺寸列表
    sizeList: [
      { id: '1inch', name: '一寸', dimension: '295x413px', width: 295, height: 413 },
      { id: '2inch', name: '二寸', dimension: '413x579px', width: 413, height: 579 },
      { id: 'small1', name: '小一寸', dimension: '260x378px', width: 260, height: 378 }, 
      { id: 'big1', name: '大一寸', dimension: '390x567px', width: 390, height: 567 }, 
      { id: 'small2', name: '小二寸', dimension: '413x531px', width: 413, height: 531 },
      { id: 'cet', name: '英语四六级', dimension: '144x192px', width: 144, height: 192 },
      { id: 'ncre', name: '计算机等级', dimension: '144x192px', width: 144, height: 192 },
      { id: 'teacher', name: '教师资格', dimension: '295x413px', width: 295, height: 413 },
      { id: 'visa_jp', name: '日本签证', dimension: '531x531px', width: 531, height: 531 }  
    ],
    colorList: [
      { name: '白色', value: '#ffffff' },
      { name: '蓝色', value: '#438edb' },
      { name: '红色', value: '#d93a49' },
      { name: '灰色', value: '#cccccc' },
      { name: '青色', value: '#00c5cd' }
    ],

    previewW: 0, previewH: 0, 
    imgWidth: 0, imgHeight: 0, imgX: 0, imgY: 0,
    isMoveMode: true, lastX: 0, lastY: 0, initialDistance: 0
  },

  videoAd: null,
  cameraContext: null,

  onLoad() {
    this.cameraContext = wx.createCameraContext();
    this.initVideoAd();
    this.checkDailyQuota(); 
    setTimeout(() => this.updatePreviewSize(), 300);
  },

  // === 1. 额度管理 ===
  checkDailyQuota() {
    const today = new Date().toLocaleDateString();
    let aiRecord = wx.getStorageSync('quota_ai_v1') || { date: today, count: DAILY_FREE_AI_LIMIT };
    if (aiRecord.date !== today) { aiRecord = { date: today, count: DAILY_FREE_AI_LIMIT }; }
    
    let saveRecord = wx.getStorageSync('quota_save_v1') || { date: today, count: DAILY_FREE_SAVE_LIMIT };
    if (saveRecord.date !== today) { saveRecord = { date: today, count: DAILY_FREE_SAVE_LIMIT }; }

    this.setData({ aiQuota: aiRecord.count, saveQuota: saveRecord.count });
    wx.setStorageSync('quota_ai_v1', aiRecord);
    wx.setStorageSync('quota_save_v1', saveRecord);
  },

  updateQuota(type, change) {
    const key = type === 'ai' ? 'quota_ai_v1' : 'quota_save_v1';
    let record = wx.getStorageSync(key);
    record.count += change;
    wx.setStorageSync(key, record);
    if (type === 'ai') this.setData({ aiQuota: record.count });
    else this.setData({ saveQuota: record.count });
  },

  // === 2. 广告系统 ===
  initVideoAd() {
    if (wx.createRewardedVideoAd) {
      try {
        this.videoAd = wx.createRewardedVideoAd({ adUnitId: AD_CONFIG.VIDEO_ID });
        this.videoAd.onError((err) => console.log('广告加载忽略:', err));
        this.videoAd.onClose((res) => {
          if (res && res.isEnded) {
            if (this.data.pendingAdType === 'ai') {
              this.updateQuota('ai', AD_REWARD_COUNT);
              wx.showToast({ title: `获得 ${AD_REWARD_COUNT} 次AI机会`, icon: 'none' });
              if (this.data.rawImagePath) this.processAiMatting();
            } else {
              this.updateQuota('save', 999); 
              wx.showToast({ title: '解锁成功', icon: 'success' });
              // 广告解锁后，继续之前的保存流程
              this.realSaveProcess();
            }
          } else {
            wx.showModal({ title: '提示', content: '完整观看才能获取奖励哦', showCancel: false });
          }
        });
      } catch (e) {}
    }
  },

  showAdModal(type) {
    this.setData({ pendingAdType: type });
    const title = type === 'ai' ? 'AI 次数耗尽' : '保存次数耗尽';
    const content = type === 'ai' ? `观看视频免费获取 ${AD_REWARD_COUNT} 次 AI 拍摄机会` : '观看视频解锁高清保存';
    
    if (this.videoAd) {
      wx.showModal({
        title, content, confirmText: '去获取',
        success: (res) => { if (res.confirm) this.videoAd.show().catch(() => {}); }
      });
    } else {
      if (type === 'ai') this.processAiMatting(true); 
      else this.realSaveProcess();
    }
  },

  // === 3. 交互逻辑 ===
  switchMode(e) {
    const targetMode = e.currentTarget.dataset.mode;
    if (this.data.mode === targetMode) return;
    this.setData({ 
      mode: targetMode,
      rawImagePath: '',
      transparentImagePath: '',
      processedImage: '',
      showCamera: false,
      imgWidth: 0, imgHeight: 0 
    });
  },

  // === 4. 按钮点击事件 ===
  
  // 点击“保存去排版”
  onLayoutBtnClick() {
    if (!this.data.rawImagePath) {
      wx.showToast({ title: '请先制作照片', icon: 'none' });
      return;
    }
    // 标记目标为排版
    this.setData({ saveTarget: 'layout' });
    this.checkQuotaAndSave();
  },

  // 点击“保存高清照”
  onSaveBtnClick() {
    if (!this.data.rawImagePath) return;
    // 标记目标为普通保存
    this.setData({ saveTarget: 'save' });
    this.checkQuotaAndSave();
  },

  // 通用检查额度并保存逻辑
  checkQuotaAndSave() {
    if (this.data.saveQuota > 0) {
      this.generateFinalImage();
    } else {
      this.showAdModal('save');
    }
  },

  // === 5. 图片处理 ===
  async processAiMatting(skipCheck = false) {
    if (this.data.transparentImagePath) { this.initImagePosition(this.data.transparentImagePath); return; }
    
    if (!skipCheck && this.data.aiQuota <= 0) {
      this.showAdModal('ai');
      return;
    }

    this.setData({ isProcessing: true });
    wx.showLoading({ title: 'AI 制作中...', mask: true });

    try {
      if (!SERVER_CONFIG.LAF_MATTING_URL || SERVER_CONFIG.LAF_MATTING_URL.includes('请替换')) throw new Error('请配置云函数地址');
      
      let imgBase64 = await this.getLocalImageBase64(this.data.rawImagePath);
      imgBase64 = imgBase64.replace(/^data:image\/\w+;base64,/, '').replace(/[\r\n]/g, '');

      wx.request({
        url: SERVER_CONFIG.LAF_MATTING_URL,
        method: 'POST',
        data: { base64: imgBase64 }, 
        success: (res) => {
          const aiData = res.data;
          
          if (aiData && aiData.code === 0 && aiData.result_base64) {
            if (!skipCheck) this.updateQuota('ai', -1);

            let rawBase64 = aiData.result_base64;
            if (rawBase64.startsWith('data:image')) rawBase64 = rawBase64.split('base64,')[1];
            rawBase64 = rawBase64.replace(/[\r\n\s]/g, "");

            this.base64ToTempFile(rawBase64).then(transparentPath => {
              this.setData({ transparentImagePath: transparentPath, isProcessing: false });
              wx.hideLoading();
              setTimeout(() => {
                 this.initImagePosition(transparentPath);
                 wx.showToast({ title: '制作完成', icon: 'success' });
              }, 200);
            }).catch(err => this.handleError(new Error('结果保存失败')));
          } else {
            const msg = (aiData && aiData.msg) ? aiData.msg : 'AI 处理失败';
            this.handleError(new Error(`API报错: ${msg}`));
          }
        },
        fail: (err) => this.handleError(new Error('网络请求失败'))
      });
    } catch (err) { this.handleError(err); }
  },

  generateFinalImage() {
    this.setData({ isProcessing: true });
    wx.showLoading({ title: '合成中...' });

    const pixelRatio = 3; 
    const sizeObj = this.data.sizeList.find(item => item.id === this.data.selectedSize);
    const targetW = (sizeObj.width || 295) * pixelRatio;
    const targetH = (sizeObj.height || 413) * pixelRatio;
    const canvas = wx.createOffscreenCanvas({ type: '2d', width: targetW, height: targetH });
    const ctx = canvas.getContext('2d');

    let sourcePath = this.data.rawImagePath;
    if (this.data.mode === 'auto' && this.data.transparentImagePath) sourcePath = this.data.transparentImagePath;

    ctx.fillStyle = this.data.selectedColor;
    ctx.fillRect(0, 0, targetW, targetH);

    const img = canvas.createImage();
    img.onload = () => {
      const scaleFactor = targetW / this.data.previewW;
      const drawX = this.data.imgX * scaleFactor;
      const drawY = this.data.imgY * scaleFactor;
      const drawWidth = this.data.imgWidth * scaleFactor;
      const drawHeight = this.data.imgHeight * scaleFactor;

      ctx.filter = `brightness(${this.data.brightness}%) contrast(${this.data.contrast}%)`;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, drawX, drawY, drawWidth, drawHeight);
      ctx.filter = 'none';

      wx.canvasToTempFilePath({
        canvas: canvas, fileType: 'jpg', quality: 1.0, 
        success: (res) => {
          this.setData({ processedImage: res.tempFilePath, isProcessing: false });
          wx.hideLoading();
          if (this.data.saveQuota < 900) this.updateQuota('save', -1);
          this.realSaveProcess(); 
        },
        fail: (err) => { console.error(err); this.handleError(new Error('合成失败')); }
      });
    };
    img.onerror = () => this.handleError(new Error('加载资源失败'));
    img.src = sourcePath;
  },

  openCamera() {
    const that = this;
    wx.getSetting({
      success(res) {
        if (res.authSetting['scope.camera']) that.setData({ showCamera: true, processedImage: '' });
        else wx.authorize({ scope: 'scope.camera', success() { that.setData({ showCamera: true, processedImage: '' }); }, fail() { wx.showToast({ title: '需相机授权', icon: 'none' }); } });
      },
      fail() { that.setData({ showCamera: true, processedImage: '' }); }
    });
  },
  closeCamera() { this.setData({ showCamera: false }); },
  switchCamera() { this.setData({ cameraPosition: this.data.cameraPosition === 'front' ? 'back' : 'front' }); },
  
  takePhoto() {
    wx.showLoading({ title: '拍摄中...' });
    this.cameraContext.takePhoto({
      quality: 'high',
      success: (res) => { wx.hideLoading(); this.handleNewImage(res.tempImagePath); },
      fail: () => { wx.hideLoading(); wx.showToast({ title: '拍摄失败', icon: 'none' }); }
    });
  },

  chooseFromAlbum() {
    wx.chooseMedia({
      count: 1, mediaType: ['image'], sourceType: ['album'], sizeType: ['original'],
      success: (res) => { this.handleNewImage(res.tempFiles[0].tempFilePath); }
    });
  },

  handleNewImage(path) {
    wx.showLoading({ title: '加载中...' });
    this.setData({ showCamera: false, rawImagePath: path, transparentImagePath: '', processedImage: '' }, () => {
      if (this.data.mode === 'auto') {
        this.processAiMatting(); 
      } else {
        wx.hideLoading();
        this.initImagePosition(path);
      }
    });
  },

  initImagePosition(imagePath) {
    if (!imagePath) return;
    this.updatePreviewSize(); 
    setTimeout(() => {
      const containerW = this.data.previewW; 
      const containerH = this.data.previewH;
      const that = this;
      if (!containerW || !containerH) { this.updatePreviewSize(); return; }

      wx.getImageInfo({
        src: imagePath,
        success(imgInfo) {
          let scale = 1;
          const imgRatio = imgInfo.width / imgInfo.height;
          const boxRatio = containerW / containerH;
          if (imgRatio > boxRatio) scale = containerH / imgInfo.height;
          else scale = containerW / imgInfo.width;
          scale = scale * 1.02; 

          const initWidth = imgInfo.width * scale;
          const initHeight = imgInfo.height * scale;
          const initX = (containerW - initWidth) / 2;
          const initY = (containerH - initHeight) / 2;

          that.setData({ imgWidth: initWidth, imgHeight: initHeight, imgX: initX, imgY: initY, brightness: 100, contrast: 100 });
        }
      });
    }, 200);
  },

  onTouchStart(e) {
    if (e.touches.length === 1) { this.setData({ lastX: e.touches[0].clientX, lastY: e.touches[0].clientY }); }
    else if (e.touches.length === 2) {
      const x = e.touches[1].clientX - e.touches[0].clientX;
      const y = e.touches[1].clientY - e.touches[0].clientY;
      this.setData({ initialDistance: Math.sqrt(x * x + y * y) });
    }
  },
  onTouchMove(e) {
    if (e.touches.length === 1) {
      const cx = e.touches[0].clientX; const cy = e.touches[0].clientY;
      const dx = cx - this.data.lastX; const dy = cy - this.data.lastY;
      this.setData({ imgX: this.data.imgX + dx, imgY: this.data.imgY + dy, lastX: cx, lastY: cy });
    } else if (e.touches.length === 2) {
      const x = e.touches[1].clientX - e.touches[0].clientX;
      const y = e.touches[1].clientY - e.touches[0].clientY;
      const dist = Math.sqrt(x * x + y * y);
      if (this.data.initialDistance > 0) {
        const zoomSpeed = 0.005; 
        const delta = (dist - this.data.initialDistance) * zoomSpeed;
        const scale = 1 + delta;
        const newW = this.data.imgWidth * scale;
        const newH = this.data.imgHeight * scale;
        const shiftX = (this.data.imgWidth - newW) / 2;
        const shiftY = (this.data.imgHeight - newH) / 2;
        this.setData({ imgWidth: newW, imgHeight: newH, imgX: this.data.imgX + shiftX, imgY: this.data.imgY + shiftY, initialDistance: dist });
      }
    }
  },
  onTouchEnd() {},

  selectSize(e) {
    const id = e.currentTarget.dataset.id;
    if (this.data.selectedSize === id) return;
    this.setData({ selectedSize: id }, () => {
      this.updatePreviewSize();
      const currentImg = (this.data.mode === 'auto' && this.data.transparentImagePath) ? this.data.transparentImagePath : this.data.rawImagePath;
      if(currentImg) this.initImagePosition(currentImg);
    });
  },
  
  selectColor(e) { this.setData({ selectedColor: e.currentTarget.dataset.value, selectedColorName: e.currentTarget.dataset.name }); },
  onBrightnessChange(e) { this.setData({ brightness: e.detail.value }); },
  onContrastChange(e) { this.setData({ contrast: e.detail.value }); },

  updatePreviewSize() {
    const sizeObj = this.data.sizeList.find(item => item.id === this.data.selectedSize);
    const w = sizeObj ? sizeObj.width : 295;
    const h = sizeObj ? sizeObj.height : 413;
    const ratio = w / h;
    const sys = wx.getSystemInfoSync();
    const maxW = sys.windowWidth * 0.65; 
    const maxH = sys.windowHeight * 0.5;
    let finalW, finalH;
    if (maxW / ratio <= maxH) { finalW = maxW; finalH = maxW / ratio; }
    else { finalH = maxH; finalW = maxH * ratio; }
    this.setData({ previewW: finalW, previewH: finalH });
  },

  handleError(err) {
    console.error(err);
    this.setData({ isProcessing: false });
    wx.hideLoading();
    wx.showModal({ title: '提示', content: err.message || '操作失败', showCancel: false });
  },

  getLocalImageBase64(path) {
    return new Promise((resolve, reject) => {
      const fs = wx.getFileSystemManager();
      fs.readFile({ filePath: path, encoding: 'base64', success: (res) => resolve(res.data), fail: reject });
    });
  },

  base64ToTempFile(base64Data) {
    return new Promise((resolve, reject) => {
      const fs = wx.getFileSystemManager();
      const fileName = `${wx.env.USER_DATA_PATH}/ai_matting_${Date.now()}.png`;
      try {
        const pureBase64 = base64Data.replace(/^data:image\/\w+;base64,/, '');
        const buffer = wx.base64ToArrayBuffer(pureBase64);
        fs.writeFile({ filePath: fileName, data: buffer, encoding: 'binary', success: () => resolve(fileName), fail: (err) => reject(new Error('写入失败')) });
      } catch (e) { reject(e); }
    });
  },

  // === 🔥 最终保存逻辑 (含分支跳转) ===
  realSaveProcess() {
    wx.saveImageToPhotosAlbum({
      filePath: this.data.processedImage,
      success: () => {
        // 保存成功后，判断去向
        if (this.data.saveTarget === 'layout') {
          // 跳转排版页
          wx.navigateTo({
            url: `/pages/idprint/idprint?src=${encodeURIComponent(this.data.processedImage)}`
          });
        } else {
          // 跳转成功页
          wx.navigateTo({
            url: `/pages/success/success?path=${encodeURIComponent(this.data.processedImage)}`
          });
        }
      },
      fail: (err) => {
        if (!err.errMsg.includes('cancel')) {
          wx.showModal({ title: '提示', content: '需授权保存', success: (res) => { if(res.confirm) wx.openSetting(); } });
        }
      }
    });
  },
  // === 分享配置 ===
  onShareAppMessage() {
    const imageUrl = this.data.processedImage || '/assets/share-cover.png';
    return {
      title: '手机就能拍证件照，自动抠图换底色！',
      path: '/pages/idphoto/idphoto',
      imageUrl: imageUrl
    };
  },

  onShareTimeline() {
    const imageUrl = this.data.processedImage || '/assets/share-cover.png';
    return {
      title: '免费制作高清证件照，一寸二寸随心换，立省几十块！',
      query: '',
      imageUrl: imageUrl
    };
  }
});
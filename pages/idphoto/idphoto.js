// pages/idphoto/idphoto.js
const app = getApp();

const BASE_URL = 'https://goodgoodstudy-nb.top/api/v1/wx-proxy';
const APP_TAG = 'default_app';

const AD_CONFIG = {
  BANNER_ID: 'adunit-ecfcec4c6a0c871b',
  VIDEO_ID: 'adunit-da175a2014d3443b',
  INTERSTITIAL_ID: 'adunit-a9556a7e617c27b7' 
};

const QUOTA_CONFIG = {
  SAVE_FREE: 2,    
  SAVE_REWARD: 5   
};

Page({
  data: {
    rawImagePath: '',        
    processedImage: '',      
    isProcessing: false,
    
    useBeauty: false, 
    selectedSize: '1inch',
    selectedColor: '#438ed8', 
    bannerUnitId: AD_CONFIG.BANNER_ID,

    showCustomSizeModal: false,
    customW: '295',
    customH: '413',

    showCustomColorModal: false,
    customColorHex: '#FFD700',

    colorList: [
      { name: '经典蓝', value: '#438ed8' },
      { name: '中国红', value: '#ff0000' },
      { name: '纯净白', value: '#ffffff' },
      { name: '高级灰', value: '#808080' },
      { name: '浅空蓝', value: '#00BFFF' },
      { name: '莫兰粉', value: '#FFC0CB' },
      { name: '自定义', value: 'custom' }
    ],

    sizeList: [
      { id: '1inch', name: '一寸照', dimension: '295×413 px', w: 295, h: 413 },
      { id: '2inch', name: '二寸照', dimension: '413×626 px', w: 413, h: 626 },
      { id: 'small1', name: '小一寸', dimension: '260×378 px', w: 260, h: 378 },
      { id: 'large1', name: '大一寸', dimension: '390×567 px', w: 390, h: 567 },
      { id: 'small2', name: '小二寸', dimension: '413×531 px', w: 413, h: 531 },
      { id: 'teacher', name: '教师资格', dimension: '413×579 px', w: 413, h: 579 },
      { id: 'resume', name: '简历照', dimension: '400×600 px', w: 400, h: 600 },
      { id: 'custom', name: '自定义', dimension: '自由设置宽高', w: 0, h: 0 }
    ]
  },

  videoAd: null,
  interstitialAd: null,

  onLoad() {
    this.initAds();
  },

  initAds() {
    if (wx.createRewardedVideoAd) {
      this.videoAd = wx.createRewardedVideoAd({ adUnitId: AD_CONFIG.VIDEO_ID });
      this.videoAd.onError(err => console.error('激励视频加载失败', err));
      this.videoAd.onClose(res => {
        if (res && res.isEnded) this.grantSaveQuota();
        else wx.showToast({ title: '需完整观看才能解锁保存', icon: 'none' });
      });
    }

    if (wx.createInterstitialAd) {
      this.interstitialAd = wx.createInterstitialAd({ adUnitId: AD_CONFIG.INTERSTITIAL_ID });
      this.interstitialAd.onLoad(() => console.log('插屏已准备就绪'));
    }
  },

  getQuota(key) {
    const today = new Date().toLocaleDateString();
    let r = wx.getStorageSync(key) || { date: today, count: 0, extra: 0 };
    if (r.date !== today) r = { date: today, count: 0, extra: 0 };
    return r;
  },

  updateQuota(key, val) { wx.setStorageSync(key, val); },

  chooseImage() {
    wx.chooseMedia({
      count: 1, mediaType: ['image'], sizeType: ['original'],
      success: (res) => {
        this.setData({ rawImagePath: res.tempFiles[0].tempFilePath, processedImage: '' });
      }
    });
  },

  // === 状态与弹窗控制 ===
  toggleBeauty(e) { 
    this.setData({ useBeauty: e.detail.value }); 
    if(this.data.processedImage) this.setData({ processedImage: '' });
  },

  selectSize(e) { 
    const id = e.currentTarget.dataset.id;
    if (id === 'custom') {
      this.setData({ showCustomSizeModal: true });
    } else {
      this.setData({ selectedSize: id });
      if(this.data.processedImage) this.setData({ processedImage: '' });
    }
  },
  onCustomWInput(e) { this.setData({ customW: e.detail.value }); },
  onCustomHInput(e) { this.setData({ customH: e.detail.value }); },
  closeCustomSize() { this.setData({ showCustomSizeModal: false }); },
  confirmCustomSize() {
    if(!this.data.customW || !this.data.customH) return wx.showToast({title:'请输入宽高', icon:'none'});
    this.setData({ showCustomSizeModal: false, selectedSize: 'custom' });
    if(this.data.processedImage) this.setData({ processedImage: '' });
  },

  selectColor(e) { 
    const val = e.currentTarget.dataset.value;
    if (val === 'custom') {
      this.setData({ showCustomColorModal: true });
    } else {
      this.setData({ selectedColor: val }); 
      if(this.data.processedImage) this.setData({ processedImage: '' });
    }
  },
  onCustomColorInput(e) { 
    let hex = e.detail.value;
    if (!hex.startsWith('#') && hex.length > 0) hex = '#' + hex;
    this.setData({ customColorHex: hex }); 
  },
  closeCustomColor() { this.setData({ showCustomColorModal: false }); },
  confirmCustomColor() {
    if(!/^#[0-9A-F]{6}$/i.test(this.data.customColorHex)) {
      return wx.showToast({title: '请输入有效的色值', icon: 'none'});
    }
    this.setData({ showCustomColorModal: false, selectedColor: 'custom' });
    if(this.data.processedImage) this.setData({ processedImage: '' });
  },

  // 🌟 核心修复：去排版智能传参
  goToLayout() {
    // 智能选择：如果有制作好的证件照就传成品，没有就传用户刚选的原图
    const targetImg = this.data.processedImage || this.data.rawImagePath;
    if (!targetImg) return;

    wx.navigateTo({
      // ⚠️ 将参数名严格修改为 src，与 idprint 页面中 options.src 匹配！
      url: `/pages/idprint/idprint?src=${encodeURIComponent(targetImg)}`,
      fail: (err) => {
        console.error('跳转排版页失败：', err);
        wx.showToast({ title: '无法跳转排版功能', icon: 'none' })
      }
    });
  },

  // === 核心网络请求封装 ===
  requestApi(path, data) {
    return new Promise((resolve, reject) => {
      wx.request({
        url: BASE_URL + path,
        method: 'POST',
        data: data,
        timeout: 90000,
        success: (res) => {
          if (res.data && res.data.code === 200 && res.data.data && res.data.data.image) {
            resolve(res.data.data.image);
          } else {
            reject(new Error(res.data?.msg || '服务器处理失败'));
          }
        },
        fail: () => reject(new Error('网络请求超时或被拦截'))
      });
    });
  },

  isUrl(str) {
    if (!str) return false;
    let s = String(str).replace(/\\/g, "");
    if (s.length < 2000) return true; 
    if (s.startsWith('http') || s.includes('://') || s.startsWith('//')) return true;
    return false;
  },

  downloadAsBase64(url) {
    return new Promise((resolve, reject) => {
      let fixedUrl = String(url).replace(/\\/g, "");
      if (!fixedUrl.startsWith('http') && !fixedUrl.startsWith('//')) {
        if (fixedUrl.startsWith('/')) fixedUrl = 'https://goodgoodstudy-nb.top' + fixedUrl;
        else fixedUrl = 'https://' + fixedUrl;
      }
      if (fixedUrl.startsWith('//')) fixedUrl = 'https:' + fixedUrl;
      
      wx.request({
        url: fixedUrl,
        method: 'GET',
        responseType: 'arraybuffer',
        success: (res) => {
          if (res.statusCode === 200) resolve(wx.arrayBufferToBase64(res.data));
          else reject(new Error('云端图片下载失败'));
        },
        fail: () => reject(new Error('云端图片请求被拦截'))
      });
    });
  },

  cleanBase64(str) {
    if (!str) return '';
    let clean = String(str);
    if (clean.includes(',')) clean = clean.split(',').pop();
    try { clean = decodeURIComponent(clean); } catch(e) {}
    clean = clean.replace(/[^a-zA-Z0-9+/]/g, ""); 
    const remainder = clean.length % 4;
    if (remainder > 0) clean += '='.repeat(4 - remainder);
    return clean;
  },

  // === 🌟 生成证件照 ===
  async generateIdPhoto() {
    if (!this.data.rawImagePath) return wx.showToast({ title: '请先选图', icon: 'none' });
    
    let targetW, targetH;
    if (this.data.selectedSize === 'custom') {
      targetW = parseInt(this.data.customW);
      targetH = parseInt(this.data.customH);
    } else {
      const sizeObj = this.data.sizeList.find(s => s.id === this.data.selectedSize);
      targetW = sizeObj.w; targetH = sizeObj.h;
    }

    let targetColor = this.data.selectedColor === 'custom' ? this.data.customColorHex : this.data.selectedColor;

    this.setData({ isProcessing: true });
    wx.showLoading({ title: 'AI 极速换底中...', mask: true });

    const fs = wx.getFileSystemManager();
    let rawBase64;
    try {
       rawBase64 = fs.readFileSync(this.data.rawImagePath, 'base64');
    } catch(e) {
       wx.hideLoading(); this.setData({ isProcessing: false });
       return wx.showToast({ title: '读取原图失败', icon: 'none' });
    }

    try {
      let currentImgData = await this.requestApi('/idphoto', {
        app_tag: APP_TAG, image: rawBase64, width: targetW, height: targetH, color: targetColor
      });

      if (this.data.useBeauty) {
        wx.showLoading({ title: '五官精修中...', mask: true });
        let tempBase64 = this.isUrl(currentImgData) ? await this.downloadAsBase64(currentImgData) : this.cleanBase64(currentImgData);
        currentImgData = await this.requestApi('/hd-fix', { app_tag: APP_TAG, image: tempBase64 });
      }

      let finalBase64 = this.isUrl(currentImgData) ? await this.downloadAsBase64(currentImgData) : this.cleanBase64(currentImgData);
      
      if (!finalBase64 || finalBase64.length < 100) {
          throw new Error('解析图片数据异常');
      }

      let finalLocalPath = `${wx.env.USER_DATA_PATH}/idphoto_final_${Date.now()}.jpg`; 

      try {
        fs.writeFileSync(finalLocalPath, finalBase64, 'base64');
      } catch (writeErr) {
        console.warn("Base64写入抛错，降级写入...", writeErr);
        let buffer = wx.base64ToArrayBuffer(finalBase64);
        fs.writeFileSync(finalLocalPath, buffer, 'binary');
      }
      
      wx.hideLoading();
      this.setData({ processedImage: finalLocalPath, isProcessing: false }, () => {
        if (this.interstitialAd) this.interstitialAd.show().catch(e => console.warn(e));
      });

    } catch (err) {
      wx.hideLoading();
      this.setData({ isProcessing: false });
      wx.showToast({ title: err.message || '制作失败，请重试', icon: 'none', duration: 3000 });
    }
  },

  // === 保存功能 ===
  saveImage() {
    if (!this.data.processedImage) return;
    const save = this.getQuota('idphoto_save_quota');
    if (save.count >= (QUOTA_CONFIG.SAVE_FREE + save.extra)) {
      this.showAdModal(); 
      return;
    }
    
    wx.showLoading({ title: '保存中...', mask: true });
    wx.saveImageToPhotosAlbum({
      filePath: this.data.processedImage,
      success: () => {
        const save = this.getQuota('idphoto_save_quota');
        save.count++; 
        this.updateQuota('idphoto_save_quota', save); 
        wx.hideLoading();
        wx.navigateTo({ url: `/pages/success/success?path=${encodeURIComponent(this.data.processedImage)}` });
      },
      fail: (err) => {
        wx.hideLoading();
        if (err.errMsg.includes('auth')) wx.showModal({ title: '提示', content: '需开启相册权限', success: r => r.confirm && wx.openSetting() });
        else wx.showToast({ title: '保存取消或失败', icon: 'none' });
      }
    });
  },

  showAdModal() { 
    wx.showModal({
      title: '免费保存次数已用完',
      content: `观看一段视频，即可解锁 ${QUOTA_CONFIG.SAVE_REWARD} 次保存机会！`,
      confirmText: '看视频',
      confirmColor: '#6366f1',
      success: (res) => { 
        if (res.confirm && this.videoAd) this.videoAd.show().catch(() => {}); 
      }
    });
  },

  grantSaveQuota() { 
      const s = this.getQuota('idphoto_save_quota'); 
      s.extra += QUOTA_CONFIG.SAVE_REWARD; 
      this.updateQuota('idphoto_save_quota', s); 
      wx.showToast({ title: `成功解锁 ${QUOTA_CONFIG.SAVE_REWARD} 次机会`, icon: 'success' }); 
      setTimeout(() => { this.saveImage(); }, 800); 
  },
  
  onAdError(err) { console.log('Banner Ad Error:', err); },
  onShareAppMessage() { return { title: '免费智能证件照制作，完美抠图换底！', path: '/pages/idphoto/idphoto' }; },
  onShareTimeline() { return { title: '免费智能证件照制作，完美抠图换底！' }; }
});
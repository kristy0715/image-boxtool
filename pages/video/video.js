const api = require('../../utils/api.js');

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
    inputValue: '',
    isProcessing: false, // 🌟 解析锁
    isDownloading: false, // 🌟 下载锁 (页面级)
    downloadProgressText: '下载', 
    videoData: null,
    bannerUnitId: AD_CONFIG.BANNER_ID,
    savedSingleImages: [], 
    downloadFailed: false  
  },

  videoAd: null,
  interstitialAd: null,
  isGlobalDownloading: false, // 🌟 下载锁 (全局级)
  isNavigating: false,
  pendingDownloadCallback: null, 

  onLoad() {
    this.initVideoAd();
    this.initInterstitialAd();
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 0 });
    }
    const pendingUrl = wx.getStorageSync('pendingParseTask');
    if (pendingUrl && typeof pendingUrl === 'string') {
      this.setData({ inputValue: pendingUrl });
      wx.removeStorageSync('pendingParseTask');
      setTimeout(() => { this.startParse(); }, 500);
    }
  },
  
  onUnload() {
    this.isGlobalDownloading = false; 
  },

  goToLocalWatermark() {
    if (this.isNavigating) return; 
    this.isNavigating = true;
    wx.navigateTo({
      url: '/pages/watermark/watermark',
      complete: () => { setTimeout(() => { this.isNavigating = false; }, 800); }
    });
  },

  initVideoAd() {
    if (wx.createRewardedVideoAd) {
      this.videoAd = wx.createRewardedVideoAd({ adUnitId: AD_CONFIG.VIDEO_ID });
      this.videoAd.onClose((res) => {
        if (res && res.isEnded) { 
          this.grantSaveQuota(); 
          
          if (this.pendingDownloadCallback) {
            const executeDeduct = () => {
              const sq = this.getQuota('video_save_quota');
              sq.count++;
              this.updateQuota('video_save_quota', sq);
            };
            this.pendingDownloadCallback(executeDeduct);
            this.pendingDownloadCallback = null;
          }
        } 
        else { 
          this.pendingDownloadCallback = null;
          this.showCustomToast('需看完视频才能解锁保存哦'); 
        }
      });
    }
  },

  initInterstitialAd() {
    if (wx.createInterstitialAd && AD_CONFIG.INTERSTITIAL_ID.includes('adunit-')) {
      this.interstitialAd = wx.createInterstitialAd({ adUnitId: AD_CONFIG.INTERSTITIAL_ID });
    }
  },

  getTodayDateString() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  },

  formatTime(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hour = String(date.getHours()).padStart(2, '0');
    const minute = String(date.getMinutes()).padStart(2, '0');
    const second = String(date.getSeconds()).padStart(2, '0');
    return `${year}-${month}-${day} ${hour}:${minute}:${second}`;
  },

  getQuota(key) {
    const today = this.getTodayDateString();
    let r = wx.getStorageSync(key) || { date: today, count: 0, extra: 0 };
    if (r.date !== today) r = { date: today, count: 0, extra: 0 };
    return r;
  },

  updateQuota(key, val) { wx.setStorageSync(key, val); },

  showCustomToast(msg) {
    wx.hideToast();
    const topTips = this.selectComponent('#topTips');
    if (topTips && typeof topTips.showTip === 'function') { topTips.showTip(msg); } 
    else { wx.showToast({ title: String(msg).substring(0, 15), icon: 'none' }); }
  },

  handleInput(e) { this.setData({ inputValue: e.detail.value }); },
  clearInput() { this.setData({ inputValue: '' }); },
  pasteFromClipboard() {
    wx.getClipboardData({ success: (res) => { if (res.data) this.setData({ inputValue: res.data }); } });
  },

  // ================= 🚀 1. 视频解析逻辑 =================
  startParse() {
    // 🌟 互斥锁：解析中或下载中，禁止二次触发解析
    if (this.data.isProcessing) return;
    if (this.data.isDownloading || this.isGlobalDownloading) return this.showCustomToast('任务正在下载中，请稍后再解析');

    const url = this.data.inputValue.trim();
    if (!url) return this.showCustomToast('请粘贴视频链接');

    this.setData({ 
      isProcessing: true, // 上锁
      videoData: null,
      downloadProgressText: '下载',
      savedSingleImages: [],
      downloadFailed: false 
    });
    
    api.post('/api/v1/wx-proxy/video/parse', { url: url }).then(res => {
      this.setData({ isProcessing: false }); // 释放锁
      if (res.code === 200) {
        this.setData({ videoData: res.data });
        this.saveToHistory(url, res.data);
        this.updateParseStats();
        this.showCustomToast('解析成功 🎉');
        
        setTimeout(() => {
          wx.pageScrollTo({ selector: '.bottom-btns', duration: 500, offset: -100 });
        }, 300);

        if (this.interstitialAd) this.interstitialAd.show().catch(() => {});
      } else {
        this.showCustomToast(res.msg || '解析失败');
      }
    }).catch(err => {
      // 🌟 修复：防止断网时锁死
      this.setData({ isProcessing: false }); // 释放锁
      this.showCustomToast('网络异常，请重试');
    });
  },

  silentReParse(callback) {
    // 🌟 互斥锁保护静默解析
    if (this.data.isProcessing) return this.showCustomToast('正在刷新通道，请稍候');
    if (this.data.isDownloading || this.isGlobalDownloading) return;

    this.setData({ isProcessing: true }); // 上锁
    wx.showLoading({ title: '刷新下载通道...' });
    const url = this.data.inputValue.trim();
    
    api.post('/api/v1/wx-proxy/video/parse', { url: url }).then(res => {
      wx.hideLoading();
      this.setData({ isProcessing: false }); // 释放锁
      if (res.code === 200) {
        this.setData({ 
          videoData: res.data,
          downloadFailed: false 
        });
        callback(); 
      } else {
        this.showCustomToast(res.msg || '通道刷新失败，请手动点击解析');
      }
    }).catch(err => {
      wx.hideLoading();
      this.setData({ isProcessing: false }); // 释放锁
      this.showCustomToast('网络异常，请重试');
    });
  },

  // ================= 🚀 2. 真正的普通用户保护体系 =================
  checkAuthAndProcess(callback) {
    let goldVipExpire = wx.getStorageSync('goldVipExpire') || 0;
    if (Date.now() < goldVipExpire) return callback(null); 

    const saveQuota = this.getQuota('video_save_quota'); 
    if (saveQuota.count < (QUOTA_CONFIG.SAVE_FREE + saveQuota.extra)) {
      const executeDeduct = () => {
        const sq = this.getQuota('video_save_quota');
        sq.count++;
        this.updateQuota('video_save_quota', sq);
      };
      return callback(executeDeduct);
    }

    this.showUpgradeModal(callback);
  },

  showUpgradeModal(callback) {
    const silverCount = wx.getStorageSync('silverVipCount') || 0;
    
    wx.showModal({
      title: '免费保存次数已用完',
      content: silverCount > 0 
        ? `观看广告或消耗1张免广告卡(余${silverCount})解锁5次保存额度` 
        : '观看一段广告即可解锁5次保存额度',
      showCancel: true,
      cancelText: '取消',
      confirmText: silverCount > 0 ? '使用卡片' : '看广告',
      confirmColor: '#2B66FF',
      success: (res) => {
        if (res.confirm) {
          if (silverCount > 0) {
            this.useSilverCard(callback);
          } else {
            this.pendingDownloadCallback = callback; 
            if (this.videoAd) this.videoAd.show().catch(() => { this.showCustomToast('广告拉取失败'); });
          }
        }
      }
    });
  },

  useSilverCard(callback) {
    wx.showLoading({ title: '处理中...' });
    
    api.post('/api/v1/wx-proxy/user/consume-silver-card', {}).then(res => {
      wx.hideLoading();
      if (res.code === 200) {
        wx.setStorageSync('silverVipCount', res.data.silver_count);
        
        const s = this.getQuota('video_save_quota');
        s.extra += QUOTA_CONFIG.SAVE_REWARD;
        this.updateQuota('video_save_quota', s);
        
        this.showCustomToast('已消耗1张卡，自动开始下载');

        const executeDeduct = () => {
          const sq = this.getQuota('video_save_quota');
          sq.count++;
          this.updateQuota('video_save_quota', sq);
        };
        setTimeout(() => { callback(executeDeduct); }, 500);
      } else {
        this.showCustomToast(res.msg || '卡片消耗失败');
      }
    }).catch(err => {
      wx.hideLoading();
      this.showCustomToast(err || '网络请求异常');
    });
  },

  grantSaveQuota() {
    const s = this.getQuota('video_save_quota');
    s.extra += QUOTA_CONFIG.SAVE_REWARD;
    this.updateQuota('video_save_quota', s);
    this.showCustomToast(`成功解锁 ${QUOTA_CONFIG.SAVE_REWARD} 次保存机会 🎉`);
  },

  // ================= 🚀 3. 下载动作核心拦截与执行 =================
  
  saveResource() {
    // 🌟 互斥锁：下载中或解析中，禁止触发下载
    if (this.data.isDownloading || this.isGlobalDownloading) return this.showCustomToast('任务正在下载中'); 
    if (this.data.isProcessing) return this.showCustomToast('正在解析中，请稍候');

    if (this.data.downloadFailed) {
      this.silentReParse(() => { this.executeSaveResource(); });
      return;
    }
    this.executeSaveResource();
  },

  executeSaveResource() {
    if (this.data.videoData && this.data.videoData.isSaved) {
      this.proceedToSaveAuth(() => {
        if (this.data.videoData.type === 'video') { this.downloadVideo(null); } 
        else { this.downloadImages(null); }
      });
      return;
    }
    this.proceedToSaveAuth(() => {
      this.checkAuthAndProcess((deductFunc) => {
        if (this.data.videoData.type === 'video') { this.downloadVideo(deductFunc); } 
        else { this.downloadImages(deductFunc); }
      });
    });
  },

  saveSingleImage(e) {
    // 🌟 互斥锁：下载中或解析中，禁止触发单图下载
    if (this.data.isDownloading || this.isGlobalDownloading) return this.showCustomToast('任务正在下载中'); 
    if (this.data.isProcessing) return this.showCustomToast('正在解析中，请稍候');
    
    const targetUrl = e.currentTarget.dataset.url;
    const imgIndex = this.data.videoData.images.indexOf(targetUrl);

    if (this.data.downloadFailed) {
      this.silentReParse(() => {
        const newUrl = this.data.videoData.images[imgIndex] || this.data.videoData.images[0];
        this.executeSaveSingleImage(newUrl);
      });
      return;
    }
    this.executeSaveSingleImage(targetUrl);
  },

  executeSaveSingleImage(targetUrl) {
    let savedArr = this.data.savedSingleImages || [];
    if (savedArr.includes(targetUrl)) {
      this.proceedToSaveAuth(() => { this.doDownloadSingle(targetUrl, null); });
      return;
    }
    this.proceedToSaveAuth(() => {
      this.checkAuthAndProcess((deductFunc) => {
        this.doDownloadSingle(targetUrl, deductFunc);
      });
    });
  },

  // ================= 🌟 4. 基础保存与工具函数 =================
  saveToHistory(originalUrl, apiData) {
    const history = wx.getStorageSync('parseHistory') || [];
    const existingIndex = history.findIndex(item => item.original_url === originalUrl);
    if (existingIndex > -1) { history.splice(existingIndex, 1); }

    const dataType = apiData.type === 'image' ? 'images' : apiData.type;
    const finalCover = (apiData.cover || (apiData.images && apiData.images[0]) || '').replace('http://', 'https://');

    history.unshift({
      id: Date.now().toString(),
      type: dataType, platform: this.detectPlatform(originalUrl), cover_url: finalCover,
      parsed_text: apiData.title || '精美内容', original_url: originalUrl, timestamp: this.formatTime(new Date())
    });
    if (history.length > 500) history.length = 500;
    wx.setStorageSync('parseHistory', history);
  },

  detectPlatform(url) {
    if (url.includes('douyin.com')) return '抖音';
    if (url.includes('xiaohongshu.com')) return '小红书';
    if (url.includes('kuaishou.com')) return '快手';
    if (url.includes('weibo.com')) return '微博';
    if (url.includes('bilibili.com')) return 'B站';
    return '社交平台';
  },

  updateParseStats() {
    const todayStr = this.formatTime(new Date()).substring(0, 10); 
    let stats = wx.getStorageSync('parseStats') || { total: 0, today: 0, lastDate: todayStr };
    if (stats.lastDate !== todayStr) { stats.today = 0; stats.lastDate = todayStr; }
    stats.total += 1; stats.today += 1;
    wx.setStorageSync('parseStats', stats);
  },

  proceedToSaveAuth(callback) {
    wx.getSetting({
      success: (res) => {
        if (res.authSetting['scope.writePhotosAlbum'] === false) {
          wx.showModal({
            title: '需要相册权限', content: '保存无水印资源到手机，需要开启相册权限哦。', confirmText: '去开启', confirmColor: '#2B66FF',
            success: (modalRes) => { 
              if (modalRes.confirm) wx.openSetting({ success: (settingRes) => { if (settingRes.authSetting['scope.writePhotosAlbum']) callback(); } });
            }
          });
        } 
        else if (res.authSetting['scope.writePhotosAlbum'] === undefined) {
          wx.authorize({
            scope: 'scope.writePhotosAlbum',
            success: () => { setTimeout(() => { callback(); }, 300); },
            fail: () => { this.showCustomToast('您取消了授权，无法保存'); }
          });
        } else { callback(); }
      },
      fail: () => { callback(); }
    });
  },

  showDownloadFailModal() {
    this.setData({ downloadFailed: true }); 
    wx.showModal({
      title: '温馨提示', 
      content: '当前下载通道拥挤，网络链接已断开 🏃\n\n系统已为您准备新通道，请【再次点击下载】即可智能重试！',
      showCancel: false, 
      confirmText: '我知道了', 
      confirmColor: '#2B66FF'
    });
  },

  doDownloadSingle(url, deductFunc) {
    this.isGlobalDownloading = true; // 上锁
    wx.showLoading({ title: '正在下载...' });
    const fs = wx.getFileSystemManager();
    const localFilePath = `${wx.env.USER_DATA_PATH}/dl_single_${Date.now()}.png`;

    wx.downloadFile({
      url: url,
      success: (res) => {
        if (res.statusCode === 200) {
          fs.copyFile({
            srcPath: res.tempFilePath, destPath: localFilePath,
            success: () => {
              wx.saveImageToPhotosAlbum({
                filePath: localFilePath,
                success: () => {
                  wx.hideLoading(); this.isGlobalDownloading = false; // 释放锁
                  
                  if (deductFunc) deductFunc(); 
                  
                  let savedArr = this.data.savedSingleImages || [];
                  savedArr.push(url);
                  this.setData({ savedSingleImages: savedArr });

                  wx.navigateTo({ url: `/pages/success/success?type=image&path=${encodeURIComponent(url)}` });
                },
                fail: () => { wx.hideLoading(); this.isGlobalDownloading = false; },
                complete: () => { fs.unlink({ filePath: localFilePath, success: () => {} }); }
              });
            },
            fail: () => { wx.hideLoading(); this.isGlobalDownloading = false; } // 释放锁
          });
        } else { wx.hideLoading(); this.isGlobalDownloading = false; this.showDownloadFailModal(); }
      },
      fail: () => { wx.hideLoading(); this.isGlobalDownloading = false; this.showDownloadFailModal(); }
    });
  },

  downloadVideo(deductFunc) {
    this.isGlobalDownloading = true; // 上锁
    this.setData({ isDownloading: true, downloadProgressText: '建立连接...' });
    const fs = wx.getFileSystemManager();
    const localFilePath = `${wx.env.USER_DATA_PATH}/dl_video_${Date.now()}.mp4`;

    const downloadTask = wx.downloadFile({
      url: this.data.videoData.url, 
      success: (res) => {
        this.isGlobalDownloading = false; // 释放锁
        if (res.statusCode === 200) {
          fs.copyFile({
            srcPath: res.tempFilePath, destPath: localFilePath,
            success: () => {
              wx.saveVideoToPhotosAlbum({
                filePath: localFilePath,
                success: () => {
                  if (deductFunc) deductFunc(); 

                  this.setData({ 
                    isDownloading: false, 
                    downloadProgressText: '再存一次',
                    'videoData.isSaved': true
                  });
                  wx.navigateTo({ url: `/pages/success/success?type=video&path=${encodeURIComponent(this.data.videoData.cover)}` });
                },
                fail: () => { this.setData({ isDownloading: false, downloadProgressText: '下载' }); },
                complete: () => { fs.unlink({ filePath: localFilePath, success: () => {} }); }
              });
            },
            fail: () => { this.setData({ isDownloading: false, downloadProgressText: '下载' }); }
          });
        } else {
          this.setData({ isDownloading: false, downloadProgressText: '下载' });
          this.showDownloadFailModal();
        }
      },
      fail: () => {
        this.isGlobalDownloading = false; // 释放锁
        this.setData({ isDownloading: false, downloadProgressText: '下载' });
        this.showDownloadFailModal();
      }
    });

    downloadTask.onProgressUpdate((res) => { this.setData({ downloadProgressText: `下载中 ${res.progress}%` }); });
  },

  async downloadImages(deductFunc) {
    this.isGlobalDownloading = true; // 上锁
    const images = this.data.videoData.images;
    this.setData({ isDownloading: true });
    let successCount = 0; let needRetry = false; 
    const fs = wx.getFileSystemManager();

    for (let i = 0; i < images.length; i++) {
      this.setData({ downloadProgressText: `下载中 ${i + 1}/${images.length}` });
      const localFilePath = `${wx.env.USER_DATA_PATH}/dl_img_${Date.now()}_${i}.png`;

      const isSuccess = await new Promise((resolve) => {
        wx.downloadFile({
          url: images[i], 
          success: (res) => {
            if (res.statusCode === 200) {
              fs.copyFile({
                srcPath: res.tempFilePath, destPath: localFilePath,
                success: () => {
                  wx.saveImageToPhotosAlbum({ 
                    filePath: localFilePath, success: () => resolve(true), fail: () => resolve(false),
                    complete: () => { fs.unlink({ filePath: localFilePath, success: () => {} }); }
                  });
                },
                fail: () => resolve(false)
              });
            } else { needRetry = true; resolve(false); }
          },
          fail: () => { needRetry = true; resolve(false); }
        });
      });
      if (needRetry) break; 
      if (isSuccess) successCount++;
    }

    this.isGlobalDownloading = false; // 释放锁
    this.setData({ isDownloading: false, downloadProgressText: '下载全部' });
    
    if (successCount > 0) {
      if (deductFunc) deductFunc(); 
      
      this.setData({ 
        'videoData.isSaved': true,
        downloadProgressText: '再存一次'
      });
      wx.navigateTo({ url: `/pages/success/success?type=image&path=${encodeURIComponent(images[0])}` });
    } else if (needRetry) {
      this.showDownloadFailModal();
    }
  },

  previewImage(e) { wx.previewImage({ current: this.data.videoData.images[e.currentTarget.dataset.index], urls: this.data.videoData.images }); },
  copySingleImageLink(e) { wx.setClipboardData({ data: e.currentTarget.dataset.url }); },
  copyResourceLink() { wx.setClipboardData({ data: this.data.videoData.type === 'video' ? this.data.videoData.url : this.data.videoData.images.join('\n') }); },
  copyTitle() { if (this.data.videoData) wx.setClipboardData({ data: this.data.videoData.title }); },
  onShareAppMessage() { return { title: '短视频图文无痕高清提取！', path: '/pages/video/video' }; },
  onShareTimeline() { return { title: '全网无痕提取神器 ✨' }; }
});
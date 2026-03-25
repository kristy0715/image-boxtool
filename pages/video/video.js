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
    isProcessing: false,
    isDownloading: false,
    downloadProgressText: '下载', 
    videoData: null,
    bannerUnitId: AD_CONFIG.BANNER_ID
  },

  videoAd: null,
  interstitialAd: null,
  isGlobalDownloading: false,

  onLoad() {
    this.initVideoAd();
    this.initInterstitialAd();
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 0 });
    }
  },
  
  onUnload() {
    this.isGlobalDownloading = false; 
  },

// 🌟 真正的跳转防抖逻辑
goToLocalWatermark() {
  // 1. 如果当前正在跳转中，直接拦截无视后续点击
  if (this.isNavigating) return; 
  
  // 2. 马上上锁
  this.isNavigating = true;

  wx.navigateTo({
    url: '/pages/watermark/watermark',
    complete: () => {
      // 3. 跳转动作执行完毕后，延迟 800 毫秒再把锁解开
      setTimeout(() => {
        this.isNavigating = false;
      }, 800);
    }
  });
},
  
  initVideoAd() {
    if (wx.createRewardedVideoAd) {
      this.videoAd = wx.createRewardedVideoAd({ adUnitId: AD_CONFIG.VIDEO_ID });
      this.videoAd.onClose((res) => {
        if (res && res.isEnded) {
          this.grantSaveQuota(); 
        } else {
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

  getQuota(key) {
    const today = new Date().toLocaleDateString();
    let r = wx.getStorageSync(key) || { date: today, count: 0, extra: 0 };
    if (r.date !== today) r = { date: today, count: 0, extra: 0 };
    return r;
  },

  updateQuota(key, val) { wx.setStorageSync(key, val); },

  showCustomToast(msg) {
    wx.hideToast();
    const topTips = this.selectComponent('#topTips');
    if (topTips && typeof topTips.showTip === 'function') { 
      topTips.showTip(msg); 
    } else { 
      wx.showToast({ title: msg, icon: 'none' }); 
    }
  },

  handleInput(e) { this.setData({ inputValue: e.detail.value }); },
  clearInput() { this.setData({ inputValue: '' }); },
  pasteFromClipboard() {
    wx.getClipboardData({ success: (res) => { if (res.data) this.setData({ inputValue: res.data }); } });
  },

  extractUrl(text) {
    const urlRegex = /(https?:\/\/[a-zA-Z0-9\-\.\_\~\:\/\?\#\[\]\@\!\$\&\'\(\)\*\+\,\;\=\%]+)/g;
    const match = text.match(urlRegex);
    return match ? match[0] : null;
  },

  startParse(e, retryCount = 0) {
    if (retryCount === 0 && this.data.isProcessing) return;   
    if (retryCount === 0 && !this.data.inputValue) return this.showCustomToast('请粘贴链接 ⚠️');
    const realUrl = this.extractUrl(this.data.inputValue);
    if (!realUrl) return this.showCustomToast('解析失败，请检查链接格式');

    if (retryCount === 0) {
      this.setData({ isProcessing: true });
    }

    const MAX_RETRIES = 3; 

    wx.request({
      url: 'https://goodgoodstudy-nb.top/api/parse-video',
      method: 'POST',
      header: { 'x-api-key': 'sk-ucGynTYiVxxw3_nclVtepg' }, 
      data: { url: realUrl }, 
      success: (res) => {
        if (res.statusCode === 200 && res.data && res.data.code === 200) {
          const data = res.data.data;
          let dataType = data.type === 'image' ? 'images' : data.type;
          this.setData({
            videoData: {
              type: dataType,
              title: data.title || '精美内容',
              cover: (data.cover || '').replace('http://', 'https://'), 
              url: (data.url || '').replace('http://', 'https://'), 
              images: (data.images || []).map(img => img.replace('http://', 'https://'))
            },
            isProcessing: false
          });
          this.showCustomToast(`解析成功 🎉`);
          
          if (this.interstitialAd) this.interstitialAd.show().catch(() => {});
          
        } 
        else if (res.data && res.data.code === 400) {
          this.setData({ isProcessing: false });
          this.showCustomToast(res.data.msg || '暂不支持该链接，请换个平台试试');
        }
        else {
          this.handleParseRetry(retryCount, MAX_RETRIES);
        }
      },
      fail: () => {
        this.handleParseRetry(retryCount, MAX_RETRIES);
      }
    });
  },

  handleParseRetry(currentRetry, maxRetries) {
    if (currentRetry < maxRetries) {
      setTimeout(() => { this.startParse(null, currentRetry + 1); }, 1000);
    } else {
      this.setData({ isProcessing: false });
      wx.showModal({
        title: '温馨提示',
        content: '当前排队人数较多或触发了平台拦截策略 🏃\n\n建议您稍作等待，或多点击几次【开始解析】试试看！',
        confirmText: '我知道了',
        confirmColor: '#2B66FF',
        showCancel: false
      });
    }
  },

  checkAuthAndProcess(callback) {
    const save = this.getQuota('video_save_quota');
    if (save.count >= (QUOTA_CONFIG.SAVE_FREE + save.extra)) {
      this.showAdModal(); 
      return;
    }
    if (this.data.isDownloading || this.isGlobalDownloading) {
      return this.showCustomToast('任务正在下载中，请稍候'); 
    }
    
    wx.getSetting({
      success: (res) => {
        if (res.authSetting['scope.writePhotosAlbum'] === false) {
          wx.showModal({
            title: '需要相册权限',
            content: '保存无水印资源到手机，需要您开启相册权限哦。',
            confirmText: '去开启',
            confirmColor: '#2B66FF',
            success: (modalRes) => { 
              if (modalRes.confirm) {
                wx.openSetting({
                  success: (settingRes) => {
                    if (settingRes.authSetting['scope.writePhotosAlbum']) callback();
                  }
                });
              } 
            }
          });
        } 
        else if (res.authSetting['scope.writePhotosAlbum'] === undefined) {
          wx.authorize({
            scope: 'scope.writePhotosAlbum',
            success: () => { setTimeout(() => { callback(); }, 300); },
            fail: () => { this.showCustomToast('您取消了授权，无法保存'); }
          });
        } 
        else { callback(); }
      },
      fail: () => { callback(); }
    });
  },

  saveResource() {
    this.checkAuthAndProcess(() => {
      if (this.data.videoData.type === 'video') { this.downloadVideo(); } 
      else { this.downloadImages(); }
    });
  },

  saveSingleImage(e) {
    const targetUrl = e.currentTarget.dataset.url;
    this.checkAuthAndProcess(() => {
      this.doDownloadSingle(targetUrl);
    });
  },

  copySingleImageLink(e) {
    const targetUrl = e.currentTarget.dataset.url;
    wx.setClipboardData({ data: targetUrl });
  },

  doDownloadSingle(url) {
    this.isGlobalDownloading = true;
    wx.showLoading({ title: '正在下载...' });

    const fs = wx.getFileSystemManager();
    const localFilePath = `${wx.env.USER_DATA_PATH}/dl_single_${Date.now()}.png`;

    wx.downloadFile({
      url: url,
      success: (res) => {
        if (res.statusCode === 200) {
          fs.copyFile({
            srcPath: res.tempFilePath,
            destPath: localFilePath,
            success: () => {
              wx.saveImageToPhotosAlbum({
                filePath: localFilePath,
                success: () => {
                  wx.hideLoading();
                  this.isGlobalDownloading = false;
                  
                  const record = this.getQuota('video_save_quota');
                  record.count++; 
                  this.updateQuota('video_save_quota', record);

                  wx.navigateTo({ url: `/pages/success/success?type=image&path=${encodeURIComponent(url)}` });
                },
                fail: (err) => {
                  wx.hideLoading();
                  this.isGlobalDownloading = false;
                  if (err.errMsg.indexOf('cancel') === -1) {
                    wx.showModal({ title: '保存失败', content: '相册保存被拒绝或空间不足。', showCancel: false });
                  }
                },
                complete: () => { fs.unlink({ filePath: localFilePath, success: () => {} }); }
              });
            },
            fail: () => {
              wx.hideLoading();
              this.isGlobalDownloading = false;
              this.showCustomToast('文件处理失败');
            }
          });
        } else {
          wx.hideLoading();
          this.isGlobalDownloading = false;
          this.showDownloadFailModal(url);
        }
      },
      fail: () => {
        wx.hideLoading();
        this.isGlobalDownloading = false;
        this.showDownloadFailModal(url);
      }
    });
  },

  showAdModal() {
    wx.showModal({ 
      title: '免费保存次数已用完', 
      content: `观看一段视频，即可解锁 ${QUOTA_CONFIG.SAVE_REWARD} 次保存机会！`, 
      confirmText: '看视频', 
      confirmColor: '#2B66FF',
      success: (res) => { 
        if (res.confirm && this.videoAd) {
          this.videoAd.show().catch(() => { this.showCustomToast('广告拉取失败，请稍后再试'); }); 
        } 
      } 
    });
  },

  grantSaveQuota() {
    const s = this.getQuota('video_save_quota');
    s.extra += QUOTA_CONFIG.SAVE_REWARD;
    this.updateQuota('video_save_quota', s);
    this.showCustomToast(`成功解锁 ${QUOTA_CONFIG.SAVE_REWARD} 次机会 🎉`);
  },

  showDownloadFailModal(urlData) {
    wx.showModal({
      title: '温馨提示',
      content: `当前下载通道拥挤，部分网络被拦截 🏃\n\n建议您重新点击提取刷新通道后再试！\n\n(也可点击复制直链，去浏览器中直接下载)`,
      confirmText: '复制直链',
      confirmColor: '#2B66FF',
      cancelText: '我知道了',
      success: (res) => {
        if (res.confirm) wx.setClipboardData({ data: urlData });
      }
    });
  },

  downloadVideo() {
    this.isGlobalDownloading = true; 
    this.setData({ isDownloading: true, downloadProgressText: '建立连接...' });

    const fs = wx.getFileSystemManager();
    const localFilePath = `${wx.env.USER_DATA_PATH}/dl_video_${Date.now()}.mp4`;

    const downloadTask = wx.downloadFile({
      url: this.data.videoData.url, 
      success: (res) => {
        this.isGlobalDownloading = false; 
        if (res.statusCode === 200) {
          fs.copyFile({
            srcPath: res.tempFilePath,
            destPath: localFilePath,
            success: () => {
              wx.saveVideoToPhotosAlbum({
                filePath: localFilePath,
                success: () => {
                  this.setData({ isDownloading: false, downloadProgressText: '下载' });
                  wx.navigateTo({ url: `/pages/success/success?type=video&path=${encodeURIComponent(this.data.videoData.cover)}` });
                  
                  const record = this.getQuota('video_save_quota');
                  record.count++; 
                  this.updateQuota('video_save_quota', record);
                },
                fail: (err) => {
                  this.setData({ isDownloading: false, downloadProgressText: '下载' });
                  if (err.errMsg.indexOf('cancel') === -1) {
                    wx.showModal({ title: '保存失败', content: '相册保存被拒绝或空间不足。', showCancel: false });
                  }
                },
                complete: () => { fs.unlink({ filePath: localFilePath, success: () => {} }); }
              });
            },
            fail: (err) => {
              this.setData({ isDownloading: false, downloadProgressText: '下载' });
              wx.showModal({ title: '温馨提示', content: '文件处理失败，请重试。', showCancel: false });
            }
          });
        } else {
          this.setData({ isDownloading: false, downloadProgressText: '下载' });
          this.showDownloadFailModal(this.data.videoData.url);
        }
      },
      fail: (err) => {
        this.isGlobalDownloading = false; 
        this.setData({ isDownloading: false, downloadProgressText: '下载' });
        this.showDownloadFailModal(this.data.videoData.url);
      }
    });

    downloadTask.onProgressUpdate((res) => {
      this.setData({ downloadProgressText: `下载中 ${res.progress}%` });
    });
  },

  async downloadImages() {
    this.isGlobalDownloading = true; 
    const images = this.data.videoData.images;
    this.setData({ isDownloading: true });
    
    let successCount = 0;
    let needRetry = false; 

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
                srcPath: res.tempFilePath,
                destPath: localFilePath,
                success: () => {
                  wx.saveImageToPhotosAlbum({ 
                    filePath: localFilePath, 
                    success: () => resolve(true), 
                    fail: (err) => resolve(false),
                    complete: () => { fs.unlink({ filePath: localFilePath, success: () => {} }); }
                  });
                },
                fail: (err) => resolve(false)
              });
            } else { needRetry = true; resolve(false); }
          },
          fail: (err) => { needRetry = true; resolve(false); }
        });
      });

      if (needRetry) break; 
      if (isSuccess) successCount++;
    }

    this.isGlobalDownloading = false; 
    this.setData({ isDownloading: false, downloadProgressText: '下载全部' });
    
    if (successCount > 0) {
      const record = this.getQuota('video_save_quota');
      record.count++; 
      this.updateQuota('video_save_quota', record);

      wx.navigateTo({ url: `/pages/success/success?type=image&path=${encodeURIComponent(images[0])}` });
      if (successCount < images.length) {
        this.showCustomToast(`成功保存${successCount}张，部分图片可能因网络原因遗漏`);
      }
    } else if (needRetry) {
      this.showDownloadFailModal(images.join('\n'));
    }
  },

  previewImage(e) {
    const index = e.currentTarget.dataset.index;
    wx.previewImage({ current: this.data.videoData.images[index], urls: this.data.videoData.images });
  },

  copyResourceLink() {
    const link = this.data.videoData.type === 'video' ? this.data.videoData.url : this.data.videoData.images.join('\n');
    wx.setClipboardData({ data: link });
  },

  copyTitle() {
    if (this.data.videoData) wx.setClipboardData({ data: this.data.videoData.title });
  },

  onShareAppMessage() { return { title: '短视频图文无痕高清提取！', path: '/pages/video/video' }; },
  onShareTimeline() { return { title: '全网无痕提取神器 ✨' }; }
});
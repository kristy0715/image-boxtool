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
    downloadProgressText: '📥 保存到相册', 
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

  onUnload() {
    // 👈 页面退出时强制重置，防止死锁
    this.isGlobalDownloading = false; 
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
    if (topTips) { topTips.showTip(msg); } 
    else { wx.showToast({ title: msg, icon: 'none' }); }
  },

  onShow() {
    // 点亮第 1 个 Tab (索引为 0)
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 0 });
    }
    wx.getClipboardData({
      success: (res) => {
        if (res.data && res.data.includes('http')) {
          wx.showModal({
            title: '智能识别',
            content: '检测到链接，是否立刻提取？',
            confirmColor: '#6366f1',
            success: (modalRes) => {
              if (modalRes.confirm) {
                this.setData({ inputValue: res.data });
                this.startParse();
                wx.setClipboardData({ data: '', success: () => wx.hideToast() });
              }
            }
          });
        }
      }
    });
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

// 🌟 解析逻辑：加入最多 3 次的静默自动重试机制
startParse(e, retryCount = 0) {
  // 👈 新增这一行：如果是用户主动点击（retryCount为0），且已经在处理中，直接拦截！
  if (retryCount === 0 && this.data.isProcessing) return;   
  if (retryCount === 0 && !this.data.inputValue) return this.showCustomToast('请粘贴链接 ⚠️');
  const realUrl = this.extractUrl(this.data.inputValue);
  if (!realUrl) return this.showCustomToast('解析失败，请检查链接格式');

  // 只有第一次点击时才开启 loading 状态，后面的静默重试不改变 UI
  if (retryCount === 0) {
    this.setData({ isProcessing: true });
  }

  const MAX_RETRIES = 3; // 最大静默重试次数（总共会请求 4 次）

  wx.request({
    url: 'https://goodgoodstudy-nb.top/api/parse-video',
    method: 'POST',
    header: { 'x-api-key': 'sk-ucGynTYiVxxw3_nclVtepg' },
    data: { url: realUrl }, 
    success: (res) => {
      if (res.data && res.data.code === 200) {
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
          isProcessing: false // 成功后立刻关闭 loading
        });
        this.showCustomToast(`解析成功 🎉`);
        
        if (this.interstitialAd) this.interstitialAd.show().catch(() => {});
        
        setTimeout(() => {
          wx.createSelectorQuery()
            .select('.result-card')
            .boundingClientRect((rect) => {
              if (rect) { wx.pageScrollTo({ scrollTop: rect.top - 20, duration: 400 }); }
            }).exec();
        }, 350);

      } else {
        // 业务报错：走重试逻辑
        this.handleParseRetry(retryCount, MAX_RETRIES);
      }
    },
    fail: () => {
      // 网络报错：走重试逻辑
      this.handleParseRetry(retryCount, MAX_RETRIES);
    }
  });
},

// 🌟 辅助函数：处理静默重试延迟
handleParseRetry(currentRetry, maxRetries) {
  if (currentRetry < maxRetries) {
    console.log(`[静默重试] 第 ${currentRetry + 1} 次尝试重新解析...`);
    // 延迟 1.5 秒后再次发起请求，避开临时的拥堵或网络抖动
    setTimeout(() => {
      this.startParse(null, currentRetry + 1);
    }, 1500);
  } else {
    // 所有的重试机会都用光了，再给用户弹排队提示
    this.setData({ isProcessing: false });
    this.showParseFailModal();
  }
},

  showParseFailModal() {
    wx.showModal({
      title: '温馨提示',
      content: '当前服务器解析排队人数较多 🏃\n\n建议您稍作等待，或多点击几次【立刻提取】试试看！',
      confirmText: '我知道了',
      confirmColor: '#10b981',
      showCancel: false
    });
  },

  saveResource() {
    if (!this.data.videoData) return;
    
    const save = this.getQuota('video_save_quota');
    if (save.count >= (QUOTA_CONFIG.SAVE_FREE + save.extra)) {
      this.showAdModal(); 
      return;
    }
    this.realSaveProcess();
  },

  showAdModal() {
    wx.showModal({ 
      title: '免费保存次数已用完', 
      content: `观看一段视频，即可解锁 ${QUOTA_CONFIG.SAVE_REWARD} 次保存机会！`, 
      confirmText: '看视频', 
      confirmColor: '#6366f1',
      success: (res) => { 
        if (res.confirm && this.videoAd) {
          this.videoAd.show().catch(() => { this.realSaveProcess(); }); 
        } 
      } 
    });
  },

  grantSaveQuota() {
    const s = this.getQuota('video_save_quota');
    s.extra += QUOTA_CONFIG.SAVE_REWARD;
    this.updateQuota('video_save_quota', s);
    this.showCustomToast(`成功解锁 ${QUOTA_CONFIG.SAVE_REWARD} 次机会 🎉`);
    setTimeout(() => { this.realSaveProcess(); }, 800);
  },

  // ================= 👑 终极权限守护逻辑 =================
  realSaveProcess() {
    if (this.data.isDownloading || this.isGlobalDownloading) return this.showCustomToast('任务正在下载中，请稍候'); 
    
    wx.getSetting({
      success: (res) => {
        // 1. 用户曾明确拒绝过授权
        if (res.authSetting['scope.writePhotosAlbum'] === false) {
          wx.showModal({
            title: '需要相册权限',
            content: '保存无水印资源到手机，需要您开启相册权限哦。',
            confirmText: '去开启',
            confirmColor: '#6366f1',
            success: (modalRes) => { 
              if (modalRes.confirm) {
                wx.openSetting({
                  success: (settingRes) => {
                    // 如果用户在设置里打开了开关，回来直接无缝开始下载！
                    if (settingRes.authSetting['scope.writePhotosAlbum']) {
                      this.executeDownload();
                    }
                  }
                });
              } 
            }
          });
        } 
        // 2. 第一次请求授权
        else if (res.authSetting['scope.writePhotosAlbum'] === undefined) {
          wx.authorize({
            scope: 'scope.writePhotosAlbum',
            success: () => { 
              setTimeout(() => { this.executeDownload(); }, 300); 
            },
            fail: () => { 
              this.showCustomToast('您取消了授权，无法保存'); 
            }
          });
        } 
        // 3. 已经有权限，直接冲
        else {
          this.executeDownload();
        }
      },
      fail: () => { 
        this.executeDownload(); // 接口故障兜底
      }
    });
  },

  executeDownload() {
    if (this.data.videoData.type === 'video') { this.downloadVideo(); } 
    else { this.downloadImages(); }
  },

  showDownloadFailModal(urlData) {
    wx.showModal({
      title: '温馨提示',
      content: `当前下载通道拥挤，部分网络被拦截 🏃\n\n建议您重新点击【立刻提取】刷新通道后再试！\n\n(您也可以点击下方复制直链，去浏览器中直接下载)`,
      confirmText: '复制直链',
      confirmColor: '#6366f1',
      cancelText: '我知道了',
      success: (res) => {
        if (res.confirm) wx.setClipboardData({ data: urlData });
      }
    });
  },

  downloadVideo() {
    this.isGlobalDownloading = true; 
    this.setData({ isDownloading: true, downloadProgressText: '📥 建立连接...' });

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
                  this.setData({ isDownloading: false, downloadProgressText: '📥 保存到相册' });
                  wx.navigateTo({ url: `/pages/success/success?type=video&path=${encodeURIComponent(this.data.videoData.cover)}` });
                  
                  const record = this.getQuota('video_save_quota');
                  record.count++; 
                  this.updateQuota('video_save_quota', record);
                },
                fail: (err) => {
                  this.setData({ isDownloading: false, downloadProgressText: '📥 保存到相册' });
                  // 👑 修复点：精准区分“用户点取消”和“真的失败了”
                  if (err.errMsg.indexOf('cancel') === -1) {
                    wx.showModal({ title: '保存失败', content: '相册保存被拒绝或存储空间不足，请清理手机空间后重试。', showCancel: false });
                  }
                },
                complete: () => { fs.unlink({ filePath: localFilePath, success: () => {} }); }
              });
            },
            fail: (err) => {
              this.setData({ isDownloading: false, downloadProgressText: '📥 保存到相册' });
              wx.showModal({ title: '温馨提示', content: '文件处理失败，请重试。', showCancel: false });
            }
          });
        } else {
          this.setData({ isDownloading: false, downloadProgressText: '📥 保存到相册' });
          this.showDownloadFailModal(this.data.videoData.url);
        }
      },
      fail: (err) => {
        this.isGlobalDownloading = false; 
        this.setData({ isDownloading: false, downloadProgressText: '📥 保存到相册' });
        this.showDownloadFailModal(this.data.videoData.url);
      }
    });

    downloadTask.onProgressUpdate((res) => {
      this.setData({ downloadProgressText: `⚡视频下载中 ${res.progress}%` });
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
      this.setData({ downloadProgressText: `📥 图片下载中 ${i + 1}/${images.length}` });
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
            } else {
              needRetry = true;
              resolve(false); 
            }
          },
          fail: (err) => {
            needRetry = true;
            resolve(false);
          }
        });
      });

      if (needRetry) break; 
      if (isSuccess) successCount++;
    }

    this.isGlobalDownloading = false; 
    this.setData({ isDownloading: false, downloadProgressText: '📥 保存到相册' });
    
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

  onShareAppMessage() { return { title: '无水印高清提取，点击免费使用！', path: '/pages/video/video' }; },
  onShareTimeline() { return { title: '全网无水印提取神器 ✨' }; }
});
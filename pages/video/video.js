const AD_CONFIG = {
  BANNER_ID: 'adunit-ecfcec4c6a0c871b', 
  VIDEO_ID: 'adunit-da175a2014d3443b',  
  INTERSTITIAL_ID: 'adunit-a9556a7e617c27b7' 
};

const DAILY_FREE_SAVE_LIMIT = 2; 
let isGlobalDownloading = false; 

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

  onLoad() {
    this.initVideoAd();
    this.initInterstitialAd();
  },

  initVideoAd() {
    if (wx.createRewardedVideoAd) {
      this.videoAd = wx.createRewardedVideoAd({ adUnitId: AD_CONFIG.VIDEO_ID });
      this.videoAd.onClose((res) => {
        if (res && res.isEnded) {
          this.setDailyUnlimitedSave();
          this.realSaveProcess(); 
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

  showCustomToast(msg) {
    wx.hideToast();
    const topTips = this.selectComponent('#topTips');
    if (topTips) { topTips.showTip(msg); } 
    else { wx.showToast({ title: msg, icon: 'none' }); }
  },

  onShow() {
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

  startParse() {
    if (!this.data.inputValue) return this.showCustomToast('请粘贴链接 ⚠️');
    const realUrl = this.extractUrl(this.data.inputValue);
    if (!realUrl) return this.showCustomToast('解析失败，请检查链接格式');

    this.setData({ isProcessing: true });

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
            }
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
          this.showCustomToast('解析失败，请重新解析或换个链接');
        }
      },
      fail: () => this.showCustomToast('网络请求失败，请稍后再试'),
      complete: () => { this.setData({ isProcessing: false }); }
    });
  },

  saveResource() {
    if (!this.data.videoData) return;
    const today = new Date().toLocaleDateString();
    const record = wx.getStorageSync('video_save_record') || { date: today, count: 0, isUnlimited: false };
    
    if (record.date !== today) {
      record.date = today; record.count = 0; record.isUnlimited = false;
    }

    if (record.isUnlimited || record.count < DAILY_FREE_SAVE_LIMIT) {
      this.realSaveProcess();
    } else {
      if (this.videoAd) {
        this.videoAd.show().catch(() => this.realSaveProcess());
      } else {
        this.realSaveProcess();
      }
    }
  },

  setDailyUnlimitedSave() {
    const today = new Date().toLocaleDateString();
    wx.setStorageSync('video_save_record', { date: today, count: 99, isUnlimited: true });
  },

  realSaveProcess() {
    if (this.data.isDownloading || isGlobalDownloading) return this.showCustomToast('任务正在下载中，请稍候'); 
    
    wx.getSetting({
      success: (res) => {
        if (res.authSetting['scope.writePhotosAlbum'] === false) {
          wx.showModal({
            title: '需要相册权限',
            content: '保存无水印资源需要开启相册权限',
            confirmText: '去开启',
            success: (modalRes) => {
              if (modalRes.confirm) wx.openSetting();
            }
          });
        } else if (res.authSetting['scope.writePhotosAlbum'] === undefined) {
          wx.authorize({
            scope: 'scope.writePhotosAlbum',
            success: () => { setTimeout(() => { this.executeDownload(); }, 500); },
            fail: () => { this.showCustomToast('您取消了授权，无法保存'); }
          });
        } else {
          this.executeDownload();
        }
      },
      fail: () => { this.executeDownload(); }
    });
  },

  executeDownload() {
    if (this.data.videoData.type === 'video') { this.downloadVideo(false); } 
    else { this.downloadImages(false); }
  },

  silentParseAndDownload() {
    const realUrl = this.extractUrl(this.data.inputValue);
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
            }
          });
          if (dataType === 'video') this.downloadVideo(true);
          else this.downloadImages(true);
        } else {
          this.setData({ isDownloading: false, downloadProgressText: '📥 保存到相册' });
          this.showCustomToast('原链接可能已失效，请重新复制');
        }
      },
      fail: () => {
        this.setData({ isDownloading: false, downloadProgressText: '📥 保存到相册' });
        this.showCustomToast('网络状况不佳，请重试');
      }
    });
  },

  downloadVideo(isRetry = false) {
    isGlobalDownloading = true; 
    this.setData({ isDownloading: true, downloadProgressText: '📥 建立连接...' });

    const fs = wx.getFileSystemManager();
    const localFilePath = `${wx.env.USER_DATA_PATH}/dl_video_${Date.now()}.mp4`;

    const downloadTask = wx.downloadFile({
      url: this.data.videoData.url, 
      success: (res) => {
        isGlobalDownloading = false; 
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
                  const record = wx.getStorageSync('video_save_record') || { count: 0 };
                  record.count++; wx.setStorageSync('video_save_record', record);
                },
                fail: (err) => {
                  this.setData({ isDownloading: false, downloadProgressText: '📥 保存到相册' });
                  wx.showModal({ title: '保存失败', content: '相册保存被拒: ' + err.errMsg, showCancel: false });
                },
                complete: () => { fs.unlink({ filePath: localFilePath, success: () => {} }); }
              });
            },
            fail: (err) => {
              this.setData({ isDownloading: false, downloadProgressText: '📥 保存到相册' });
              wx.showModal({ title: '文件转存失败', content: err.errMsg, showCancel: false });
            }
          });
        } else {
          if (res.statusCode === 403 && !isRetry) { this.silentParseAndDownload(); } 
          else {
            this.setData({ isDownloading: false, downloadProgressText: '📥 保存到相册' });
            wx.showModal({ title: '下载受限', content: `服务器拒绝(状态码${res.statusCode})`, showCancel: false });
          }
        }
      },
      fail: (err) => {
        isGlobalDownloading = false; 
        if (!isRetry) { this.silentParseAndDownload(); } 
        else {
          this.setData({ isDownloading: false, downloadProgressText: '📥 保存到相册' });
          wx.showModal({ title: '网络下载失败', content: err.errMsg, showCancel: false });
        }
      }
    });

    downloadTask.onProgressUpdate((res) => {
      this.setData({ downloadProgressText: `⚡视频下载中 ${res.progress}%` });
    });
  },

  async downloadImages(isRetry = false) {
    isGlobalDownloading = true; 
    const images = this.data.videoData.images;
    this.setData({ isDownloading: true });
    
    let successCount = 0;
    let needRetry = false; 
    let lastError = ''; // ⭐ 记录最后一次的具体报错

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
                    fail: (err) => {
                      lastError = "相册保存被拒: " + err.errMsg;
                      resolve(false);
                    },
                    complete: () => { fs.unlink({ filePath: localFilePath, success: () => {} }); }
                  });
                },
                fail: (err) => {
                  lastError = "文件转存失败: " + err.errMsg;
                  resolve(false);
                }
              });
            } else {
              if (res.statusCode === 403 && !isRetry) { needRetry = true; }
              lastError = `HTTP异常(状态码${res.statusCode})`;
              resolve(false); 
            }
          },
          fail: (err) => {
            if (!isRetry) needRetry = true;
            lastError = "网络拦截: " + err.errMsg;
            resolve(false);
          }
        });
      });

      if (needRetry) break; 
      if (isSuccess) successCount++;
    }

    isGlobalDownloading = false; 

    if (needRetry && !isRetry) {
      this.silentParseAndDownload();
      return; 
    }

    this.setData({ isDownloading: false, downloadProgressText: '📥 保存到相册' });
    
    if (successCount > 0) {
      // 哪怕只成功了 1 张，也算成功
      wx.navigateTo({ url: `/pages/success/success?type=image&path=${encodeURIComponent(images[0])}` });
      if (successCount < images.length) {
        this.showCustomToast(`成功保存${successCount}张，失败${images.length - successCount}张`);
      }
    } else if (isRetry || !needRetry) {
      // ⭐ 如果全部失败，弹窗告诉你到底是什么原因！
      wx.showModal({
        title: '下载失败诊断',
        content: lastError || '未知错误',
        showCancel: false
      });
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
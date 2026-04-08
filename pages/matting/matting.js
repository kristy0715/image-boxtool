// pages/matting/matting.js
const app = getApp();
const Audit = require('../../utils/audit.js'); // 🌟 新增引入
const TEST_MODE = false; 
const SERVER_MATTING_URL = 'https://goodgoodstudy-nb.top/api/v1/wx-proxy/remove-bg'; 
const APP_TAG = 'default_app'; 

const AD_CONFIG = {
  BANNER_ID: 'adunit-ecfcec4c6a0c871b', 
  VIDEO_ID: 'adunit-da175a2014d3443b',  
  INTERSTITIAL_ID: 'adunit-a9556a7e617c27b7'   
};

const QUOTA_CONFIG = { SAVE_FREE: 2, SAVE_REWARD: 5 };

Page({
  data: {
    isAllowed: false, // 🌟 核心防线
    selectedImage: '', 
    resultImage: '',   
    isProcessing: false,
    bannerUnitId: AD_CONFIG.BANNER_ID,
    
    previewBgColor: 'transparent',
    customBgImage: '',      
    currentEffect: 'none',  
    
    boxWidth: 0,
    boxHeight: 0,
    subjectBaseW: 0,
    subjectBaseH: 0,
    currentX: 0,
    currentY: 0,
    currentScale: 1,

    initBoxHeight: 0,
    initX: 0,
    initY: 0,

    onlyHuman: true
  },

  videoAd: null,
  interstitialAd: null,

  onLoad() {
    Audit.checkAccess().then(allowed => {
      if (!allowed) return; // 被拦截踢走

      this.setData({ isAllowed: true }, () => {
        wx.setNavigationBarTitle({ title: 'AI 智能抠图' });
      });

      this.initAds();
    });
  },

  initAds() {
    if (wx.createRewardedVideoAd) {
      this.videoAd = wx.createRewardedVideoAd({ adUnitId: AD_CONFIG.VIDEO_ID });
      this.videoAd.onError(err => console.error('激励视频加载失败', err));
      this.videoAd.onClose(res => {
        if (res && res.isEnded) {
          const save = this.getQuota('matting_save_quota');
          save.extra += QUOTA_CONFIG.SAVE_REWARD;
          wx.setStorageSync('matting_save_quota', save);
          wx.showToast({ title: `成功解锁 ${QUOTA_CONFIG.SAVE_REWARD} 次机会`, icon: 'success' });
        } else {
          wx.showToast({ title: '需完整观看才能解锁', icon: 'none' });
        }
      });
    }

    if (wx.createInterstitialAd) {
      this.interstitialAd = wx.createInterstitialAd({ adUnitId: AD_CONFIG.INTERSTITIAL_ID });
      this.interstitialAd.onLoad(() => console.log('插屏广告已准备就绪'));
      this.interstitialAd.onError(err => console.error('插屏广告加载出错', err));
    }
  },

  getQuota(key) {
    const today = new Date().toLocaleDateString();
    let record = wx.getStorageSync(key) || { date: today, count: 0, extra: 0 };
    if (record.date !== today) record = { date: today, count: 0, extra: 0 }; 
    return record;
  },

  chooseImage() {
    wx.chooseMedia({
      count: 1, mediaType: ['image'], 
      sizeType: ['compressed'], 
      success: (res) => {
        this.setData({ 
          selectedImage: res.tempFiles[0].tempFilePath,
          resultImage: '',
          previewBgColor: 'transparent',
          customBgImage: '',
          currentEffect: 'none',
          boxHeight: 0 
        });
      }
    });
  },

  toggleOnlyHuman(e) {
    this.setData({ onlyHuman: e.detail.value });
  },

  async startMatting() {
    if (!this.data.selectedImage) return;
    const path = this.data.selectedImage;
    this.setData({ isProcessing: true });
    
    if (TEST_MODE) {
        setTimeout(() => {
            this.handleMattingSuccess(path);
            wx.showToast({ title: '测试模式:模拟成功', icon: 'none' });
        }, 1500);
        return;
    }

    try {
      const fs = wx.getFileSystemManager();
      const base64 = fs.readFileSync(path, 'base64');
      
      const res = await new Promise((resolve, reject) => {
        wx.request({
          url: SERVER_MATTING_URL, 
          method: 'POST',
          data: { image: base64, app_tag: APP_TAG, only_human: this.data.onlyHuman },
          success: resolve, fail: reject
        });
      });

      const aiData = res.data;
      if (aiData && aiData.code === 200 && aiData.data && aiData.data.image) {
        let imgData = aiData.data.image;
        let that = this;
        
        if (imgData.startsWith('http') || imgData.includes('://')) {
          imgData = imgData.replace(/\\/g, "").replace('http://', 'https://'); 

          // 🌟 换回 wx.downloadFile，避免 wx.request 报域名未配置的错误
          const localPath = `${wx.env.USER_DATA_PATH}/matting_dl_${Date.now()}.png`;

          wx.downloadFile({
            url: imgData,
            filePath: localPath, // 强制生成为 PNG 后缀
            success: function (resDl) {
              if (resDl.statusCode === 200) {
                that.handleMattingSuccess(localPath);
              } else {
                that.setData({ isProcessing: false });
                wx.showToast({ title: '云端下载失败', icon: 'none' });
              }
            },
            fail: function(err) {
              console.error("下载报错", err);
              that.setData({ isProcessing: false });
              wx.showModal({ title: '网络拦截', content: '云端图片下载失败，请重试', showCancel: false });
            }
          });
        } 
        else {
          // 如果接口直接返回 Base64，严格使用 base64 编码写入（保护透明通道）
          let mattedBase64 = imgData.replace(/^data:image\/\w+;base64,/, "").replace(/[\r\n\s]/g, ""); 
          var saveFs = wx.getFileSystemManager();
          var number = Math.random();
          var localPath = wx.env.USER_DATA_PATH + '/pic' + number + '.png';
          
          saveFs.writeFile({
            filePath: localPath,
            data: mattedBase64,
            encoding: 'base64',
            success: function () {
              that.handleMattingSuccess(localPath);
            },
            fail: function(err) {
              console.log("写入失败", err);
              that.setData({ isProcessing: false });
            }
          });
        }
      }else {
        throw new Error(aiData?.msg || '未识别到主体');
      }
    } catch (err) {
      console.error(err);
      this.setData({ isProcessing: false });
      const errMsg = err.message ? err.message : '处理失败，请重试';
      wx.showToast({ title: errMsg, icon: 'none', duration: 3500 });
    }
  },

  handleMattingSuccess(localPath) {
    this.setData({ resultImage: localPath, isProcessing: false }, () => {
      const query = wx.createSelectorQuery();
      query.select('.canvas-box').boundingClientRect((rect) => {
        if (!rect) return;
        const boxW = rect.width;
        
        wx.getImageInfo({
          src: localPath,
          success: (info) => {
            const imgRatio = info.width / info.height;
            let boxH = boxW / imgRatio;
            if (boxH > 500) boxH = 500; 
            if (boxH < 200) boxH = 200;

            const baseW = boxW * 0.9;
            const baseH = baseW / imgRatio;
            const initX = boxW / 2;
            const initY = boxH / 2;

            this.setData({
              boxWidth: boxW, boxHeight: boxH, initBoxHeight: boxH, 
              subjectBaseW: baseW, subjectBaseH: baseH,
              currentX: initX, currentY: initY,
              initX: initX, initY: initY, currentScale: 1
            });

            if (this.interstitialAd) this.interstitialAd.show().catch(()=>{});
          }
        });
      }).exec();
    });
  },

  onSubjectMove(e) {
    if (e.detail.source === 'touch') {
      this.data.currentX = e.detail.x;
      this.data.currentY = e.detail.y;
    }
  },
  
  onSubjectScale(e) {
    this.data.currentX = e.detail.x;
    this.data.currentY = e.detail.y;
    this.data.currentScale = e.detail.scale;
  },

  resetLayout() {
    this.setData({
      previewBgColor: 'transparent', customBgImage: '', currentEffect: 'none',
      boxHeight: this.data.initBoxHeight, currentX: this.data.initX,
      currentY: this.data.initY, currentScale: 1
    });
    wx.showToast({ title: '已还原', icon: 'success', duration: 800 });
  },

  changeBg(e) { this.setData({ previewBgColor: e.currentTarget.dataset.color }); },

  chooseCustomBg() {
    wx.chooseMedia({
      count: 1, mediaType: ['image'], sizeType: ['original'],
      success: (res) => {
        const path = res.tempFiles[0].tempFilePath;
        wx.getImageInfo({
          src: path,
          success: (info) => {
            const boxW = this.data.boxWidth;
            const newBoxH = boxW * (info.height / info.width); 
            const targetX = boxW / 2; const targetY = newBoxH / 2;
            
            this.data.currentX = targetX; this.data.currentY = targetY;
            this.setData({ customBgImage: path, previewBgColor: 'custom', boxHeight: newBoxH, currentX: targetX, currentY: targetY });
          }
        });
      }
    });
  },

  changeEffect(e) { this.setData({ currentEffect: e.currentTarget.dataset.effect }); },

  saveImage() {
    if (!this.data.resultImage) return;

    const save = this.getQuota('matting_save_quota');
    if (save.count >= (QUOTA_CONFIG.SAVE_FREE + save.extra)) {
      wx.showModal({
        title: '免费保存次数已用完',
        content: `观看视频即可解锁 ${QUOTA_CONFIG.SAVE_REWARD} 次保存机会`,
        confirmText: '去观看',
        confirmColor: '#6366f1',
        success: (res) => {
          if (res.confirm && this.videoAd) this.videoAd.show().catch(() => {});
        }
      });
      return;
    }

    // 🌟 透明背景时，先提示用户
    if (this.data.previewBgColor === 'transparent') {
      wx.showModal({
        title: '透明背景说明',
        content: '由于系统限制，相册中的图片将转为 JPG 格式，透明背景会丢失。\n\n如需保留透明背景，需同时生成文件，使用时通过"发送文件"传输给好友或电脑。\n\n是否同时生成文件？',
        confirmText: '生成文件',
        cancelText: '仅存相册',
        confirmColor: '#6366f1',
        success: (res) => {
          // res.confirm为true表示点击"同时生成文件"，false表示点击"仅保存相册"
          if (res.confirm) {
            this.renderAndSaveComposite(true);
          } else if (res.cancel) {
            this.renderAndSaveComposite(false);
          }
        },
        fail: () => {
          wx.showToast({ title: '请重试', icon: 'none' });
        }
      });
      return;
    }

    this.renderAndSaveComposite(false);
  },

  async renderAndSaveComposite(saveAsFile = false) {
    const isTransparent = this.data.previewBgColor === 'transparent';
    let that = this;

    // 🟢 直出通道：如果没做任何操作且是透明底，直接保存底图
    if (isTransparent && this.data.currentEffect === 'none' && this.data.currentScale === 1 && this.data.currentX === this.data.initX && this.data.currentY === this.data.initY) {
      this.doSaveAlbum(this.data.resultImage, saveAsFile);
      return;
    }

    wx.showLoading({ title: '高质量合成中...', mask: true });
    try {
      const query = wx.createSelectorQuery();
      query.select('#exportCanvas').fields({ node: true, size: true }).exec(async (res) => {
        if (!res[0] || !res[0].node) {
           wx.hideLoading(); return wx.showToast({ title: '画板初始化失败', icon: 'none' });
        }
        
        const canvas = res[0].node;
        const ctx = canvas.getContext('2d');
        
        let exportScale = 3; 
        let bgImgObj = null;

        const loadCanvasImg = (src) => new Promise((resolve) => {
          const img = canvas.createImage();
          img.onload = () => resolve(img); img.onerror = () => resolve(null);
          img.src = src;
        });

        let cw, ch;
        if (this.data.previewBgColor === 'custom' && this.data.customBgImage) {
          const bgInfo = await new Promise((resFn, rej) => wx.getImageInfo({ src: this.data.customBgImage, success: resFn, fail: rej }));
          exportScale = bgInfo.width / this.data.boxWidth; 
          cw = Math.round(bgInfo.width); ch = Math.round(bgInfo.height);
          canvas.width = cw; canvas.height = ch;
          bgImgObj = await loadCanvasImg(bgInfo.path);
        } else {
          cw = Math.round(this.data.boxWidth * exportScale); ch = Math.round(this.data.boxHeight * exportScale);
          canvas.width = cw; canvas.height = ch;
        }

        ctx.clearRect(0, 0, cw, ch);

        if (bgImgObj) {
          ctx.drawImage(bgImgObj, 0, 0, cw, ch);
        } else if (!isTransparent) {
          ctx.fillStyle = this.data.previewBgColor;
          ctx.fillRect(0, 0, cw, ch);
        }

        const subInfo = await new Promise((resFn, rej) => wx.getImageInfo({ src: this.data.resultImage, success: resFn, fail: rej }));
        const subjectImg = await loadCanvasImg(subInfo.path);

        const drawW = Math.round(this.data.subjectBaseW * this.data.currentScale * exportScale);
        const drawH = Math.round(this.data.subjectBaseH * this.data.currentScale * exportScale);
        const drawX = Math.round((this.data.currentX * exportScale) - (drawW / 2));
        const drawY = Math.round((this.data.currentY * exportScale) - (drawH / 2));

        if (this.data.currentEffect === 'shadow') {
          ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
          ctx.shadowBlur = Math.round(30 * (exportScale / 3));
          ctx.shadowOffsetX = Math.round(15 * (exportScale / 3));
          ctx.shadowOffsetY = Math.round(20 * (exportScale / 3));
        } else if (this.data.currentEffect === 'stroke') {
          ctx.shadowColor = 'white';
          ctx.shadowBlur = Math.round(20 * (exportScale / 3));
          ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;
          ctx.drawImage(subjectImg, drawX, drawY, drawW, drawH);
          ctx.drawImage(subjectImg, drawX, drawY, drawW, drawH);
        }

        ctx.drawImage(subjectImg, drawX, drawY, drawW, drawH);

        setTimeout(() => {
          if (isTransparent) {
            // 🌟 终极截图同款方案（保留）：针对透明图层，只提取纯净 base64 强转文件！
            try {
              var dataURL = canvas.toDataURL('image/png');
              var base64Data = dataURL.replace(/^data:image\/png;base64,/, '');
              
              var saveFs = wx.getFileSystemManager();
              var number = Math.random();
              var targetPath = wx.env.USER_DATA_PATH + '/pic_export_' + number + '.png';

              saveFs.writeFile({
                filePath: targetPath,
                data: base64Data,
                encoding: 'base64',
                success: function () {
                  that.doSaveAlbum(targetPath, saveAsFile);
                },
                fail: function(err) {
                  wx.hideLoading();
                  wx.showToast({ title: '透明图生成失败', icon: 'none' });
                }
              });
            } catch (exportErr) {
              wx.hideLoading();
              wx.showToast({ title: '提取失败', icon: 'none' });
            }
          } else {
            // 不是透明图就使用常规的 JPG 导出接口
            wx.canvasToTempFilePath({
              canvas: canvas,
              fileType: 'jpg',
              quality: 1,
              success: (exportRes) => {
                that.doSaveAlbum(exportRes.tempFilePath);
              },
              fail: () => { wx.hideLoading(); wx.showToast({ title: '合成失败', icon: 'none' }); }
            });
          }
        }, 150); 
      });
    } catch (err) {
      wx.hideLoading(); wx.showToast({ title: '系统错误', icon: 'none' });
    }
  },

  // 统一保存方法
  doSaveAlbum(filePath, saveAsFile = false) {
    wx.showLoading({ title: '保存中...', mask: true });
    wx.saveImageToPhotosAlbum({
      filePath: filePath,
      success: () => {
        const save = this.getQuota('matting_save_quota');
        save.count++;
        wx.setStorageSync('matting_save_quota', save);
        wx.hideLoading();

        if (saveAsFile) {
          // 同时保存一份到本地文件系统（保留完整 PNG）
          wx.saveFile({
            tempFilePath: filePath,
            success: (res) => {
              wx.setStorageSync('last_transparent_png', res.savedFilePath);
              wx.navigateTo({
                url: `/pages/success/success?path=${encodeURIComponent(filePath)}&hasFile=1`,
                fail: () => wx.showToast({ title: '已保存', icon: 'success' })
              });
            },
            fail: () => {
              // 文件保存失败，仍然跳转成功页
              wx.navigateTo({
                url: `/pages/success/success?path=${encodeURIComponent(filePath)}`,
                fail: () => wx.showToast({ title: '已保存', icon: 'success' })
              });
            }
          });
        } else {
          wx.navigateTo({
            url: `/pages/success/success?path=${encodeURIComponent(filePath)}`,
            fail: () => wx.showToast({ title: '已保存', icon: 'success' })
          });
        }
      },
      fail: (err) => {
        wx.hideLoading();
        console.log("保存相册失败", err);
        if (err.errMsg.includes('auth')) wx.showModal({ title: '提示', content: '需开启相册权限', success: r => r.confirm && wx.openSetting() });
        else wx.showToast({ title: '保存取消或失败', icon: 'none' });
      }
    });
  },

  onShareAppMessage() {
    return { title: 'AI智能抠图神器，发丝级自动去背景！', path: '/pages/matting/matting', imageUrl: this.data.resultImage || '' };
  },
  onShareTimeline() {
    return { title: 'AI智能抠图神器，发丝级自动去背景！', query: '', imageUrl: this.data.resultImage || '' };
  }
});
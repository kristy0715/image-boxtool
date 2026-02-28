// pages/qrcode/qrcode.js
const drawQrcode = require('../../utils/weapp-qrcode.js');
const Security = require('../../utils/security.js'); 

// 广告配置
const AD_CONFIG = {
  BANNER_ID: 'adunit-ecfcec4c6a0c871b'
};

Page({
  data: {
    content: '',
    previewImage: '',
    bannerUnitId: AD_CONFIG.BANNER_ID
  },

  onContentInput(e) { this.setData({ content: e.detail.value }); },
  
  onAdError(err) { console.log('Banner error', err); },

  // 生成二维码
  generateCode() {
    const text = this.data.content.trim();
    if (!text) return wx.showToast({ title: '请输入内容', icon: 'none' });

    wx.showLoading({ title: '生成中...' });

    // 安全检测
    Security.checkText(text).then(isSafe => {
      if (!isSafe) { wx.hideLoading(); return; }
      this.doDraw(text);
    }).catch(() => {
      // 容错：检测失败也允许生成
      this.doDraw(text);
    });
  },

  doDraw(text) {
    drawQrcode({
      width: 600,
      height: 600,
      canvasId: 'myQrcode',
      text: text,
      background: '#ffffff',
      foreground: '#000000',
      correctLevel: 1,
      callback: () => {
        setTimeout(() => {
          wx.canvasToTempFilePath({
            canvasId: 'myQrcode',
            width: 600, height: 600,
            destWidth: 1200, destHeight: 1200, // 高清导出
            success: (res) => {
              this.setData({ previewImage: res.tempFilePath });
              wx.hideLoading();
              // 自动滚到底部
              wx.pageScrollTo({ selector: '.bottom-bar', duration: 300 });
            },
            fail: () => {
              wx.hideLoading();
              wx.showToast({ title: '生成失败', icon: 'none' });
            }
          });
        }, 200);
      }
    });
  },

  // 保存并跳转成功页
  saveImageAndJump() {
    if (!this.data.previewImage) return;
    
    wx.showLoading({ title: '保存中...' });

    wx.saveImageToPhotosAlbum({
      filePath: this.data.previewImage,
      success: () => {
        wx.hideLoading();
        // 跳转到已有的成功页
        wx.navigateTo({
          url: `/pages/success/success?path=${encodeURIComponent(this.data.previewImage)}`
        });
      },
      fail: (err) => {
        wx.hideLoading();
        if (err.errMsg.includes('auth')) {
          wx.showModal({ title: '提示', content: '需开启相册权限', success: s => s.confirm && wx.openSetting() });
        } else {
          wx.showToast({ title: '保存失败', icon: 'none' });
        }
      }
    });
  },

  onShareAppMessage() {
    return {
      title: '免费二维码生成器，永久有效！',
      path: '/pages/qrcode/qrcode',
      imageUrl: this.data.previewImage || '/assets/share-cover.png'
    };
  },
  
  onShareTimeline() {
    return { title: '免费二维码生成器', imageUrl: this.data.previewImage };
  }
});
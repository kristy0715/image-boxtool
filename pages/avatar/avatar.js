// pages/avatar/avatar.js
const Audit = require('../../utils/audit.js'); 

const AD_CONFIG = {
  BANNER_ID: 'adunit-ecfcec4c6a0c871b', 
  VIDEO_ID: 'adunit-da175a2014d3443b'
};

const FREE_COUNT_DAILY = 2;

Page({
  data: {
    isAllowed: false, // 🔥 审核隔离锁
    imagePath: '',
    selectedFrame: 'flag',
    frameColor: '#ff0000',
    generatedPath: '', // 用于分享封面
    bannerUnitId: AD_CONFIG.BANNER_ID,
    
    frameList: [
      { id: 'none', name: '无', icon: '⭕', preview: '#f1f5f9' },
      { id: 'flag', name: '国旗', icon: '🇨🇳', preview: '#ffebeb' },
      { id: 'heart', name: '爱心', icon: '❤️', preview: '#ffe0e6' },
      { id: 'star', name: '星星', icon: '⭐', preview: '#fff8e0' },
      { id: 'rainbow', name: '彩虹', icon: '🌈', preview: 'linear-gradient(135deg, #ff6b6b, #4ecdc4)' },
      { id: 'v', name: '加V', icon: '✔', preview: '#fff5d1' }
    ],
    colorList: ['#ff0000', '#ff4d4f', '#ff7875', '#ffffff', '#000000', '#40a9ff', '#52c41a', '#fadb14']
  },

  onLoad() {
    // 🌟 修复：使用正确的 checkAccess()，不再瞎改标题
    Audit.checkAccess().then(isAllowed => {
      if (!isAllowed) return; // 已经被踢回首页了，代码终止
      
      // 身份合法，解开面纱，开始渲染
      this.setData({ isAllowed: true });
      this.initCanvas();
    });
  },

  initCanvas() {
    const query = wx.createSelectorQuery();
    query.select('#avatarCanvas')
      .fields({ node: true, size: true })
      .exec((res) => {
        if (!res[0]) return;
        const canvas = res[0].node;
        const ctx = canvas.getContext('2d');
        const dpr = wx.getSystemInfoSync().pixelRatio;
        canvas.width = res[0].width * dpr;
        canvas.height = res[0].height * dpr;
        ctx.scale(dpr, dpr);
        this.canvas = canvas;
        this.ctx = ctx;
        this.dpr = dpr;
      });
  },

  chooseImage() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      success: (res) => {
        this.setData({ imagePath: res.tempFiles[0].tempFilePath }, () => {
          this.drawAvatar();
        });
      }
    });
  },

  selectFrame(e) {
    this.setData({ selectedFrame: e.currentTarget.dataset.id }, () => {
      this.drawAvatar();
    });
  },

  selectColor(e) {
    this.setData({ frameColor: e.currentTarget.dataset.color }, () => {
      this.drawAvatar();
    });
  },

  async drawAvatar() {
    if (!this.data.imagePath || !this.ctx) return;
    const ctx = this.ctx;
    ctx.clearRect(0, 0, 300, 300);

    // 1. 画头像
    const img = this.canvas.createImage();
    img.src = this.data.imagePath;
    await new Promise(r => img.onload = r);
    ctx.drawImage(img, 0, 0, 300, 300);

    // 2. 画挂件/边框
    const { selectedFrame, frameColor } = this.data;
    if (selectedFrame === 'none') return;

    ctx.strokeStyle = frameColor;
    ctx.lineWidth = 15;

    if (selectedFrame === 'flag') {
      ctx.strokeRect(0, 0, 300, 300);
      ctx.fillStyle = frameColor;
      ctx.font = 'bold 40px Arial';
      ctx.fillText('🇨🇳', 240, 50);
    } else if (selectedFrame === 'v') {
      ctx.fillStyle = '#ff9c00';
      ctx.beginPath();
      ctx.arc(260, 260, 25, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 30px Arial';
      ctx.fillText('V', 248, 272);
    } else {
      ctx.strokeRect(0, 0, 300, 300);
    }
  },

  saveImage() {
    if (!this.canvas) return;
    this.realSaveProcess();
  },

  realSaveProcess() {
    wx.showLoading({ title: '保存中...' });
    wx.canvasToTempFilePath({
      canvas: this.canvas,
      width: 300,
      height: 300,
      destWidth: 300 * this.dpr,
      destHeight: 300 * this.dpr,
      success: (res) => {
        wx.saveImageToPhotosAlbum({
          filePath: res.tempFilePath,
          success: () => {
            wx.hideLoading();
            // 存一下路径，让分享卡片能显示用户做好的图
            this.setData({ generatedPath: res.tempFilePath }); 
            wx.navigateTo({
              url: `/pages/success/success?path=${encodeURIComponent(res.tempFilePath)}`
            });
          },
          fail: (err) => {
            wx.hideLoading();
            if (err.errMsg.indexOf('cancel') === -1) {
                wx.showToast({ title: '保存失败', icon: 'none' });
            }
          }
        });
      },
      fail: () => {
        wx.hideLoading();
        wx.showToast({ title: '导出失败', icon: 'none' });
      }
    });
  },

  onShareAppMessage() {
    const imageUrl = this.data.generatedPath || '/assets/share-cover.png';
    return {
      title: '快来领取你的专属节日头像挂件吧！',
      path: '/pages/avatar/avatar',
      imageUrl: imageUrl
    };
  },

  onShareTimeline() {
    return {
      title: '快来领取你的专属节日头像挂件吧！',
      query: ''
    };
  }
});
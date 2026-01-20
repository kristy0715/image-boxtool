// pages/index/index.js
const fortuneService = require('../../data/fortunes.js');

let videoAd = null;
let interstitialAd = null;
let tempPosterPath = ''; 
let nextBgPromise = null; // 弹窗打开时的预加载任务
let downloadingBgTask = null; // 【核心新增】点击广告时的实时下载任务

const app = getApp();

Page({
  data: {
    statusBarHeight: 20,
    navBarHeight: 44,
    showFortuneModal: false,
    todayFortune: null,
    // 工具列表 (保持不变)
    toolList: [{id:'idphoto',title:'证件照制作',desc:'一寸/二寸/签证照',icon:'📷',colors:['#6366f1','#8b5cf6']},{id:'idprint',title:'证件照排版',desc:'排版打印省钱',icon:'🖨️',colors:['#8b5cf6','#a78bfa']},{id:'compress',title:'图片压缩',desc:'智能压缩，保持清晰',icon:'📦',colors:['#ec4899','#f472b6']},{id:'crop',title:'图片裁剪',desc:'自由裁剪/比例裁剪',icon:'✂️',colors:['#f59e0b','#fbbf24']},{id:'collage',title:'图片拼接',desc:'多图拼接/带编号',icon:'🧩',colors:['#14b8a6','#2dd4bf']},{id:'longpic',title:'长图拼接',desc:'聊天截图拼长图',icon:'📜',colors:['#06b6d4','#22d3ee']},{id:'grid9',title:'九宫格切图',desc:'朋友圈九宫格',icon:'🍱',colors:['#64748b','#94a3b8']},{id:'batchwm',title:'批量加水印',desc:'多图批量添加水印',icon:'💧',colors:['#ef4444','#f87171']},{id:'watermark',title:'去水印',desc:'一键去除图片水印',icon:'✨',colors:['#f59e0b','#fbbf24']}],
    ocrList: [{id:'text2img',title:'长文转图片',desc:'文字生成图片',icon:'📄',colors:['#10b981','#34d399']},{id:'ocr',title:'图片转文字',desc:'提取图中文字',icon:'🔍',colors:['#3b82f6','#60a5fa']},{id:'text',title:'添加文字',desc:'图片加字/水印',icon:'✏️',colors:['#8b5cf6','#a78bfa']}],
    funList: [{id:'retouch',title:'一键精修',desc:'智能美颜/磨皮/提亮',icon:'✨',colors:['#ec4899','#f472b6']},{id:'filter',title:'滤镜效果',desc:'复古/黑白/暖色调',icon:'🎭',colors:['#f43f5e','#fb7185']},{id:'anime',title:'艺术风格',desc:'12种风格转换',icon:'🎨',colors:['#ec4899','#f472b6']},{id:'avatar',title:'头像挂件',desc:'节日边框/装饰',icon:'🎀',colors:['#f59e0b','#fbbf24']},{id:'meme',title:'表情包制作',desc:'DIY专属表情包',icon:'😂',colors:['#eab308','#facc15']},{id:'mosaic',title:'图片马赛克',desc:'隐私打码保护',icon:'🔲',colors:['#64748b','#94a3b8']}]
  },

  onLoad() {
    try {
      const systemInfo = wx.getSystemInfoSync();
      const menuButton = wx.getMenuButtonBoundingClientRect();
      const navBarHeight = (menuButton.top - systemInfo.statusBarHeight) * 2 + menuButton.height;
      this.setData({ statusBarHeight: systemInfo.statusBarHeight, navBarHeight: navBarHeight });
    } catch (e) {}
    this.initFortune();
    this.initVideoAd();
    this.initInterstitialAd();
  },

  goToPage(e) {
    const page = e.currentTarget.dataset.page;
    if (page) wx.navigateTo({ url: `/pages/${page}/${page}`, fail: () => wx.showToast({ title: '开发中', icon: 'none' }) });
  },

  initFortune() {
    const data = fortuneService.getTodayFortune();
    const dateObj = new Date();
    const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
    
    data.day = dateObj.getDate(); 
    data.month = months[dateObj.getMonth()]; 
    data.year = dateObj.getFullYear(); 

    data.isPremiumBg = false;
    data.bgUrl = ''; 
    
    this.setData({ todayFortune: data });
  },

  openFortuneModal() {
    this.setData({ showFortuneModal: true });
    this.generatePoster().catch((err) => { console.error("预加载失败:", err); });
    // 依然保留打开时的预加载，作为备选方案
    this.preloadNextBg(); 
  },
  
  closeFortuneModal() {
    this.setData({ showFortuneModal: false });
  },

  preloadNextBg() {
    const url = fortuneService.getRandomPremiumBg();
    nextBgPromise = this.downloadFile(url).catch(err => null);
  },

  // === 激励视频广告 ===
  initVideoAd() {
    if (wx.createRewardedVideoAd) {
      videoAd = wx.createRewardedVideoAd({ adUnitId: 'adunit-da175a2014d3443b' });
      videoAd.onError((err) => console.error('激励视频加载失败', err));
      videoAd.onClose((res) => {
        if (res && res.isEnded) {
          // 广告结束，立即使用刚才下载的图
          this.changeToPremiumBg();
        } else {
          wx.showToast({ title: '需完整观看才能解锁', icon: 'none' });
          // 如果中途退出，取消/忽略刚才的下载任务，避免下次混淆
          downloadingBgTask = null;
        }
      });
    }
  },

  initInterstitialAd() {
    if (wx.createInterstitialAd) {
      interstitialAd = wx.createInterstitialAd({ adUnitId: 'adunit-a9556a7e617c27b7' });
      interstitialAd.onLoad(() => console.log('插屏广告加载成功'));
      interstitialAd.onError((err) => console.error('插屏广告加载失败', err));
    }
  },

  // === 【关键修改】点击按钮：边下图片，边播广告 ===
  handleChangeBgAd() {
    // 1. 立即开始下载 (利用广告时间的15-30秒)
    const newBgUrl = fortuneService.getRandomPremiumBg();
    console.log('开始静默下载背景:', newBgUrl);
    downloadingBgTask = this.downloadFile(newBgUrl).catch(err => {
      console.error('广告期间下载失败:', err);
      return null;
    });

    // 2. 同时展示广告
    if (videoAd) {
      videoAd.show().catch(() => {
        videoAd.load().then(() => videoAd.show()).catch(err => {
            wx.showToast({ title: '广告加载慢，请重试', icon: 'none' });
        });
      });
    } else {
      // 异常兜底
      this.changeToPremiumBg();
    }
  },

  // === 【关键修改】应用背景 ===
  async changeToPremiumBg() {
    wx.showLoading({ title: '正在切换...', mask: true });

    try {
      let localPath = null;

      // 优先级 1: 使用刚才点击广告时发起的下载任务 (大概率已经下载完了)
      if (downloadingBgTask) {
        localPath = await downloadingBgTask;
      }

      // 优先级 2: 如果上面的失败了，尝试使用弹窗打开时的预加载任务
      if (!localPath && nextBgPromise) {
        console.log('使用备用预加载图');
        localPath = await nextBgPromise;
      }

      // 优先级 3: 实在不行，现场下载一张新的
      if (!localPath) {
        const newBgUrl = fortuneService.getRandomPremiumBg(); 
        localPath = await this.downloadFile(newBgUrl);
      }

      // 更新 UI
      this.setData({
        'todayFortune.bgUrl': localPath, 
        'todayFortune.isPremiumBg': true
      }, () => {
        this.generatePoster();
        // 重置任务，并预加载下一张
        downloadingBgTask = null;
        this.preloadNextBg();
      });

    } catch (error) {
      console.error('背景切换异常', error);
      wx.hideLoading();
      wx.showToast({ title: '网络不佳，请重试', icon: 'none' });
      downloadingBgTask = null;
    }
  },

  downloadFile(url) {
    return new Promise((resolve, reject) => {
      if (!url.startsWith('http')) return resolve(url);
      wx.downloadFile({
        url: url,
        success: (res) => {
          if (res.statusCode === 200) {
            resolve(res.tempFilePath);
          } else {
            reject(new Error(`下载失败 code: ${res.statusCode}`));
          }
        },
        fail: (err) => reject(err)
      });
    });
  },

  // =================================================================
  // --- 绘图逻辑 (保持不变) ---
  // =================================================================
  async generatePoster() {
    if (!this.data.showFortuneModal) return;

    tempPosterPath = '';

    const query = wx.createSelectorQuery();
    const canvasRes = await new Promise(resolve => {
      query.select('#posterCanvas').fields({ node: true, size: true }).exec(resolve);
    });

    if (!canvasRes[0] || !canvasRes[0].node) return;

    const canvas = canvasRes[0].node;
    const ctx = canvas.getContext('2d');
    
    const WIN_W = 1080; 
    const WIN_H = 1920; 
    const SCALE = WIN_W / 750; 
    const R = (val) => val * SCALE; 

    canvas.width = WIN_W;
    canvas.height = WIN_H;

    const fortune = this.data.todayFortune;

    const loadImage = (src) => {
      return new Promise((resolve) => {
        if (!src) return resolve(null);
        const img = canvas.createImage();
        const timer = setTimeout(() => { resolve(null); }, 5000);
        img.onload = () => { clearTimeout(timer); resolve(img); };
        img.onerror = () => { clearTimeout(timer); resolve(null); };
        img.src = src;
      });
    };

    try {
      let bgImg = null;
      let qrImg = null;

      if (fortune.isPremiumBg && fortune.bgUrl) {
        [bgImg, qrImg] = await Promise.all([
           loadImage(fortune.bgUrl),
           loadImage('/images/qrcode.png') 
        ]);
      } else {
        qrImg = await loadImage('/images/qrcode.png');
      }

      if (fortune.isPremiumBg && bgImg) {
          this.drawAspectFillImage(ctx, bgImg, 0, 0, WIN_W, WIN_H);
      } else { 
          const grd = ctx.createLinearGradient(0, 0, WIN_W, WIN_H);
          grd.addColorStop(0, '#a8edea'); 
          grd.addColorStop(1, '#fed6e3');
          ctx.fillStyle = grd;
          ctx.fillRect(0, 0, WIN_W, WIN_H); 
      }
      
      ctx.fillStyle = 'rgba(0, 0, 0, 0.15)'; 
      ctx.fillRect(0, 0, WIN_W, WIN_H);

      const CARD_WIDTH = R(630); 
      const PADDING = R(40);
      const CONTENT_WIDTH = CARD_WIDTH - (PADDING * 2);

      const dayFontSize = R(96);
      const labelW = R(64);
      const colGap = R(36); 
      const labelFontSize = R(36); 
      const labelPadV = R(24);
      const labelSpacing = R(14);
      const charCount = fortune.type ? fortune.type.length : 2; 
      const labelContentH = (labelPadV * 2) + (charCount * labelFontSize) + ((charCount - 1) * labelSpacing);

      const rightColW = CONTENT_WIDTH - labelW - colGap;
      const titleFontSize = R(40);
      const titleMarginB = R(36); 
      const textFontSize = R(30);
      const textLineHeight = textFontSize * 1.6; 
      
      ctx.font = `500 ${textFontSize}px sans-serif`;
      const textLines = this.measureLines(ctx, fortune.text || '', rightColW);
      const textContentH = titleFontSize + titleMarginB + (textLines * textLineHeight);
      const bodyHeight = Math.max(labelContentH, textContentH);
      const footerHeight = R(262);
      const notchPos = R(170); 
      const totalCardHeight = notchPos + R(40) + bodyHeight + footerHeight;

      const cardX = (WIN_W - CARD_WIDTH) / 2;
      const cardY = (WIN_H - totalCardHeight) / 2;
      const notchY = cardY + notchPos;
      const r = R(24);
      const nr = R(18);

      ctx.save();
      ctx.shadowColor = "rgba(0, 0, 0, 0.2)";
      ctx.shadowBlur = 60; ctx.shadowOffsetY = 40;
      ctx.fillStyle = 'rgba(255, 255, 255, 0.85)'; 
      
      ctx.beginPath();
      ctx.moveTo(cardX, notchY - nr);
      ctx.lineTo(cardX, cardY + r);
      ctx.arc(cardX + r, cardY + r, r, Math.PI, 1.5 * Math.PI); 
      ctx.lineTo(cardX + CARD_WIDTH - r, cardY);
      ctx.arc(cardX + CARD_WIDTH - r, cardY + r, r, 1.5 * Math.PI, 0); 
      ctx.lineTo(cardX + CARD_WIDTH, notchY - nr); 
      ctx.arc(cardX + CARD_WIDTH, notchY, nr, 1.5 * Math.PI, 0.5 * Math.PI, true); 
      ctx.lineTo(cardX + CARD_WIDTH, cardY + totalCardHeight - r);
      ctx.arc(cardX + CARD_WIDTH - r, cardY + totalCardHeight - r, r, 0, 0.5 * Math.PI); 
      ctx.lineTo(cardX + r, cardY + totalCardHeight);
      ctx.arc(cardX + r, cardY + totalCardHeight - r, r, 0.5 * Math.PI, Math.PI); 
      ctx.lineTo(cardX, notchY + nr); 
      ctx.arc(cardX, notchY, nr, 0.5 * Math.PI, 1.5 * Math.PI, true); 
      ctx.closePath();
      ctx.fill();
      ctx.restore();

      const contentLeft = cardX + PADDING;
      const headerY = cardY + R(45); 
      
      ctx.fillStyle = '#222';
      ctx.font = `900 ${dayFontSize}px 'Times New Roman', serif`; 
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText(String(fortune.day), contentLeft, headerY - R(12)); 
      const dayW = ctx.measureText(String(fortune.day)).width;

      const dateRightX = contentLeft + dayW + R(20); 
      ctx.font = `900 ${R(26)}px sans-serif`;
      ctx.fillText(fortune.month, dateRightX, headerY + R(10)); 
      ctx.fillStyle = '#666';
      ctx.font = `bold ${R(22)}px sans-serif`;
      ctx.fillText(String(fortune.year), dateRightX, headerY + R(48)); 

      const rightX = cardX + CARD_WIDTH - PADDING;
      ctx.textAlign = 'right';
      ctx.fillStyle = '#555';
      ctx.font = `bold ${R(24)}px sans-serif`;
      ctx.fillText(fortune.lunarStr || '', rightX, headerY + R(20));

      ctx.strokeStyle = 'rgba(0,0,0,0.1)';
      ctx.lineWidth = 3;
      ctx.setLineDash([15, 12]);
      ctx.beginPath();
      ctx.moveTo(contentLeft, notchY);
      ctx.lineTo(cardX + CARD_WIDTH - PADDING, notchY);
      ctx.stroke();
      ctx.setLineDash([]);

      const bodyStartY = notchY + R(40);

      ctx.fillStyle = '#8B0000';
      this.drawRoundedRect(ctx, contentLeft, bodyStartY, labelW, labelContentH, R(12));
      ctx.fill();

      ctx.fillStyle = '#FFFFFF';
      ctx.font = `900 ${labelFontSize}px serif`;
      ctx.textAlign = 'center';
      const labelCX = contentLeft + labelW / 2;
      let charY = bodyStartY + labelPadV;
      if (fortune.type) {
        for (let char of fortune.type) {
            ctx.fillText(char, labelCX, charY);
            charY += labelFontSize + labelSpacing;
        }
      }

      const textX = contentLeft + labelW + colGap;
      ctx.textAlign = 'left';
      ctx.fillStyle = '#000';
      ctx.font = `900 ${titleFontSize}px sans-serif`;
      ctx.fillText(fortune.title || '', textX, bodyStartY - R(4)); 

      const textStartY = bodyStartY + titleFontSize + titleMarginB;
      ctx.fillStyle = '#444';
      ctx.font = `500 ${textFontSize}px sans-serif`;
      this.drawWrappedText(ctx, fortune.text || '', textX, textStartY, rightColW, textLineHeight);

      const footerStartY = cardY + totalCardHeight - footerHeight;
      const footerLineY = footerStartY + R(40); 

      ctx.strokeStyle = '#f5f5f5';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(contentLeft + R(20), footerLineY);
      ctx.lineTo(cardX + CARD_WIDTH - PADDING - R(20), footerLineY);
      ctx.stroke();

      const qrSize = R(130);
      const qrX = cardX + (CARD_WIDTH - qrSize) / 2;
      const qrY = footerLineY + R(30);

      if (qrImg) {
        ctx.drawImage(qrImg, qrX, qrY, qrSize, qrSize);
      } else {
        ctx.fillStyle = '#eee'; ctx.fillRect(qrX, qrY, qrSize, qrSize);
      }

      const tipY = qrY + qrSize + R(20);
      ctx.fillStyle = '#999';
      ctx.font = `${R(22)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText('长按保存 · 扫码解锁好运', cardX + CARD_WIDTH / 2, tipY);

      wx.hideLoading(); 

    } catch (e) {
      console.error('Drawing Error:', e);
      wx.hideLoading();
    }
  },

  measureLines(ctx, text, maxWidth) {
    if(!text) return 0;
    let words = text.split('');
    let line = '';
    let count = 1;
    for (let n = 0; n < words.length; n++) {
      let testLine = line + words[n];
      let metrics = ctx.measureText(testLine);
      if (metrics.width > maxWidth && n > 0) {
        line = words[n];
        count++;
      } else {
        line = testLine;
      }
    }
    return count;
  },

  drawRoundedRect(ctx, x, y, width, height, radius) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.arcTo(x + width, y, x + width, y + height, radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.arcTo(x + width, y + height, x, y + height, radius);
    ctx.lineTo(x + radius, y + height);
    ctx.arcTo(x, y + height, x, y, radius);
    ctx.lineTo(x, y + radius);
    ctx.arcTo(x, y, x + radius, y, radius);
    ctx.closePath();
  },

  drawWrappedText(ctx, text, x, y, maxWidth, lineHeight) {
    if(!text) return;
    let words = text.split(''); 
    let line = '';
    for (let n = 0; n < words.length; n++) {
      let testLine = line + words[n];
      let metrics = ctx.measureText(testLine);
      if (metrics.width > maxWidth && n > 0) { 
          ctx.fillText(line, x, y); 
          line = words[n]; 
          y += lineHeight; 
      } else { 
          line = testLine; 
      }
    }
    ctx.fillText(line, x, y);
  },

  drawAspectFillImage(ctx, img, x, y, w, h) {
    if(!img) return;
    const imgAspect = img.width / img.height; 
    const canvasAspect = w / h;
    let sW, sH, sX, sY;
    if (imgAspect > canvasAspect) { sH = img.height; sW = img.height * canvasAspect; sY = 0; sX = (img.width - sW) / 2; }
    else { sW = img.width; sH = img.width / canvasAspect; sX = 0; sY = (img.height - sH) / 2; }
    ctx.drawImage(img, sX, sY, sW, sH, x, y, w, h);
  },

  // =================================================================
  // --- 分享逻辑 (保留您手动修复的版本) ---
  // =================================================================
  onShareAppMessage(res) {
    if (res.from === 'button') {
      const fortune = this.data.todayFortune;
      return { 
        title: fortune ? `今日签文：${fortune.title}` : '每日一签', 
        path: '/pages/index/index', 
        imageUrl: tempPosterPath || (fortune ? fortune.bgUrl : null) 
      };
    }
    return { 
      title: '就这么图 - 全能图片工具箱', 
      path: '/pages/index/index',
      imageUrl: '/assets/share-cover.png' 
    };
  },

  onShareTimeline() { 
    return { 
      title: '全能图片工具箱：美颜滤镜、修图、拼图、切图、图文处理、证件照一键搞定！', 
      imageUrl: '/assets/share-cover.png' 
    }; 
  },

  handleSaveLocal() {
    wx.showLoading({ title: '正在生成高清图...', mask: true });
    
    const query = wx.createSelectorQuery();
    query.select('#posterCanvas').fields({ node: true, size: true }).exec((res) => {
        if (!res[0] || !res[0].node) {
            wx.hideLoading();
            wx.showToast({ title: '画布未就绪', icon: 'none' });
            return;
        }

        const canvas = res[0].node;
        wx.canvasToTempFilePath({
            canvas: canvas,
            destWidth: 1080, 
            destHeight: 1920,
            fileType: 'jpg',
            quality: 0.9,
            success: (res) => {
                tempPosterPath = res.tempFilePath;
                wx.saveImageToPhotosAlbum({ 
                    filePath: res.tempFilePath, 
                    success: () => {
                        wx.hideLoading();
                        wx.showToast({ title: '已保存到相册', icon: 'success' });
                        if (interstitialAd) {
                          interstitialAd.show().catch((err) => {
                            console.error('插屏广告显示失败', err);
                          });
                        }
                    },
                    fail: (err) => {
                       wx.hideLoading();
                       if(err.errMsg.includes('auth')) {
                           wx.showModal({ 
                               title: '提示', 
                               content: '保存图片需要相册权限，请在设置中开启', 
                               success: r => r.confirm && wx.openSetting() 
                           });
                       } else {
                           wx.showToast({ title: '保存失败', icon: 'none' });
                       }
                    }
                });
            },
            fail: (err) => {
                wx.hideLoading();
                wx.showToast({ title: '生成图片失败', icon: 'none' });
            }
        });
    });
  }
});
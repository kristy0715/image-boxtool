// pages/index/index.js
const fortuneService = require('../../data/fortunes.js');

let videoAd = null;
let interstitialAd = null; // 【新增】插屏广告实例变量
let tempPosterPath = ''; // 缓存生成的本地海报路径

const app = getApp();

Page({
  data: {
    statusBarHeight: 20,
    navBarHeight: 44,
    showFortuneModal: false,
    todayFortune: null,
    // 工具列表数据 (保持不变)
    toolList: [{id:'idphoto',title:'证件照制作',desc:'一寸/二寸/签证照',icon:'📷',colors:['#6366f1','#8b5cf6']},{id:'idprint',title:'证件照排版',desc:'排版打印省钱',icon:'🖨️',colors:['#8b5cf6','#a78bfa']},{id:'compress',title:'图片压缩',desc:'智能压缩，保持清晰',icon:'📦',colors:['#ec4899','#f472b6']},{id:'crop',title:'图片裁剪',desc:'自由裁剪/比例裁剪',icon:'✂️',colors:['#f59e0b','#fbbf24']},{id:'collage',title:'图片拼接',desc:'多图拼接/带编号',icon:'🧩',colors:['#14b8a6','#2dd4bf']},{id:'longpic',title:'长图拼接',desc:'聊天截图拼长图',icon:'📜',colors:['#06b6d4','#22d3ee']},{id:'grid9',title:'九宫格切图',desc:'朋友圈九宫格',icon:'⬜',colors:['#64748b','#94a3b8']},{id:'batchwm',title:'批量加水印',desc:'多图批量添加水印',icon:'💧',colors:['#ef4444','#f87171']},{id:'watermark',title:'去水印',desc:'一键去除图片水印',icon:'✨',colors:['#f59e0b','#fbbf24']}],
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
    this.initInterstitialAd(); // 【新增】初始化插屏广告
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

    // 【重要】初始化状态：默认不显示 Premium 背景，使用 CSS 渐变
    data.isPremiumBg = false;
    data.bgUrl = ''; 
    
    this.setData({ todayFortune: data });
  },

  openFortuneModal() {
    this.setData({ showFortuneModal: true });
    // 打开时生成海报 (此时生成的是默认渐变背景的海报)
    this.generatePoster().catch((err) => {
      console.error("预加载失败:", err);
    });
  },
  
  closeFortuneModal() {
    this.setData({ showFortuneModal: false });
  },

  // === 激励视频广告 (换背景) ===
  initVideoAd() {
    if (wx.createRewardedVideoAd) {
      videoAd = wx.createRewardedVideoAd({ adUnitId: 'adunit-da175a2014d3443b' });
      videoAd.onError((err) => console.error('激励视频加载失败', err));
      videoAd.onClose((res) => {
        if (res && res.isEnded) {
          this.changeToPremiumBg();
        } else {
          wx.showToast({ title: '需完整观看才能解锁', icon: 'none' });
        }
      });
    }
  },

  // === 【新增】插屏广告 (保存成功后) ===
  initInterstitialAd() {
    if (wx.createInterstitialAd) {
      // ⚠️ 请替换为你自己的插屏广告 ID
      interstitialAd = wx.createInterstitialAd({ adUnitId: 'adunit-a9556a7e617c27b7' });
      interstitialAd.onLoad(() => console.log('插屏广告加载成功'));
      interstitialAd.onError((err) => console.error('插屏广告加载失败', err));
    }
  },

  handleChangeBgAd() {
    if (videoAd) {
      videoAd.show().catch(() => {
        videoAd.load().then(() => videoAd.show()).catch(err => {
            wx.showToast({ title: '广告加载慢，请重试', icon: 'none' });
        });
      });
    } else {
      this.changeToPremiumBg();
    }
  },

  // =================================================================
  // --- 【商业级核心优化】先下载，再渲染 ---
  // =================================================================
  async changeToPremiumBg() {
    wx.showLoading({ title: '正在获取精美背景...', mask: true });

    try {
      // 1. 获取网络链接
      const newBgUrl = fortuneService.getRandomPremiumBg(); 
      
      // 2. 【关键】先下载到本地，避免白屏和保存失败
      const localPath = await this.downloadFile(newBgUrl);

      // 3. 图片就绪，瞬间更新 UI
      // 此时 image src 指向本地文件，渲染极快
      this.setData({
        'todayFortune.bgUrl': localPath, 
        'todayFortune.isPremiumBg': true
      }, () => {
        // 4. 后台静默重绘 Canvas (此时 Canvas 也直接读取 localPath)
        // 注意：generatePoster 内部有 hideLoading
        this.generatePoster();
      });

    } catch (error) {
      console.error('背景切换异常', error);
      wx.hideLoading();
      wx.showToast({ title: '背景加载失败', icon: 'none' });
    }
  },

  // 下载工具函数
  downloadFile(url) {
    return new Promise((resolve, reject) => {
      // 如果已经是本地文件，直接返回
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
  // --- 绘图逻辑 (适配本地路径) ---
  // =================================================================
  async generatePoster() {
    if (!this.data.showFortuneModal) return;

    // 清空旧缓存
    tempPosterPath = '';

    const query = wx.createSelectorQuery();
    const canvasRes = await new Promise(resolve => {
      query.select('#posterCanvas').fields({ node: true, size: true }).exec(resolve);
    });

    if (!canvasRes[0] || !canvasRes[0].node) return;

    const canvas = canvasRes[0].node;
    const ctx = canvas.getContext('2d');
    
    // 画布设置
    const WIN_W = 1080; 
    const WIN_H = 1920; 
    const SCALE = WIN_W / 750; 
    const R = (val) => val * SCALE; 

    canvas.width = WIN_W;
    canvas.height = WIN_H;

    const fortune = this.data.todayFortune;

    // 图片加载器
    const loadImage = (src) => {
      return new Promise((resolve) => {
        if (!src) return resolve(null);
        const img = canvas.createImage();
        // 本地路径通常很快，但为了保险加个超时
        const timer = setTimeout(() => { resolve(null); }, 5000);
        img.onload = () => { clearTimeout(timer); resolve(img); };
        img.onerror = () => { clearTimeout(timer); resolve(null); };
        img.src = src;
      });
    };

    try {
      let bgImg = null;
      let qrImg = null;

      // 判断逻辑：只要是 isPremiumBg=true，bgUrl 一定是已经下载好的本地路径
      if (fortune.isPremiumBg && fortune.bgUrl) {
        [bgImg, qrImg] = await Promise.all([
           loadImage(fortune.bgUrl),
           loadImage('/images/qrcode.png') 
        ]);
      } else {
        qrImg = await loadImage('/images/qrcode.png');
      }

      // 1. 绘制背景
      if (fortune.isPremiumBg && bgImg) {
          // 方案A：画本地高清图
          this.drawAspectFillImage(ctx, bgImg, 0, 0, WIN_W, WIN_H);
      } else { 
          // 方案B：画渐变 (兜底或默认状态，与 CSS 保持一致)
          const grd = ctx.createLinearGradient(0, 0, WIN_W, WIN_H);
          grd.addColorStop(0, '#a8edea'); 
          grd.addColorStop(1, '#fed6e3');
          ctx.fillStyle = grd;
          ctx.fillRect(0, 0, WIN_W, WIN_H); 
      }
      
      // 2. 全局蒙版 (增加文字对比度)
      ctx.fillStyle = 'rgba(0, 0, 0, 0.15)'; 
      ctx.fillRect(0, 0, WIN_W, WIN_H);

      // --- 卡片绘制开始 ---
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

      // 卡片白色底 (半透明)
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

      // 卡片内容
      const contentLeft = cardX + PADDING;
      const headerY = cardY + R(45); 
      
      // 日期
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

      // 农历 (只显示 lunarStr，不重复显示今日宜)
      const rightX = cardX + CARD_WIDTH - PADDING;
      ctx.textAlign = 'right';
      ctx.fillStyle = '#555';
      ctx.font = `bold ${R(24)}px sans-serif`;
      ctx.fillText(fortune.lunarStr || '', rightX, headerY + R(20));

      // 虚线
      ctx.strokeStyle = 'rgba(0,0,0,0.1)';
      ctx.lineWidth = 3;
      ctx.setLineDash([15, 12]);
      ctx.beginPath();
      ctx.moveTo(contentLeft, notchY);
      ctx.lineTo(cardX + CARD_WIDTH - PADDING, notchY);
      ctx.stroke();
      ctx.setLineDash([]);

      const bodyStartY = notchY + R(40);

      // 红色标签
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

      // 底部
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

      wx.hideLoading(); // 绘制完成，隐藏 Loading

    } catch (e) {
      console.error('Drawing Error:', e);
      wx.hideLoading();
    }
  },

  // --- 辅助工具函数 ---
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

  onShareAppMessage(res) {
    const title = this.data.todayFortune ? `今日签文：${this.data.todayFortune.title}` : '每日一签';
    return { title: title, path: '/pages/index/index', imageUrl: tempPosterPath || this.data.todayFortune.bgUrl };
  },

  onShareTimeline() { return { title: '每日一签', query: 'from=timeline' }; },

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
                        // 【新增】保存成功后，弹出插屏广告
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
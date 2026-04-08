// pages/index/index.js
const fortuneService = require('../../data/fortunes.js');
const Audit = require('../../utils/audit.js');

const app = getApp();

// ============================================================
// 1. 完整数据源 (已全面接入 SEO 热搜词优化)
// ============================================================
const ALL_TOOLS = [
  {id:'video',title:'短视频去水印',desc:'全网无水印解析保存',icon:'🎬',colors:['#3b82f6','#8b5cf6']},
  {id:'watermark',title:'图片去水印',desc:'无痕去水印 去路人/杂物',icon:'✨',colors:['#f59e0b','#fbbf24']}, 
  {id:'idphoto',title:'最美证件照',desc:'一寸/二寸 智能抠图换底',icon:'📷',colors:['#6366f1','#8b5cf6']},
  {id:'idprint',title:'证件照排版',desc:'排版打印神器 超级省钱',icon:'🖨️',colors:['#8b5cf6','#a78bfa']},
  {id:'matting',title:'智能抠图',desc:'发丝级抠图 一键换背景',icon:'🦋',colors:['#ec4899','#f472b6']}, 
  {id:'restore', title:'高清修复', desc:'模糊变清晰 老照片翻新', icon:'💎', colors:['#6366f1', '#8b5cf6']}, 
  {id:'grid9',title:'九宫格切图',desc:'朋友圈防折叠 心形拼图',icon:'🍱',colors:['#64748b','#94a3b8']},
  {id:'collage',title:'全能拼图',desc:'多图无缝拼接 宫格海报',icon:'🧩',colors:['#14b8a6','#2dd4bf']},
  {id:'crop',title:'图片裁剪',desc:'自由缩放 社交头像比例',icon:'✂️',colors:['#f59e0b','#fbbf24']},
  {id:'compress',title:'图片压缩',desc:'高清无损缩小 突破限制',icon:'📦',colors:['#ec4899','#f472b6']},
  {id:'mosaic',title:'图片马赛克',desc:'隐私极速打码 局部模糊',icon:'🔲',colors:['#64748b','#94a3b8']},
  {id:'longpic',title:'长图拼接',desc:'聊天截图/台词 智能拼接',icon:'📜',colors:['#06b6d4','#22d3ee']},
  {id:'batchwm',title:'批量加水印',desc:'微商防盗图 一键加Logo',icon:'💧',colors:['#ef4444','#f87171']}
];

const ALL_OCR = [
  {id:'text2img',title:'长文转图',desc:'文字生成图片 朋友圈防折叠',icon:'📄',colors:['#10b981','#34d399']},
  {id:'ocr',title:'图片转文字',desc:'OCR拍照取字 智能提取',icon:'🔍',colors:['#3b82f6','#60a5fa']}, 
  {id:'text',title:'加文字 加水印 叠加图',desc:'图片加字 防盗打码 加Logo',icon:'✏️',colors:['#8b5cf6','#a78bfa']}, 
  {id:'qrcode',title:'二维码生成',desc:'文本/网址极速转码',icon:'🔳',colors:['#6366f1','#8b5cf6']}
];

const ALL_FUN = [
  {id:'burst',title:'3D冲出特效',desc:'人物悬浮跃出 视觉大片',icon:'🚀',colors:['#ef4444','#f87171']},
  {id:'retouch',title:'一键精修',desc:'智能美颜磨皮 肤质提升',icon:'✨',colors:['#ec4899','#f472b6']}, 
  {id:'filter',title:'质感滤镜',desc:'复古/胶片/黑白 氛围感',icon:'🎭',colors:['#f43f5e','#fb7185']},
  {id:'art',title:'动漫手绘脸',desc:'照片一键变漫画 二次元',icon:'🎨',colors:['#ec4899','#f472b6']}, 
  {id:'avatar',title:'头像挂件',desc:'节日边框 专属头像定制',icon:'🎀',colors:['#f59e0b','#fbbf24']},
  {id:'text',title:'自制表情包',desc:'DIY恶搞改图 聊天斗图神器',icon:'😂',colors:['#eab308','#facc15']} 
];

let videoAd = null;
let interstitialAd = null;
let tempPosterPath = ''; 
let nextBgPromise = null;
let downloadingBgTask = null;

Page({
  data: {
    statusBarHeight: 20,
    navBarHeight: 44,
    showFortuneModal: false,
    todayFortune: null,
    bannerUnitId: 'adunit-ecfcec4c6a0c871b',
    toolList: [], // 🌟 真实的渲染变量 1
    ocrList: [],  // 🌟 真实的渲染变量 2
    funList: [],  // 🌟 真实的渲染变量 3
    kefuX: 300,
    kefuY: 500
  },

  onLoad() {
    this.initNavBar();
    try {
      const sysInfo = wx.getSystemInfoSync();
      this.setData({
        kefuX: sysInfo.windowWidth - 70, 
        kefuY: sysInfo.windowHeight * 0.65 
      });
    } catch (e) {}
    this.initFortune();
    this.initVideoAd();
    this.initInterstitialAd();
  },

  onShow() {
    // 保证自定义 TabBar 的高亮状态正确
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 0 });
    }

    // 🌟 开启照妖镜：直接把服务器发来的数据弹在屏幕上！
    Audit.getConfig().then(({ isAudit, blockList }) => {
      // 执行剔除逻辑
      const visibleTools = ALL_TOOLS.filter(tool => !blockList.includes(tool.id));
      const visibleOcr = ALL_OCR.filter(tool => !blockList.includes(tool.id));
      const visibleFun = ALL_FUN.filter(tool => !blockList.includes(tool.id));

      this.setData({
        toolList: visibleTools,
        ocrList: visibleOcr,
        funList: visibleFun
      });
    });
  },

// 🌟 核心大招：统一的动态过滤函数 (已去除测试弹窗)
refreshToolsByAudit() {
  // 第一步：在等待网络请求时，先用一套“绝对安全”的白名单兜底
  const safeIds = [
     'video', 'watermark', 'ocr', 'retouch', 'burst', 'text2img', 
     'batchwm', 'idphoto', 'idprint', 'grid9', 'collage', 'crop', 
     'compress', 'mosaic', 'longpic', 'text', 'avatar', 'meme'
  ];
  this.setData({
      toolList: ALL_TOOLS.filter(i => safeIds.includes(i.id)),
      ocrList: ALL_OCR.filter(i => safeIds.includes(i.id)),
      funList: ALL_FUN.filter(i => safeIds.includes(i.id))
  });

  // 第二步：正式向探针索要服务器下发的最新名单，并过滤图标
  Audit.getConfig()
    .then(({ isAudit, blockList }) => {
      // 使用 filter 语法，将 3 个真实渲染变量中，存在于 blockList 里的图标全部剔除！
      this.setData({
        toolList: ALL_TOOLS.filter(item => !blockList.includes(item.id)),
        ocrList: ALL_OCR.filter(item => !blockList.includes(item.id)),
        funList: ALL_FUN.filter(item => !blockList.includes(item.id))
      });
    })
    .catch((err) => { 
      console.error('配置拉取失败', err); 
    });
},

  initNavBar() {
    try {
      const sys = wx.getSystemInfoSync();
      const menu = wx.getMenuButtonBoundingClientRect();
      const h = (menu.top - sys.statusBarHeight) * 2 + menu.height;
      this.setData({ statusBarHeight: sys.statusBarHeight, navBarHeight: h });
    } catch (e) {}
  },

  onAdError(err) { console.log('Banner fail', err); },

  goToPage(e) {
    const page = e.currentTarget.dataset.page;
    if (page === 'video') {
      wx.switchTab({ url: '/pages/video/video' });
      return;
    }
    if (page) wx.navigateTo({ url: `/pages/${page}/${page}`, fail: () => wx.showToast({ title: '功能升级中', icon: 'none' }) });
  },

  initFortune() {
    const data = fortuneService.getTodayFortune();
    const d = new Date();
    data.day = d.getDate();
    data.month = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'][d.getMonth()];
    data.year = d.getFullYear();
    data.isPremiumBg = false;
    data.bgUrl = '';
    this.setData({ todayFortune: data });
  },

  openFortuneModal() {
    this.setData({ showFortuneModal: true });
    this.generatePoster().catch(()=>{});
    this.preloadNextBg();
  },

  closeFortuneModal() { this.setData({ showFortuneModal: false }); },
  
  preloadNextBg() {
    const url = fortuneService.getRandomPremiumBg();
    nextBgPromise = this.downloadFile(url).catch(e=>null);
  },

  initVideoAd() {
    if (wx.createRewardedVideoAd) {
      videoAd = wx.createRewardedVideoAd({ adUnitId: 'adunit-da175a2014d3443b' });
      videoAd.onError(e => console.error(e));
      videoAd.onClose(res => {
        if (res && res.isEnded) this.changeToPremiumBg();
        else { wx.showToast({ title: '需完整观看', icon: 'none' }); downloadingBgTask = null; }
      });
    }
  },

  initInterstitialAd() {
    if (wx.createInterstitialAd) {
      interstitialAd = wx.createInterstitialAd({ adUnitId: 'adunit-a9556a7e617c27b7' });
    }
  },

  handleChangeBgAd() {
    const url = fortuneService.getRandomPremiumBg();
    downloadingBgTask = this.downloadFile(url).catch(()=>null);
    if (videoAd) videoAd.show().catch(() => videoAd.load().then(() => videoAd.show()).catch(()=>{}));
    else this.changeToPremiumBg();
  },

  async changeToPremiumBg() {
    wx.showLoading({title:'切换中'});
    try {
      let p = downloadingBgTask ? await downloadingBgTask : (nextBgPromise ? await nextBgPromise : await this.downloadFile(fortuneService.getRandomPremiumBg()));
      this.setData({ 'todayFortune.bgUrl': p, 'todayFortune.isPremiumBg': true }, () => {
        this.generatePoster(); downloadingBgTask = null; this.preloadNextBg();
      });
    } catch (e) { wx.hideLoading(); downloadingBgTask = null; }
  },

  downloadFile(url) {
    return new Promise((resolve, reject) => {
      if (!url.startsWith('http')) return resolve(url);
      wx.downloadFile({ url, success: res => res.statusCode===200?resolve(res.tempFilePath):reject(res), fail: reject });
    });
  },

  async generatePoster() {
    if (!this.data.showFortuneModal) return;
    tempPosterPath = '';
    const query = wx.createSelectorQuery();
    const canvasRes = await new Promise(resolve => query.select('#posterCanvas').fields({ node: true, size: true }).exec(resolve));
    if (!canvasRes[0] || !canvasRes[0].node) return;
    const canvas = canvasRes[0].node; const ctx = canvas.getContext('2d');
    const WIN_W = 1080; const WIN_H = 1920; const SCALE = WIN_W / 750; const R = v => v * SCALE;
    canvas.width = WIN_W; canvas.height = WIN_H;
    const fortune = this.data.todayFortune;

    const loadImage = src => new Promise(r => {
      const img = canvas.createImage();
      img.onload = () => r(img); img.onerror = () => r(null); img.src = src;
    });

    try {
      let bgImg = null, qrImg = null;
      if (fortune.isPremiumBg) [bgImg, qrImg] = await Promise.all([loadImage(fortune.bgUrl), loadImage('/images/qrcode.png')]);
      else qrImg = await loadImage('/images/qrcode.png');

      if (bgImg) this.drawAspectFillImage(ctx, bgImg, 0, 0, WIN_W, WIN_H);
      else { const g = ctx.createLinearGradient(0,0,WIN_W,WIN_H); g.addColorStop(0,'#a8edea'); g.addColorStop(1,'#fed6e3'); ctx.fillStyle=g; ctx.fillRect(0,0,WIN_W,WIN_H); }
      
      ctx.fillStyle = 'rgba(0,0,0,0.15)'; ctx.fillRect(0,0,WIN_W,WIN_H);

      this.drawCardContent(ctx, fortune, (WIN_W - R(630))/2, WIN_W, WIN_H, R, qrImg); 
      wx.hideLoading();
    } catch (e) { wx.hideLoading(); }
  },

  drawCardContent(ctx, fortune, cardX, W, H, R, qrImg) {
      const dayFS = R(96), labelW = R(64), colGap = R(36);
      const rightColW = (R(630) - R(40)*2) - labelW - colGap;
      ctx.font = `500 ${R(30)}px sans-serif`;
      const textLines = this.measureLines(ctx, fortune.text||'', rightColW);
      const bodyH = Math.max( ((R(24)*2)+(fortune.type?fortune.type.length:2)*R(36)), (R(40)+R(36)+textLines*R(30)*1.6) );
      const footerH = R(262), notchPos = R(170);
      const totalH = notchPos + R(40) + bodyH + footerH;
      const cardY = (H - totalH)/2;

      const notchY = cardY + notchPos, r = R(24), nr = R(18), CW = R(630);
      ctx.save(); ctx.shadowColor="rgba(0,0,0,0.2)"; ctx.shadowBlur=60; ctx.shadowOffsetY=40; ctx.fillStyle='rgba(255,255,255,0.85)';
      ctx.beginPath();
      ctx.moveTo(cardX, notchY-nr); ctx.lineTo(cardX, cardY+r); ctx.arc(cardX+r, cardY+r, r, Math.PI, 1.5*Math.PI);
      ctx.lineTo(cardX+CW-r, cardY); ctx.arc(cardX+CW-r, cardY+r, r, 1.5*Math.PI, 0);
      ctx.lineTo(cardX+CW, notchY-nr); ctx.arc(cardX+CW, notchY, nr, 1.5*Math.PI, 0.5*Math.PI, true);
      ctx.lineTo(cardX+CW, cardY+totalH-r); ctx.arc(cardX+CW-r, cardY+totalH-r, r, 0, 0.5*Math.PI);
      ctx.lineTo(cardX+r, cardY+totalH); ctx.arc(cardX+r, cardY+totalH-r, r, 0.5*Math.PI, Math.PI);
      ctx.lineTo(cardX, notchY+nr); ctx.arc(cardX, notchY, nr, 0.5*Math.PI, 1.5*Math.PI, true);
      ctx.fill(); ctx.restore();

      const contentL = cardX + R(40);
      ctx.fillStyle='#222'; ctx.font=`900 ${dayFS}px serif`; ctx.textAlign='left'; ctx.textBaseline='top';
      ctx.fillText(String(fortune.day), contentL, cardY+R(45)-R(12));
      const dW = ctx.measureText(String(fortune.day)).width;
      ctx.font=`900 ${R(26)}px sans-serif`; ctx.fillText(fortune.month, contentL+dW+R(20), cardY+R(55));
      ctx.fillStyle='#666'; ctx.font=`bold ${R(22)}px sans-serif`; ctx.fillText(String(fortune.year), contentL+dW+R(20), cardY+R(93));
      
      ctx.textAlign='right'; ctx.fillStyle='#555'; ctx.font=`bold ${R(24)}px sans-serif`;
      ctx.fillText(fortune.lunarStr||'', cardX+CW-R(40), cardY+R(65));

      ctx.strokeStyle='rgba(0,0,0,0.1)'; ctx.lineWidth=3; ctx.setLineDash([15,12]);
      ctx.beginPath(); ctx.moveTo(contentL, notchY); ctx.lineTo(cardX+CW-R(40), notchY); ctx.stroke(); ctx.setLineDash([]);

      const bodyY = notchY + R(40);
      ctx.fillStyle='#8B0000'; this.drawRoundedRect(ctx, contentL, bodyY, labelW, (R(24)*2 + (fortune.type||'').length*(R(36)+R(14))), R(12)); ctx.fill();
      ctx.fillStyle='#fff'; ctx.font=`900 ${R(36)}px serif`; ctx.textAlign='center';
      let cy = bodyY + R(24);
      for(let c of (fortune.type||'')) { ctx.fillText(c, contentL+labelW/2, cy); cy+=R(50); }

      ctx.textAlign='left'; ctx.fillStyle='#000'; ctx.font=`900 ${R(40)}px sans-serif`;
      ctx.fillText(fortune.title||'', contentL+labelW+colGap, bodyY-R(4));
      ctx.fillStyle='#444'; ctx.font=`500 ${R(30)}px sans-serif`;
      this.drawWrappedText(ctx, fortune.text||'', contentL+labelW+colGap, bodyY+R(76), rightColW, R(30)*1.6);

      const footY = cardY + totalH - footerH + R(40);
      ctx.strokeStyle='#f5f5f5'; ctx.lineWidth=2; ctx.beginPath(); ctx.moveTo(contentL+R(20), footY); ctx.lineTo(cardX+CW-R(60), footY); ctx.stroke();
      
      const qrSz = R(130), qrX = cardX+(CW-qrSz)/2, qrY = footY+R(30);
      if(qrImg) ctx.drawImage(qrImg, qrX, qrY, qrSz, qrSz);
      else { ctx.fillStyle='#eee'; ctx.fillRect(qrX, qrY, qrSz, qrSz); }
      ctx.fillStyle='#999'; ctx.font=`${R(22)}px sans-serif`; ctx.textAlign='center';
      ctx.fillText('长按保存 · 扫码解锁好运', cardX+CW/2, qrY+qrSz+R(20));
  },

  measureLines(ctx, text, maxWidth) {
    if(!text) return 0;
    let words = text.split(''), line = '', count = 1;
    for (let n = 0; n < words.length; n++) {
      let testLine = line + words[n];
      if (ctx.measureText(testLine).width > maxWidth && n > 0) { line = words[n]; count++; } else line = testLine;
    }
    return count;
  },
  drawRoundedRect(ctx, x, y, width, height, radius) {
    ctx.beginPath(); ctx.moveTo(x + radius, y); ctx.lineTo(x + width - radius, y);
    ctx.arcTo(x + width, y, x + width, y + height, radius); ctx.lineTo(x + width, y + height - radius);
    ctx.arcTo(x + width, y + height, x, y + height, radius); ctx.lineTo(x + radius, y + height);
    ctx.arcTo(x, y + height, x, y, radius); ctx.lineTo(x, y + radius); ctx.arcTo(x, y, x + radius, y, radius); ctx.closePath();
  },
  drawWrappedText(ctx, text, x, y, maxWidth, lineHeight) {
    if(!text) return;
    let words = text.split(''), line = '';
    for (let n = 0; n < words.length; n++) {
      let testLine = line + words[n];
      if (ctx.measureText(testLine).width > maxWidth && n > 0) { ctx.fillText(line, x, y); line = words[n]; y += lineHeight; } else line = testLine;
    }
    ctx.fillText(line, x, y);
  },
  drawAspectFillImage(ctx, img, x, y, w, h) {
    if(!img) return;
    const r = img.width / img.height, cr = w / h;
    let sw, sh, sx, sy;
    if (r > cr) { sh = img.height; sw = img.height * cr; sy = 0; sx = (img.width - sw) / 2; }
    else { sw = img.width; sh = img.width / cr; sx = 0; sy = (img.height - sh) / 2; }
    ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
  },

  onShareAppMessage(res) {
    const f = this.data.todayFortune;
    return { 
      title: res.from==='button'?(f?`今日签文：${f.title}`:'免费工具箱'):'免费图片处理', 
      path: '/pages/index/index', 
      imageUrl: res.from==='button'?(tempPosterPath||(f?f.bgUrl:null)):'/assets/share-cover.png' 
    };
  },
  
  onShareTimeline() { 
    return { title: '免费工具箱', imageUrl: '/assets/share-cover.png' }; 
  },

  handleSaveLocal() {
    wx.showLoading({ title: '保存中...' });
    const q = wx.createSelectorQuery();
    q.select('#posterCanvas').fields({ node: true }).exec(res => {
      if(!res[0]) return wx.hideLoading();
      wx.canvasToTempFilePath({
        canvas: res[0].node, destWidth: 1080, destHeight: 1920, fileType: 'jpg', quality: 0.9,
        success: r => {
          tempPosterPath = r.tempFilePath;
          wx.saveImageToPhotosAlbum({
            filePath: r.tempFilePath,
            success: () => { wx.hideLoading(); wx.showToast({title:'已保存'}); if(interstitialAd) interstitialAd.show().catch(()=>{}); },
            fail: e => { wx.hideLoading(); if(e.errMsg.includes('auth')) wx.showModal({title:'需权限', content:'请开启相册权限', success:s=>s.confirm&&wx.openSetting()}); }
          });
        },
        fail: () => wx.hideLoading()
      })
    });
  },

  _tapCount: 0,
  _lastTapTime: 0,
  onSecretTap() {
    const now = Date.now();
    if (now - this._lastTapTime > 500) this._tapCount = 0;
    this._tapCount++; this._lastTapTime = now;
    if (this._tapCount === 3) wx.vibrateShort({type:'light'});
    if (this._tapCount >= 5) { this._tapCount = 0; wx.vibrateShort({type:'medium'}); wx.navigateTo({url:'/pages/admin/score/score', fail:()=>wx.showToast({title:'未配置', icon:'none'})}); }
  }
});
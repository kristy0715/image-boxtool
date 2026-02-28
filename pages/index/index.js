// pages/index/index.js
const fortuneService = require('../../data/fortunes.js');
const Audit = require('../../utils/audit.js');

const app = getApp();

// ============================================================
// 1. 完整数据源 (所有功能都在这里)
// ============================================================
const ALL_TOOLS = [
  {id:'idphoto',title:'证件照制作',desc:'一寸 二寸 换底色',icon:'📷',colors:['#6366f1','#8b5cf6']},
  {id:'idprint',title:'证件照排版',desc:'排版打印省钱',icon:'🖨️',colors:['#8b5cf6','#a78bfa']},
  {id:'matting',title:'AI智能抠图',desc:'发丝级自动去底',icon:'🦋',colors:['#ec4899','#f472b6']}, // 敏感
  {id:'restore', title:'AI高清修复', desc:'模糊变清晰 老照片', icon:'💎', colors:['#6366f1', '#8b5cf6']}, // 敏感
  {id:'watermark',title:'图片去水印',desc:'去水印 去杂物',icon:'✨',colors:['#f59e0b','#fbbf24']}, // 敏感
  {id:'grid9',title:'九宫格切图',desc:'朋友圈九宫格 心形拼图',icon:'🍱',colors:['#64748b','#94a3b8']},
  {id:'collage',title:'图片拼接',desc:'多图合并 宫格拼图',icon:'🧩',colors:['#14b8a6','#2dd4bf']},
  {id:'crop',title:'图片裁剪',desc:'自由裁剪 比例裁剪',icon:'✂️',colors:['#f59e0b','#fbbf24']},
  {id:'compress',title:'图片压缩',desc:'智能压缩 高清无损',icon:'📦',colors:['#ec4899','#f472b6']},
  {id:'mosaic',title:'图片马赛克',desc:'隐私打码 模糊处理',icon:'🔲',colors:['#64748b','#94a3b8']},
  {id:'longpic',title:'长图拼接',desc:'聊天截图拼长图',icon:'📜',colors:['#06b6d4','#22d3ee']},
  {id:'batchwm',title:'批量加水印',desc:'一键加水印 微商专用',icon:'💧',colors:['#ef4444','#f87171']},
  //{id:'test',title:'测试去水印',desc:'测试去水印',icon:'💧',colors:['#ef4444','#f87171']},
];

const ALL_OCR = [
  {id:'text2img',title:'长文转图片',desc:'文字生成图片防折叠',icon:'📄',colors:['#10b981','#34d399']},
  {id:'ocr',title:'图片转文字',desc:'拍照取字 OCR文字提取',icon:'🔍',colors:['#3b82f6','#60a5fa']}, // 敏感
  {id:'text',title:'添加文字',desc:'图片加字 加水印',icon:'✏️',colors:['#8b5cf6','#a78bfa']},
  {id:'qrcode',title:'二维码生成',desc:'文本/网址极速转码',icon:'🔳',colors:['#6366f1','#8b5cf6']},
];

const ALL_FUN = [
  {id:'burst',title:'3D冲出特效',desc:'人物悬浮九宫格',icon:'🚀',colors:['#ef4444','#f87171']},
  {id:'retouch',title:'一键精修',desc:'智能美颜 磨皮 提亮',icon:'✨',colors:['#ec4899','#f472b6']}, // 敏感
  {id:'filter',title:'滤镜效果',desc:'复古 黑白 暖色调',icon:'🎭',colors:['#f43f5e','#fb7185']},
  {id:'art',title:'艺术风格',desc:'照片变漫画 动漫头像',icon:'🎨',colors:['#ec4899','#f472b6']}, // 敏感
  {id:'avatar',title:'头像挂件',desc:'节日头像 边框装饰',icon:'🎀',colors:['#f59e0b','#fbbf24']},
  {id:'meme',title:'表情包制作',desc:'DIY专属表情包 斗图神器',icon:'😂',colors:['#eab308','#facc15']}
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

    // 初始列表 (建议先只放绝对安全的兜底，防止接口慢时显示敏感图标)
    toolList: [],
    ocrList: [],
    funList: []
  },

  onLoad() {
    this.initNavBar();
    
    // 🔥 核心：检查审核状态
    this.checkAuditStatus();

    this.initFortune();
    this.initVideoAd();
    this.initInterstitialAd();
  },

  // 🔥 请求云端开关
  checkAuditStatus() {
    // 1. 先显示安全的兜底列表（防止白屏）
    const safeIds = [
      //'matting',    // AI智能抠图
      //'restore',    // AI高清修复
      'watermark',  // 图片去水印 (建议隐藏)
      'ocr',        // 图片转文字 (建议隐藏)
      'retouch',    // 一键精修
      //'art',      // 艺术风格/动漫脸 (重灾区)
      'burst',      // 3D特效
      'text2img',   // 长文转图
      'batchwm',    // 批量水印 (微商属性，有时敏感)

      // =========== 🟢 基础安全功能 (建议注释掉 -> 显示) ===========
       'idphoto',   // 证件照制作 (通常安全)
       'idprint',   // 证件照排版 (通常安全)
       'grid9',     // 九宫格
       'collage',   // 拼图
       'crop',      // 裁剪
       'compress',  // 压缩
       'mosaic',    // 马赛克
       'longpic',   // 长图拼接
       'text',      // 添加文字
       'avatar',    // 头像挂件
       'meme',      // 表情包
    ];
    this.setData({
        toolList: ALL_TOOLS.filter(i => safeIds.includes(i.id)),
        ocrList: ALL_OCR.filter(i => safeIds.includes(i.id)),
        funList: ALL_FUN.filter(i => safeIds.includes(i.id))
    });

    // 2. 调用通用模块获取配置
    Audit.getConfig()
      .then(({ isAudit, blockList }) => {
        console.log('配置模式:', isAudit ? '🔒等待中' : '🔓已开放');
        
        if (isAudit) {
          // 过滤黑名单
          this.setData({
            toolList: ALL_TOOLS.filter(item => !blockList.includes(item.id)),
            ocrList: ALL_OCR.filter(item => !blockList.includes(item.id)),
            funList: ALL_FUN.filter(item => !blockList.includes(item.id))
          });
        } else {
          // 正式模式：全量显示
          this.setData({
            toolList: ALL_TOOLS,
            ocrList: ALL_OCR,
            funList: ALL_FUN
          });
        }
      })
      .catch((err) => {
        console.error('配置拉取失败，维持安全模式', err);
        // 失败时什么都不用做，因为第1步已经设置了安全兜底
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
    if (page) wx.navigateTo({ url: `/pages/${page}/${page}`, fail: () => wx.showToast({ title: '功能升级中', icon: 'none' }) });
  },

  // === 每日一签逻辑 ===
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
      interstitialAd.onLoad(() => console.log('插屏加载成功'));
      interstitialAd.onError(e => console.error(e));
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

  // 🔥 确保保留分享功能！🔥
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
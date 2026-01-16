// pages/idprint/idprint.js

const Security = require('../../utils/security.js');

const AD_CONFIG = {
  BANNER_ID: 'adunit-ecfcec4c6a0c871b', 
  VIDEO_ID: 'adunit-da175a2014d3443b' 
};

const FREE_COUNT_DAILY = 2;

// === 物理尺寸配置 ===
// 6寸相纸 (4R) 物理尺寸: 102mm x 152mm
const PAPER_SHORT_MM = 102;
const PAPER_LONG_MM = 152;

// 基础 300 DPI 换算系数 (像素/毫米)
const BASE_PX_PER_MM = 300 / 25.4; 

// 【核心升级】高清倍率：3.0 
// 相当于 900 DPI 输出，确保原图缩放后依然保留极致细节
// 解决“模糊”和“像素丢失”问题
const HD_SCALE = 3.0;

Page({
  data: {
    imagePath: '',
    selectedSize: '1inch',
    resultImage: '',
    isProcessing: false,
    bannerUnitId: AD_CONFIG.BANNER_ID,

    // 排版间距 (单位:毫米)
    rowGap: 2,       
    colGap: 2,       
    
    // 动态排版数据
    layoutInfo: {
      isPaperLandscape: false, 
      cols: 0,
      rows: 0,
      count: 0,
      itemW_mm: 0,
      itemH_mm: 0,
      isRotated: false
    },

    // 尺寸定义 (仅作为“基准短边”参考，实际长边由原图决定)
    sizeList: [
      { id: '1inch', name: '一寸', desc: '基准短边25mm', base_short: 25 },
      { id: 'small1', name: '小一寸', desc: '基准短边22mm', base_short: 22 },
      { id: 'big1', name: '大一寸', desc: '基准短边33mm', base_short: 33 },
      { id: '2inch', name: '二寸', desc: '基准短边35mm', base_short: 35 },
      { id: 'small2', name: '小二寸', desc: '基准短边35mm', base_short: 35 },
      { id: 'big2', name: '大二寸', desc: '基准短边35mm', base_short: 35 }
    ]
  },

  videoAd: null,

  onLoad() {
    this.initVideoAd();
  },

  initVideoAd() {
    if (wx.createRewardedVideoAd) {
      this.videoAd = wx.createRewardedVideoAd({ adUnitId: AD_CONFIG.VIDEO_ID });
      this.videoAd.onLoad(() => console.log('激励视频加载成功'));
      this.videoAd.onError((err) => console.error('激励视频加载失败', err));
      this.videoAd.onClose((res) => {
        if (res && res.isEnded) {
          this.setDailyUnlimited();
          wx.showToast({ title: '已解锁', icon: 'success' });
          this.doSaveImage(); 
        }
      });
    }
  },

  chooseImage() {
    wx.chooseMedia({
      count: 1, mediaType: ['image'], sizeType: ['original'], // 强制原图
      success: (res) => {
        const path = res.tempFiles[0].tempFilePath;
        wx.showLoading({ title: '解析原图...' });
        Security.checkImage(path).then(isSafe => {
          wx.hideLoading();
          if (isSafe) {
            this.setData({ imagePath: path, resultImage: '' });
            this.triggerSmartLayout(path);
          }
        }).catch(() => { 
            wx.hideLoading(); 
            this.setData({ imagePath: path }); 
            this.triggerSmartLayout(path);
        });
      }
    });
  },

  selectSize(e) {
    const id = e.currentTarget.dataset.id;
    if (id === this.data.selectedSize) return;
    this.setData({ selectedSize: id });
    if (this.data.imagePath) this.triggerSmartLayout(this.data.imagePath);
  },

  onRowGapChange(e) {
    this.setData({ rowGap: e.detail.value });
    this.debounceGenerate();
  },
  onColGapChange(e) {
    this.setData({ colGap: e.detail.value });
    this.debounceGenerate();
  },
  
  debounceGenerate() {
    if (this.gapTimeout) clearTimeout(this.gapTimeout);
    this.gapTimeout = setTimeout(() => {
        this.triggerSmartLayout(this.data.imagePath);
    }, 300);
  },

  triggerSmartLayout(path) {
    if (!path) return;
    wx.getImageInfo({
        src: path,
        success: (imgInfo) => {
            // 将原图尺寸传入算法
            this.calculateAndDraw(imgInfo.width, imgInfo.height);
        },
        fail: () => { wx.showToast({ title: '读取失败', icon: 'none' }); }
    });
  },

  // === 核心：无损自适应算法 ===
  calculateAndDraw(imgW, imgH) {
    this.setData({ isProcessing: true });
    wx.showLoading({ title: '超清排版计算...' });

    const sizeConfig = this.data.sizeList.find(s => s.id === this.data.selectedSize);
    
    // 1. 锁定“物理短边”，长边随原图比例自由伸缩
    // 这样能保证：不管原图是长的扁的，都完全保留，不裁剪哪怕一个像素
    const baseShortMM = sizeConfig.base_short;
    const imgRatio = imgW / imgH;
    
    let itemW_mm, itemH_mm;
    let isRotated = false;

    if (imgW > imgH) {
        // 原图是横的
        itemH_mm = baseShortMM; 
        itemW_mm = baseShortMM * imgRatio; 
        isRotated = true;
    } else {
        // 原图是竖的
        itemW_mm = baseShortMM;
        itemH_mm = baseShortMM / imgRatio;
        isRotated = false;
    }

    // 2. 计算哪种相纸方向能排更多
    const gapC = this.data.colGap;
    const gapR = this.data.rowGap;

    const planA = this.calcCapacity(PAPER_SHORT_MM, PAPER_LONG_MM, itemW_mm, itemH_mm, gapC, gapR);
    const planB = this.calcCapacity(PAPER_LONG_MM, PAPER_SHORT_MM, itemW_mm, itemH_mm, gapC, gapR);

    let bestPlan;
    if (planB.total > planA.total) {
        bestPlan = { ...planB, paperW_mm: PAPER_LONG_MM, paperH_mm: PAPER_SHORT_MM, isPaperLandscape: true };
    } else {
        bestPlan = { ...planA, paperW_mm: PAPER_SHORT_MM, paperH_mm: PAPER_LONG_MM, isPaperLandscape: false };
    }

    this.setData({
        layoutInfo: {
            ...bestPlan,
            itemW_mm: itemW_mm,
            itemH_mm: itemH_mm,
            isRotated: isRotated
        }
    });

    // 3. 开始超清绘图
    this.startDrawingHD(bestPlan, itemW_mm, itemH_mm);
  },

  calcCapacity(paperW, paperH, itemW, itemH, gapC, gapR) {
    const cols = Math.floor((paperW + gapC) / (itemW + gapC));
    const rows = Math.floor((paperH + gapR) / (itemH + gapR));
    return { cols, rows, total: cols * rows };
  },

  // === 绘图：3倍超采样 + PNG无损导出 ===
  startDrawingHD(plan, itemW_mm, itemH_mm) {
    // 全链路像素放大，确保细节
    const scale = BASE_PX_PER_MM * HD_SCALE;

    const paperPxW = Math.ceil(plan.paperW_mm * scale);
    const paperPxH = Math.ceil(plan.paperH_mm * scale);
    const itemPxW = Math.round(itemW_mm * scale);
    const itemPxH = Math.round(itemH_mm * scale);
    const gapColPx = Math.round(this.data.colGap * scale);
    const gapRowPx = Math.round(this.data.rowGap * scale);

    // 安全检查：防止画布过大崩溃 (限制在 4096px 宽以内)
    // 6寸长边 152mm * 11.8 * 3 ≈ 5380px，可能在部分安卓机上有风险
    // 我们做一个自适应降级：如果算出来太大，就稍微降一点倍率，优先保证能跑通
    let safeScale = 1;
    if (Math.max(paperPxW, paperPxH) > 4096) {
        safeScale = 4096 / Math.max(paperPxW, paperPxH);
    }
    
    const finalW = Math.floor(paperPxW * safeScale);
    const finalH = Math.floor(paperPxH * safeScale);
    const finalItemW = Math.floor(itemPxW * safeScale);
    const finalItemH = Math.floor(itemPxH * safeScale);
    const finalGapCol = Math.floor(gapColPx * safeScale);
    const finalGapRow = Math.floor(gapRowPx * safeScale);

    const canvas = wx.createOffscreenCanvas({ type: '2d', width: finalW, height: finalH });
    const ctx = canvas.getContext('2d');

    // 开启极高画质平滑
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    const img = canvas.createImage();
    img.onload = () => {
      try {
        // 背景白
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, finalW, finalH);

        // 居中计算
        const contentW = plan.cols * finalItemW + (plan.cols - 1) * finalGapCol;
        const contentH = plan.rows * finalItemH + (plan.rows - 1) * finalGapRow;
        const startX = (finalW - contentW) / 2;
        const startY = (finalH - contentH) / 2;

        // 绘制辅助裁切线 (灰色细线)
        ctx.strokeStyle = '#eeeeee';
        ctx.lineWidth = 1 * HD_SCALE * safeScale;
        ctx.beginPath();
        ctx.moveTo(finalW/2, 0); ctx.lineTo(finalW/2, finalH);
        ctx.moveTo(0, finalH/2); ctx.lineTo(finalW, finalH/2);
        ctx.stroke();

        for (let r = 0; r < plan.rows; r++) {
          for (let c = 0; c < plan.cols; c++) {
            const x = startX + c * (finalItemW + finalGapCol);
            const y = startY + r * (finalItemH + finalGapRow);
            
            // 【绝对不裁剪】直接把原图画进去
            // 因为 finalItemW/H 就是按原图比例算出来的，所以这里 100% 吻合
            ctx.drawImage(img, x, y, finalItemW, finalItemH);
            
            // 描边 (灰色)
            ctx.strokeStyle = '#cccccc';
            ctx.lineWidth = 2 * HD_SCALE * safeScale;
            ctx.strokeRect(x, y, finalItemW, finalItemH);
          }
        }

        // 导出为 PNG (关键：destWidth = 画布物理尺寸)
        // 使用 PNG 格式，彻底消除 JPG 压缩噪点
        wx.canvasToTempFilePath({
            canvas: canvas,
            width: finalW,
            height: finalH,
            destWidth: finalW,
            destHeight: finalH,
            fileType: 'png', 
            quality: 1.0,
            success: (res) => {
                this.setData({ resultImage: res.tempFilePath, isProcessing: false });
                wx.hideLoading();
            },
            fail: (err) => {
                console.error(err);
                this.setData({ isProcessing: false });
                wx.hideLoading();
                wx.showToast({ title: '导出失败', icon: 'none' });
            }
        });
      } catch (err) {
        console.error(err);
        this.setData({ isProcessing: false });
        wx.hideLoading();
      }
    };
    img.onerror = () => {
        this.setData({ isProcessing: false });
        wx.hideLoading();
    }
    img.src = this.data.imagePath;
  },

  previewResult() {
      if (this.data.resultImage) {
          wx.previewImage({ urls: [this.data.resultImage], current: this.data.resultImage });
      }
  },

  saveImage() {
    if (!this.data.resultImage) return;
    this.checkQuotaAndSave();
  },

  checkQuotaAndSave() {
    const today = new Date().toLocaleDateString();
    const key = 'idprint_usage_record';
    let record = wx.getStorageSync(key) || { date: today, count: 0, isUnlimited: false };
    if (record.date !== today) { record = { date: today, count: 0, isUnlimited: false }; wx.setStorageSync(key, record); }

    if (record.isUnlimited || record.count < FREE_COUNT_DAILY) {
      if(!record.isUnlimited) { record.count++; wx.setStorageSync(key, record); }
      this.doSaveImage();
    } else {
      this.showAdModal();
    }
  },

  setDailyUnlimited() {
    wx.setStorageSync('idprint_usage_record', { date: new Date().toLocaleDateString(), count: 999, isUnlimited: true });
  },

  showAdModal() {
    if (this.videoAd) {
      wx.showModal({
        title: '免费次数已用完', content: '观看视频解锁今日无限次保存',
        success: (res) => { if (res.confirm) this.videoAd.show().catch(() => this.doSaveImage()); }
      });
    } else { this.doSaveImage(); }
  },

  doSaveImage() {
    wx.showLoading({ title: '保存中...' });
    wx.saveImageToPhotosAlbum({
      filePath: this.data.resultImage,
      success: () => {
        wx.hideLoading();
        wx.navigateTo({ url: `/pages/success/success?path=${encodeURIComponent(this.data.resultImage)}` });
      },
      fail: (err) => {
        wx.hideLoading();
        if (err.errMsg.indexOf('cancel') === -1) {
            wx.showModal({ title: '权限', content: '需开启相册权限', success: s => s.confirm && wx.openSetting() });
        }
      }
    });
  },
  
  onAdError(err) { console.log(err); },
  onShareAppMessage() { return { title: '超清无损证件照排版', path: '/pages/idprint/idprint' }; }
});
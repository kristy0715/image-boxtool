// pages/anime/anime.js

const Security = require('../../utils/security.js');

// === 1. 广告配置 ===
const AD_CONFIG = {
  BANNER_ID: 'adunit-ecfcec4c6a0c871b',       // Banner 广告 ID
  VIDEO_ID: 'adunit-da175a2014d3443b'         // 激励视频广告 ID
};

// === 2. 策略配置 ===
const FREE_COUNT_DAILY = 2; // 每天免费保存 2 次

Page({
  data: {
    imagePath: '',
    canvasWidth: 300,
    canvasHeight: 300,
    currentStyle: 'anime',
    intensity: 50,
    isProcessing: false,
    generatedPath: '',
    
    // 绑定 Banner ID
    bannerUnitId: AD_CONFIG.BANNER_ID,
    
    styleList: [
      { id: 'anime', name: '日漫', icon: '🎨', desc: '经典日式动漫' },
      { id: 'comic', name: '美漫', icon: '💥', desc: '美式漫画风' },
      { id: 'sketch', name: '素描', icon: '✏️', desc: '铅笔素描效果' },
      { id: 'watercolor', name: '水彩', icon: '🎨', desc: '水彩画风格' },
      { id: 'oil', name: '油画', icon: '🖼️', desc: '印象派油画' },
      { id: 'pixel', name: '像素', icon: '👾', desc: '复古像素风' },
      { id: 'poster', name: '海报', icon: '🎬', desc: '波普艺术' },
      { id: 'neon', name: '霓虹', icon: '✨', desc: '赛博霓虹' },
      { id: 'ink', name: '水墨', icon: '🖌️', desc: '中国水墨画' },
      { id: 'mosaic', name: '马赛克', icon: '🔲', desc: '艺术马赛克' },
      { id: 'cartoon', name: '卡通', icon: '🎭', desc: '可爱卡通风' },
      { id: 'vintage', name: '怀旧', icon: '📷', desc: '老照片效果' }
    ]
  },

  videoAd: null, // 广告实例

  onLoad() {
    this.dpr = wx.getSystemInfoSync().pixelRatio;
    this.initVideoAd();
  },

  onReady() {
    this.initCanvas();
  },

  // === 3. 初始化激励视频 ===
  initVideoAd() {
    if (wx.createRewardedVideoAd) {
      this.videoAd = wx.createRewardedVideoAd({ adUnitId: AD_CONFIG.VIDEO_ID });
      this.videoAd.onLoad(() => console.log('激励视频加载成功'));
      this.videoAd.onError((err) => console.error('激励视频加载失败', err));
      
      this.videoAd.onClose((res) => {
        // 用户点击了【关闭广告】按钮
        if (res && res.isEnded) {
          // A. 完整观看：解锁权益并保存
          this.setDailyUnlimited();
          wx.showToast({ title: '已解锁今日无限次', icon: 'success' });
          this.realSaveProcess(); 
        } else {
          // B. 中途退出：提示
          wx.showModal({
            title: '提示',
            content: '需要完整观看视频才能解锁今日无限次保存权限哦',
            confirmText: '继续观看',
            success: (m) => {
              if (m.confirm) this.videoAd.show();
            }
          });
        }
      });
    }
  },

  // === 4. 额度检查逻辑 (核心) ===
  checkQuotaAndSave() {
    const today = new Date().toLocaleDateString();
    const storageKey = 'anime_usage_record'; // 独立 Key
    let record = wx.getStorageSync(storageKey) || { date: today, count: 0, isUnlimited: false };

    // 跨天重置
    if (record.date !== today) {
      record = { date: today, count: 0, isUnlimited: false };
      wx.setStorageSync(storageKey, record);
    }

    // 情况A: 已解锁 -> 直接保存
    if (record.isUnlimited) {
      this.realSaveProcess();
      return;
    }

    // 情况B: 有免费次数 -> 扣除并保存
    if (record.count < FREE_COUNT_DAILY) {
      record.count++;
      wx.setStorageSync(storageKey, record);
      
      const left = FREE_COUNT_DAILY - record.count;
      if (left > 0) {
        wx.showToast({ title: `今日剩余免费${left}次`, icon: 'none' });
      }
      this.realSaveProcess();
      return;
    }

    // 情况C: 次数用尽 -> 弹广告
    this.showAdModal();
  },

  setDailyUnlimited() {
    const today = new Date().toLocaleDateString();
    const storageKey = 'anime_usage_record';
    const record = { date: today, count: 999, isUnlimited: true };
    wx.setStorageSync(storageKey, record);
  },

  showAdModal() {
    if (this.videoAd) {
      wx.showModal({
        title: '免费次数已用完',
        content: '观看一次视频，即可解锁【今日无限次】免费保存权限',
        confirmText: '免费解锁',
        cancelText: '取消',
        success: (res) => {
          if (res.confirm) {
            this.videoAd.show().catch(() => {
              // 广告加载失败，兜底允许保存
              this.realSaveProcess();
            });
          }
        }
      });
    } else {
      this.realSaveProcess();
    }
  },

  onAdError(err) {
    console.log('Banner 广告加载失败:', err);
  },

  initCanvas() {
    const query = wx.createSelectorQuery();
    query.select('#animeCanvas')
      .fields({ node: true, size: true })
      .exec((res) => {
        if (res[0]) {
          this.canvas = res[0].node;
          this.ctx = this.canvas.getContext('2d');
        }
      });
  },

  chooseImage() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      success: (res) => {
        const tempFilePath = res.tempFiles[0].tempFilePath;

        wx.showLoading({ title: '安全检测中...' });

        Security.checkImage(tempFilePath).then((isSafe) => {
          wx.hideLoading();

          if (isSafe) {
            this.setData({ 
              imagePath: tempFilePath,
              generatedPath: '' // 重置分享图
            });
            this.loadImage(tempFilePath);
          } else {
            console.log('图片违规，停止处理');
          }
        }).catch(err => {
            wx.hideLoading();
            console.error('检测流程异常', err);
        });
      }
    });
  },

  loadImage(path) {
    wx.showLoading({ title: '加载中...' });
    wx.getImageInfo({
      src: path,
      success: (info) => {
        const maxSize = 600;
        let width = info.width;
        let height = info.height;

        if (width > height && width > maxSize) {
          height = height * (maxSize / width);
          width = maxSize;
        } else if (height > maxSize) {
          width = width * (maxSize / height);
          height = maxSize;
        }

        this.setData({ canvasWidth: Math.floor(width), canvasHeight: Math.floor(height) });
        this.originalPath = path;

        setTimeout(() => {
          this.initCanvas();
          setTimeout(() => {
            this.processImage();
            wx.hideLoading();
          }, 150);
        }, 100);
      },
      fail: () => wx.hideLoading()
    });
  },

  selectStyle(e) {
    if (this.data.isProcessing) return;
    this.setData({ currentStyle: e.currentTarget.dataset.id });
    this.processImage();
  },

  onIntensityChange(e) {
    this.setData({ intensity: e.detail.value });
  },

  onIntensityChanged(e) {
    this.setData({ intensity: e.detail.value });
    this.processImage();
  },

  processImage() {
    if (!this.canvas || !this.originalPath || this.data.isProcessing) return;

    this.setData({ isProcessing: true });
    
    const { canvasWidth, canvasHeight } = this.data;
    const dpr = this.dpr;
    
    this.canvas.width = canvasWidth * dpr;
    this.canvas.height = canvasHeight * dpr;
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.scale(dpr, dpr);

    const img = this.canvas.createImage();
    img.onload = () => {
      this.ctx.drawImage(img, 0, 0, canvasWidth, canvasHeight);
      const imageData = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
      
      this.applyEffect(imageData);
      this.ctx.putImageData(imageData, 0, 0);
      
      wx.canvasToTempFilePath({
        canvas: this.canvas,
        success: (res) => {
          this.setData({ generatedPath: res.tempFilePath });
        }
      });

      this.setData({ isProcessing: false });
    };
    img.onerror = () => {
      this.setData({ isProcessing: false });
      wx.showToast({ title: '图片加载失败', icon: 'none' });
    };
    img.src = this.originalPath;
  },

  applyEffect(imageData) {
    const { currentStyle, intensity } = this.data;
    const data = imageData.data;
    const width = imageData.width;
    const height = imageData.height;

    switch (currentStyle) {
      case 'anime': this.animeEffect(data, width, height, intensity); break;
      case 'comic': this.comicEffect(data, width, height, intensity); break;
      case 'sketch': this.sketchEffect(data, width, height, intensity); break;
      case 'watercolor': this.watercolorEffect(data, width, height, intensity); break;
      case 'oil': this.oilEffect(data, width, height, intensity); break;
      case 'pixel': this.pixelEffect(data, width, height, intensity); break;
      case 'poster': this.posterEffect(data, width, height, intensity); break;
      case 'neon': this.neonEffect(data, width, height, intensity); break;
      case 'ink': this.inkEffect(data, width, height, intensity); break;
      case 'mosaic': this.mosaicArtEffect(data, width, height, intensity); break;
      case 'cartoon': this.cartoonEffect(data, width, height, intensity); break;
      case 'vintage': this.vintageEffect(data, width, height, intensity); break;
    }
  },

  // === 滤镜算法 (保持不变) ===
  animeEffect(data, width, height, intensity) {
     const levels = Math.max(4, 16 - Math.floor(intensity / 10));
     const edgeStrength = intensity / 100;
     const edgeData = new Uint8ClampedArray(data);
     this.detectEdges(edgeData, width, height);
     for (let i = 0; i < data.length; i += 4) {
       let r = Math.round(data[i] / (256 / levels)) * (256 / levels);
       let g = Math.round(data[i + 1] / (256 / levels)) * (256 / levels);
       let b = Math.round(data[i + 2] / (256 / levels)) * (256 / levels);
       const gray = 0.299 * r + 0.587 * g + 0.114 * b;
       const sat = 1.3;
       r = gray + sat * (r - gray);
       g = gray + sat * (g - gray);
       b = gray + sat * (b - gray);
       const edge = edgeData[i];
       if (edge < 80 && edgeStrength > 0.2) {
         const blend = edgeStrength * 0.8;
         r = r * (1 - blend);
         g = g * (1 - blend);
         b = b * (1 - blend);
       }
       data[i] = Math.max(0, Math.min(255, r));
       data[i + 1] = Math.max(0, Math.min(255, g));
       data[i + 2] = Math.max(0, Math.min(255, b));
     }
  },
  comicEffect(data, width, height, intensity) {
      for (let i = 0; i < data.length; i += 4) {
        const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
        let level;
        if (gray > 200) level = 255;
        else if (gray > 150) level = 200;
        else if (gray > 100) level = 140;
        else if (gray > 60) level = 80;
        else level = 0;
        const colorKeep = 0.3;
        data[i] = level * (1 - colorKeep) + data[i] * colorKeep;
        data[i + 1] = level * (1 - colorKeep) + data[i + 1] * colorKeep;
        data[i + 2] = level * (1 - colorKeep) + data[i + 2] * colorKeep;
        const factor = 1.4;
        data[i] = Math.max(0, Math.min(255, factor * (data[i] - 128) + 128));
        data[i + 1] = Math.max(0, Math.min(255, factor * (data[i + 1] - 128) + 128));
        data[i + 2] = Math.max(0, Math.min(255, factor * (data[i + 2] - 128) + 128));
      }
  },
  sketchEffect(data, width, height, intensity) {
      for (let i = 0; i < data.length; i += 4) {
        const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
        data[i] = data[i + 1] = data[i + 2] = gray;
      }
      const inverted = new Uint8ClampedArray(data.length);
      for (let i = 0; i < data.length; i += 4) {
        inverted[i] = 255 - data[i];
        inverted[i + 1] = 255 - data[i + 1];
        inverted[i + 2] = 255 - data[i + 2];
        inverted[i + 3] = data[i + 3];
      }
      for (let i = 0; i < data.length; i += 4) {
        const base = data[i];
        const blend = inverted[i];
        const result = blend === 255 ? 255 : Math.min(255, base * 255 / (256 - blend));
        const final = result * (intensity / 100) + data[i] * (1 - intensity / 100);
        data[i] = data[i + 1] = data[i + 2] = Math.min(255, final + 20);
      }
  },
  watercolorEffect(data, width, height, intensity) {
      const radius = Math.max(2, Math.floor(intensity / 25));
      const copy = new Uint8ClampedArray(data);
      for (let y = radius; y < height - radius; y += 2) {
        for (let x = radius; x < width - radius; x += 2) {
          let sumR = 0, sumG = 0, sumB = 0, count = 0;
          for (let dy = -radius; dy <= radius; dy++) {
            for (let dx = -radius; dx <= radius; dx++) {
              const idx = ((y + dy) * width + (x + dx)) * 4;
              sumR += copy[idx];
              sumG += copy[idx + 1];
              sumB += copy[idx + 2];
              count++;
            }
          }
          const idx = (y * width + x) * 4;
          const levels = 8;
          data[idx] = Math.round((sumR / count) / (256 / levels)) * (256 / levels);
          data[idx + 1] = Math.round((sumG / count) / (256 / levels)) * (256 / levels);
          data[idx + 2] = Math.round((sumB / count) / (256 / levels)) * (256 / levels);
        }
      }
      for (let i = 0; i < data.length; i += 4) {
        data[i] = Math.min(255, data[i] + 20);
        data[i + 1] = Math.min(255, data[i + 1] + 20);
        data[i + 2] = Math.min(255, data[i + 2] + 20);
        const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
        const sat = 0.7;
        data[i] = gray + sat * (data[i] - gray);
        data[i + 1] = gray + sat * (data[i + 1] - gray);
        data[i + 2] = gray + sat * (data[i + 2] - gray);
      }
  },
  oilEffect(data, width, height, intensity) {
      const radius = Math.max(2, Math.floor(intensity / 20));
      const levels = 20;
      const copy = new Uint8ClampedArray(data);
      for (let y = radius; y < height - radius; y += 2) {
        for (let x = radius; x < width - radius; x += 2) {
          const buckets = new Array(levels).fill(0).map(() => ({ r: 0, g: 0, b: 0, count: 0 }));
          for (let dy = -radius; dy <= radius; dy++) {
            for (let dx = -radius; dx <= radius; dx++) {
              const idx = ((y + dy) * width + (x + dx)) * 4;
              const intensityVal = Math.floor(((copy[idx] + copy[idx + 1] + copy[idx + 2]) / 3) / (256 / levels));
              const bucket = buckets[Math.min(intensityVal, levels - 1)];
              bucket.r += copy[idx];
              bucket.g += copy[idx + 1];
              bucket.b += copy[idx + 2];
              bucket.count++;
            }
          }
          let maxBucket = buckets[0];
          for (const b of buckets) {
            if (b.count > maxBucket.count) maxBucket = b;
          }
          if (maxBucket.count > 0) {
            const idx = (y * width + x) * 4;
            data[idx] = maxBucket.r / maxBucket.count;
            data[idx + 1] = maxBucket.g / maxBucket.count;
            data[idx + 2] = maxBucket.b / maxBucket.count;
          }
        }
      }
  },
  pixelEffect(data, width, height, intensity) {
      const blockSize = Math.max(4, Math.floor(intensity / 8));
      const copy = new Uint8ClampedArray(data);
      for (let y = 0; y < height; y += blockSize) {
        for (let x = 0; x < width; x += blockSize) {
          let sumR = 0, sumG = 0, sumB = 0, count = 0;
          for (let dy = 0; dy < blockSize && y + dy < height; dy++) {
            for (let dx = 0; dx < blockSize && x + dx < width; dx++) {
              const idx = ((y + dy) * width + (x + dx)) * 4;
              sumR += copy[idx];
              sumG += copy[idx + 1];
              sumB += copy[idx + 2];
              count++;
            }
          }
          const avgR = sumR / count;
          const avgG = sumG / count;
          const avgB = sumB / count;
          for (let dy = 0; dy < blockSize && y + dy < height; dy++) {
            for (let dx = 0; dx < blockSize && x + dx < width; dx++) {
              const idx = ((y + dy) * width + (x + dx)) * 4;
              data[idx] = avgR;
              data[idx + 1] = avgG;
              data[idx + 2] = avgB;
            }
          }
        }
      }
  },
  posterEffect(data, width, height, intensity) {
      const levels = Math.max(2, 6 - Math.floor(intensity / 25));
      for (let i = 0; i < data.length; i += 4) {
        data[i] = Math.round(data[i] / (256 / levels)) * (256 / levels);
        data[i + 1] = Math.round(data[i + 1] / (256 / levels)) * (256 / levels);
        data[i + 2] = Math.round(data[i + 2] / (256 / levels)) * (256 / levels);
        const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
        const sat = 1.5;
        data[i] = Math.max(0, Math.min(255, gray + sat * (data[i] - gray)));
        data[i + 1] = Math.max(0, Math.min(255, gray + sat * (data[i + 1] - gray)));
        data[i + 2] = Math.max(0, Math.min(255, gray + sat * (data[i + 2] - gray)));
      }
  },
  neonEffect(data, width, height, intensity) {
      const edgeData = new Uint8ClampedArray(data);
      this.detectEdges(edgeData, width, height);
      for (let i = 0; i < data.length; i += 4) {
        const edge = edgeData[i];
        if (edge < 100) {
          const hue = (i / 4 / width * 360 + intensity * 3.6) % 360;
          const rgb = this.hslToRgb(hue / 360, 1, 0.5);
          const blend = (100 - edge) / 100 * (intensity / 100);
          data[i] = data[i] * (1 - blend) + rgb.r * blend;
          data[i + 1] = data[i + 1] * (1 - blend) + rgb.g * blend;
          data[i + 2] = data[i + 2] * (1 - blend) + rgb.b * blend;
        }
        data[i] = data[i] * 0.3;
        data[i + 1] = data[i + 1] * 0.3;
        data[i + 2] = data[i + 2] * 0.3;
      }
  },
  inkEffect(data, width, height, intensity) {
      for (let i = 0; i < data.length; i += 4) {
        const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
        data[i] = data[i + 1] = data[i + 2] = gray;
      }
      const contrast = 1 + intensity / 100;
      for (let i = 0; i < data.length; i += 4) {
        const val = contrast * (data[i] - 128) + 128;
        data[i] = data[i + 1] = data[i + 2] = Math.max(0, Math.min(255, val));
      }
      for (let i = 0; i < data.length; i += 4) {
        const brightness = data[i];
        data[i] = Math.min(255, brightness + 15);
        data[i + 1] = Math.min(255, brightness + 10);
        data[i + 2] = brightness;
      }
  },
  mosaicArtEffect(data, width, height, intensity) {
      const blockSize = Math.max(6, Math.floor(intensity / 5));
      const copy = new Uint8ClampedArray(data);
      for (let y = 0; y < height; y += blockSize) {
        for (let x = 0; x < width; x += blockSize) {
          let sumR = 0, sumG = 0, sumB = 0, count = 0;
          for (let dy = 0; dy < blockSize && y + dy < height; dy++) {
            for (let dx = 0; dx < blockSize && x + dx < width; dx++) {
              const idx = ((y + dy) * width + (x + dx)) * 4;
              sumR += copy[idx];
              sumG += copy[idx + 1];
              sumB += copy[idx + 2];
              count++;
            }
          }
          const avgR = Math.round((sumR / count) / 64) * 64;
          const avgG = Math.round((sumG / count) / 64) * 64;
          const avgB = Math.round((sumB / count) / 64) * 64;
          for (let dy = 0; dy < blockSize && y + dy < height; dy++) {
            for (let dx = 0; dx < blockSize && x + dx < width; dx++) {
              const idx = ((y + dy) * width + (x + dx)) * 4;
              if (dy === 0 || dx === 0) {
                data[idx] = avgR * 0.8;
                data[idx + 1] = avgG * 0.8;
                data[idx + 2] = avgB * 0.8;
              } else {
                data[idx] = avgR;
                data[idx + 1] = avgG;
                data[idx + 2] = avgB;
              }
            }
          }
        }
      }
  },
  cartoonEffect(data, width, height, intensity) {
      const levels = 6;
      const edgeData = new Uint8ClampedArray(data);
      this.detectEdges(edgeData, width, height);
      for (let i = 0; i < data.length; i += 4) {
        let r = Math.round(data[i] / (256 / levels)) * (256 / levels);
        let g = Math.round(data[i + 1] / (256 / levels)) * (256 / levels);
        let b = Math.round(data[i + 2] / (256 / levels)) * (256 / levels);
        r = Math.min(255, r * 1.1 + 10);
        g = Math.min(255, g * 1.1 + 10);
        b = Math.min(255, b * 1.1 + 10);
        const gray = 0.299 * r + 0.587 * g + 0.114 * b;
        const sat = 1.2;
        r = gray + sat * (r - gray);
        g = gray + sat * (g - gray);
        b = gray + sat * (b - gray);
        const edge = edgeData[i];
        if (edge < 60) {
          r = g = b = 30;
        }
        data[i] = Math.max(0, Math.min(255, r));
        data[i + 1] = Math.max(0, Math.min(255, g));
        data[i + 2] = Math.max(0, Math.min(255, b));
      }
  },
  vintageEffect(data, width, height, intensity) {
      for (let i = 0; i < data.length; i += 4) {
        let r = data[i];
        let g = data[i + 1];
        let b = data[i + 2];
        const tr = 0.393 * r + 0.769 * g + 0.189 * b;
        const tg = 0.349 * r + 0.686 * g + 0.168 * b;
        const tb = 0.272 * r + 0.534 * g + 0.131 * b;
        const blend = intensity / 100;
        r = r * (1 - blend) + tr * blend;
        g = g * (1 - blend) + tg * blend;
        b = b * (1 - blend) + tb * blend;
        r = r * 0.9 + 25;
        g = g * 0.9 + 20;
        b = b * 0.9 + 15;
        data[i] = Math.max(0, Math.min(255, r));
        data[i + 1] = Math.max(0, Math.min(255, g));
        data[i + 2] = Math.max(0, Math.min(255, b));
      }
      const cx = width / 2;
      const cy = height / 2;
      const maxDist = Math.sqrt(cx * cx + cy * cy);
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const idx = (y * width + x) * 4;
          const dist = Math.sqrt((x - cx) * (x - cx) + (y - cy) * (y - cy));
          const vignette = 1 - (dist / maxDist) * 0.5 * (intensity / 100);
          data[idx] *= vignette;
          data[idx + 1] *= vignette;
          data[idx + 2] *= vignette;
        }
      }
  },

  detectEdges(data, width, height) {
    const sobelX = [-1, 0, 1, -2, 0, 2, -1, 0, 1];
    const sobelY = [-1, -2, -1, 0, 0, 0, 1, 2, 1];
    const copy = new Uint8ClampedArray(data);
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        let gx = 0, gy = 0;
        for (let ky = -1; ky <= 1; ky++) {
          for (let kx = -1; kx <= 1; kx++) {
            const idx = ((y + ky) * width + (x + kx)) * 4;
            const gray = (copy[idx] + copy[idx + 1] + copy[idx + 2]) / 3;
            const ki = (ky + 1) * 3 + (kx + 1);
            gx += gray * sobelX[ki];
            gy += gray * sobelY[ki];
          }
        }
        const mag = Math.sqrt(gx * gx + gy * gy);
        const idx = (y * width + x) * 4;
        data[idx] = data[idx + 1] = data[idx + 2] = mag > 30 ? 0 : 255;
      }
    }
  },

  hslToRgb(h, s, l) {
    let r, g, b;
    if (s === 0) {
      r = g = b = l;
    } else {
      const hue2rgb = (p, q, t) => {
        if (t < 0) t += 1;
        if (t > 1) t -= 1;
        if (t < 1/6) return p + (q - p) * 6 * t;
        if (t < 1/2) return q;
        if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
        return p;
      };
      const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
      const p = 2 * l - q;
      r = hue2rgb(p, q, h + 1/3);
      g = hue2rgb(p, q, h);
      b = hue2rgb(p, q, h - 1/3);
    }
    return { r: r * 255, g: g * 255, b: b * 255 };
  },

  // === 5. 点击保存入口 ===
  saveImage() {
    if (!this.canvas) return;
    this.checkQuotaAndSave();
  },

  // === 6. 真正的保存逻辑 ===
  realSaveProcess() {
    wx.showLoading({ title: '保存中...' });
    
    const { canvasWidth, canvasHeight } = this.data;
    const dpr = this.dpr;
    
    wx.canvasToTempFilePath({
      canvas: this.canvas,
      width: canvasWidth,
      height: canvasHeight,
      destWidth: canvasWidth * dpr, 
      destHeight: canvasHeight * dpr, 
      success: (res) => {
        wx.saveImageToPhotosAlbum({
          filePath: res.tempFilePath,
          success: () => {
            wx.hideLoading();
            // 跳转到统一成功页
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

  // === 分享配置 ===
  onShareAppMessage() {
    const imageUrl = this.data.generatedPath || '/assets/share-cover.png';
    return {
      title: '一键照片变漫画，唯美日漫风！',
      path: '/pages/anime/anime',
      imageUrl: imageUrl
    };
  },

  onShareTimeline() {
    const imageUrl = this.data.generatedPath || '/assets/share-cover.png';
    return {
      title: '一键照片变漫画，唯美日漫风！',
      query: '',
      imageUrl: imageUrl
    };
  }
});
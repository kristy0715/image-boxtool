// pages/longpic/longpic.js

const Security = require('../../utils/security.js');

// === 1. 广告配置 ===
const AD_CONFIG = {
  BANNER_ID: 'adunit-ecfcec4c6a0c871b',       // 请替换为您的 Banner 广告 ID
  VIDEO_ID: 'adunit-da175a2014d3443b' // 请替换为您的 激励视频广告 ID
};

// === 2. 策略配置 ===
const FREE_COUNT_DAILY = 2; // 每天免费保存 3 次

Page({
  data: {
    imageList: [],
    gap: 0, // 支持负数，负数即为重叠
    bgColor: '#ffffff',
    colorList: ['#ffffff', '#000000', '#f5f5f5', '#fef3c7', '#dbeafe', '#dcfce7'],
    resultImage: '',
    isProcessing: false,
    loadingText: '处理中...',
    // 绑定 Banner ID
    bannerUnitId: AD_CONFIG.BANNER_ID
  },

  videoAd: null, // 广告实例

  onLoad() {
    // 初始化视频广告
    this.initVideoAd();
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
          this.doSaveImage(); 
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
    const storageKey = 'longpic_usage_record'; // 独立 Key
    let record = wx.getStorageSync(storageKey) || { date: today, count: 0, isUnlimited: false };

    // 跨天重置
    if (record.date !== today) {
      record = { date: today, count: 0, isUnlimited: false };
      wx.setStorageSync(storageKey, record);
    }

    // 情况A: 已解锁 -> 直接保存
    if (record.isUnlimited) {
      this.doSaveImage();
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
      this.doSaveImage();
      return;
    }

    // 情况C: 次数用尽 -> 弹广告
    this.showAdModal();
  },

  setDailyUnlimited() {
    const today = new Date().toLocaleDateString();
    const storageKey = 'longpic_usage_record';
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
              this.doSaveImage();
            });
          }
        }
      });
    } else {
      this.doSaveImage();
    }
  },

  // 监听 Banner 错误
  onAdError(err) {
    console.log('Banner 广告加载失败:', err);
  },

  // === 业务逻辑 ===

  // === 图片操作 ===
  addImages() {
    const remain = 50 - this.data.imageList.length; 
    if (remain <= 0) return wx.showToast({ title: '最多50张', icon: 'none' });
    
    wx.chooseMedia({
      count: remain > 9 ? 9 : remain,
      mediaType: ['image'],
      success: async (res) => {
        wx.showLoading({ title: '安全检测中...', mask: true });
        const tempFiles = res.tempFiles;
        const safePaths = [];
        
        for (const file of tempFiles) {
          try {
            const isSafe = await Security.checkImage(file.tempFilePath);
            if (isSafe) safePaths.push(file.tempFilePath);
          } catch (err) {
            safePaths.push(file.tempFilePath); // 容错放行
          }
        }
        wx.hideLoading();

        if (safePaths.length > 0) {
          this.setData({
            imageList: [...this.data.imageList, ...safePaths],
            resultImage: '' 
          });
        }
      }
    });
  },

  removeImage(e) {
    const index = e.currentTarget.dataset.index;
    const list = [...this.data.imageList];
    list.splice(index, 1);
    this.setData({ imageList: list, resultImage: '' });
  },

  clearImages() {
    if (this.data.imageList.length === 0) return;
    wx.showModal({
      title: '提示', content: '确定清空所有图片吗？',
      success: (res) => { if (res.confirm) this.setData({ imageList: [], resultImage: '' }); }
    });
  },

  // === 设置操作 ===
  onGapChange(e) {
    this.setData({ gap: e.detail.value, resultImage: '' });
  },

  selectBgColor(e) {
    this.setData({ bgColor: e.currentTarget.dataset.color, resultImage: '' });
  },

  // === 智能计算重叠 ===
  async autoDetectOverlap() {
    if (this.data.imageList.length < 2) return wx.showToast({ title: '至少需要2张图', icon: 'none' });
    
    wx.showLoading({ title: '智能分析中...' });
    try {
        const info1 = await this.getImageInfo(this.data.imageList[0]);
        // 简单估算：假设重叠高度是图片高度的 15%
        const estimatedOverlap = Math.floor(info1.height * 0.15);
        
        this.setData({ gap: -estimatedOverlap });
        wx.hideLoading();
        wx.showToast({ title: '已自动调整，可手动微调', icon: 'none' });
        
    } catch (e) {
        wx.hideLoading();
        this.setData({ gap: -100 }); 
    }
  },

  // === 核心生成逻辑 ===
  async generateLongPic() {
    if (this.data.imageList.length === 0) return wx.showToast({ title: '请先添加图片', icon: 'none' });

    this.setData({ isProcessing: true, loadingText: '准备中...' });

    try {
      // 1. 获取图片信息
      const imageInfos = await Promise.all(
        this.data.imageList.map((path) => this.getImageInfo(path).catch(() => null))
      );
      const validInfos = imageInfos.filter(info => info);
      if (validInfos.length === 0) throw new Error("无有效图片");

      // 2. 画布尺寸计算 (支持高清，宽度上限3000px)
      const MAX_WIDTH = 3000; 
      let targetWidth = Math.max(...validInfos.map(info => info.width));
      if (targetWidth > MAX_WIDTH) targetWidth = MAX_WIDTH;

      const gap = this.data.gap; 
      let totalHeight = 0;

      // 3. 预计算坐标
      const drawList = validInfos.map(info => {
        const scale = targetWidth / info.width;
        const drawHeight = info.height * scale; 
        const y = totalHeight;
        
        totalHeight += drawHeight + gap; 
        
        return { ...info, drawHeight, y };
      });

      totalHeight -= gap; // 减去最后多加的 gap

      if (totalHeight < 100) totalHeight = 100;

      this.setData({ loadingText: '拼接中...' });

      // 4. 创建离屏画布
      const canvas = wx.createOffscreenCanvas({ type: '2d', width: targetWidth, height: Math.ceil(totalHeight) });
      const ctx = canvas.getContext('2d');

      // 5. 填充背景
      ctx.fillStyle = this.data.bgColor;
      ctx.fillRect(0, 0, targetWidth, Math.ceil(totalHeight));

      // 6. 绘制
      for (let i = 0; i < drawList.length; i++) {
        const item = drawList[i];
        if (i % 3 === 0) this.setData({ loadingText: `绘制中 ${i + 1}/${drawList.length}` });
        await this.drawImageToCanvas(canvas, ctx, item.path, 0, item.y, targetWidth, item.drawHeight);
      }

      // 7. 导出
      this.setData({ loadingText: '导出中...' });
      
      // 使用 canvasToTempFilePath (防闪退)
      wx.canvasToTempFilePath({
        canvas: canvas,
        fileType: 'png', // 长图用 png 质量更好
        quality: 0.9,
        success: (res) => {
            // 🌟 核心新增：在 UI 更新之后，加入平滑滚动动画
            this.setData({ resultImage: res.tempFilePath, isProcessing: false }, () => {
                // 等待 150ms 确保 DOM 已经渲染完毕
                setTimeout(() => {
                    wx.pageScrollTo({
                        selector: '#previewSection', // 滚动到预览区域和 Banner 广告区域
                        duration: 400 // 平滑动画 400ms
                    });
                }, 150);
            });
        },
        fail: (err) => {
            console.error(err);
            this.setData({ isProcessing: false });
            wx.showToast({ title: '生成失败', icon: 'none' });
        }
      });

    } catch (err) {
      console.error(err);
      wx.showToast({ title: '拼接失败', icon: 'none' });
      this.setData({ isProcessing: false });
    }
  },

  getImageInfo(path) {
    return new Promise((resolve, reject) => {
      wx.getImageInfo({ src: path, success: (res) => resolve({ ...res, path }), fail: reject });
    });
  },

  drawImageToCanvas(canvas, ctx, path, x, y, width, height) {
    return new Promise((resolve) => {
      const img = canvas.createImage();
      img.onload = () => { ctx.drawImage(img, x, y, width, height); resolve(); };
      img.onerror = () => { resolve(); };
      img.src = path;
    });
  },

  previewResult() {
    if (this.data.resultImage) wx.previewImage({ urls: [this.data.resultImage] });
  },

  // === 5. 点击保存入口 ===
  saveImage() {
    if (!this.data.resultImage) return;
    // 触发额度检查
    this.checkQuotaAndSave();
  },

  // === 6. 真正的保存逻辑 ===
  doSaveImage() {
    wx.saveImageToPhotosAlbum({
      filePath: this.data.resultImage,
      success: () => {
        wx.hideLoading();
        // 跳转成功页
        wx.navigateTo({
            url: `/pages/success/success?path=${encodeURIComponent(this.data.resultImage)}`
        });
      },
      fail: (err) => {
        if (err.errMsg.indexOf('cancel') === -1) {
            wx.showModal({
                title: '提示', content: '需要授权保存图片到相册',
                success: (res) => { if (res.confirm) wx.openSetting(); }
            });
        }
      }
    });
  },

 // === 分享配置 ===
 onShareAppMessage() {
  const imageUrl = this.data.resultImage || '/assets/share-cover.png';
  return {
    title: '截图拼接长图工具，聊天记录无缝衔接！',
    path: '/pages/longpic/longpic',
    imageUrl: imageUrl
  };
},

onShareTimeline() {
  const imageUrl = this.data.resultImage || '/assets/share-cover.png';
  return {
    title: '截图拼接长图工具，聊天记录无缝衔接！',
    query: '',
    imageUrl: imageUrl
  };
}
});
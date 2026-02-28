// pages/test/test.js
// 如果 utils 目录下有 security.js，可以解开下面注释；如果没有，暂时忽略安全检测
// const Security = require('../../utils/security.js');

const SERVER_CONFIG = {
  //API_URL: 'http://119.91.20.125:8080/api/remove-watermark', 
  
  API_URL: 'https://goodgoodstudy-nb.top/api/remove-watermark', 
  API_KEY: 'sk-ucGynTYiVxxw3_nclVtepg' 
};

Page({
  data: {
    imagePath: '',
    resultImage: '',
    isProcessing: false,
    
    // 画布相关
    canvasDisplayWidth: 300,
    canvasDisplayHeight: 400,
    dpr: 1,
    
    // 交互状态
    isMoveMode: false,
    moveX: 0, moveY: 0, moveScale: 1,
    brushSize: 30,
    
    // 历史记录 (撤销用)
    history: []
  },

  // 变量区
  canvas: null, ctx: null,
  maskCanvas: null, maskCtx: null, // 专门画蒙版的离屏 canvas
  originalImage: null,

  onLoad() {
    this.data.dpr = wx.getSystemInfoSync().pixelRatio;
  },

  // 1. 选择图片
  chooseImage() {
    wx.chooseMedia({
      count: 1, mediaType: ['image'], sourceType: ['album', 'camera'],
      success: (res) => {
        const path = res.tempFiles[0].tempFilePath;
        this.loadImage(path);
      }
    });
  },

  loadImage(path) {
    wx.showLoading({ title: '准备中...' });
    this.setData({ resultImage: '', isMoveMode: false, moveScale: 1, moveX: 0, moveY: 0 });

    wx.getImageInfo({
      src: path,
      success: (info) => {
        const sys = wx.getSystemInfoSync();
        const padding = 40;
        const maxWidth = sys.windowWidth - padding;
        const maxHeight = sys.windowHeight * 0.55;
        
        let dw, dh;
        const ratio = info.width / info.height;
        if (ratio > maxWidth / maxHeight) {
          dw = maxWidth; dh = maxWidth / ratio;
        } else {
          dh = maxHeight; dw = maxHeight * ratio;
        }

        this.setData({
          imagePath: path,
          canvasDisplayWidth: dw,
          canvasDisplayHeight: dh,
          imageWidth: info.width,   // 原图真实宽度
          imageHeight: info.height  // 原图真实高度
        }, () => {
          setTimeout(() => { this.initCanvas(path); }, 200);
        });
      },
      fail: () => wx.hideLoading()
    });
  },

  // 2. 初始化画布
  initCanvas(imgPath) {
    const query = wx.createSelectorQuery();
    query.select('#editCanvas').fields({ node: true, size: true }).exec((res) => {
      if (!res[0] || !res[0].node) return;
      
      const canvas = res[0].node;
      const ctx = canvas.getContext('2d');
      const dpr = this.data.dpr;

      canvas.width = this.data.canvasDisplayWidth * dpr;
      canvas.height = this.data.canvasDisplayHeight * dpr;
      ctx.scale(dpr, dpr);

      this.canvas = canvas;
      this.ctx = ctx;

      this.maskCanvas = wx.createOffscreenCanvas({ type: '2d', width: canvas.width, height: canvas.height });
      this.maskCtx = this.maskCanvas.getContext('2d');

      const img = canvas.createImage();
      img.onload = () => {
        this.originalImage = img;
        this.drawLayer();
        wx.hideLoading();
      };
      img.src = imgPath;
    });
  },

  // 3. 绘制层叠 (底图 + 蒙版)
  drawLayer() {
    if (!this.ctx || !this.originalImage) return;
    const w = this.data.canvasDisplayWidth;
    const h = this.data.canvasDisplayHeight;

    this.ctx.clearRect(0, 0, w, h);
    this.ctx.drawImage(this.originalImage, 0, 0, w, h);
    
    this.ctx.save();
    this.ctx.globalAlpha = 0.5; 
    this.ctx.drawImage(this.maskCanvas, 0, 0, w, h);
    this.ctx.restore();
  },

  // 4. 触摸事件
  onTouchStart(e) {
    if (this.data.isMoveMode) return;
    this.isDrawing = true;
    const x = e.touches[0].x;
    const y = e.touches[0].y;
    this.lastX = x; this.lastY = y;
    this.saveHistory();
    this.drawLine(x, y, x, y);
  },

  onTouchMove(e) {
    if (!this.isDrawing) return;
    const x = e.touches[0].x;
    const y = e.touches[0].y;
    this.drawLine(this.lastX, this.lastY, x, y);
    this.lastX = x; this.lastY = y;
  },

  onTouchEnd() {
    this.isDrawing = false;
  },

  drawLine(x1, y1, x2, y2) {
    if (!this.maskCtx) return;
    const dpr = this.data.dpr;
    this.maskCtx.beginPath();
    this.maskCtx.lineCap = 'round';
    this.maskCtx.lineJoin = 'round';
    this.maskCtx.lineWidth = this.data.brushSize * dpr;
    this.maskCtx.strokeStyle = 'rgba(255, 0, 0, 1)'; 
    this.maskCtx.moveTo(x1 * dpr, y1 * dpr);
    this.maskCtx.lineTo(x2 * dpr, y2 * dpr);
    this.maskCtx.stroke();
    this.drawLayer();
  },

  // === 工具栏功能 ===
  toggleMoveMode() { this.setData({ isMoveMode: !this.data.isMoveMode }); },
  onScaleChange(e) { this.data.moveScale = e.detail.scale; },
  onBrushSizeChange(e) { this.setData({ brushSize: e.detail.value }); },
  clearMask() {
    if (!this.maskCtx) return;
    this.maskCtx.clearRect(0, 0, this.maskCanvas.width, this.maskCanvas.height);
    this.drawLayer();
    this.setData({ moveX: 0, moveY: 0, moveScale: 1 });
  },
  saveHistory() {
    if (this.data.history.length > 5) this.data.history.shift();
    const data = this.maskCtx.getImageData(0, 0, this.maskCanvas.width, this.maskCanvas.height);
    this.data.history.push(data);
  },
  undoAction() {
    if (this.data.history.length === 0) return wx.showToast({ title: '没法再撤了', icon: 'none' });
    const lastData = this.data.history.pop();
    this.maskCtx.putImageData(lastData, 0, 0);
    this.drawLayer();
  },

  // === 🚀 核心逻辑适配 v4.2 ===
  async startProcess() {
    if (this.data.isProcessing) return;
    
    this.setData({ isProcessing: true });
    wx.showLoading({ title: 'AI 消除中...', mask: true });

    try {
      const ogW = this.data.imageWidth;
      const ogH = this.data.imageHeight;

      // 1. 获取 Mask 的 Base64
      const maskBase64 = await this.generateMaskForApi(ogW, ogH);
      
      // 2. 获取 原图 的 Base64
      const imageBase64 = await this.readFileToBase64(this.data.imagePath);

      console.log(`准备请求接口: ${SERVER_CONFIG.API_URL}`);

      // 3. 发送纯净 JSON 请求 (不带 config，服务器自适应)
      wx.request({
        url: SERVER_CONFIG.API_URL,
        method: 'POST',
        header: {
          'content-type': 'application/json',
          'x-api-key': SERVER_CONFIG.API_KEY
        },
        data: {
          "image": imageBase64,
          "mask": maskBase64
          // ✂️ config 参数已移除，由后端统一控制
        },
        success: (res) => {
          console.log('服务器响应:', res);
          
          // 1. 成功处理
          if (res.statusCode === 200 && res.data.code === 200) {
            const resultData = res.data.data;
            if (resultData && resultData.image) {
              this.saveBase64Image(resultData.image);
            } else {
              // 失败情况 1：数据格式不对
              console.error('返回数据为空', res);
              wx.showToast({ title: '处理异常', icon: 'none' });
            }
          } 
          // 2. 业务错误 (如 402, 500) - 改为控制台输出 + 简单Toast
          else {
             const errorMsg = res.data.detail || res.data.msg || '未知错误';
             console.error('请求失败:', res.statusCode, errorMsg);
             
             // 🔥 重点：这里不再弹窗，只给个轻提示
             wx.showToast({ 
               title: '处理失败: ' + res.statusCode, 
               icon: 'none',
               duration: 2000
             });
          }
        },
        fail: (err) => {
          // 网络层面的失败（如连不上网）
          console.error('网络请求失败:', err);
          wx.showToast({ title: '网络开小差了', icon: 'none' });
        },
        fail: (err) => {
          wx.showModal({ title: '网络错误', content: '无法连接服务器，请检查防火墙或IP\n' + err.errMsg, showCancel: false });
        },
        complete: () => {
          wx.hideLoading();
          this.setData({ isProcessing: false });
        }
      });

    } catch (err) {
      wx.hideLoading();
      this.setData({ isProcessing: false });
      console.error(err);
      wx.showToast({ title: '图片处理失败', icon: 'none' });
    }
  },

  readFileToBase64(filePath) {
    return new Promise((resolve, reject) => {
      wx.getFileSystemManager().readFile({
        filePath: filePath,
        encoding: 'base64',
        success: res => resolve(res.data),
        fail: reject
      });
    });
  },

  generateMaskForApi(targetW, targetH) {
    return new Promise((resolve, reject) => {
      const w = targetW || this.maskCanvas.width;
      const h = targetH || this.maskCanvas.height;
      
      const tempCanvas = wx.createOffscreenCanvas({ type: '2d', width: w, height: h });
      const ctx = tempCanvas.getContext('2d');

      ctx.clearRect(0, 0, w, h);
      ctx.drawImage(this.maskCanvas, 0, 0, w, h);
      
      // 涂抹区变白
      ctx.globalCompositeOperation = 'source-in';
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, w, h);

      // 背景变黑
      ctx.globalCompositeOperation = 'destination-over';
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, w, h);

      wx.canvasToTempFilePath({
        canvas: tempCanvas,
        destWidth: w,
        destHeight: h,
        fileType: 'jpg', 
        quality: 0.8,
        success: (res) => {
          const fs = wx.getFileSystemManager();
          fs.readFile({
            filePath: res.tempFilePath,
            encoding: 'base64',
            success: (r) => resolve(r.data),
            fail: reject
          });
        },
        fail: reject
      });
    });
  },

  // === 🧹 自动清理缓存函数 ===
  cleanOldFiles() {
    const fs = wx.getFileSystemManager();
    const dir = wx.env.USER_DATA_PATH;

    try {
      // 1. 读取目录下所有文件
      const res = fs.readdirSync(dir);
      
      res.forEach(fileName => {
        // 2. 只删除我们自己生成的 result_ 开头的图片，防止误删其他文件
        if (fileName.startsWith('result_') && (fileName.endsWith('.png') || fileName.endsWith('.jpg'))) {
          const filePath = `${dir}/${fileName}`;
          try {
            fs.unlinkSync(filePath);
            console.log('已清理旧文件:', fileName);
          } catch (e) {
            console.error('清理失败:', fileName, e);
          }
        }
      });
    } catch (e) {
      console.log('读取目录失败或目录为空 (不用担心)', e);
    }
  },

  saveBase64Image(base64Str) {

    // 🧹 第一步：先清理旧文件，释放空间 (关键！)
    this.cleanOldFiles();

    // 1. 清理数据：去掉可能存在的换行符、空格和前缀
    const cleanBase64 = base64Str.replace(/[\r\n]/g, "").replace(/^data:image\/\w+;base64,/, "");

    const fs = wx.getFileSystemManager();
    const fileName = `${wx.env.USER_DATA_PATH}/result_${Date.now()}.png`;

    try {
      // 2. 关键修改：转为 ArrayBuffer 二进制数据写入 (比直接写 Base64 字符串更稳定)
      const buffer = wx.base64ToArrayBuffer(cleanBase64);

      fs.writeFile({
        filePath: fileName,
        data: buffer,
        encoding: 'binary',
        success: () => {
          console.log('图片保存成功:', fileName);
          this.setData({
            resultImage: fileName
          });
          wx.pageScrollTo({
            selector: '.result-card',
            duration: 300
          });
        },
        fail: (err) => {
          console.error('保存文件失败:', err);
          wx.showModal({
            title: '保存失败',
            content: '错误详情: ' + (err.errMsg || JSON.stringify(err)),
            showCancel: false
          });
        }
      });
    } catch (e) {
      console.error('转换Base64异常:', e);
      wx.showToast({ title: '图片数据解析错误', icon: 'none' });
    }
  },
  
  previewResult() {
    wx.previewImage({ urls: [this.data.resultImage] });
  }
});
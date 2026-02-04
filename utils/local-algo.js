// utils/local-algo.js

/**
 * 🚀 高性能本地图像增强算法库 (LUT加速 + USM锐化 + S曲线对比度)
 * 优化参考：腾讯云开发者社区/图形学通用标准
 */

// 安全限制：输入图片长边最大允许像素
const MAX_INPUT_SIZE = 1280; 

// === 1. 预计算 S-Curve 对比度查找表 (性能核心) ===
// 传统的 (val - 128) * factor + 128 计算量大且效果生硬
// S曲线可以让中间调对比度增强，同时保护高光和阴影不溢出
const createContrastLUT = (strength = 1.2) => {
  const lut = new Uint8Array(256);
  for (let i = 0; i < 256; i++) {
    // 归一化到 0-1
    let x = i / 255;
    // S曲线公式 (Sigmoid-like)
    // 这里的 magic numbers 是为了微调曲线弧度，使其接近商业级滤镜
    let y = 0.5 + (Math.atan(strength * (x - 0.5) * Math.PI) / Math.atan(strength * 0.5 * Math.PI)) * 0.5;
    // 还原到 0-255
    lut[i] = Math.min(255, Math.max(0, y * 255));
  }
  return lut;
};

// === 2. 卷积核心算法 (USM 锐化) ===
// 使用权重更平滑的卷积核，减少噪点
const applyKernel = (data, width, height) => {
  const w = width;
  const h = height;
  
  // 创建副本用于读取原像素 (避免修改过程中污染邻域)
  // 注意：小程序 Canvas 2D 的 ImageData.data 是 Uint8ClampedArray
  const src = new Uint8ClampedArray(data); 

  // USM 锐化核 (Unsharp Masking approximation)
  // 相比之前的拉普拉斯核，这个核对噪点更宽容，细节更扎实
  // [ -1, -1, -1 ]
  // [ -1,  9, -1 ]
  // [ -1, -1, -1 ]
  const kernel = [-1, -1, -1, -1, 9, -1, -1, -1, -1];

  // 预生成对比度 LUT (强度 1.5)
  const contrastLUT = createContrastLUT(1.5);

  // 遍历像素 (避开边缘 1px 防止越界)
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      
      let r = 0, g = 0, b = 0;
      const dstIndex = (y * w + x) * 4;

      // 3x3 卷积计算
      // 展开循环以提升 JS 执行效率
      // 0 1 2
      // 3 4 5
      // 6 7 8
      
      // 上一行
      const i0 = ((y - 1) * w + (x - 1)) * 4;
      const i1 = i0 + 4;
      const i2 = i0 + 8;
      // 当前行
      const i3 = (y * w + (x - 1)) * 4;
      const i4 = dstIndex; // 中心点
      const i5 = i3 + 8;
      // 下一行
      const i6 = ((y + 1) * w + (x - 1)) * 4;
      const i7 = i6 + 4;
      const i8 = i6 + 8;

      // 红色通道 R (卷积 + 锐化)
      r += src[i0] * kernel[0] + src[i1] * kernel[1] + src[i2] * kernel[2] +
           src[i3] * kernel[3] + src[i4] * kernel[4] + src[i5] * kernel[5] +
           src[i6] * kernel[6] + src[i7] * kernel[7] + src[i8] * kernel[8];

      // 绿色通道 G
      g += src[i0+1]*kernel[0] + src[i1+1]*kernel[1] + src[i2+1]*kernel[2] +
           src[i3+1]*kernel[3] + src[i4+1]*kernel[4] + src[i5+1]*kernel[5] +
           src[i6+1]*kernel[6] + src[i7+1]*kernel[7] + src[i8+1]*kernel[8];

      // 蓝色通道 B
      b += src[i0+2]*kernel[0] + src[i1+2]*kernel[1] + src[i2+2]*kernel[2] +
           src[i3+2]*kernel[3] + src[i4+2]*kernel[4] + src[i5+2]*kernel[5] +
           src[i6+2]*kernel[6] + src[i7+2]*kernel[7] + src[i8+2]*kernel[8];

      // === 融合步骤：锐化结果 -> 查表增强对比度 ===
      // 1. 限制范围 (Clamp)
      // 2. 查表 (LUT Lookup) 瞬间完成色彩增强
      data[dstIndex]     = contrastLUT[Math.min(255, Math.max(0, r))];
      data[dstIndex + 1] = contrastLUT[Math.min(255, Math.max(0, g))];
      data[dstIndex + 2] = contrastLUT[Math.min(255, Math.max(0, b))];
      // Alpha通道保持不变
    }
  }
};

// === 主处理函数 ===
const process = (canvas, ctx, img, width, height, scale = 2) => {
  return new Promise((resolve, reject) => {
    try {
      // 1. 智能尺寸缩放 (防止内存溢出)
      let drawW = width;
      let drawH = height;
      const maxSide = Math.max(drawW, drawH);
      
      // 如果超过 1280，等比缩小
      if (maxSide > MAX_INPUT_SIZE) {
        const ratio = MAX_INPUT_SIZE / maxSide;
        drawW = Math.floor(drawW * ratio);
        drawH = Math.floor(drawH * ratio);
        console.log(`[LocalAlgo] 优化尺寸: ${width}x${height} -> ${drawW}x${drawH}`);
      }

      // 2. 设置 Canvas
      // 限制输出尺寸不超过 2560px (2倍放大后)，防止微信 Canvas 崩溃
      const targetW = drawW * scale;
      const targetH = drawH * scale;
      
      canvas.width = targetW;
      canvas.height = targetH;

      // 3. 高质量插值绘制 (基础放大)
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, targetW, targetH);

      // 4. 像素级增强 (仅在图片尺寸合理时启用，防止卡死)
      // 限制处理总像素数在 400万以内 (2000x2000)
      if (targetW * targetH <= 4000000) {
        const imageData = ctx.getImageData(0, 0, targetW, targetH);
        
        // 执行核心算法 (USM + S-Curve LUT)
        applyKernel(imageData.data, targetW, targetH);
        
        ctx.putImageData(imageData, 0, 0);
      } else {
        console.warn('[LocalAlgo] 图片过大，仅执行插值放大，跳过像素增强');
      }

      // 5. 导出
      wx.canvasToTempFilePath({
        canvas: canvas,
        fileType: 'jpg',
        quality: 0.95, // 提高一点输出质量
        destWidth: targetW,
        destHeight: targetH,
        success: (res) => resolve(res.tempFilePath),
        fail: (err) => reject(err)
      });

    } catch (e) {
      reject(e);
    }
  });
};

module.exports = {
  process
};
// utils/security.js

// =========================================================================

const USE_LAF_CHANNEL = false; 
// =========================================================================

// 🔥 新方案配置：您的 Laf 云函数地址
const LAF_CHECK_URL = 'https://kvpoib63ld.sealosbja.site/check-content';

// === 本地敏感词库 (公用，第一道防线) ===
const LOCAL_BLOCK_WORDS = [
  '台独', '港独', '藏独', '疆独', '法轮功', '六四', '暴乱', 
  '反共', '纳粹', '希特勒', '恐怖分子', 
  '色情', '淫秽', 'AV', 'av', '女优', '裸聊', '裸照', '露点', 
  '约炮', '私处', '口交', 'SM', 'sm', '迷奸', '强奸', '乱伦', '援交',
  '枪支', '弹药', '炸药', '炸弹', '砍刀', '毒杀',
  '冰毒', '海洛因', '大麻', '摇头丸', '迷药', '发票', '办证', 
  '假币', '窃听器', '针孔摄像头',
  '赌博', '博彩', '六合彩', '网赌', '裸贷',
  '傻逼', 'SB', 'sb', 'cnm', 'CNM', '死全家'
];

/**
 * 文本安全检测 (双通道)
 */
const checkText = (text) => {
  return new Promise(async (resolve) => {
    if (!text) { resolve(true); return; }
    
    // 0. 预处理
    const normalizedText = text.replace(/\s+/g, '').toLowerCase();

    // --- 第一道防线：本地关键词检测 (公用) ---
    const hitWord = LOCAL_BLOCK_WORDS.find(word => normalizedText.includes(word.toLowerCase()));
    if (hitWord) {
      wx.hideLoading();
      wx.showToast({ title: '内容包含敏感词', icon: 'none' });
      console.warn(`本地检测拦截: "${hitWord}"`);
      resolve(false);
      return;
    }

    // --- 第二道防线：分流处理 ---
    if (USE_LAF_CHANNEL) {
      // ✅ 方案 B：走 Laf 新接口 (备选)
      console.log('🚀 [Security] 正在使用 Laf 通道检测文本...');
      wx.request({
        url: LAF_CHECK_URL,
        method: 'POST',
        data: { type: 'text', value: text },
        success: (res) => {
          if (res.data && res.data.errCode === 87014) {
            wx.hideLoading();
            wx.showToast({ title: '文字违规', icon: 'none' });
            resolve(false);
          } else {
            resolve(true);
          }
        },
        fail: () => {
          console.warn('Laf 接口网络异常，默认放行');
          resolve(true);
        }
      });
    } else {
      // 🔄 方案 A：走原来的微信云开发 (当前默认)
      console.log('☁️ [Security] 正在使用原微信云开发检测文本...');
      try {
        const res = await wx.cloud.callFunction({
          name: 'check-content',
          data: { type: 'text', value: text }
        });
        if (res.result && res.result.errCode === 87014) {
          wx.hideLoading();
          wx.showToast({ title: '文字违规', icon: 'none' });
          resolve(false);
        } else {
          resolve(true);
        }
      } catch (err) {
        // 云环境过期或调用失败，默认放行 (保持原有逻辑)
        console.error('原云检测失效(已放行):', err);
        resolve(true); 
      }
    }
  });
};

/**
 * 图片安全检测 (双通道)
 */
const checkImage = (filePath) => {
  return new Promise(async (resolve) => {
    try {
      const fs = wx.getFileSystemManager();
      let checkPath = filePath;

      // 1. 获取原图大小
      let fileInfo = fs.statSync(filePath);

      // 2. 统一压缩逻辑 (为了过检测，两个方案都需要)
      // 如果图片 > 100KB，尝试极致压缩
      if (fileInfo.size > 100 * 1024) {
        try {
          const compressRes = await wx.compressImage({
            src: filePath,
            quality: 1 // 极致压缩
          });
          checkPath = compressRes.tempFilePath;
          fileInfo = fs.statSync(checkPath);
          console.log('图片压缩后大小(KB):', Math.round(fileInfo.size / 1024));
        } catch (e) {
          console.error('压缩失败，使用原图:', e);
        }
      }

      // 3. 大小熔断 (太大的图直接放行，防止接口报错)
      if (fileInfo.size > 200 * 1024) { // 200KB 限制
        console.warn('⚠️ 图片过大，跳过云检测，直接放行');
        resolve(true);
        return;
      }

      // --- 分流处理 ---
      if (USE_LAF_CHANNEL) {
        // ✅ 方案 B：走 Laf 新接口 (备选)
        console.log('🚀 [Security] 正在使用 Laf 通道检测图片...');
        // 注意：Laf 方案通常需要 Base64 字符串
        const base64 = fs.readFileSync(checkPath, 'base64');
        
        wx.request({
          url: LAF_CHECK_URL,
          method: 'POST',
          data: { type: 'image', value: base64 },
          success: (res) => {
            if (res.data && res.data.errCode === 87014) {
              wx.hideLoading();
              wx.showToast({ title: '图片违规', icon: 'none' });
              resolve(false);
            } else {
              resolve(true);
            }
          },
          fail: () => resolve(true)
        });

      } else {
        // 🔄 方案 A：走原来的微信云开发 (当前默认)
        console.log('☁️ [Security] 正在使用原微信云开发检测图片...');
        // 注意：微信云开发直接传 Buffer 效率更高
        const fileBuffer = fs.readFileSync(checkPath);
        
        const res = await wx.cloud.callFunction({
          name: 'check-content',
          data: { type: 'image', value: fileBuffer }
        });

        if (res.result && res.result.errCode === 87014) {
          wx.hideLoading();
          wx.showToast({ title: '图片违规', icon: 'none' });
          resolve(false);
        } else {
          resolve(true);
        }
      }

    } catch (err) {
      console.error('检测流程出错(已放行):', err);
      resolve(true); 
    }
  });
};

module.exports = {
  checkText,
  checkImage
};
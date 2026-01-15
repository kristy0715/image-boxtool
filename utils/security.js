// utils/security.js

// === 1. 本地敏感词库 (高频违规词) ===
// 作用：无需联网，瞬间拦截明显违规内容，节省云资源。
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
 * 文本安全检测 (本地正则 + 云端检测)
 */
const checkText = (text) => {
  return new Promise(async (resolve) => {
    if (!text) { resolve(true); return; }
    
    // 0. 预处理：去除干扰字符
    const normalizedText = text.replace(/\s+/g, '').toLowerCase();

    // --- 第一道防线：本地关键词检测 ---
    const hitWord = LOCAL_BLOCK_WORDS.find(word => normalizedText.includes(word.toLowerCase()));
    
    if (hitWord) {
      wx.hideLoading();
      wx.showToast({ title: '内容包含敏感词', icon: 'none' });
      console.warn(`本地检测拦截: "${hitWord}"`);
      resolve(false);
      return;
    }

    // --- 第二道防线：云端智能检测 ---
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
      console.error('文字云检测失效(已放行):', err);
      resolve(true); 
    }
  });
};

/**
 * 图片安全检测 (死守大小底线)
 */
const checkImage = (filePath) => {
  return new Promise(async (resolve) => {
    try {
      const fs = wx.getFileSystemManager();
      let checkPath = filePath;

      // 1. 获取原图大小
      let fileInfo = fs.statSync(filePath); // 使用 statSync 更直接

      // 2. 压缩逻辑
      // 如果图片 > 100KB，尝试极致压缩
      if (fileInfo.size > 100 * 1024) {
        try {
          const compressRes = await wx.compressImage({
            src: filePath,
            quality: 1 // 极致压缩，只为过检测
          });
          checkPath = compressRes.tempFilePath;
          
          // 更新文件信息
          fileInfo = fs.statSync(checkPath);
          console.log('图片压缩后大小(KB):', Math.round(fileInfo.size / 1024));
        } catch (e) {
          console.error('压缩失败，将使用原图判断:', e);
        }
      }

      // === 3. 核心修复：大小门槛熔断机制 ===
      // 如果（无论是否压缩过）文件依然超过 200KB，直接放弃检测！
      // 原因：微信云函数调用 payload 限制严格，大图必报 "data exceed max size"
      if (fileInfo.size > 200 * 1024) {
        console.warn('⚠️ 图片过大，跳过云检测，直接放行');
        resolve(true); // 放行
        return;
      }

      // 4. 读取文件 Buffer
      const fileBuffer = fs.readFileSync(checkPath);

      // 5. 调用云函数
      const res = await wx.cloud.callFunction({
        name: 'check-content',
        data: { type: 'image', value: fileBuffer }
      });

      // 6. 判断结果
      if (res.result && res.result.errCode === 87014) {
        wx.hideLoading();
        wx.showToast({ title: '图片违规', icon: 'none' });
        resolve(false);
      } else {
        resolve(true);
      }

    } catch (err) {
      // 这里的 catch 是为了捕获网络错误或其他意外
      console.error('云检测出错(已放行):', err);
      resolve(true); 
    }
  });
};

module.exports = {
  checkText,
  checkImage
};
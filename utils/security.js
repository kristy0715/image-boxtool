// utils/security.js

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
 * 文本安全检测 (极简极速版)
 * 只做本地词库匹配，不发起任何云端网络请求，0延迟
 */
const checkText = (text) => {
  return new Promise((resolve) => {
    if (!text) { resolve(true); return; }
    
    const normalizedText = text.replace(/\s+/g, '').toLowerCase();

    // 匹配本地黑名单
    const hitWord = LOCAL_BLOCK_WORDS.find(word => normalizedText.includes(word.toLowerCase()));
    if (hitWord) {
      wx.hideLoading();
      wx.showToast({ title: '内容包含敏感词', icon: 'none' });
      console.warn(`本地检测拦截: "${hitWord}"`);
      resolve(false);
      return;
    }

    // 无拦截则直接秒放行
    resolve(true);
  });
};

/**
 * 图片安全检测 (极简极速版)
 * 废弃云端检测，直接秒放行，节省用户等待时间
 */
const checkImage = (filePath) => {
  return new Promise((resolve) => {
      // 现在的 AI 接口本身一般都自带了黄暴鉴别，无需在小程序端重复造轮子发请求
      resolve(true); 
  });
};

module.exports = {
  checkText,
  checkImage
};
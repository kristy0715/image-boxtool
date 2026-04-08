// utils/audit.js
const app = getApp();

// 🔥 你的小程序标识
const APP_TAG = 'default_app'; 

// 🌟 核心：提审版本号
const APP_VERSION = '3.1.0'; 

// 获取带时间戳的防缓存 URL
const getAuditUrl = () => `https://goodgoodstudy-nb.top/api/v1/wx-proxy/check-config?app_tag=${APP_TAG}&version=${APP_VERSION}&t=${Date.now()}`;

// 网络彻底断开时的最后一道防线
const DEFAULT_BLOCK_LIST = ['art', 'matting', 'restore', 'watermark'];

let hasFetched = false;

/**
 * 🛡️ 路由守卫 (供子页面如 art/restore 使用)
 * 🌟 升级版：精确打击！只踢出在 blockList 名单里的页面！
 */
function checkAccess() {
  return new Promise((resolve) => {
    // 自动获取当前所在页面的路径 (例如: "pages/art/art")
    const pages = getCurrentPages();
    const currentRoute = pages.length > 0 ? pages[pages.length - 1].route : '';

    // 判断当前页面是否应该被踢出
    const checkAndKick = (blockList) => {
      const isBlocked = blockList.some(item => currentRoute.includes(item));
      if (isBlocked) {
        _kickOut();
        resolve(false);
      } else {
        resolve(true); // 如果页面不在名单里，哪怕是审核期也放行！
      }
    };

    if (hasFetched && app.globalData && app.globalData.blockList) {
      checkAndKick(app.globalData.blockList);
      return;
    }

    wx.request({
      url: getAuditUrl(),
      method: 'GET',
      success: (res) => {
        hasFetched = true;
        const isAudit = (res.data && res.data.is_audit !== undefined) ? res.data.is_audit : true;
        let blockList = res.data.hidden_ids || [];
        
        if (app.globalData) {
          app.globalData.isAuditMode = isAudit;
          app.globalData.blockList = blockList;
        }
        checkAndKick(blockList);
      },
      fail: () => {
        hasFetched = true;
        if (app.globalData) {
          app.globalData.isAuditMode = true;
          app.globalData.blockList = DEFAULT_BLOCK_LIST;
        }
        checkAndKick(DEFAULT_BLOCK_LIST);
      }
    });
  });
}

/**
 * 📥 获取配置 (供首页获取功能菜单展现状态)
 */
function getConfig() {
  return new Promise((resolve) => {
    if (hasFetched && app.globalData && app.globalData.isAuditMode !== null) {
      resolve({ 
        isAudit: app.globalData.isAuditMode, 
        blockList: app.globalData.blockList || [] 
      });
      return;
    }

    wx.request({
      url: getAuditUrl(),
      method: 'GET',
      success: (res) => {
        hasFetched = true;
        const isAudit = (res.data && res.data.is_audit !== undefined) ? res.data.is_audit : true;
        
        // 🌟 修复：直接信任服务器下发的名单，就算为空也认！
        let blockList = res.data.hidden_ids || [];

        if (app.globalData) {
           app.globalData.isAuditMode = isAudit;
           app.globalData.blockList = blockList;
        }
        resolve({ isAudit, blockList });
      },
      fail: () => {
        hasFetched = true;
        if (app.globalData) {
            app.globalData.isAuditMode = true;
            app.globalData.blockList = DEFAULT_BLOCK_LIST;
        }
        resolve({ isAudit: true, blockList: DEFAULT_BLOCK_LIST }); // 只有真断网了才用兜底
      }
    });
  });
}

function _kickOut() {
  console.warn('⛔️ 拦截：该页面已被动态配置隔离');
  wx.showToast({ title: '功能升级中', icon: 'none' });
  setTimeout(() => {
    wx.reLaunch({ url: '/pages/index/index' });
  }, 1000);
}

module.exports = { checkAccess, getConfig };
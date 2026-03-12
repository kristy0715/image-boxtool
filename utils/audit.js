// utils/audit.js
const app = getApp();

// 🔥 你的小程序标识 (不同的小程序填不同的名字)
const APP_TAG = 'default_app'; 

// 动态拼接 URL，把 app_tag 传给服务器
const AUDIT_URL = `https://goodgoodstudy-nb.top/api/check-config?app_tag=${APP_TAG}`;

// 兜底的黑名单（当服务器网络异常时，默认隐藏这些最容易被拒的 AI 功能保平安）
const DEFAULT_BLOCK_LIST = ['matting', 'restore', 'art'];

/**
 * 🛡️ 路由守卫 (供子页面使用)
 * 检查当前页面是否允许访问。如果是审核模式，自动踢回首页。
 * @returns {Promise<boolean>} true = 允许访问; false = 已被拦截
 */
function checkAccess() {
  return new Promise((resolve) => {
    // 1. 优先读取全局缓存 (避免重复请求)
    if (app.globalData && typeof app.globalData.isAuditMode === 'boolean') {
      if (app.globalData.isAuditMode) {
        _kickOut();
        resolve(false);
      } else {
        resolve(true);
      }
      return;
    }

    // 2. 缓存无值，请求云端
    wx.request({
      url: AUDIT_URL,
      method: 'GET',
      success: (res) => {
        // 默认为 true (安全模式)，除非明确返回 false
        const isAudit = (res.data && res.data.is_audit !== undefined) ? res.data.is_audit : true;
        
        // 更新全局缓存
        if (app.globalData) app.globalData.isAuditMode = isAudit;

        if (isAudit) {
          _kickOut();
          resolve(false);
        } else {
          resolve(true);
        }
      },
      fail: () => {
        // 接口挂了，为了安全，默认执行拦截
        console.error('配置接口请求失败，执行兜底拦截');
        _kickOut();
        resolve(false);
      }
    });
  });
}

/**
 * 📥 获取配置 (供首页使用)
 * 只拉取状态和黑名单，不执行跳转拦截。
 * @returns {Promise<Object>} { isAudit: boolean, blockList: Array }
 */
function getConfig() {
  return new Promise((resolve) => {
    wx.request({
      url: AUDIT_URL,
      method: 'GET',
      success: (res) => {
        const isAudit = (res.data && res.data.is_audit !== undefined) ? res.data.is_audit : true;
        
        // 2. 获取名单 (兼容 hidden_ids)
        let blockList = [];
        if (res.data && res.data.hidden_ids) {
          blockList = res.data.hidden_ids;
        }

        // 防止因为没配黑名单导致违规功能在审核期暴露
        if (isAudit && blockList.length === 0) {
          blockList = DEFAULT_BLOCK_LIST;
        }

        // 3. 更新全局变量
        if (app.globalData) app.globalData.isAuditMode = isAudit;
        resolve({ isAudit, blockList });
      },
      fail: () => {
        // 接口挂了 -> 默认开启审核模式 + 使用本地死锁名单
        console.error('配置接口请求失败，使用本地兜底审核配置');
        if (app.globalData) app.globalData.isAuditMode = true;
        resolve({ isAudit: true, blockList: DEFAULT_BLOCK_LIST });
      }
    });
  });
}

// 内部函数：踢回首页
function _kickOut() {
  console.warn('⛔️ 拦截：审核模式禁止访问此页面');
  // 加一个微小的延时，让页面有时间完成底层的初始化登记，然后再销毁它
  setTimeout(() => {
    wx.reLaunch({ url: '/pages/index/index' });
  }, 200);
}

module.exports = {
  checkAccess,
  getConfig
};
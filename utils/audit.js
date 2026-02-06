// utils/audit.js

const app = getApp();

// 🔥 统一配置：Laf 云函数地址
const AUDIT_URL = 'https://kvpoib63ld.sealosbja.site/check-config';

/**
 * 🛡️ 路由守卫 (供子页面使用)
 * 检查当前页面是否允许访问。如果是审核模式，自动踢回首页。
 * * @returns {Promise<boolean>} true = 允许访问; false = 已被拦截
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
        console.error('接口请求失败，执行兜底拦截');
        _kickOut();
        resolve(false);
      }
    });
  });
}

/**
 * 📥 获取配置 (供首页使用)
 * 只拉取状态和黑名单，不执行跳转拦截。
 * * @returns {Promise<Object>} { isAudit: boolean, blockList: Array }
 */
function getConfig() {
  return new Promise((resolve, reject) => {
    wx.request({
      url: AUDIT_URL,
      method: 'GET',
      success: (res) => {
        const isAudit = (res.data && res.data.is_audit !== undefined) ? res.data.is_audit : true;
       // 2. 获取名单 (兼容 hidden_ids 和 block_list 两种写法)
       let blockList = [];
       if (res.data) {
         blockList = res.data.block_list || res.data.hidden_ids || [];
       }

       // 防止因为字段名写错导致所有功能都显示出来
       if (isAudit && blockList.length === 0) {
         blockList = DEFAULT_BLOCK_LIST;
       }

       // 3. 更新全局变量
       if (app.globalData) app.globalData.isAuditMode = isAudit;
        resolve({ isAudit, blockList });
      },
      fail: (err) => {
        // 接口挂了 -> 默认开启审核模式 + 使用本地死锁名单
        if (app.globalData) app.globalData.isAuditMode = true;
        resolve({ isAudit: true, blockList: DEFAULT_BLOCK_LIST });
      }
    });
  });
}

// 内部函数：踢回首页
function _kickOut() {
  console.warn('⛔️ 拦截：禁止访问页面');
  // 🔥 修改点：加一个微小的延时
  // 解决 "Cannot read property '__subPageFrameEndTime__' of null" 报错
  // 让页面有时间完成底层的初始化登记，然后再销毁它
  setTimeout(() => {
    wx.reLaunch({ url: '/pages/index/index' });
  }, 200);
}

module.exports = {
  checkAccess,
  getConfig
};
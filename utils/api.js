// utils/api.js
const BASE_URL = 'https://goodgoodstudy-nb.top'; 
const APP_TAG = 'default_app'; 

let loginPromise = null;

const ensureToken = () => {
  const token = wx.getStorageSync('token');
  if (token) return Promise.resolve(token);

  if (loginPromise) return loginPromise;

  loginPromise = new Promise((resolve, reject) => {
    wx.login({
      success: (res) => {
        if (res.code) {
          wx.request({
            url: BASE_URL + '/api/v1/wx-proxy/login',
            method: 'POST',
            data: { code: res.code, app_tag: APP_TAG },
            success: (serverRes) => {
              if (serverRes.data && serverRes.data.code === 200) {
                const newToken = serverRes.data.data.token;
                wx.setStorageSync('token', newToken);
                wx.setStorageSync('user_token', newToken); // 兼容其它页面的提取习惯
                console.log('🔄 拦截器无感登录成功，下发全新通行证');
                resolve(newToken);
              } else {
                reject((serverRes.data && serverRes.data.msg) || '登录接口拒绝');
              }
            },
            fail: (err) => reject(err.errMsg || '网络请求失败'),
            complete: () => { loginPromise = null; }
          });
        } else {
          reject('微信获取code失败');
        }
      },
      fail: (err) => reject(err.errMsg || '微信登录失败')
    });
  });

  return loginPromise;
};

const request = (url, method, data = {}, isRetry = false) => {
  // 登录接口本身不需要 Token
  if (url.includes('/login')) {
     return new Promise((resolve, reject) => {
       wx.request({
         url: BASE_URL + url,
         method: method,
         data: data,
         success: res => resolve(res.data),
         fail: err => reject(err.errMsg || '请求失败')
       });
     });
  }

  return new Promise((resolve, reject) => {
    ensureToken().then(token => {
      wx.request({
        url: BASE_URL + url,
        method: method,
        data: data,
        header: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        success: (res) => {
          // Token 失效，自动无感重试一次
          if (res.statusCode === 401 || (res.data && res.data.code === 401)) {
            wx.removeStorageSync('token'); 
            wx.removeStorageSync('user_token'); 
            
            if (!isRetry) {
              console.warn('⚠️ Token 已失效，拦截器正在进行无感重试...');
              return request(url, method, data, true).then(resolve).catch(reject);
            } else {
              reject('登录状态失效，请重新进入小程序');
            }
            return;
          }

          // 🌟 终极防弹衣：把服务端报的 500、404 等对象，强制拍平成大白话字符串！
          if (res.statusCode !== 200) {
            let errMsg = `服务器开小差了 (${res.statusCode})`;
            if (res.data) {
                if (typeof res.data === 'object') {
                    errMsg = res.data.msg || res.data.detail || JSON.stringify(res.data);
                } else {
                    errMsg = String(res.data);
                }
            }
            console.error('【网络报错拍平拦截】', errMsg);
            reject(errMsg);
            return;
          }

          resolve(res.data);
        },
        fail: (err) => {
          reject(err.errMsg || '网络连接超时，请检查网络');
        }
      });
    }).catch(err => {
      // 保证最终扔给所有界面的绝对是一段文字
      const finalErr = typeof err === 'object' ? (err.msg || err.message || err.errMsg || JSON.stringify(err)) : String(err);
      reject(finalErr);
    });
  });
};

module.exports = {
  APP_TAG,
  get: (url, data) => request(url, 'GET', data),
  post: (url, data) => request(url, 'POST', data)
};
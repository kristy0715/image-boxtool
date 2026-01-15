// cloudfunctions/check-content/index.js
const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

exports.main = async (event, context) => {
  const { type, value } = event
  const wxContext = cloud.getWXContext()

  try {
    // === 场景1：文本检测 (security.msgSecCheck V2) ===
    if (type === 'text') {
      const res = await cloud.openapi.security.msgSecCheck({
        content: value,
        version: 2,
        scene: 2, // 场景值：1-资料，2-评论，3-论坛，4-社交日志
        openid: wxContext.OPENID
      })
      
      // 检查结果：suggest != 'pass' 代表有风险
      if (res.result.suggest !== 'pass') {
        return { errCode: 87014, errMsg: '内容包含违规信息', label: res.result.label }
      }
      return { errCode: 0, errMsg: 'ok' }
    } 
    
    // === 场景2：图片检测 (security.imgSecCheck 同步接口) ===
    else if (type === 'image') {
      // value 是前端传来的 ArrayBuffer，这里需要转为 Buffer
      const res = await cloud.openapi.security.imgSecCheck({
        media: {
          contentType: 'image/png', // 流式传输固定写这个即可
          value: Buffer.from(value) 
        }
      })
      // 只要不报错，就是通过
      return { errCode: 0, errMsg: 'ok' }
    }
  } catch (err) {
    // 微信官方错误码 87014 代表内容违规
    if (err.errCode === 87014) {
      return { errCode: 87014, errMsg: '内容含有违法违规信息' }
    }
    // 其他错误（如参数错误、系统繁忙），返回 500
    return { errCode: 500, errMsg: err.errMsg || '检测接口异常' }
  }
}
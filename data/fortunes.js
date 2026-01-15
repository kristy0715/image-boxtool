// data/fortunes.js

// 1. 签文数据池 (保持不变)
const fortunesData = [
  { type: "上上签", title: "万象更新", text: "昨日之日不可留，今日之日多烦忧。但向前看，万事可期。" },
  { type: "中吉", title: "春风得意", text: "春风若有情，花开满庭芳。适合推进那些搁置已久的计划。" },
  { type: "大吉", title: "时来运转", text: "虽然前路漫漫，但转角处自有光亮。财运正在赶来的路上。" },
  { type: "小吉", title: "静待花开", text: "不急不躁，只需做好手头的事，时间会给你最好的答案。" },
  { type: "平签", title: "韬光养晦", text: "暂时收起锋芒，多读书，多沉淀，此时无声胜有声。" },
  { type: "上吉", title: "贵人相助", text: "留意身边那个总是给你建议的人，他可能是你破局的关键。" },
  { type: "中平", title: "平安喜乐", text: "无病无灾便是福。今晚早点睡，梦里什么都有。" },
  { type: "大吉", title: "心想事成", text: "念念不忘，必有回响。你坚持的事情，即将看到曙光。" },
  { type: "下签", title: "谨言慎行", text: "言多必失，今日宜少说话，多观察，避开不必要的争论。" },
  { type: "上上签", title: "紫气东来", text: "好运爆棚的一天，去买张彩票，或者向喜欢的人表白吧。" },
  { type: "中吉", title: "如鱼得水", text: "工作或学习上将迎来突破，灵感迸发，势如破竹。" },
  { type: "小吉", title: "小确幸", text: "去喝杯奶茶，看场电影，快乐其实很简单。" },
  { type: "平签", title: "顺其自然", text: "命里有时终须有，命里无时莫强求。放平心态。" },
  { type: "上吉", title: "否极泰来", text: "最坏的日子已经过去了，接下来每一天都是上坡路。" },
  { type: "大吉", title: "财源广进", text: "付出的汗水，终将变成口袋里的响声。" }
];

// 2. 免费背景池 (默认状态：毛玻璃/模糊效果)
// 技巧：在 Unsplash 链接后加 &blur=60 可以直接获得模糊图，解决 Canvas 无法模糊的问题
const freeBgImages = [
  "https://images.unsplash.com/photo-1507608616759-54f48f0af0ee?q=80&w=1080&h=1920&fit=crop&blur=60", // 雨林-模糊
  "https://images.unsplash.com/photo-1470252649378-9c29740c9fa8?q=80&w=1080&h=1920&fit=crop&blur=60", // 晨曦-模糊
  "https://images.unsplash.com/photo-1493246507139-91e8fad9978e?q=80&w=1080&h=1920&fit=crop&blur=60", // 山水-模糊
  "https://images.unsplash.com/photo-1558591710-4b4a1ae0f04d?q=80&w=1080&h=1920&fit=crop&blur=60", // 抽象光影
];

// 3. 高级背景池 (广告解锁：高清锐利美图)
const premiumBgImages = [
  "https://images.unsplash.com/photo-1519681393784-d120267933ba?q=80&w=1080&h=1920&fit=crop", // 星空
  "https://images.unsplash.com/photo-1518173946687-a4c8892bbd9f?q=80&w=1080&h=1920&fit=crop", // 樱花
  "https://images.unsplash.com/photo-1465146344425-f00d5f5c8f07?q=80&w=1080&h=1920&fit=crop", // 深海
  "https://images.unsplash.com/photo-1506744038136-46273834b3fb?q=80&w=1080&h=1920&fit=crop", // 瀑布
  "https://images.unsplash.com/photo-1433086966358-54859d0ed716?q=80&w=1080&h=1920&fit=crop"  // 绿地
];

function getDateStr() {
  const date = new Date();
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
}

// 核心逻辑：获取今日运势
function getTodayFortune() {
  const todayStr = getDateStr();
  const cachedData = wx.getStorageSync('daily_fortune_cache_v3'); // 升级缓存Key

  if (cachedData && cachedData.date === todayStr) {
    return cachedData.data;
  }

  // 生成新的
  const fortuneIndex = Math.floor(Math.random() * fortunesData.length);
  const bgIndex = Math.floor(Math.random() * freeBgImages.length);

  const result = {
    ...fortunesData[fortuneIndex],
    bgUrl: freeBgImages[bgIndex], // 默认使用模糊图
    isPremiumBg: false,
    dateStr: `${new Date().getMonth() + 1}月${new Date().getDate()}日`,
    lunarStr: '今日宜 · 分享'
  };

  wx.setStorageSync('daily_fortune_cache_v3', { date: todayStr, data: result });
  return result;
}

// 逻辑：随机获取一张高级背景 (高清图)
function getRandomPremiumBg() {
  const bgIndex = Math.floor(Math.random() * premiumBgImages.length);
  return premiumBgImages[bgIndex];
}

module.exports = { getTodayFortune, getRandomPremiumBg };
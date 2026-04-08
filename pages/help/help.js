Page({
  data: {
    currentTab: 'doubao',
    platformNames: {
      doubao: '豆包', qianwen: '千问', douyin: '抖音', kuaishou: '快手', xiaohongshu: '小红书', bilibili: 'B站', other: '其他'
    },
    currentPlatformName: '豆包',
    
    // 🌟 核心更新：将步骤和图片路径结合
    helpData: {
      doubao: [
        { text: '打开豆包APP，点击底部【AI】或选择一个对话。', image: '/assets/Help/doubao1.jpg' },
        { text: '点击右上角或右下角的【分享】图标。', image: '/assets/Help/doubao2.jpg' },
        { text: '在弹出的底部菜单中，选择【复制链接】。', image: '/assets/Help/doubao3.jpg' },
        { text: '回到本小程序，粘贴链接即可无痕提取图片或视频。', image: '' }
      ],
      qianwen: [
        { text: '打开千问APP，找到需要提取的图片或视频。', image: '/assets/Help/qianwen1.jpg' },
        { text: '长按图片或者视频 -> 选择【分享】。', image: '/assets/Help/qianwen2.jpg' },
        { text: '点击【复制链接】，完成获取。', image: '' },
        { text: '返回本小程序，粘贴链接一键解析。', image: '' }
      ],
      // 其他分类暂时保持纯文字
      douyin: [{ text: '找到视频作品 -> 点击右侧【分享】 -> 点击【复制链接】。' }],
      kuaishou: [{ text: '找到视频作品 -> 点击下方【分享】 -> 点击【复制链接】。' }],
      xiaohongshu: [{ text: '找到笔记作品 -> 点击右上角【分享】 -> 点击【复制链接】。' }],
      bilibili: [{ text: '找到视频作品 -> 点击下方【分享】 -> 点击【复制链接】。' }],
      // 🌟 新增：其他平台的通用教程
      other: [
        { text: '绝大多数APP（如微博、知乎、皮皮虾等）的操作都十分类似：' },
        { text: '找到你想提取的图文或视频，点击页面上的【分享】或【...】图标。' },
        { text: '在弹出的菜单中选择【复制链接】。' },
        { text: '打开本小程序，粘贴链接即可一键解析提取。' }
      ]
    }
  },

  switchTab(e) {
    const tab = e.currentTarget.dataset.tab;
    this.setData({ 
        currentTab: tab,
        currentPlatformName: this.data.platformNames[tab]
    });
  }
});
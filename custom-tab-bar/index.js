Component({
  data: {
    selected: 0,
    list: [
      {
        pagePath: "pages/video/video",
        text: "无水印提取",
        iconPath: "/images/tab_video.png",
        selectedIconPath: "/images/tab_video_active.png"
      },
      {
        pagePath: "pages/index/index",
        text: "修图工具",
        iconPath: "/images/tab_home.png",
        selectedIconPath: "/images/tab_home_active.png"
      }
    ]
  },
  methods: {
    switchTab(e) {
      const data = e.currentTarget.dataset;
      const url = '/' + data.path;
      wx.switchTab({ url });
    }
  }
})
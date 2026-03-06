Component({
  data: {
    show: false,
    msg: ''
  },
  timer: null,
  methods: {
    // 对外暴露的调用方法
    showTip(msg, duration = 2500) {
      if (this.timer) clearTimeout(this.timer);
      this.setData({ msg: msg, show: true });
      
      this.timer = setTimeout(() => {
        this.setData({ show: false });
      }, duration);
    }
  }
})
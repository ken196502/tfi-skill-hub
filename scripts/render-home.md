# 首页发布动画视频

在仓库根目录安装依赖、浏览器和 ffmpeg：

```sh
npm install
npx playwright install chromium
brew install ffmpeg # macOS；其他平台使用对应包管理器
```

先启动 API（另开一个终端，在仓库根目录运行 `npm run api`），然后构建并启动 Next 生产前端：

```sh
cd web
API_PROXY_TARGET=http://localhost:8787 NEXT_PUBLIC_API_BASE_URL=/skillhubservice npm run build
API_PROXY_TARGET=http://localhost:8787 npm run start -- --port 3000
```

仓库根目录运行：

```sh
npm run render:home -- 30
# 或不传秒数，脚本会询问
npm run render:home
npm run render:home -- 40 --hold 3 --fps 30 --url http://localhost:3000 --output output/launch.mp4
```

输出 7680 × 2160，使用 1920 × 540 CSS 布局和 deviceScaleFactor=4（Retina 4×），保留页面原有居中布局。总时长从“即将发布”开始计算，默认第 2 秒双击回车，然后录制当前首页的倒计时、爆炸和揭幕后首页。建议 30 秒；短时长会截断流程。两个独立 tab 渲染奇偶帧，共用同一时间线；JS 时钟和 CSS 动画逐帧推进，不依赖实时录屏速度。倒计时音轨从项目本地 MP3 混入；`--silent` 可输出无声视频。

浏览器开启 GPU 合成加速，macOS 使用 Metal；Retina 截帧关闭 Skia Graphite，避免高分辨率滤镜缺块；本机 Chrome 在该配置下页面栅格化和合成回退到软件渲染，HEVC 视频编码仍使用硬件加速；编码默认 macOS `hevc_videotoolbox`（HEVC，支持本机 7680 宽度）、其他平台 `h264_nvenc`。实际 GPU 状态存于视频旁的 `.gpu.json`，应检查 `featureStatus` 是否为硬件加速。设备或驱动不支持 7680 宽度时编码会报错，可显式加 `--encoder libx264` 使用 CPU 编码。两 tab 是两个并发渲染任务，浏览器自行管理系统线程。

可使用现有 Chrome，跳过浏览器下载：

```sh
CHROME_PATH='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' npm run render:home -- 30
```

渲染临时 JPEG 会使用较多磁盘空间，完成或失败后自动清理。无痕上下文从首页配置接口读取服务器保存的手印布局。输出目录可自定义；不自动提交视频文件。

#!/usr/bin/env node
import { chromium } from 'playwright';
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline/promises';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const help = `用法: npm run render:home -- [秒数] [选项]
  --seconds 30          视频总时长（也可输入位置参数，省略时交互输入）
  --url http://localhost:3000   已运行的 Next 首页地址
  --fps 30              帧率
  --hold 2              双击回车前的停留秒数
  --output output/home.mp4
  --encoder auto        auto | hevc_videotoolbox | h264_videotoolbox | h264_nvenc | libx264
  --silent              不混入首页倒计时音轨
固定输出 7680 × 2160（1920 × 540 CSS 布局，Retina 4×），两个 tab 并行渲染。auto 使用 macOS VideoToolbox / 其他平台 NVENC，失败会报错。`;
if (args.includes('--help')) { console.log(help); process.exit(0); }
const options = {};
for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg === '--silent') options.silent = true;
  else if (arg.startsWith('--')) {
    const key = arg.slice(2);
    if (!['seconds', 'url', 'fps', 'hold', 'output', 'encoder'].includes(key) || !args[i + 1] || args[i + 1].startsWith('--')) throw new Error(`无效参数: ${arg}\n${help}`);
    options[key] = args[++i];
  } else if (!options.seconds) options.seconds = arg;
  else throw new Error(`多余参数: ${arg}`);
}
if (!options.seconds) {
  const input = createInterface({ input: process.stdin, output: process.stdout });
  try { options.seconds = await input.question('渲染多少秒？（建议 30）：'); } finally { input.close(); }
}
const seconds = Number(options.seconds);
const fps = Number(options.fps ?? 30);
const hold = Number(options.hold ?? 2);
if (!Number.isFinite(seconds) || seconds <= 0 || !Number.isFinite(fps) || fps < 1 || fps > 120 || !Number.isFinite(hold) || hold < 0 || hold >= seconds) throw new Error('秒数必须大于 0，fps 在 1–120 之间，hold 必须小于总时长。');
const encoder = options.encoder === undefined || options.encoder === 'auto' ? (process.platform === 'darwin' ? 'hevc_videotoolbox' : 'h264_nvenc') : options.encoder;
if (!['hevc_videotoolbox', 'h264_videotoolbox', 'h264_nvenc', 'libx264'].includes(encoder)) throw new Error('不支持的 encoder');
if (spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' }).status !== 0) throw new Error('请先安装 ffmpeg。');
const url = options.url ?? 'http://localhost:3000';
const output = path.resolve(options.output ?? path.join(root, 'output/home.mp4'));
await mkdir(path.dirname(output), { recursive: true });
const framesDir = await mkdtemp(path.join(tmpdir(), 'home-render-'));
const total = Math.ceil(seconds * fps);
let browser;
let completed = 0;
try {
  const probe = spawnSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', `color=s=7680x2160:r=${fps}`, '-frames:v', '1', '-c:v', encoder, '-pix_fmt', 'yuv420p', path.join(framesDir, 'probe.mp4')], { encoding: 'utf8' });
  if (probe.status !== 0) throw new Error(`编码器 ${encoder} 不支持当前输出或不可用：${probe.stderr}`);
  const chromePath = process.env.CHROME_PATH ?? (existsSync(chromium.executablePath()) ? undefined : process.platform === 'darwin' && existsSync('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome') ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' : undefined);
  browser = await chromium.launch({ headless: true, ...(chromePath ? { executablePath: chromePath } : {}), args: [
    '--enable-gpu', '--ignore-gpu-blocklist', '--enable-gpu-rasterization', '--disable-features=SkiaGraphite',
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows',
    '--autoplay-policy=no-user-gesture-required',
    ...(process.platform === 'darwin' ? ['--use-angle=metal'] : []),
  ] });
  const context = await browser.newContext({ viewport: { width: 1920, height: 540 }, deviceScaleFactor: 4, locale: 'zh-CN', colorScheme: 'dark' });
  const workers = await Promise.all([0, 1].map(async worker => {
    const page = await context.newPage();
    await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
    await page.locator('.launch-root').waitFor();
    await page.addStyleTag({ content: 'nextjs-portal { display: none !important; }' });
    await page.evaluate(async () => {
      await document.fonts.ready;
      await Promise.all([...document.images].map(img => img.complete ? Promise.resolve() : new Promise(resolve => { img.addEventListener('load', resolve, { once: true }); img.addEventListener('error', resolve, { once: true }); })));
    });
    // Freeze JS time; CSS animations are advanced explicitly alongside it.
    await page.clock.install();
    await page.clock.pauseAt(new Date());
    await page.evaluate(() => { window.__renderAnimations = new Map(); });
    return { worker, page };
  }));
  const cdp = await context.newCDPSession(workers[0].page);
  const gpu = await cdp.send('SystemInfo.getInfo').catch(() => null);
  // SystemInfo requires a browser session on Chromium.
  const browserCdp = await browser.newBrowserCDPSession();
  const info = gpu ?? await browserCdp.send('SystemInfo.getInfo');
  await writeFile(`${output}.gpu.json`, JSON.stringify(info.gpu, null, 2));
  console.log(`GPU 信息: ${output}.gpu.json\n双 tab 渲染 ${total} 帧，${seconds}s，${fps}fps，编码器 ${encoder}`);
  if (seconds < hold + 18.75) console.warn('当前时长可能在首页完全揭幕后之前结束；完整展示建议至少 25–30 秒。');
  await Promise.all(workers.map(async ({ worker, page }) => {
    let time = 0;
    let triggered = false;
    const syncAnimations = async t => page.evaluate(t => {
      const seen = window.__renderAnimations;
      for (const animation of document.getAnimations()) {
        if (!seen.has(animation)) {
          seen.set(animation, t);
          animation.pause();
        }
        animation.currentTime = Math.max(0, t - seen.get(animation));
      }
    }, t);
    await syncAnimations(0);
    const advance = async target => {
      // Small increments allow React renders to create successive animation stages.
      while (time < target - 0.0001) {
        const step = Math.min(1000 / fps, target - time);
        await page.clock.runFor(step);
        time += step;
        await syncAnimations(time);
      }
    };
    for (let frame = worker; frame < total; frame += 2) {
      const target = frame * 1000 / fps;
      if (!triggered && target >= hold * 1000) {
        await advance(hold * 1000);
        // Use the same particle seed in both tabs so interleaved frames do not flicker.
        await page.evaluate(() => {
          let seed = 20261028;
          Math.random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
        });
        await page.keyboard.press('Enter');
        await page.keyboard.press('Enter');
        triggered = true;
      }
      await advance(target);
      await page.waitForTimeout(50); // Let the GPU compositor commit the Retina frame.
      await page.screenshot({ path: path.join(framesDir, `${String(frame).padStart(8, '0')}.jpg`), type: 'jpeg', quality: 95, animations: 'allow', caret: 'hide', timeout: 60000 });
      completed++;
      if (completed % Math.max(1, Math.round(fps)) === 0 || completed === total) console.log(`${completed}/${total} 帧 (${Math.round(completed / total * 100)}%)`);
    }
  }));
  await browser.close(); browser = undefined;
  const audio = path.join(root, 'web/public/audio/home-countdown.mp3');
  const ffargs = ['-y', '-framerate', String(fps), '-i', path.join(framesDir, '%08d.jpg')];
  if (!options.silent) ffargs.push('-i', audio, '-filter_complex', `[1:a]volume=0.95,atrim=duration=18.75,adelay=${Math.round(hold * 1000)}:all=1,apad[a]`, '-map', '0:v', '-map', '[a]', '-c:a', 'aac', '-b:a', '192k');
  ffargs.push('-c:v', encoder, ...(encoder === 'libx264' ? ['-preset', 'medium', '-crf', '18'] : ['-b:v', '60M']), ...(encoder === 'hevc_videotoolbox' ? ['-tag:v', 'hvc1'] : []), '-pix_fmt', 'yuv420p', '-t', String(seconds), '-movflags', '+faststart', output);
  const result = spawnSync('ffmpeg', ffargs, { stdio: 'inherit' });
  if (result.status !== 0) throw new Error(`编码失败 (${encoder})。检查 GPU/编码器是否支持 7680 宽度；需要 CPU 时显式加 --encoder libx264。`);
  console.log(`完成: ${output}`);
} finally {
  if (browser) await browser.close();
  await rm(framesDir, { recursive: true, force: true });
}

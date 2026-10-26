# EAR Audio Visualization SDK 接入指南

这套 SDK 将 EAR 的实时分析视图作为独立模块提供。应用可以接入现有 Web Audio 节点，也可以推送 PCM；无需使用 EAR 播放器、VS Code API 或 Essentia。EAR 与这些包复用同一套组件和 DSP 源码。

当前版本为 **0.1.0 实验版本，尚未发布到 npm registry**。下面使用本仓库构建的 tarball 安装。公共 API 在稳定版之前可能调整。

## 选择模块

| 包 | 入口 | 用途 |
| --- | --- | --- |
| `@ear-audio/level-meter` | `createLevelMeter` | L/R、M/S、电平、峰值保持、Clip、Z/A/B/C RMS |
| `@ear-audio/spectrum` | `createSpectrum` | FFT/CQT 实时频谱、平滑、峰值与描述符 |
| `@ear-audio/stereo-field` | `createStereoField` | Lissajous、Polar Sample、Polar Level |
| `@ear-audio/phase-correlation` | `createPhaseCorrelation` | 分频段和宽带相位相关性 |
| `@ear-audio/descriptors` | `createDescriptors` | Centroid、Spread、85% Rolloff |
| `@ear-audio/live-panel` | `createLivePanel` | 组合电平表、频谱、声场和相关性；可调布局和全屏 |
| `@ear-audio/core` | `createPcmSource` | 输入契约、PCM 数据源、FFT 长度租约 |
| `@ear-audio/web-audio` | `createAudioSource` | 将宿主 AudioNode 接入分析支路 |
| `@ear-audio/dsp` | 各计算类/函数 | 不创建 UI 的数值分析；支持按子路径导入 |
| `@ear-audio/theme` | `styles.css` | 默认 EAR 外观；作用域限定在 `.ear-sdk` |

只需要一个表就选择对应包；希望快速接入完整面板则选 `live-panel`。波形、离线 STFT、响度/音高时间轴及 React/Vue 专用包装不在本批包中。

## 1. 构建与安装

在仓库根目录运行：

```sh
npm ci
npm run sdk:pack
```

输出位置：

- `packages/<name>/dist/`：ESM JavaScript、TypeScript 声明、依赖许可证。
- `artifacts/sdk-tarballs/`：10 个可安装的 `.tgz`。

在你自己的项目目录中安装全部本地包：

```sh
npm install --ignore-scripts /absolute/path/to/EAR-Audio-Preview/artifacts/sdk-tarballs/*.tgz
```

本地包之间使用版本号依赖，尚未在 registry 发布，所以本地安装需同时提供依赖 tarball。只安装 Level Meter 的最小包组是 `core`、`dsp`、`level-meter`，以及需要默认外观时的 `theme`。AudioNode 接入再加 `web-audio`。

所有包提供 ESM 和类型声明，不提供 CommonJS `require()` 入口。Vite/Webpack 等构建工具可直接读取 `exports`；无构建工具的浏览器需要 import map，参考[可运行示例](../examples/sdk-native/README.md)。不要直接引用仓库 `src/` 或包内 `dist/types/` 私有路径。

## 2. 从 PCM 创建一个电平表

先给宿主容器明确的宽度和高度。SDK 不改变页面其他元素的布局。

```html
<div id="meter" style="width:160px;height:320px"></div>
```

```ts
import { createPcmSource } from "@ear-audio/core";
import { createLevelMeter } from "@ear-audio/level-meter";
import "@ear-audio/theme/styles.css";

const source = createPcmSource({ sampleRate: 48000, fftSize: 2048 });
const meter = createLevelMeter(document.querySelector<HTMLElement>("#meter")!, {
  source,
  weighting: "Z",
});

// 示例信号；实际项目在每个新音频块到达时 push 一次。
const left = Float32Array.from(
  { length: 2048 },
  (_, i) => 0.25 * Math.sin((2 * Math.PI * 1500 * i) / 48000),
);
source.push({ left }); // 不传 right 时将单声道复制到左右通道。

meter.setOptions({ weighting: "A" });

// 由宿主在组件卸载时调用；不要在创建后立即执行。
function cleanup() {
  meter.dispose();
  source.dispose();
}
```

PCM 是有限数值的非交错 `Float32Array`，通常以 ±1 为数字满幅；左右长度必须一致。采样率在创建时确定。`push()` 复制输入，不转移或 detach 调用方 buffer；窗口保留最近的样本，未填满部分补零。不要为了“刷新 UI”重复推送同一段音频——每次推送都会追加到音频窗口。

扩大 FFT 窗口后，新增加的历史范围需要后续 PCM 填充；启动和切换时不要将未填满窗口的暂态读数当作稳态测量。CQT 使用更长的采样窗口。

## 3. 接入已有 Web Audio 播放链

```ts
import { createAudioSource } from "@ear-audio/web-audio";
import { createSpectrum } from "@ear-audio/spectrum";
import { createLevelMeter } from "@ear-audio/level-meter";
import "@ear-audio/theme/styles.css";

// context 与 node 由你的播放器持有，node 已连接宿主的播放链。
const source = createAudioSource({ context, node, channelCount: 2 });
const spectrum = createSpectrum(spectrumElement, { source });
const meter = createLevelMeter(meterElement, { source });

// 在宿主处理用户点击时恢复音频上下文；SDK 不自动播放或申请权限。
await context.resume();

// 由宿主在组件卸载时调用，不会关闭 context 或移除宿主播放连接。
function cleanup() {
  spectrum.dispose();
  meter.dispose();
  source.dispose();
}
```

`context` 和 `node` 必须属于同一音频上下文。单声道节点请显式传 `channelCount: 1`；默认按两声道采集。适配器支持 `BaseAudioContext`，实时 UI 通常使用 `AudioContext`。

SDK 只创建自己的分析支路，不额外把源节点连接到扬声器，不自动调用 `resume()`/`close()`，也不创建 `MediaElementAudioSourceNode`。媒体元素转节点应由宿主创建一次并复用。麦克风权限、远程媒体 CORS、音量和播放状态均由宿主处理。

一个 source 可以供多个视图使用。FFT 租约取当前需求的最大值，避免一个视图把另一个需要的窗口缩小。同步读取批次可以共享采样快照；这不等于所有独立动画循环只执行一次 FFT。

## 4. 选项与生命周期

创建时将分析设置放入 `settings`；后续调用 `setOptions()` 时直接传设置字段：

```ts
const spectrum = createSpectrum(spectrumElement, {
  source,
  settings: {
    liveSpectrumMode: "fft",
    liveAnalysisFftSize: 2048,
    liveSpectrumPeakHoldSec: 2,
  },
});
spectrum.setOptions({ liveSpectrumMode: "cqt", liveCqtLfRes: 20 });
```

常用设置如下，完整类型由 `@ear-audio/core/settings` 的 `VisualizationSettings` 导出：

| 设置 | 取值 |
| --- | --- |
| `liveSpectrumMode` | `"fft"` / `"cqt"` |
| `liveAnalysisFftSize` | `512` / `1024` / `2048` / `4096` |
| `liveCqtLfRes` | `40` / `20` / `10` |
| `liveSoundFieldMode` | `"polarSample"` / `"polarLevel"` / `"lissajous"` |
| `liveMonitoringMode` | `"lr"` / `"swap"` / `"l"` / `"r"` / `"m"` / `"s"` |
| `liveSpectrumTiltDbPerOct` | `0` / `1.5` / `3` / `4.5` / `6` |
| Level Meter 的 `weighting` | `"Z"` / `"A"` / `"B"` / `"C"`，独立于 `settings` |

所有视图返回相同的生命周期方法：

- `resize()`：手动同步尺寸；默认也使用 ResizeObserver。
- `suspend()` / `resume()`：停止和恢复该视图，其他共享 source 的视图不受影响。
- `reset()`：重建该视图，清除峰值、余辉等显示历史，保留配置。
- `dispose()`：释放该视图资源，重复调用安全；不销毁共享 source。

source 的 `suspend()` 影响所有使用它的视图，并暂停采集；PCM source 在暂停期间不接收新样本。`resume()` 不会替宿主恢复 AudioContext。source 销毁后不要继续推送或重新挂接视图，应创建新 source。

切换权重会重置 RMS 显示的平滑状态，需要等待其收敛；峰值和宿主音频不受权重影响。A/B/C 是加权 RMS **dBFS 估计**，不是校准声压级或认证声级计。

## 5. 多轨快照与只使用计算

Spectrum、Stereo Field、Phase Correlation、Descriptors 和 Live Panel 支持可选的 `comparison` 输入。它包含：

```ts
import type { LiveComparisonInput } from "@ear-audio/spectrum";

const comparison: LiveComparisonInput = {
  snapshot: () => latestSnapshot,
  subscribe(redraw) {
    listeners.add(redraw);
    return () => { listeners.delete(redraw); };
  },
};
```

快照形状为 `{ revision, time, tracks }`；`time` 使用秒。每条轨道包含稳定 `id`、随数据更新的 `revision`、名称/颜色、采样率、左右 PCM、频率 Hz 数组、频谱 dB 数组、分频段/宽带相关值和加权标记。以公开导出的 `LiveTrackFrame` 类型为准。发布完整批次后通知订阅者，不要在绘制期间修改已发布数组。

调用方式为 `createSpectrum(element, { source, comparison })`。仍需提供 source 接口用于状态；不接 Web Audio 时可以使用 PCM source。Level Meter 不支持多轨叠加，Live Panel 中的电平表读取 `source`，其余视图读取 `comparison`。不要把多轨频谱数据误当作电平表的混音输入。

已有分析后端时可以提供快照；需要纯计算时可直接使用 DSP 子路径：

```ts
import { FrequencyWeightedRms } from "@ear-audio/dsp/frequencyWeightedRms";
const rmsLinear = new FrequencyWeightedRms().compute(samples, sampleRate, "A");
const rmsDbFs = rmsLinear > 0 ? 20 * Math.log10(rmsLinear) : -Infinity;
```

## 6. 样式、框架与常见问题

默认样式需要显式引入 `@ear-audio/theme/styles.css`。SDK 在挂载点内创建 `.ear-sdk`，可以通过该类下的 CSS 自定义属性覆盖颜色。宿主仍需提供容器尺寸；不要覆盖内部 canvas 的像素宽高。无 DOM 的服务端可以导入包和类型，但创建视图必须在浏览器挂载阶段执行。

React/Vue 中把容器 ref 交给 create 函数，在 effect/onMounted 中创建，在清理钩子/onBeforeUnmount 中 `dispose()`；source 的生命周期应由实际拥有它的上层管理。不要每次组件 render 都创建新 source。

| 现象 | 检查项 |
| --- | --- |
| 视图空白或高度很小 | 宿主是否有明确高度，是否引入 theme，是否在 DOM 挂载后创建 |
| 音频在播放但分析为空 | context 是否 running、node 是否属于该 context、单双声道配置是否正确 |
| PCM 切换后读数短时变化 | 窗口是否填满、是否刚重置显示状态、是否重复追加同一块数据 |
| 浏览器无法解析包名 | 原生 ESM 需要覆盖公共子路径的 import map，见示例 |
| 本地安装尝试访问 registry | 是否同时提供了依赖 tarball；当前包尚未发布 |
| 比较图在音频末尾显示 No tracks | 快照是否仍含有效音轨，播放位置是否已超出轨道时长 |

## 7. 维护与验收

```sh
npm run ci                   # EAR 原有功能、类型、测试及生产 VSIX
npm run sdk:check            # 打包、隔离安装、无 DOM 导入、严格类型消费
npm run sdk:check:consumers  # 实际 Vite / Webpack 消费构建
```

真实浏览器验收：

```sh
EAR_PLAYWRIGHT_MODULE=/path/to/playwright node bench/sdkAcceptance.mjs
EAR_PLAYWRIGHT_MODULE=/path/to/playwright node bench/sdkAudioAcceptance.mjs
```

这些脚本消费安装后的 tarball，不使用源码别名。修改 SDK 后先重新运行 `npm run sdk:pack`。外部构建测试可能需要下载开发工具；浏览器测试需要 Chrome/Playwright，支持的路径变量以各脚本为准。

[验收记录](../doc/metrics/sdk-modules/acceptance.json)包含实际覆盖范围。合成信号的数值、浏览器和 macOS VS Code 验收不等同于所有浏览器/操作系统或主观听感认证。

源码入口为 `src/sdk/`，视图复用 `src/webview/components/liveMeters/`，打包逻辑为 `scripts/sdk-*.mjs`。新增模块时同步维护 `scripts/sdk-config.mjs`、公共类型、消费示例和 `scripts/test-groups.mjs`。各包保留项目许可与打入依赖的许可证；不要从这些基础包隐式引入 Essentia 或整个扩展运行时。

# CQT 频谱分析器移植实现说明

本文档说明 EAR Audio Preview 如何将 PAZ Analyzer 的 CQT 频谱分析机制移植到项目中，以及我们在此基础上做了哪些适配和改动。PAZ 原始插件的行为分析见 [`paz-spectrum-rendering.md`](paz-spectrum-rendering.md)。

## 1. 分析引擎：Goertzel CQT

我们使用 **Goertzel 算法**实现 CQT 分析，而非小波变换。Goertzel 本质上是单频率点的 DFT，每个 bin 独立计算：

- 每个 bin 使用独立的 Hann 窗口，窗口长度 `N_k = Q_k × fs / f_k`
- 窗口长度受 AnalyserNode 的 `fftSize` 上限约束（`min(fftSize, idealN)`）
- 比完整 DFT 更高效：每个 bin 的计算量为 O(N_k)

相关代码：`src/webview/utils/goertzelCqt.ts` 中的 `goertzelCqt()` 函数。

## 2. 变 Q Band 布局

完全遵循 PAZ 的分段变 Q 模型：

- **250 Hz 以下**：Q 取决于 LF res 设置（40 Hz → Q=3.85, 20 Hz → Q=5.07, 10 Hz → Q=6.97）
- **250 Hz 以上**：Q=10

`buildPazBandLayout(lfResHz, freqMax)` 生成分段几何级数的频率网格和逐 bin 的 Q 值。返回的 `PazBandLayout` 包含：

```typescript
interface PazBandLayout {
  freqs: Float64Array;       // 各 bin 的中心频率
  leftEdges: Float64Array;   // 各 bin 的左边缘（渲染用）
  qPerBin: Float64Array;     // 各 bin 的 Q 值
  numBins: number;           // 总 bin 数
  crossoverIdx: number;      // 第一个高频 bin 的索引（= 低频 bin 数量）
}
```

左边缘计算：
```
leftEdges[0] = 6 Hz（CQT_AXIS_START_HZ 常量，匹配 PAZ）
leftEdges[k] = sqrt(freqs[k-1] × freqs[k])    对于 k ≥ 1
```

## 3. 渲染管线：混合网格 + Akima 插值

**与 PAZ 的关键差异**：PAZ 在所有频率使用直线段连接左边缘，因为其插件窗口较小（约 400–600px 宽），52 个 band 在此分辨率下视觉上足够平滑。我们的 canvas 可以达到 1400px 以上宽度，直接使用 52 个点的直线连接在高频区域会产生明显的多边形锯齿。

**我们的解决方案——混合渲染网格**：

以 250 Hz 为分界（`crossoverIdx`），渲染网格分为两部分：

| 区域 | 渲染点来源 | 点数 | 视觉效果 |
|------|-----------|------|---------|
| 250 Hz 以下 | 原始 leftEdge 频率 | crossoverIdx 个（40 Hz → 8 个） | 保持 PAZ 风格的稀疏梯形 |
| 250 Hz 以上 | 对数等间距密集点 | 300 − crossoverIdx 个（约 292 个） | 平滑曲线 |

总渲染点数固定为 300 个，与 FFT 模式一致，避免切换模式时重新分配弹性数组。

**插值方式**：对全部 CQT 数据（全部 leftEdges + nyquist 延伸点）建立单条 **Modified Akima 样条**，然后在混合网格上求值。由于 Akima 样条精确通过所有源节点，低频区域的渲染点恰好落在源节点位置，返回精确的原始 CQT dB 值——因此低频的梯形特征得以完整保留。高频区域的密集渲染点则得到平滑的插值结果。

相关代码：`src/webview/components/liveMeters/spectralAnalyzerComponent.ts` 中的 `_configureAxis()`（构建网格）和 `_computeCqtFrame()`（Akima 重采样）。

## 4. 频谱倾斜（Spectrum Tilt）

CQT 模式同样支持 spectrum tilt 补偿。在 Akima 重采样之前，对每个 CQT bin 的 dB 值应用倾斜校正：

```typescript
db += spectrumTiltDbAboveFloor(centerFreq, tiltDbPerOct, db, dbFloor, 18);
```

这确保了倾斜计算基于各 bin 的真实中心频率，而非渲染网格的频率。

## 5. Peak Hold 包络线

**与 PAZ 的对应关系**：PAZ 的 Peak Hold 功能追踪频谱曲线到达过的最大值（只升不降，手动 Clear 重置）。

**我们的实现**（仅 CQT 模式）：

- 外侧包络线是主曲线（EMA 平滑后的 RMS）的 **max-hold**
- 每帧更新：`peakHold[i] = max(peakHold[i], emaRms[i])`
- 无衰减，值只会升高
- **重置方式**：
  - 在频谱分析器区域**双击**可手动清除
  - 切换 FFT/CQT 模式时自动重置
  - 更改 LF Resolution 时自动重置

**FFT 模式保留原有行为**：独立的 peak 检测器，带 hold 时间和逐帧衰减，加上 3-tap 空间平滑滤波器。

## 6. 坐标轴

- **CQT 模式 X 轴固定从 6 Hz 开始**（`CQT_AXIS_START_HZ = 6`），匹配 PAZ
- 刻度通过 `cqtSpectrumFreqTicksForSr(sr, axisMin)` 生成，基于 ISO 266 八度中心频率
- 传入 `axisMin = 6`，第一个可见刻度在 8 Hz
- FFT 模式从 10 Hz 开始，不受影响

## 7. 与 PAZ 的差异汇总

| 方面 | PAZ 原始行为 | 我们的实现 | 原因 |
|------|------------|-----------|------|
| 高频渲染 | 直线段连接（52 个 band 在小窗口内足够平滑） | 250 Hz 以上使用 Akima 插值（292 个渲染点） | canvas 宽度远大于 PAZ，直线段在高频产生明显锯齿 |
| 低频渲染 | 直线段连接左边缘 | **相同**：保留原始 leftEdge 点和直线段 | 梯形效应是 PAZ 的标志性视觉特征 |
| 分析引擎 | 小波变换（wavelet） | Goertzel 单频 DFT + Hann 窗口 | 实现更简单，效果等价（均为 per-bin 独立窗口分析） |
| Peak Hold 清除 | 点击 Clear 按钮 | 区域内双击 | 适配无独立控件的 UI 布局 |
| Peak/RMS 模式切换 | 独立的 Peak/RMS 按钮 | 主曲线始终为 EMA-RMS，peak hold 作为包络线 | 简化 UI，一个视图同时展示两种信息 |

## 8. 文件索引

| 文件 | 内容 |
|------|------|
| `src/webview/utils/goertzelCqt.ts` | CQT 核心：`PazBandLayout`、`buildPazBandLayout()`、`goertzelCqt()`、Goertzel 缓存管理 |
| `src/webview/components/liveMeters/spectralAnalyzerComponent.ts` | 渲染组件：混合网格构建、Akima 重采样、弹性追踪、max-hold、双击重置 |
| `src/webview/utils/modifiedAkima.ts` | Modified Akima 插值器（共用于 FFT 和 CQT 渲染管线） |
| `src/webview/utils/liveLogSpectrumAxis.ts` | 坐标轴工具：`cqtSpectrumFreqTicksForSr()`、参数化对数频率转换 |
| `src/config.ts` | `liveCqtLfRes` 设置（40/20/10 Hz） |
| `src/webview/services/analyzeSettingsService.ts` | LF Resolution 属性、事件分发、持久化 |

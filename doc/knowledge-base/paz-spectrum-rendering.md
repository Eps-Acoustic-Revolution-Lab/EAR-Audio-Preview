# PAZ Analyzer 频谱可视化原理逆向分析

本文档基于 Waves PAZ Analyzer 官方 PDF 手册、对实际插件的观察和信号测试，总结了 PAZ 频谱显示的核心机制。本文仅描述 PAZ 原始插件的行为，不涉及移植实现的改动。

## 1. 基于 CQT 的频率分析

PAZ 使用 **常数 Q 变换**（Constant-Q Transform）而非固定大小的 FFT。每个频率 band 拥有独立的分析窗口长度：

```
N_k = Q_k × fs / f_k
```

其中 `Q_k` 是 band `k` 的品质因数，`fs` 是采样率，`f_k` 是中心频率。这与小波变换技术一致——低频使用长窗口（高频率分辨率），高频使用短窗口（高时间分辨率）。

PAZ 手册原文：*"Optimal time and frequency resolution in the PAZ is achieved by using wavelet techniques (as opposed to FFTs). This lets each band update independently as fast as possible for its frequency resolution."*

## 2. 变 Q 心理声学模型

PAZ 不使用统一的 Q 值，而是采用**分段变 Q** 模型，模拟人耳的频率分辨特性：

| 区域 | Q 值 | Bins/octave | 特征 |
|------|------|-------------|------|
| 250 Hz 以下 | 3.85 – 6.97（取决于 LF res） | 3.0 – 5.2 | 稀疏、宽 band |
| 250 Hz 以上 | ≈ 10.0 | ≈ 7.3 | 密集、窄 band |

分界点在 **250 Hz**。PAZ 手册原文：*"Above 250Hz, the 'engineering Q' (or width) of the bands are about 10.0, which as mentioned, are similar to the resolution of our hearing."*

Q 与 bins/octave 的换算公式：`binsPerOct = ln(2) / ln(1 + 1/Q)`

## 3. LF Resolution 控制

PAZ 的 "LF resolution" 控制同时决定三个参数：

| LF Res | 最低分析频率 | 低频 Q | 总 band 数（sr=44100） |
|--------|------------|--------|----------------------|
| 40 Hz  | 40 Hz      | 3.85   | 52（手册标称）          |
| 20 Hz  | 20 Hz      | 5.07   | ~64                  |
| 10 Hz  | 10 Hz      | 6.97   | 最多 68（手册标称）      |

PAZ 手册原文：*"The default setting of the LF resolution control is 40Hz, which gives 52 bands, and most closely approximates the constant-Q critical frequency bands of the ear."*

*"For more detailed or technical uses, LF resolution below 250Hz can be set to 20 or 10Hz, providing up to 68 bands."*

LF Res 降低 → 250 Hz 以下的 band 数增加，但低频区域的 Q 相应提高以覆盖更宽的低频范围。

Band 数计算公式：
```
binsLow  = round( ln(250 / lfRes) / ln(1 + 1/Q_low) )
binsHigh = round( ln(nyquist / 250) / ln(1 + 1/10) )
total    = binsLow + binsHigh
```

## 4. 左边缘渲染模型

这是 PAZ 频谱显示最核心的视觉机制。PAZ **不在每个 band 的中心频率处画点**，而是在其**左边缘**处画点：

```
leftEdge[0] = 6 Hz                              （轴起点，第一个 band 向左延伸）
leftEdge[k] = sqrt( center[k-1] × center[k] )    对于 k ≥ 1
```

左边缘是相邻两个 band 中心频率的**几何平均值**——在对数频率轴上的自然 band 边界。

曲线构造方式：
1. 每个 band `k` 在 `(leftEdge[k], dB[k])` 处画一个点
2. 所有点之间用**直线段** `lineTo` 连接（无样条、无平滑）
3. **第一个 band** 向左延伸到轴起点（6 Hz）——即 `leftEdge[0] = 6`
4. **最后一个 band** 向右延伸到 nyquist——在 `(nyquist, dB[N-1])` 处添加额外点

### 验证证据

- **20 Hz 正弦波，10 Hz LF res 模式**：峰值出现在 ~18 Hz 而非 20 Hz。吻合计算值 `sqrt(17.07 × 19.51) ≈ 18.3 Hz`（中心频率 19.51 Hz 的 band 的左边缘）
- **视觉确认**：在低频区域 band 较宽时，可以清楚看到完全的直线连接，无任何曲线插值
- **12 Hz 正弦波，10 Hz LF res 模式**：能量在 18 Hz 和 6 Hz 两个绘制点之间交替跳动（最近两个 band 的左边缘），确认了左边缘绘制机制

## 5. 梯形效应

低频区域由于变 Q 模型产生较少且较宽的 band。使用左边缘渲染时：

- 第一个 band 从 6 Hz 跨越到 `leftEdge[1]`，形成宽平段
- 相邻低频 band 之间形成**梯形**（flat-top trapezoid）形状
- 在 10 Hz LF res 模式下最明显，第一个 band 覆盖 6–14 Hz 的区间

高频区域有大量密集 band（约 7.3 个/octave），直线连接在视觉上融合为平滑曲线。这种低频梯形、高频平滑的双重特征是 PAZ 的标志性视觉风格。

## 6. 能量跳动现象

当输入信号的频率恰好落在两个 CQT band 中心之间时，Goertzel 分析会在相邻的两个 band 之间逐帧交替分配能量。观测到的行为：

- **12 Hz 输入，10 Hz LF res 模式**：能量在中心频率约 10 Hz 和 12 Hz 的两个 band 之间来回跳动，使显示的峰值在其左边缘（约 6 Hz 和 11 Hz）之间交替
- 这是任何基于离散 band 的 CQT/小波分析的固有特性，不是 bug 而是特征性 artifact

## 7. 坐标轴约定

- **X 轴始终从 6 Hz 开始**，无论 LF resolution 设置为何值
- 第一个可见刻度在 **8 Hz**（ISO 266 标准频率）
- 刻度位置遵循 ISO 266 八度中心频率：8, 16, 31, 62, 125, 250, 500, 1k, 2k, 4k, 8k, 16k
- 轴末端延伸至 **nyquist**（sr/2），并在该频率处标注刻度

## 8. Peak/RMS 模式与 Peak Hold

PAZ 手册原文：*"The Peak/RMS and Response controls let you choose the type of analysis and response time. In the Peak mode, peaks in each frequency band are displayed and the Response simply controls the release time. Under the RMS mode, the energy is averaged over time, and the Response value controls the length of this time."*

- **Peak 模式**：每个 band 显示峰值，Response 控制释放时间
- **RMS 模式**：每个 band 显示时间平均能量，Response 控制平均时长

**Peak Hold 功能**（独立于 Peak/RMS 模式）：

PAZ 手册原文：*"The maximum graphed value of the Frequency analysis can be shown by clicking the Show/Hide button. Maximum values are tracked even when in Hide mode. To reset the max graph line, click the Clear button."*

- Peak Hold 追踪频谱曲线**到达过的最大值**，是纯 max-hold 包络
- 只升不降，直到用户点击 Clear 按钮重置
- 即使在隐藏状态下也持续追踪
- 这条包络线独立于主曲线（Peak 或 RMS），显示历史最大值

## 9. 其他特性

- **权重曲线**：支持 dBA、dBB、dBC 和 Unweighted 四种频率加权
- **粉红噪声基准**：PAZ 手册指出，由于 band 近似常 Q，粉红噪声输入在无加权时会显示为平坦频谱
- **Freeze 功能**：点击 Freeze 按钮可冻结当前频谱图形
- **导航与缩放**：Option-拖动可缩放频率窗口，Reset Zoom 按钮恢复全范围显示

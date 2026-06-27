# 在 VS Code 里逆向复刻 PAZ Analyzer 的频谱曲线

> English version: [Reverse-Engineering PAZ Analyzer's Spectrum Curve in VS Code](cqt-spectrum-analyzer.en.md)

> 本文随 CQT 频谱分析器功能一并发布，记录我们如何把 Waves PAZ Analyzer 的频谱曲线搬进 EAR Audio Preview 的实时分析面板。

如果你用过 **Waves PAZ Analyzer**，大概会记得它的频谱长什么样：低频段是几块敦实的"梯形"台阶，高频段是一条顺滑流动的曲线，和多数音频软件里那种锯齿状、抖个不停的 FFT 柱状图完全不是一个气质。

这一版我们把这种画法搬进了 VS Code。PAZ 是闭源商业插件，没有公开的渲染源码，我们只能靠官方手册、信号测试和肉眼观察，把它的工作原理拼回来。下面讲这条曲线背后的原理，以及我们移植时做的取舍。

---

## 一、为什么普通 FFT 频谱"不好看"

标准 FFT 把整个频率范围切成**等宽**的频点。问题在于：人耳感知频率是**对数**的——20→40 Hz 和 10k→20k Hz 在听感上都是"一个八度",但在等宽 FFT 里,前者只占可怜的几个频点,后者却堆了几千个。

结果就是:画在对数频率轴上时,低频频点太少显得粗糙,高频频点太密又拥挤抖动。那种毛刺感来自固定时频分辨率和人耳对数感知之间的错配。

PAZ 的解法是换一套变换。

---

## 二、CQT:让每个频段"按需分配"分辨率

PAZ 用的是 **常数 Q 变换(Constant-Q Transform, CQT)**,而非固定大小的 FFT。手册里写得很直白:

> *"Optimal time and frequency resolution in the PAZ is achieved by using wavelet techniques (as opposed to FFTs)."*

CQT 的核心是让每个频段拥有**独立的分析窗口长度**:

```
N_k = Q_k × fs / f_k
```

其中 `f_k` 是该频段中心频率,`Q_k` 是品质因数,`fs` 是采样率。低频用长窗口换取高频率分辨率,高频用短窗口换取高时间分辨率——这正是小波分析的思路,也恰好贴合人耳的工作方式。

### 变 Q 的心理声学模型

PAZ 还有一点是它**不用统一的 Q 值**,而是分段处理,以 **250 Hz** 为界:

| 区域 | Q 值 | 每八度频段数 | 特征 |
|------|------|-------------|------|
| 250 Hz 以下 | 3.85 – 6.97 | 3.0 – 5.2 | 稀疏、宽频段 |
| 250 Hz 以上 | ≈ 10.0 | ≈ 7.3 | 密集、窄频段 |

手册原文:

> *"Above 250Hz, the 'engineering Q' (or width) of the bands are about 10.0, which... are similar to the resolution of our hearing."*

低频段稀疏而宽,高频段密集而窄——PAZ 低频呈"台阶感"、高频却很顺滑,就是从这里来的。

### LF Resolution 一个旋钮控制三件事

PAZ 面板上那个 "LF resolution" 旋钮(40 / 20 / 10 Hz)实际同时决定了三个参数:**最低分析频率、低频段的 Q 值、以及总频段数**。

| LF Res | 最低频率 | 低频 Q | 总频段数 (44.1k) |
|--------|---------|--------|-----------------|
| 40 Hz | 40 Hz | 3.85 | 52(手册标称) |
| 20 Hz | 20 Hz | 5.07 | ~64 |
| 10 Hz | 10 Hz | 6.97 | 最多 68 |

> *"The default setting of the LF resolution control is 40Hz, which gives 52 bands, and most closely approximates the constant-Q critical frequency bands of the ear."*

---

## 三、最难破解的一环:左边缘渲染

光知道频段布局还不够。我们一开始按"每个频段画在它的中心频率上"来渲染,结果总和 PAZ 对不上——峰值的横坐标系统性地偏右。

转机来自一次信号测试。我们往 PAZ 喂一个 **20 Hz 纯正弦波**(10 Hz LF res 模式),发现峰值落在 **~18 Hz** 而非 20 Hz。这个偏移是条线索。

算一下:在该模式下,20 Hz 附近那个频段的中心频率约 19.51 Hz,它和前一个频段(中心 17.07 Hz)的**几何平均**正好是 `sqrt(17.07 × 19.51) ≈ 18.3 Hz`。

谜底在这里:**PAZ 不在频段中心画点,而是在频段的左边缘画点。**

```
leftEdge[0] = 6 Hz                            (轴起点,第一个频段向左延伸)
leftEdge[k] = sqrt(center[k-1] × center[k])    对于 k ≥ 1
```

左边缘就是相邻两个中心频率的几何平均——在对数频率轴上,这正是两个频段之间天然的分界线。曲线的构造方式也极其朴素:

1. 每个频段在 `(leftEdge[k], dB[k])` 处画一个点
2. 点与点之间用**直线段**连接(没有样条,没有平滑)
3. 第一个频段向左拉到 6 Hz,最后一个频段向右拉到 nyquist

### 旁证

- **12 Hz 输入,10 Hz 模式**:能量在 18 Hz 和 6 Hz 两个绘制点之间来回跳动——正好是最近两个频段的左边缘
- **肉眼确认**:低频段足够宽时,能清楚看到完全的直线连接,没有任何曲线插值

这也解释了**梯形效应**:低频段又少又宽,左边缘渲染加直线连接,自然形成一个个平顶梯形;高频段又多又密(约 7.3 个/八度),密集的直线段在视觉上融合成顺滑曲线。低频梯形、高频顺滑,PAZ 的外观就是这套机制的结果。

---

## 四、我们的移植做了哪些改动

理解原理之后是工程落地。我们没有照搬,在几个地方做了改动。完整的实现细节见 [`cqt-spectrum-implementation.md`](../knowledge-base/cqt-spectrum-implementation.md),这里讲关键决策。

### 1. 用 Goertzel 算法替代小波

我们用 **Goertzel 算法**实现 CQT。Goertzel 本质是"单频点 DFT",每个频段独立计算,配上各自的 Hann 窗——效果与小波等价(都是 per-bin 独立窗口分析),但实现简单得多,且每个频段只需 O(N_k) 的计算量。窗口长度受 `AnalyserNode` 的 `fftSize` 上限约束。

### 2. 混合渲染网格:我们和 PAZ 差别最大的地方

PAZ 的插件窗口很小(约 400–600px 宽),52 个频段在这个分辨率下直线连接看起来已经够顺。但 VS Code 里我们的 canvas 能轻松超过 1400px——同样 52 个点直接连直线,高频立刻露出明显的多边形锯齿。

解法是**混合网格**,仍以 250 Hz 为界:

| 区域 | 渲染点来源 | 视觉效果 |
|------|-----------|---------|
| 250 Hz 以下 | 原始左边缘频率(稀疏) | 保留 PAZ 的梯形特征 |
| 250 Hz 以上 | 对数等间距密集点(约 292 个) | 平滑曲线 |

我们对全部 CQT 数据建立一条 **Modified Akima 样条**,然后在这张混合网格上求值。关键在于:Akima 样条精确通过所有源节点,所以低频那些渲染点恰好落在原始左边缘上,拿到的是**未经插值的原始值**,梯形台阶得以原样保留;高频的密集点才走插值变顺。**只对 250 Hz 以上做插值**,是这次移植里最重要的一处取舍。

### 3. Peak Hold 改为双击重置

PAZ 的 Peak Hold 是一条"只升不降"的历史最大值包络,靠点击 Clear 按钮重置。我们的 UI 没有独立控件的位置,于是把它做成了**在频谱区域双击即可清除**;切换 FFT/CQT 模式或更改 LF Resolution 时也会自动重置。

### 与 PAZ 的差异一览

| 方面 | PAZ 原始 | 我们的实现 | 原因 |
|------|---------|-----------|------|
| 高频渲染 | 直线段(小窗口够顺) | Akima 插值(292 点) | canvas 远宽于 PAZ |
| 低频渲染 | 直线段连左边缘 | **相同** | 梯形是标志性特征 |
| 分析引擎 | 小波变换 | Goertzel 单频 DFT | 实现更简单,效果等价 |
| Peak Hold 清除 | Clear 按钮 | 区域内双击 | 适配 UI 布局 |

---

## 五、结果

现在打开 EAR Audio Preview 的 **Live Spec** 面板,切到 CQT 模式:X 轴固定从 6 Hz 起步,低频是梯形台阶,高频是顺滑曲线,外侧还有一条记录历史峰值的 Peak Hold 包络。

整个功能在浏览器沙箱里用 Web Audio + Canvas2D 实现,没有原生依赖。

想深入了解:

- **PAZ 原理逆向分析**:[`paz-spectrum-rendering.md`](../knowledge-base/paz-spectrum-rendering.md) ——严格按原始插件行为叙述
- **移植实现说明**:[`cqt-spectrum-implementation.md`](../knowledge-base/cqt-spectrum-implementation.md) ——我们做的每一处改动与代码索引

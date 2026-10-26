<div align="center">
  <img src="ear_audio.png" alt="EAR Audio Preview" width="110" />
  <h1>EAR Audio Preview</h1>
  <p>
    <strong>属于 IDE 的严肃监听系统</strong><br>
    <em>内嵌于 VS Code 与 Cursor 的专业级音频分析、对比与监听工作站。</em>
  </p>

  <p>
    <a href="https://marketplace.visualstudio.com/items?itemName=Eps-Acoustic-Revolution-Lab.ear-audio-preview">
      <img src="https://img.shields.io/visual-studio-marketplace/v/Eps-Acoustic-Revolution-Lab.ear-audio-preview?style=for-the-badge&label=VS%20Marketplace&color=007ACC&logo=visual-studio-code" alt="Marketplace" />
    </a>
    <a href="https://github.com/Eps-Acoustic-Revolution-Lab/EAR-Audio-Preview/actions/workflows/ci.yml">
      <img src="https://img.shields.io/github/actions/workflow/status/Eps-Acoustic-Revolution-Lab/EAR-Audio-Preview/ci.yml?style=for-the-badge&label=CI%20Build&logo=github" alt="CI" />
    </a>
    <a href="https://github.com/Eps-Acoustic-Revolution-Lab/EAR-Audio-Preview/blob/main/LICENSE">
      <img src="https://img.shields.io/badge/License-MIT-F59E0B.svg?style=for-the-badge" alt="License: MIT" />
    </a>
  </p>

  <p>
    <a href="https://github.com/Eps-Acoustic-Revolution-Lab/EAR-Audio-Preview/blob/main/README.md">English</a> · <strong>简体中文</strong>
  </p>

  <p>
    <a href="#-快速开始">快速开始</a> ·
    <a href="#-核心工作流">核心工作流</a> ·
    <a href="#whats-new">版本更新 (v0.6)</a> ·
    <a href="#-为什么选择-ear">核心优势</a> ·
    <a href="#-底层技术架构">底层架构</a> ·
    <a href="#-开发与贡献">开发指南</a>
  </p>
</div>

<br>

> [!TIP]
> **工程技术手记：** 我们在 [技术博客](https://github.com/Eps-Acoustic-Revolution-Lab/EAR-Audio-Preview/blob/main/doc/blog/) 中记录了 EAR 背后的核心算法与架构设计，涵盖从 CQT 频谱设计到 WebGL2 各向异性时频谱图渲染的完整实现。

---

## ⚡ 简介

**告别在代码编辑器与笨重的外部音频软件之间来回切换。**

**EAR Audio Preview** 将波形、GPU 加速时频谱图、实时立体声场分析与响度测量直接引入你的代码编辑器。无论是评估生成式音频模型输出、质检语音数据集、试听音效素材，还是审阅混音版本，所有操作均可在一个工作区内一站式完成。

<div align="center">

`🎛️ 8 轨并行对比` · `🌈 FFT + CQT 双模频谱` · `📊 LUFS / LRA / 真峰值` · `🎧 AutoEq 耳机校准` · `🔒 音频本地处理`

</div>

---

## 🚀 快速开始

### 1. 安装插件

在编辑器扩展面板搜索 **`EAR Audio Preview`**，或通过终端直接安装：

```sh
code --install-extension Eps-Acoustic-Revolution-Lab.ear-audio-preview
```

### 2. 一分钟上手

1. **打开与试听：** 点击音频文件并按 Space 即可播放。（若被其他编辑器接管，右键选择 **使用…重新打开编辑器 → Audio Preview**）。
2. **深度检视：** 在 **STFT** 视图中拖拽即可框选放大局部细节；切换至 **Live Spec** 观察实时频谱与立体声场；或打开 **Loudness** 计算响度、基频（$F_0$）与起音点（Onsets）时间线。
3. **多版本对比：** 在资源管理器中选中 **2–8 个单声道/立体声文件**，右键选择 **EAR Audio: Compare Files**。点击播放即可同步试听，配合单轨静音/聚焦控件快速进行试听与细节比对。

> [!NOTE]
> **快捷交互与支持格式：** 首次打开时内置引导将带你熟悉控件（随时点击工具栏的 `?` 重新查看）。在对比视图中，Ctrl/Cmd+拖拽 缩放时间轴，Shift+拖拽 缩放频率轴，**双击**重置视图；右键点击图表可切换布局与全屏模式。
> **支持格式：** `WAV` · `MP3` · `AAC` · `OGG` · `FLAC` · `OPUS` · `M4A` · `SPH`
> 📖 [完整用户指南](https://github.com/Eps-Acoustic-Revolution-Lab/EAR-Audio-Preview/blob/main/doc/usage.md) · ⚙️ [配置项参考](https://github.com/Eps-Acoustic-Revolution-Lab/EAR-Audio-Preview/blob/main/doc/configuration.md)

---

## 🎬 核心工作流

### 模型输出、参考音频与混音版本同屏比对

在共享时间轴上加载最多 **8 条音频轨**。单次拖拽即可在所有时频谱图上同步锁定同一时频区域；切换至 **Live Spec** 即可叠加显示不同颜色编码的频谱、立体声场与相位相关性曲线。支持将参考轨静音，同时在分析视图中保留其频谱曲线，方便边听边比对。

![](https://github.com/Eps-Acoustic-Revolution-Lab/EAR-Audio-Preview/raw/main/assets/demos/multi-audio-workflow.gif)

### 动态范围核查与监听环境校准

从常规回放无缝切换至 LUFS、真峰值（True Peak）、基频与起音点分析。打开独立的 **Monitor（监听）** 面板，单独审听 `L / R / M / S` 通道或特定频段；加载 **AutoEq 耳机频响校准配置**并随时切换 Bypass，还原平直的参考级听感。

![](https://github.com/Eps-Acoustic-Revolution-Lab/EAR-Audio-Preview/raw/main/assets/demos/single-audio-workflow.gif)

### 覆盖全流程的声学检视工具

| 工作区模块 | 核心功能 |
| --- | --- |
| **🌊 STFT** | 检视高精度波形与 GPU 时频谱图；自由切换 `Linear`、`Log`、`Mel` 或 `Hybrid` 频率轴；支持多轨联动缩放与全屏细节排查。 |
| **📈 Live Spec** | 播放时实时观测 FFT/CQT 频谱、峰值保持（Peak Hold）、三种立体声矢量视图及分频段相位相关性。 |
| **🔊 Loudness** | 测量 `LUFS`、`LRA`、`PLR` 与 `True Peak`；在共享时间轴上同步追踪响度、基频（$F_0$）与起音点（Onsets）曲线。 |
| **✂️ Edit & Export** | 框选局部区域并导出为单文件或混音 WAV；支持自定义采样率、通道模式及 `PCM 8/16/24-bit` 或 `Float32` 位深。 |
| **🎧 Monitor** | 支持 `L / R / M / S` 通道监听、五频段独立 Solo 监听，内置 AutoEq 耳机校准配置检索与导入。 |

---

<a id="whats-new"></a>

<!-- release:zh:start -->
## v0.6.0 更新

- **先对齐，再比较。** 估计两份同采样率音频的整数样本固定延迟，确认后应用到播放、分析和导出的会话副本，也可随时重置；支持可选极性补偿，原文件保持不变。

- **八文件同步比较。** 共用播放时钟，联动缩放波形与 STFT；每轨可独立聚焦、静音或停用分析。
- **实时频谱叠加。** 同屏比对 FFT/CQT 频谱、立体声场与相位相关度，并查看 LUFS、基频和起音点曲线。
- **电平匹配与差异测量。** 按共用选区匹配 RMS，只衰减、不放大，避免削波；以聚焦文件为参考，测量同采样率音频的残差 RMS 与峰值。
- **选区混音导出。** 选择片段、采样率、声道及 PCM 或 float32 WAV 编码，导出多轨混音，也可将已启用的耳机 EQ 写入导出文件。
- **界面与体积优化。** 统一控件与监听入口，提供悬浮 Monitor、耳机频响校准和交互式比较引导，安装包缩小 48%。
- **诊断更可靠。** 修正声场图的方向、信号极性与边界插值；损坏的耳机 EQ 配置会安全回退，不再中断音频预览。

技术博客：[音频对齐为什么会失败](https://github.com/Eps-Acoustic-Revolution-Lab/EAR-Audio-Preview/blob/main/doc/blog/audio-alignment-dsp.md)（[English](https://github.com/Eps-Acoustic-Revolution-Lab/EAR-Audio-Preview/blob/main/doc/blog/audio-alignment-dsp.en.md)）。
<!-- release:zh:end -->

📜 [查看完整版本历史 (CHANGELOG)](https://github.com/Eps-Acoustic-Revolution-Lab/EAR-Audio-Preview/blob/main/CHANGELOG.md)

---

## 🏆 为什么选择 EAR？

在同时审阅多个音频结果时，你需要直观对比每个音源的频谱、声场与响度。以下是 EAR 与同类扩展的能力对比：

| 核心特性 | **EAR Audio Preview** | [audio-preview](https://marketplace.visualstudio.com/items?itemName=sukumo28.wav-preview) | [Audio Player](https://marketplace.visualstudio.com/items?itemName=huachao.audio-player) | [audioscope](https://marketplace.visualstudio.com/items?itemName=YongsooIm.audioscope) |
| :--- | :---: | :---: | :---: | :---: |
| **多轨同步对比与联动** | **✅ 8 轨并行 · 联动缩放** | 仅单文件 | 仅列表播放 | 双文件 A/B · 联动 |
| **时频谱图引擎 (STFT)** | **✅ WebGL2 · 各向异性渲染** | ✅ 基础视图 | 仅波形 | ✅ 基础视图 |
| **实时动态频谱仪** | **✅ FFT + CQT · 多轨叠加** | — | — | — |
| **立体声场与相位诊断**<br><sub>3 模式矢量示波器、分频段相位相关性、L/R 与 M/S 电平</sub> | **✅ 完整套件** | — | — | — |
| **响度测量与声学特征时间线**<br><sub>LUFS / LRA / 真峰值、基频 ($F_0$) 与起音点 (Onsets) 提取</sub> | **✅ 完整套件** | — | — | 仅 LUFS / 峰值 |
| **采样级对齐与客观残差度量**<br><sub>整数延迟与极性补偿、共享区 RMS 响度匹配、残差分析</sub> | **✅ 完整套件** | — | — | ✅ |
| **母带级监听路由矩阵**<br><sub>`L / R / M / S` 通道独立监听与五频段分频 Solo</sub> | **✅ 完整矩阵** | — | — | — |
| **参考级耳机频响校准**<br><sub>内置 AutoEq 数据库检索、配置导入与一键 Bypass</sub> | **✅ 内置 AutoEq** | — | — | — |
| **选区裁剪与多轨混音导出**<br><sub>支持重采样、多规格位深、混音并轨及写入耳机 EQ</sub> | **✅ 单轨 / 混音 / 写入 EQ** | 仅单文件选区 | — | 仅单文件选区 |
| **分析与监听链路分离**<br><sub>频段 Solo 或加载校准 EQ 不会影响底层客观测量数据</sub> | **✅ 独立 DSP 链路** | — | — | — |

✅ 支持 · — 对比版本未提供。详见 [版本与特性说明](https://github.com/Eps-Acoustic-Revolution-Lab/EAR-Audio-Preview/blob/main/doc/comparison.zh-CN.md#能力对比)。

> **分析与监听分离：** 你可以将参考轨静音，同时在分析视图中保留其频谱曲线。通道切换、频段 Solo 和耳机 EQ 仅改变你的*听感*，不会影响底层的客观*测量数据*。应用“对齐（Align）”后，所有测量将自动基于对齐后的会话副本进行计算。

### ⚡ 极速检视，轻量安装

| 🚀 **STFT 吞吐量提升 21–28%** | ⚡ **预览加载提速 6.5 倍** | 📦 **安装包体积缩减 48%** |
| --- | --- | --- |
| 3 秒音频片段仅需约 **25 ms** 即可完成分析（对比 `audio-preview`）。 | 60 秒立体声文件仅需约 **0.25 s** 即可打开。 | 经打包优化后，下载体积由 **6.66 MiB 降至 3.44 MiB**。 |

📊 [查看与 6 款音频插件的详细横评](https://github.com/Eps-Acoustic-Revolution-Lab/EAR-Audio-Preview/blob/main/doc/comparison.zh-CN.md) · 🔬 [性能基准测试详情](https://github.com/Eps-Acoustic-Revolution-Lab/EAR-Audio-Preview/blob/main/doc/comparison.zh-CN.md#仓库原有-benchmark-全套结果)

---

## 🔧 底层技术架构

### 🎨 保持瞬态清晰度的各向异性时频谱图

传统的双线性插值会模糊音频的起音瞬态。EAR 的 **WebGL2 渲染器**对时间轴与频率轴采取差异化处理：在时间轴上保持锐利边界以还原瞬态起音（Attacks），在频率轴上进行平滑插值以呈现细腻的谐波线条。配合自适应 FFT 窗长与多种窗函数，兼顾短促瞬态与持续基音的清晰度。

👉 [深入了解渲染器原理](https://github.com/Eps-Acoustic-Revolution-Lab/EAR-Audio-Preview/blob/main/doc/blog/anisotropic-spectrogram-rendering.md)

### 🎹 契合人耳听感的频谱视图

支持在标准 FFT 分析与受 PAZ 启发的 **恒定 Q 变换（CQT）** 视图之间随时切换。CQT 模式提供变 Q 值频带、高解析度低频细节、可调频谱倾斜度（Tilt）与峰值保持，配合可配置的释放时间（Release），让动态音频的频谱变化清晰易读。

👉 [CQT 频谱仪设计手记](https://github.com/Eps-Acoustic-Revolution-Lab/EAR-Audio-Preview/blob/main/doc/blog/cqt-spectrum-analyzer.md)

### ⏱️ 可逆的音频对齐

点击 **Align** 即可自动估算两个同采样率文件之间的整数样本延迟，确认后一键应用。算法默认在文件前 60 秒内搜索 `±2 秒` 的偏移窗口；应用后，回放、图表与导出均统一调用偏移后的会话副本，点击 **Reset** 即可随时还原至解码后的原始音频。（注：分数样本延迟与时钟漂移不在本功能处理范围内）。

👉 [对齐算法设计、边界案例与消融实验](https://github.com/Eps-Acoustic-Revolution-Lab/EAR-Audio-Preview/blob/main/doc/blog/audio-alignment-dsp.md) · [使用说明](https://github.com/Eps-Acoustic-Revolution-Lab/EAR-Audio-Preview/blob/main/doc/audio-alignment.md)

### 🧭 共享时间轴与原采样率独立分析

在多轨对比模式下，每条轨道均按其原始解码采样率独立计算，随后映射至统一的共享时间与频率坐标系，并采用统一的绝对 `dBFS` 色阶以便直接比对 STFT 能量。**音源分析**、**实时监听**与**音频导出**采用三条相互独立的 DSP 链路，调整监听方式不会影响客观测量结果；而应用时间对齐则会同步更新三条链路的会话音频源。

📚 [文档索引](https://github.com/Eps-Acoustic-Revolution-Lab/EAR-Audio-Preview/blob/main/doc/README.md) · 🏗️ [系统架构](https://github.com/Eps-Acoustic-Revolution-Lab/EAR-Audio-Preview/blob/main/doc/knowledge-base/architecture.md) · 🎛️ [音频 DSP 链路](https://github.com/Eps-Acoustic-Revolution-Lab/EAR-Audio-Preview/blob/main/doc/knowledge-base/audio-dsp-chain.md) · 🔊 [实时监听实现](https://github.com/Eps-Acoustic-Revolution-Lab/EAR-Audio-Preview/blob/main/doc/live-monitoring.md)

---

## 🗺️ 演进路线图

### ✅ 已发布

- [x] **基础架构：** 多格式 WASM 解码、WebGL2 时频谱图、立体声电平表与相位相关性。
- [x] **v0.2：** 四面板工作区、响度 / $F_0$ / 起音点时间线以及选区导出。
- [x] **v0.3：** 支持全局与工作区级别的 AutoEq 耳机频响校准。
- [x] **v0.4：** 类 PAZ 的 CQT 频谱分析与峰值保持。
- [x] **v0.5：** 各向异性时频谱图渲染与交互式新手引导。
- [x] **v0.6：** 8 文件并行播放、STFT 联动缩放与实时多源分析叠加。
- [x] **v0.6：** 独立文件响度/特征提取、共享监听控制面板与选区混音导出。
- [x] **v0.6：** 共享区域 RMS 匹配、同采样率残差测量及 WAV 导出可选写入耳机 EQ。
- [x] **v0.6：** 贯穿回放、分析与导出的可逆同采样率整数延迟对齐（含可选极性补偿）。

### 🔭 规划中

以下功能已在开发分支实现初版，尚未包含在 v0.6.0 中；发布前保留未勾选状态。具体范围和验证边界见[开发记录](doc/roadmap-development.md)。

- [ ] 色度（Chroma）时间线及基于 `PredominantPitchMelodia` 的主旋律估计，非多音符转录（[支持范围](doc/harmonic-analysis.md)）。
- [ ] 可选实时特征读数：频谱质心 Spectral Centroid、频谱展宽和 85% 滚降频率。
- [ ] `A / B / C` 计权 RMS 的 dBFS 估计（[测量边界](doc/frequency-weighted-rms.md)）。
- [ ] 基于 Web Worker 的长音频文件后台 $F_0$ 与起音点分析。

📋 [版本历史](https://github.com/Eps-Acoustic-Revolution-Lab/EAR-Audio-Preview/blob/main/CHANGELOG.md) · 💡 [提交功能建议](https://github.com/Eps-Acoustic-Revolution-Lab/EAR-Audio-Preview/issues)

---

## 💻 开发与贡献

仅需几步即可在本地启动开发环境：

```sh
git clone https://github.com/Eps-Acoustic-Revolution-Lab/EAR-Audio-Preview.git
cd EAR-Audio-Preview
npm ci
npm run webpack-dev
```

按 F5 启动扩展开发宿主（Extension Development Host），随后打开任意音频文件即可调试。运行 `npm run ci` 可执行代码检查与打包验证，运行 `npm run vsix` 可构建可安装的 `.vsix` 扩展包。

欢迎提交 Bug 报告、功能建议与 Pull Request！

🐛 [提交 Issue](https://github.com/Eps-Acoustic-Revolution-Lab/EAR-Audio-Preview/issues) · 🛠️ [开发与发布指南](https://github.com/Eps-Acoustic-Revolution-Lab/EAR-Audio-Preview/blob/main/doc/development.md) · 🧪 [测试架构与指南](https://github.com/Eps-Acoustic-Revolution-Lab/EAR-Audio-Preview/blob/main/doc/testing.md)

---

## 📜 致谢与开源协议

由 **[Eps Acoustic Revolution Lab](https://github.com/Eps-Acoustic-Revolution-Lab)** 研发，基于 [sukumo28/vscode-audio-preview](https://github.com/sukumo28/vscode-audio-preview) 的 Custom Editor 架构演进构建。

**核心依赖库：**

`Ooura` · `Essentia.js` · `twgl.js` · `wasm-audio-decoders` · `loudness-worklet` · `ebur128-wasm`

本项目基于 **[MIT 协议](https://github.com/Eps-Acoustic-Revolution-Lab/EAR-Audio-Preview/blob/main/LICENSE)** 开源，第三方依赖库各自保留其原有开源协议。

## 独立可视化模块 SDK

在自己的应用中接入实时频谱、声场、相关性、电平表和描述符，见 [SDK 接入指南](packages/README.md)。指南包含模块选择、本地安装、生命周期、样式与可运行示例；实验包尚未发布到 npm。

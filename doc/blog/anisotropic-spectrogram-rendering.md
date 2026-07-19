# 频谱图的各向异性渲染:为什么你的 STFT 不是马赛克就是油画

> English version: [Anisotropic Spectrogram Rendering: Why Your STFT Is Either Mosaic or Oil Painting](anisotropic-spectrogram-rendering.en.md)

> 本文随频谱渲染重构一并发布,记录 EAR Audio Preview 的 STFT 频谱图如何从"放大即马赛克、平滑即油画"的两难里走出来——以及专业频谱工具(iZotope RX、Adobe Audition)的做法给我们的启发。

如果你在 EAR Audio Preview 里把频谱图放大看过谐波,你可能会经历过两个版本:

- **第一版**:放大后是一片片方块,谐波列像被切碎的砖墙——原始的 STFT 数据格子直接暴露;
- **第二版**:方块消失了,但整幅图变成了涂抹状的"油画",鼓点边缘糊成一团,瞬态的锋利感全没了。

这两个版本对应的是纹理缩放的两种经典过滤方式:**NEAREST(最近邻)** 和 **双线性插值**。它们各自的问题恰好相反,看起来无解。但问题本身问错了——频谱图不是一张普通图片,它的两个轴有着完全不同的物理含义。

---

## 一、非此即彼的困境

频谱图的原始数据是一张二维网格:横轴时间(每个 STFT 帧一列),纵轴频率(每个 FFT bin 一行),像素值是幅度(dB)。把它画到屏幕上,几乎必然要缩放——网格尺寸由分析参数决定(帧数 = 时长 / hop,行数 = windowSize / 2),和屏幕像素没有理由对齐。

缩放就要采样,采样就要选过滤方式:

**NEAREST**:每个屏幕像素取最近的网格点。优点是诚实、锐利;缺点是放大后网格结构直接可见——"马赛克"。谐波列被量化成一格格色块,相邻帧之间的连续性完全看不出来。

**双线性**:每个屏幕像素取周围四个网格点的加权平均。优点是平滑、无方块;缺点是它在**两个轴上同时平均**——时间轴上的瞬态边缘被横向抹开,频率轴上的细节被纵向糊化。整幅图呈现出一种"印象派油画"质感:好看,但读不出东西。Bart Wronski 对双线性过滤的[频域分析](https://bartwronski.com/2020/04/14/bilinear-texture-filtering-artifacts-alternatives-and-frequency-domain-analysis/)很好地说明了这种模糊的本质:它是一种低通滤波,会系统性地抹掉高频结构。

用户的反馈精准地命中了这个两难:"像素化"→ 改双线性 →"涂抹状,不利于阅读"。

---

## 二、频谱图是各向异性的数据

破局的关键在于:**频谱图的两个轴,数据特性完全不同。**

- **谐波成分**(人声、弦乐、管乐)在频谱图上呈现为水平的脊线。同一个音符的基频和谐波在**频率方向**上是连续分布的——相邻 FFT bin 之间是真实的平滑过渡(窗函数的主瓣泄漏本身就让能量在频域连续扩散)。沿频率轴插值,是在还原信号本来的面貌。
- **瞬态成分**(鼓、拨弦、爆破音)在频谱图上呈现为竖直的宽带条纹。它们的特征恰恰是**时间方向上的突变**——这一帧和下一帧之间可以是天壤之别。沿时间轴插值,是在凭空捏造一个不存在的渐变。

这不是我们的主观审美,而是有文献支撑的信号性质。Fitzgerald 在谐波/打击声分离(Harmonic/Percussive Source Separation)的工作中正是利用了[频谱的各向异性平滑性](https://www.researchgate.net/publication/273396583_HarmonicPercussive_Sound_Separation_Based_on_Anisotropic_Smoothness_of_Spectrograms):**谐波成分沿频率轴平滑,打击成分沿时间轴平滑**——两个方向的平滑性差异大到可以反过来做声源分离。

既然数据本身是各向异性的,渲染为什么要用各向同性的过滤?

**答案呼之欲出:频率轴用线性插值,时间轴用最近邻。**

- 频率轴插值 → 谐波连成连续竖脊,没有 bin 之间的断裂;
- 时间轴最近邻 → 瞬态边缘保持刀切般锐利,鼓点就是鼓点,不会拖出渐变的尾巴。

---

## 三、专业工具是怎么做的

调研专业频谱工具,得到的答案与上面的推导互相印证:

**iZotope RX** 的文档在渲染设置里明确写着:

> *"HIGH-QUALITY RENDERING: Accurate max-bilinear interpolation of the Spectrogram (recommended). Turning this control off makes Spectrogram rendering slightly faster, but you'll lose some quality."*
>
> (高质量渲染:对频谱图使用精确的 max-bilinear 插值[推荐]。关闭此项渲染会略快,但会损失质量。)

——见 [RX 6 文档](https://downloads.izotope.com/docs/rx6/07-spectrogram-waveform-display/index.html)、[RX 11 手册](https://www.native-instruments.com/fileadmin/ni_media/downloads/manuals/RX/RX_11_Manual_English.pdf)。注意 "**max**-bilinear" 里的 max:RX 不是纯双线性,它在下采样时取邻域**最大值**而非均值——这样细弱的谐波脊线在缩小显示时不会被平均成背景噪声(均值会把一条亮线摊淡),保持"脊线永远跳出来"的标志性观感。iZotope 自己的[频谱图科普文章](https://www.izotope.com/community/blog/understanding-spectrograms)也强调 RX 的显示"能同时呈现比一般频谱图更高的时间和频率分辨率"。

**Adobe Audition** 的频谱显示([官方教程](https://www.adobe.com/learn/audition/web/audition-spectral-frequency-display-cc))把"清晰度"押在**分辨率设置**上:右键频率标尺可以调 Spectral Resolution,社区里所有["频谱显示发糊/发块"](https://community.adobe.com/questions-544/spectral-frequency-display-blocky-160552)的投诉,解法都是调分辨率,而不是换插值方式。

两条线索合起来:专业工具既不迷信单一插值,也不接受"分辨率就这么多"——它们在**采样策略**和**数据密度**两个层面同时投入。

---

## 四、实现:shader 里的手动各向异性采样

WebGL2 的硬件纹理过滤不能按轴分别设置(各向异性过滤扩展针对的是 mipmap 斜采样,解决不了"横竖不同"的需求),而且 R32F 浮点纹理的线性过滤还依赖 `OES_texture_float_linear` 扩展——不是所有实现都有。

所以我们绕开硬件过滤,在 fragment shader 里用 `texelFetch` 手动采样,精确控制每个轴的行为:

```glsl
// 时间轴:最近邻 —— 瞬态边缘保持锐利,不做水平方向的任何平均
int frame = clamp(int(v_uv.x * u_texelCount.y), 0, int(u_texelCount.y) - 1);

// 频率轴:相邻两个 bin 线性插值 —— 谐波连成连续脊线
float binF = freqUV * (u_texelCount.x - 1.0);
int b0 = int(binF);
int b1 = min(b0 + 1, int(u_texelCount.x) - 1);
float a0 = texelFetch(u_spectrogram, ivec2(b0, frame), 0).r;
float a1 = texelFetch(u_spectrogram, ivec2(b1, frame), 0).r;
float amp = mix(a0, a1, binF - float(b0));
```

`texelFetch` 是 WebGL2 核心规格,直接按整数坐标取纹理单元,不经过任何过滤——把过滤决策完全收回到 shader 代码里。成本:每像素 2 次纹理取值 + 1 次 mix,相对频率轴映射(对数/mel/hybrid 的坐标变换)可以忽略。

附带收益:不再依赖 `OES_texture_float_linear`,兼容性反而比上一版纯双线性更好。

与频率轴的各种非线性映射(linear / log 分段 / mel / 本版新增的 hybrid 线性-对数混合)完全正交:映射算出 `freqUV`,各向异性采样只管"拿到正确的幅度值"。

---

## 五、色彩映射:从彩虹到 magma

可读性的另一半是 colormap。我们之前用的是 jet 风格的六色彩虹:黑 → 蓝 → 紫 → 红 → 黄 → 青白。彩虹色带的问题在科学可视化领域早有定论:

- **亮度非单调**:红和黄都很亮,紫和蓝都很暗,等响度的能量落在不同色相上,眼睛要在"颜色翻译"上消耗带宽;
- **色相边界制造假边缘**:谐波脊线穿过红→黄的分界时,视觉上出现一条并不存在的"线";
- **细弱结构淹没**:低电平细节藏在蓝紫暗区里,看不清楚。

换成了 **magma 风格的感知均匀色带**(取自项目 design-demo 的设计规范,作为数据编码,双主题下一致):

```
0.00 → (  4,  3, 12)   近黑的深紫底
0.25 → ( 59, 15, 79)
0.50 → (131, 38, 129)
0.70 → (209, 78, 114)
0.88 → (249, 142,  9)   琥珀
1.00 → (252, 255, 164)   亮米黄
```

亮度单调递增,背景是安静的深色,能量脊线从底色里"长出来"。shader 和 Canvas2D 后备路径共用同一组色标,两条渲染路径的观感完全一致。

---

## 六、"像素点"的两层含义

用户说"局部放大还是像素点不足"——这句话其实包含两层问题,显示层的修复解决不了数据层的稀疏:

**第一层:显示像素(backing store)**。webview 的 canvas 被 CSS 拉伸到容器大小,如果 backing store 只有 1× 设计尺寸,在 Retina(dpr=2)上等于用一半分辨率显示——放大时拉伸的是画布像素,不是数据。修复:backing store 按 **dpr × 1.5 超采样**(上限 3×,宽度封顶 8192、高度 4096,避开 GPU 纹理上限),坐标轴文字按画布高度等比缩放。

**第二层:数据像素(STFT 列密度)**。放大一个局部时,渲染管线会对新的时间范围重新做 STFT——纹理的**列数** = 时长 / hop。如果 hop 不变,放大 10 倍就是把 1/10 的列数撑满屏幕,时间轴上每个数据列占几十个屏幕像素,时间轴最近邻采样忠实地把这种稀疏显示成宽块——这不是渲染的锅,是**分析密度**的锅。修复:hop 启发式除以 `(renderWidth × SPECTROGRAM_COLUMN_DENSITY)`,即**把时间列密度提高到原来的 2 倍**(受 hop ≥ windowSize/32 的下限保护)。放大时每秒携带的数据列随之翻倍,谐波的颤音、瞬态的精细结构才有数据可读。代价是分析耗时约增加 60–100%(列数翻倍),对离线分析面板完全可接受——highRes 模式本来就是靠同样的"换密度"思路工作的。

两层合起来:数据层保证放大时有足够多的列,显示层保证每一列被渲染到足够多的物理像素,各向异性采样保证列与列之间在频率方向平滑、在时间方向锐利。

---

## 七、小结

| 症状 | 根因 | 修复 |
|---|---|---|
| 放大马赛克 | NEAREST 两轴都不插值 + 分辨率不足 | 频率轴插值 + 超采样 + 列密度翻倍 |
| 平滑后涂抹成油画 | 双线性在时间轴上平均了瞬态 | 时间轴最近邻(各向异性采样) |
| 谐波脊线不醒目 | 彩虹 colormap 亮度非单调 | magma 感知均匀色带 |
| Retina 发糊 | backing store 1× | dpr × 1.5 超采样,8192×4096 封顶 |

频谱图不是照片。照片的两个轴同质,该用同一种过滤;频谱图的两个轴承载着物理含义截然不同的数据——一个该平滑,一个该锐利。让渲染策略服从数据结构,而不是在 NEAREST 和双线性之间二选一,这就是 RX 和 Audition 们"看起来就是更清楚"的秘密。

---

## 参考

- [iZotope RX 6 — Understanding the Spectrogram/Waveform Display](https://downloads.izotope.com/docs/rx6/07-spectrogram-waveform-display/index.html)
- [iZotope RX 11 Manual(PDF)](https://www.native-instruments.com/fileadmin/ni_media/downloads/manuals/RX/RX_11_Manual_English.pdf)
- [iZotope — Understanding Spectrograms](https://www.izotope.com/community/blog/understanding-spectrograms)
- [Adobe Audition — Use the Spectral Frequency Display](https://www.adobe.com/learn/audition/web/audition-spectral-frequency-display-cc)
- [Adobe Community — Spectral Frequency Display Blocky](https://community.adobe.com/questions-544/spectral-frequency-display-blocky-160552)
- [Fitzgerald — Harmonic/Percussive Sound Separation Based on Anisotropic Smoothness of Spectrograms](https://www.researchgate.net/publication/273396583_HarmonicPercussive_Sound_Separation_Based_on_Anisotropic_Smoothness_of_Spectrograms)
- [Bart Wronski — Bilinear Texture Filtering: Artifacts, Alternatives and Frequency Domain Analysis](https://bartwronski.com/2020/04/14/bilinear-texture-filtering-artifacts-alternatives-and-frequency-domain-analysis/)
- [Wikipedia — Spectrogram](https://en.wikipedia.org/wiki/Spectrogram)

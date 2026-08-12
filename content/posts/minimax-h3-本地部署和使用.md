---
slug: "minimax-h3-本地部署和使用"
title: "在 Mac 上用 h3.c 部署和使用 MiniMax-H3"
date: "2026-08-12"
category: "科技笔记"
aiParticipation: 3
excerpt: "从零下载、编译并使用 antirez 的 h3.c，在 Apple Silicon Mac 上运行 MiniMax-H3 官方模型并生成带声音视频。"
---
# 从零开始：在 Mac 上用 h3.c 运行 MiniMax-H3

这是一份面向第一次接触 h3.c 和 MiniMax-H3 的教程。目标是从一台刚准备好的
Apple Silicon Mac 出发，下载并编译 antirez 开发的 h3.c、取得官方模型权重，
完成部署检查，并用原生命令行生成第一条带声音的视频。

文末另有一节迁移经验，说明已经持有 ComfyUI 或其他重打包权重时容易遇到的坑。
如果是全新安装，直接按正文使用官方 checkpoint，不需要转换权重或修改源码。

相关项目：

- [antirez/h3.c](https://github.com/antirez/h3.c)
- [MiniMax-H3 官方模型](https://huggingface.co/MiniMaxAI/MiniMax-H3)
- [MiniMax-H3 官方提示词指南](https://huggingface.co/MiniMaxAI/MiniMax-H3/blob/main/docs/VIDEO_PROMPT_WRITING_GUIDE_base_en.md)
- [Hugging Face CLI 文档](https://huggingface.co/docs/huggingface_hub/en/guides/cli)

## 1. 先了解将要安装什么

h3.c 是面向 Apple Silicon 的原生 MiniMax-H3 推理程序。它直接使用 macOS 的
Metal、Metal Performance Shaders 和统一内存，不需要 CUDA、PyTorch 或 MLX。

### 作者 antirez 是谁

h3.c 的作者是 Salvatore Sanfilippo，更常用的网名是 **antirez**。他是 Redis 的
创始作者，也长期创作小而精的开源系统软件；比较知名的项目还有轻量命令行编辑库
linenoise、不到千行的文本编辑器 kilo、字符串库 SDS、radix tree 实现 rax 和
ADS-B 解码器 dump1090。可以在他的 [GitHub 主页](https://github.com/antirez)
查看这些项目；他也在文章 [The end of the Redis adventure](https://antirez.com/news/133)
中回顾了 Redis 的诞生与自己的经历。

这段背景值得介绍，不只是因为作者知名。antirez 的项目通常强调：依赖少、源码直接、
可以用一个简单命令编译、关键数据结构和执行路径容易检查。h3.c 也延续了这种取向。

### 为什么在 Mac 上选择 h3.c

相对于为了运行一个模型而搭建完整的 Python、PyTorch/Diffusers 环境，h3.c 的优势
主要体现在：

- **原生 Apple Silicon 路径**：直接使用 Metal、MPS、Accelerate 和统一内存，
  不是把 CUDA 工作流勉强移植到 Mac；
- **部署简单**：源码拉下来后主要就是 `make`，日常推理不受 Python 虚拟环境、
  wheel、Torch 版本和插件依赖冲突影响；
- **针对 H3 优化**：专用 Metal kernel、融合算子、BF16 权重驻留、内部画布缩放、
  denoiser reuse 和可选 SSD streaming 都围绕 MiniMax-H3 的真实结构设计；
- **直接读取官方 BF16 checkpoint**：不要求先量化或转换官方权重，便于保持模型能力；
- **完整的原生媒体链路**：提示词编码、视频/音频联合生成、VAE 解码和 MP4 封装都在
  同一套程序里，且支持首尾帧和 Ref2VA；
- **适合反复试验**：交互模式会保留已经加载的模型和条件缓存，换提示词或 seed 时
  可以少做重复工作；
- **透明可诊断**：项目是 MIT 许可的开源代码，`--info`、`--profile`、中间帧和
  测试命令都便于定位模型布局、性能或内容问题。

它的代价也很明确：这是专门面向 Apple Silicon 和 MiniMax-H3 的工程，而不是跨平台、
多模型、节点式工作流；项目仍在快速演进，参数应以当前上游 README 和
`./h3 --help` 为准。官方 BF16 权重体积也很大，h3.c 的“轻量”指软件栈精简，
不代表模型本身变小。

一次生成大致经过四个阶段：

1. Qwen3-VL 文本编码器理解提示词；
2. FL2VA DiT 联合生成视频 latent 和音频 latent；
3. Video VAE 与 Audio VAE 分别解码画面和声音；
4. FFmpeg 将画面和声音封装成 MP4。

因此最终文件不是“无声视频再配音”，而是模型在同一次生成中同时考虑画面、对白、
环境声和音乐。

## 2. 你的 Mac 是否适合

### 必要条件

- Apple Silicon Mac，即 M 系列芯片；
- 可以正常使用 Metal；
- 足够的 SSD 空间；
- macOS 命令行编译工具；
- FFmpeg 和 FFprobe。

h3.c 不是 NVIDIA/CUDA 程序，也不是为 Intel Mac 编写的通用后端。

### 内存与硬盘

仅 FL2VA 的官方最小运行文件大约包括：

| 组件 | 大约大小 |
|---|---:|
| Qwen3-VL 文本编码器（14 个分片） | 62.133 GiB |
| FL2VA DiT（13 个分片） | 61.729 GiB |
| Video VAE | 9.700 GiB |
| Audio VAE | 0.564 GiB |
| Tokenizer 与 JSON 索引/配置 | 约 7 MiB |
| 合计 | 约 134.13 GiB |

下载时还需要元数据、临时文件和安全余量，建议至少准备 160 GiB 可用 SSD 空间；
条件允许时留出 180 GiB 会更从容。若还要安装
Ref2VA，或者保留其他格式的权重，应准备更多空间。

128 GiB 统一内存的 Max 机型是已经充分验证的配置。更小内存不代表一定不能运行，
但可用分辨率、时长和速度会更受约束。新版上游还提供 SSD streaming 之类的
低内存路径；是否可用应以当前 `./h3 --help` 为准。

## 3. 安装命令行工具

### 3.1 安装 Apple 编译工具

打开“终端”，执行：

```bash
xcode-select --install
```

如果已经装过，可以用下面的命令确认：

```bash
xcode-select -p
clang --version
make --version
```

### 3.2 安装 Homebrew、FFmpeg 和 Hugging Face CLI

如果还没有 Homebrew，先按照 [Homebrew 官网](https://brew.sh/)安装。然后执行：

```bash
brew install git ffmpeg hf
```

检查结果：

```bash
git --version
ffmpeg -version
ffprobe -version
hf --help
```

`hf` 只负责下载模型；下载完成后，日常视频推理不依赖它。

## 4. 下载并编译 h3.c

下面把 antirez 的原始项目放进 `~/AI/h3.c`。也可以换成自己的目录，但后续命令要
相应修改。

```bash
mkdir -p ~/AI
cd ~/AI
git clone https://github.com/antirez/h3.c.git
cd h3.c
make -j8
mkdir -p outputs
```

检查程序是否编译成功：

```bash
./h3 --help
```

如果能看到 `--model-dir`、`--prompt`、`--width`、`--height` 等参数，说明编译
已经完成。

一个容易忽略的细节：运行 h3 时最好先进入项目根目录。程序需要读取这里的
`h3_shaders.metal`，从其他目录直接运行可能找不到 Metal shader。

## 5. 下载官方 FL2VA 模型

初次使用只下载 `FL2VA/` 即可。它支持：

- 文本生成视频与音频；
- 用首帧控制开头；
- 用首帧和尾帧控制过渡。

先进入项目目录：

```bash
cd ~/AI/h3.c
```

### 5.1 最简单：下载整个 FL2VA 目录

可以先做一次 dry run，查看需要下载哪些文件和总大小：

```bash
hf download MiniMaxAI/MiniMax-H3 \
  --include "FL2VA/*" \
  --local-dir MiniMax-H3 \
  --dry-run
```

确认磁盘空间足够后正式下载：

```bash
hf download MiniMaxAI/MiniMax-H3 \
  --include "FL2VA/*" \
  --local-dir MiniMax-H3
```

如果模型要求登录，先执行：

```bash
hf auth login
```

网络中断后通常重新执行同一条 `hf download` 命令即可续传或跳过已经完成的文件，
不必清空目录重来。

`--include "FL2VA/*"` 会保留官方 FL2VA 目录的完整结构，除推理权重外还会下载
少量 processor 文件和 MiniMax 提供的 Python 实现源码。它最不容易漏文件，适合
第一次安装；这些附加文本文件与 134 GiB 权重相比几乎可以忽略。

### 5.2 推荐精确下载哪些文件

按照当前官方模型仓库，推荐保留的 FL2VA 精确文件集共 **37 个文件，约
134.13 GiB**：

| 目录 | 必要文件 | 数量 | 大约大小 |
|---|---|---:|---:|
| `FL2VA/transformer/` | `config.json`、`model.safetensors.index.json`、`model-00001-of-00013.safetensors` 至 `model-00013-of-00013.safetensors` | 15 | 61.729 GiB |
| `FL2VA/text_encoder/` | `config.json`、`model.safetensors.index.json`、`model-00001-of-00014.safetensors` 至 `model-00014-of-00014.safetensors` | 16 | 62.133 GiB |
| `FL2VA/tokenizer/` | `tokenizer.json` | 1 | 6.7 MiB |
| `FL2VA/video_vae/` | `config.json`、`source/config.json`、`source/model.safetensors` | 3 | 9.700 GiB |
| `FL2VA/audio_vae/` | `config.json`、`model.safetensors` | 2 | 0.564 GiB |

两个 `.index.json` 文件记录 tensor 位于哪个权重分片。当前 h3.c 会直接扫描
safetensors，但保留官方索引能维持 checkpoint 的完整结构，也兼容其他工具和以后
可能变化的 loader。37 个文件中，当前 h3.c 直接运行所需的是 29 个权重分片、
`tokenizer.json`、Transformer 配置、Video VAE 外层配置和 Audio VAE 配置；表中的
索引、Text Encoder 配置及 `video_vae/source/config.json` 体积很小，建议一并保留。

只想下载最小运行集时，可以明确限制路径：

```bash
cd ~/AI/h3.c

hf download MiniMaxAI/MiniMax-H3 \
  --include "FL2VA/transformer/*.json" \
  --include "FL2VA/transformer/*.safetensors" \
  --include "FL2VA/text_encoder/config.json" \
  --include "FL2VA/text_encoder/model*.safetensors*" \
  --include "FL2VA/tokenizer/tokenizer.json" \
  --include "FL2VA/video_vae/config.json" \
  --include "FL2VA/video_vae/source/config.json" \
  --include "FL2VA/video_vae/source/model.safetensors" \
  --include "FL2VA/audio_vae/config.json" \
  --include "FL2VA/audio_vae/model.safetensors" \
  --local-dir MiniMax-H3
```

想先核对下载计划，可以在末尾添加 `--dry-run`。模型仓库以后可能增加或调整文件，
因此长期来看，“下载整个 `FL2VA/*`”仍然是更稳妥的新手方案。

### 5.3 特殊网络环境：使用 hf-mirror.com

当 `huggingface.co` 连接缓慢或经常中断时，可以临时使用第三方公益镜像
[HF-Mirror](https://hf-mirror.com/)。Hugging Face 工具链会读取 `HF_ENDPOINT`
环境变量，所以无需改模型仓库名或 h3.c 源码。

推荐只让一条命令使用镜像：

```bash
cd ~/AI/h3.c

HF_ENDPOINT=https://hf-mirror.com \
hf download MiniMaxAI/MiniMax-H3 \
  --include "FL2VA/*" \
  --local-dir MiniMax-H3
```

这样环境变量只对这一条命令生效，关闭终端后也不会留下配置。需要 dry run 时同样写：

```bash
HF_ENDPOINT=https://hf-mirror.com \
hf download MiniMaxAI/MiniMax-H3 \
  --include "FL2VA/*" \
  --local-dir MiniMax-H3 \
  --dry-run
```

如果准备在当前终端连续执行多次下载，也可以：

```bash
export HF_ENDPOINT=https://hf-mirror.com

hf download MiniMaxAI/MiniMax-H3 \
  --include "FL2VA/*" \
  --local-dir MiniMax-H3
```

下载完成后恢复官方源：

```bash
unset HF_ENDPOINT
```

确认当前是否仍设置了镜像：

```bash
echo "${HF_ENDPOINT:-使用 Hugging Face 官方源}"
```

不建议为了偶尔下载就把 `export HF_ENDPOINT=...` 永久写入 `~/.zshrc`，否则以后
所有 Hugging Face 工具都会在不明显的情况下走镜像。要强制某条命令使用官方源，
可以执行：

```bash
env -u HF_ENDPOINT hf download MiniMaxAI/MiniMax-H3 \
  --include "FL2VA/*" \
  --local-dir MiniMax-H3
```

镜像使用时要注意边界：

- `hf-mirror.com` 是第三方公益镜像，不是 Hugging Face 或 MiniMax 官方服务；
- 公共模型通常无需 token，不要无故把 Hugging Face token 交给第三方端点；
- 对 gated/private 仓库，应先在 Hugging Face 官方网站接受条款，并优先使用官方源；
- 如果确实需要经镜像传 token，应使用权限最小、可随时吊销的只读 token；
- 下载后仍要执行 `./h3 --info` 和一次短视频生成，确认分片齐全、模型能够正常工作；
- 镜像异常时先 `unset HF_ENDPOINT` 回到官方源，再重跑同一下载命令，不要删除已经
  下载的百 GiB 文件。

官方 `hf download --local-dir` 会在目标目录保留下载元数据，重复运行会复用已完成
文件。无论从官方源还是镜像源下载，都应让 CLI 管理续传，不要手工拼接 `.part`
文件。

下载结束后可以先数一下权重分片：

```bash
find MiniMax-H3/FL2VA -type f -name '*.safetensors' | sort
find MiniMax-H3/FL2VA -type f -name '*.safetensors' | wc -l
```

当前官方 FL2VA 应有 **29 个 safetensors 文件**：13 个 Transformer 分片、14 个
Text Encoder 分片、1 个 Video VAE 和 1 个 Audio VAE。文件数只能发现明显缺失，
最终仍以随后执行的 `./h3 --info` 和短片生成测试为准。

下载完成后，关键结构应类似：

```text
h3.c/
├── h3
├── h3_shaders.metal
├── MiniMax-H3/
│   └── FL2VA/
│       ├── transformer/
│       │   ├── config.json
│       │   ├── model.safetensors.index.json
│       │   └── model-*.safetensors
│       ├── text_encoder/
│       │   ├── model.safetensors.index.json
│       │   └── model-*.safetensors
│       ├── tokenizer/
│       │   └── tokenizer.json
│       ├── video_vae/
│       │   ├── config.json
│       │   └── source/model.safetensors
│       └── audio_vae/
│           ├── config.json
│           └── model.safetensors
└── outputs/
```

官方 checkpoint 本身就是 h3.c 期望的格式。新手不要先合并 safetensors、改 tensor
名称或转换精度；这些操作只会增加出错机会。

## 6. 在真正生成前检查部署

运行：

```bash
cd ~/AI/h3.c
./h3 --info -d ./MiniMax-H3
```

`--info` 只读取模型 header 并检查设备与目录，不会执行完整推理。正常结果应该能
识别：

- Apple Metal 设备；
- Qwen3-VL encoder；
- FL2VA DiT；
- Video VAE；
- Audio VAE。

如果只下载了 FL2VA，`Ref2VA DiT 0 files` 是正常现象。

还可以编译并执行 tokenizer 测试：

```bash
make -j8 h3_tokenizer_tests
./h3_tokenizer_tests MiniMax-H3/FL2VA/tokenizer/tokenizer.json
```

正常结束时会看到 tokenizer checks 通过。

## 7. 生成第一条视频

第一次不要直接挑战 10 秒 768p。先生成一条 256×256、不到 1 秒的短片，确认主体、
运动和声音都是有意义的：

```bash
cd ~/AI/h3.c

./h3 --profile \
  -d ./MiniMax-H3 \
  -p "A single red fox walks through fresh snow in a pine forest. Medium tracking shot, natural winter light, realistic fur, soft footsteps and light wind, no music." \
  --width 256 --height 256 \
  --frames 22 --steps 20 \
  --layers 50 --reuse 1 \
  -o outputs/fox-256.mp4
```

生成完成后，在 Finder 打开项目的 `outputs` 文件夹，或者直接执行：

```bash
open outputs/fox-256.mp4
```

也可以检查编码信息：

```bash
ffprobe -v error \
  -show_entries format=duration,size:stream=codec_name,codec_type,width,height,sample_rate,channels \
  -of json outputs/fox-256.mp4
```

正常成片通常包含一条 H.264 视频流和一条 AAC 音频流。

256×256 只用于证明“模型能够正常生成内容”，细节和复杂构图能力有限。这个尺寸
不要启用 `--token-reduction`。

## 8. 从预览逐步提高质量

最实用的习惯是一次只提高一个维度：先确认提示词，再提高分辨率，最后增加时长或
去噪次数。这样即使结果变差，也容易知道是哪项参数造成的。

### 8.1 512×512 日常平衡档

```bash
./h3 --profile \
  -d ./MiniMax-H3 \
  -p "A single red fox walks through fresh snow in a pine forest. Medium tracking shot, natural winter light, realistic fur, soft footsteps and light wind, no music." \
  --width 512 --height 512 \
  --frames 22 --steps 20 \
  --layers 45 --reuse 2 \
  -o outputs/fox-balanced.mp4
```

这是适合反复调整主体、构图和风格的起点。

### 8.2 10 秒 16:9 快速长片

输出为 1024×576，但内部按 512×288 推理后放大，可以用较低成本检查长分镜、
动作连续性和对白：

```bash
./h3 --profile \
  -d ./MiniMax-H3 \
  -p "把完整视频提示词放在这里" \
  --width 1024 --height 576 \
  --render-width 512 --render-height 288 \
  --seconds 10 --steps 20 \
  --layers 45 --reuse 2 \
  --seed 42 \
  -o outputs/story-preview.mp4
```

经验参考：在一台 M5 Max、128 GiB Mac 上，这个档位通常约 3 分钟。其他机器会
因芯片、散热、后台负载和文件缓存而不同。

### 8.3 原生 768p

确认低成本版本的内容正确后，再删除内部画布参数，改用原生 1344×768：

```bash
./h3 --profile \
  -d ./MiniMax-H3 \
  -p "把已经验证过的完整视频提示词放在这里" \
  --width 1344 --height 768 \
  --seconds 10 --steps 20 \
  --layers 45 --reuse 2 \
  --seed 42 \
  -o outputs/story-768p.mp4
```

原生 768p 的成本会突然大幅上升。经验参考：同一台 M5 Max、128 GiB Mac 生成
10 秒约用了 82 分钟。不要把这个数字理解为所有 Mac 的固定速度。

## 9. 理解最常用的参数

| 参数 | 作用 |
|---|---|
| `-d` | MiniMax-H3 模型根目录 |
| `-p` | 提示词；省略时进入交互模式 |
| `-o` | 输出 MP4 路径 |
| `--width/--height` | 最终输出尺寸 |
| `--render-width/--render-height` | 较低的内部推理尺寸，生成后放大 |
| `--frames` | 直接请求帧数 |
| `--seconds` | 按秒请求时长，与 `--frames` 二选一 |
| `--steps` | 实际去噪次数，越高通常越慢 |
| `--layers` | 使用多少个 DiT block；完整值为 50 |
| `--reuse` | 1 保守、2 较快、3 更激进 |
| `--seed` | 随机种子，用于可重复比较 |
| `--profile` | 打印各阶段耗时和资源数据 |
| `--show` | 在兼容终端显示中间帧，会明显增加内存占用 |

宽和高必须是 32 的倍数，总面积不能超过 `1344 × 768`。内部尺寸必须与输出保持
相同宽高比，而且不能大于输出尺寸。

h3.c 以 24 fps 输出，并把时长向上对齐到合法的 H3 时间形状。因此：

| 请求 | 实际结果约为 |
|---|---:|
| 22 帧 | 0.917 秒 |
| 56 帧 | 2.333 秒 |
| 107 帧 | 4.458 秒 |
| `--seconds 10` | 243 帧，10.125 秒 |

### 三组容易理解的质量配置

| 用途 | Steps | Layers | Reuse |
|---|---:|---:|---:|
| 极快试验 | 4–7 | 50 | 1 |
| 日常平衡 | 20 | 45 | 2 |
| 慢速质量参考 | 50 | 50 | 1 |

低 steps 时保持 `--reuse 1`，确保每次请求的去噪都真正执行。`--reuse` 和
`--core-reuse` 不能同时使用。

## 10. 如何写出更有效的提示词

简单的一句话可以工作，但 H3 更喜欢清楚的多模态描述。至少写明：

- 主体：是谁、有几个、外观和服装；
- 动作：按时间顺序发生什么；
- 场景：地点、天气、时间和背景物体；
- 镜头：景别、机位、运镜和切换；
- 画面：风格、光线、色彩和质感；
- 声音：对白、环境声、动作声和是否需要音乐；
- 限制：不要字幕、水印、Logo、文字或多余人物。

例如：

```text
Scene: a single red fox in a snow-covered pine forest at dawn.
Action: the fox walks steadily from left to right and looks toward the camera once.
Camera: a stable medium-height lateral tracking shot.
Look: photorealistic fur, cold blue ambient light and warm sunrise rim light.
Audio: soft footsteps in snow and light wind through pine branches, no music.
Constraints: one fox only, no text, subtitles, watermark or logo.
```

需要对白时，明确写出谁在什么时间说哪句话，并保留原始语言。生成长片前先固定
prompt、seed、时长和主体约束，再比较不同分辨率；否则随机变化很容易被误认为
“分辨率提高后效果反而不同”。

## 11. 首帧和尾帧控制

FL2VA 本身就支持首尾帧，不需要下载 Ref2VA。

只固定首帧：

```bash
./h3 -d ./MiniMax-H3 \
  -p "The camera slowly moves around the subject." \
  --first-frame /图片的绝对路径/opening.png \
  --width 512 --height 512 --frames 22 --steps 20 \
  --layers 45 --reuse 2 \
  -o outputs/first-frame.mp4
```

同时固定首帧和尾帧：

```bash
./h3 -d ./MiniMax-H3 \
  -p "A smooth cinematic transition between the two scenes." \
  --first-frame /图片的绝对路径/opening.png \
  --last-frame /图片的绝对路径/ending.png \
  --width 512 --height 512 --frames 22 --steps 20 \
  --layers 45 --reuse 2 \
  -o outputs/first-last-frame.mp4
```

首次尝试图片控制时仍建议使用 512×512 短片，不要直接上 10 秒 768p。

## 12. 交互模式

不提供 `-p` 时，h3 会进入交互会话：

```bash
./h3 -d ./MiniMax-H3 --width 512 --height 512 --steps 6
```

模型加载后可以连续输入提示词，避免每次重新启动和加载。常用命令：

```text
!help                 查看帮助
!status               查看当前配置
!seed random          换随机种子
!seconds 2            设置时长
!first opening.png    设置首帧
!last ending.png      设置尾帧
!first clear          清除首帧
!last clear           清除尾帧
!save output.mp4      保存结果
!cache                查看缓存状态
```

## 13. 什么时候需要 Ref2VA

下面这些是 Ref2VA 功能，而不是普通 FL2VA 首尾帧：

- 任意参考图片：`--ref-image`；
- 参考视频：`--ref-video` 或 `--ref-silent-video`；
- 替换参考视频声音：`--ref-video-audio`；
- 独立音频参考：`--ref-audio`。

需要这些功能时，再下载 Ref2VA：

```bash
cd ~/AI/h3.c
hf download MiniMaxAI/MiniMax-H3 \
  --include "Ref2VA/*" \
  --local-dir MiniMax-H3
```

它会显著增加下载量和磁盘占用。下载后再次运行 `./h3 --info -d ./MiniMax-H3`，
确认 Ref2VA DiT 已被识别。

首尾帧锚点和 Ref2VA ordered references 不能在同一次生成中混用。

## 14. 可选：在 h3.c 上使用 H3 Studio 图形界面

前面全部步骤都围绕 antirez 的 h3.c，命令行已经能够完整生成视频，并不依赖额外
界面。如果更习惯浏览器表单，可以改用非官方的
[H3 Studio fork](https://github.com/watice555/h3.c-studio)。它没有替代或重新实现
h3.c，只是在 h3.c 之上做了一点很小的辅助工作：增加中英双语本机 Web GUI、参数
预设、任务日志、取消与输出播放，以及可选的提示词整理。

这个 fork 不隶属于 antirez、MiniMax、Hugging Face、Ollama 或任何 API 服务商，
也不包含模型权重。`./h3`、Metal kernel、模型加载和实际推理仍由 h3.c 完成。

如果决定使用 GUI，可以从一开始就 clone fork；前面的编译、模型下载和命令行用法
全部保持不变：

```bash
git clone https://github.com/watice555/h3.c-studio.git ~/AI/h3.c-studio
cd ~/AI/h3.c-studio
make -j8
./start_h3_gui.command
```

模型仍放在仓库根目录的 `MiniMax-H3/`。如果已经在纯净 h3.c 目录下载了权重，不必
重新下载，可以在核对路径后移动目录或建立软链接：

```bash
ln -s ~/AI/h3.c/MiniMax-H3 ~/AI/h3.c-studio/MiniMax-H3
```

软链接前先确认目标目录不存在。GUI 只监听本机地址，自动寻找空闲端口，视频仍由
h3.c 生成到 `outputs/`。提示词优化可以接 Ollama 或 OpenAI 兼容 API，但只是可选
功能，不是 h3.c 的运行依赖。具体界面与配置方法参见
[H3 Studio GUI 中文说明](https://github.com/watice555/h3.c-studio/blob/main/gui/README.zh-CN.md)。

### 更新 H3 Studio

H3 Studio 用户从 fork 的 `main` 分支更新，不需要自己从 antirez 上游做 rebase：

```bash
cd ~/AI/h3.c-studio
git status
git pull --ff-only
make -j8
./h3 --info -d ./MiniMax-H3
./start_h3_gui.command
```

更新前先确认 `git status` 没有自己的未提交修改。正常的 `git pull` 不会删除或重新
下载被 Git 忽略的 `MiniMax-H3/`、`outputs/` 和本机配置。若修改过源码或 GUI，先把
改动提交到自己的分支；不要用 `git reset --hard`、`git clean -fdx` 或覆盖整个目录
的方式更新。H3 Studio 维护者会负责把适合的 h3.c 上游改动同步到 fork，普通用户
只需跟随 fork 的更新。

## 15. 更新 h3.c

使用 antirez 原始仓库时：

```bash
cd ~/AI/h3.c
git status
git pull --ff-only
make -j8
./h3 --info -d ./MiniMax-H3
```

更新前先看 `git status`。如果有自己的源码修改，先提交或另行保存，不要覆盖目录或
强制清理。模型和输出位于被忽略的目录中，正常的 `git pull` 不会重新下载它们。

## 16. 常见问题

### 编译后没有 `h3`

回到项目目录重新编译并留意第一条报错：

```bash
cd ~/AI/h3.c
make clean
make -j8
```

### 提示找不到 `h3_shaders.metal`

说明运行目录不对：

```bash
cd ~/AI/h3.c
./h3 --info -d ./MiniMax-H3
```

### `ffmpeg not found` 或没有 MP4

```bash
brew install ffmpeg
command -v ffmpeg
command -v ffprobe
```

### `required weight is absent`

优先怀疑模型没有下载完整或目录层级错误：

```bash
./h3 --info -d ./MiniMax-H3
```

重新执行原来的 `hf download` 命令，让工具补齐缺少文件。不要随意改 safetensors
文件名或把分片合并成单文件。

### 内存压力过大

按顺序尝试：

1. 去掉 `--show`；
2. 先使用 256×256 或 512×512；
3. 减少时长；
4. 使用 `--layers 45 --reuse 2`；
5. 使用较低的 `--render-width/--render-height`；
6. 查看当前上游是否提供 `--ssd-streaming`。

### 下载中断

不要删除已经下载的几十 GiB 文件。先确认磁盘空间和网络，再重新运行相同的
`hf download` 命令。

### 使用 `--ref-image` 时提示需要 Ref2VA

普通 FL2VA 只有首帧/尾帧锚点。任意 ordered reference 需要额外下载 Ref2VA。

## 17. 经验分享：为什么优先选择官方权重

如果手里已经有 ComfyUI 或第三方发布的单文件权重，它们看起来可能和官方权重
“数值相同”，但保存布局不一定相同。实际迁移中遇到了三类问题：

1. 单文件 Qwen 的 tensor 名少了一层 `language_model` 前缀；
2. Audio VAE 把官方 weight normalization 的 `weight_v/weight_g` 合并成了
   一个 `.weight`；
3. FL2VA DiT 把 Q、K、V 按三大段保存，而 h3.c Metal kernel 需要官方的逐 head
   Q/K/V 交错排列。

第三类最隐蔽：程序可以完整跑完，`--info` 也没有错误，但生成结果只有马赛克、灰色
纹理或噪声。原因不是步数或提示词，而是 tensor 内部行排列错误。

这些问题需要针对具体 repack 检查 tensor 名、精度与内部布局，必要时编写一次性转换
工具或调整 loader。但这属于旧权重迁移，不是从零部署 h3.c 的标准步骤；对新用户
而言，直接下载 MiniMax 官方 checkpoint 更简单可靠。

迁移旧权重时最重要的经验是：

- 永远保留源文件，不要原地转换；
- 先检查 safetensors header、dtype、shape 和 tensor 名；
- `--info` 通过后仍要生成一条短片并目视检查；
- 先验证 256×256 或 512×512，再开始高分辨率长片；
- 不要因为程序没有报错就认定 checkpoint 语义布局正确。

## 18. 模型文件安全

模型和输出通常被 `.gitignore` 忽略，因此普通 `git status` 看不到它们。不要在
装有模型的项目中运行：

```text
git clean -fdx
```

这条命令会删除所有被 Git 忽略的文件，可能一次删掉上百 GiB 模型和所有生成结果。

移动、删除或重新转换大文件前，先用下面的命令确认实际目标：

```bash
du -sh MiniMax-H3
find MiniMax-H3 -type f -name '*.safetensors' -maxdepth 5 -print
```

## 19. 最短使用清单

第一次部署：

```bash
xcode-select --install
brew install git ffmpeg hf
mkdir -p ~/AI
git clone https://github.com/antirez/h3.c.git ~/AI/h3.c
cd ~/AI/h3.c
make -j8
mkdir -p outputs
hf download MiniMaxAI/MiniMax-H3 --include "FL2VA/*" --local-dir MiniMax-H3
./h3 --info -d ./MiniMax-H3
```

日常使用：

```bash
cd ~/AI/h3.c
./h3 --profile \
  -d ./MiniMax-H3 \
  -p "主体、动作、场景、镜头、画风、声音和限制" \
  --width 512 --height 512 \
  --frames 22 --steps 20 \
  --layers 45 --reuse 2 \
  --seed 42 \
  -o outputs/my-video.mp4
```

第一次成功后，再逐步尝试长时长、首尾帧、Ref2VA 或原生 768p。完整参数始终以
当前版本的 `./h3 --help` 和上游 `README.md` 为准。

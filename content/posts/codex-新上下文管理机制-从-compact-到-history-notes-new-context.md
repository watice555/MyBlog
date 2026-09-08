---
slug: "codex-新上下文管理机制-从-compact-到-history-notes-new-context"
title: "Codex 新上下文管理机制：从 Compact 到 History / Notes / New Context"
date: "2026-09-08"
category: "评论"
aiParticipation: 4
excerpt: "本文梳理Codex新上下文管理机制，指出其通过窗口化上下文、模型维护的笔记索引及可随机访问的历史，取代传统压缩摘要。该机制将上下文管理转化为Agent的主动能力，强调模型在状态序列化与重建中的关键作用，并分析了当前检索局限及未来演进方向。"
---

## 1. 背景

Codex 最近加入了一套新的实验性上下文管理机制，核心组件包括：

* token-budget context
* history
* notes
* `new_context`

它和传统的 `/compact` / 自动 compaction 并不是同一种思路。

传统机制的重点是：

> 当前上下文快满时，把已有对话压缩成摘要，然后继续使用同一个逻辑上下文。

新机制则更接近：

> 把长任务拆成多个独立 context window，并通过 notes 和可检索的历史，在不同窗口之间传递状态。

---

## 2. 传统 Compact 机制

假设原始上下文为：

```text
A
B
C
D
E
F
G
```

context 快满后进行 compact：

```text
[Summary of A-F]
G
H
I
```

原来的 A-F 不再直接进入模型当前的 active context，而是由一份摘要代替。

如果任务继续很久：

```text
原始内容
↓
Summary 1
↓
Summary 2
↓
Summary 3
```

就会产生典型的「摘要的摘要」问题。

长期运行时可能逐渐损失：

* 用户早期约束
* 架构决策原因
* 已经尝试失败的方案
* 某个工具的精确输出
* 边缘条件
* 原始措辞

### 重要区别：原始历史通常仍然存在

Compact 并不意味着历史物理上被删除。

Codex 的 session / rollout transcript 通常仍然保存在本地 JSONL 中。

因此：

```text
历史是否保存：是
模型当前是否看到：否
```

这是两个完全不同的问题。

旧机制下 compact 后，模型通常只获得：

```text
compact summary
+ compact 后的新消息
```

而不是重新获得完整 transcript。

理论上 agent 也可以自己去：

```bash
rg ...
jq ...
```

搜索 `~/.codex/sessions` 中的 rollout JSONL。

但这属于利用 shell 手动访问底层日志，并不是旧 context management 的正式组成部分。

问题包括：

* agent 未必知道应该去搜 transcript
* 要找对当前 session
* JSONL 中混有 tool call、metadata 等
* 基本依靠 grep / literal search
* resume 后也不会自动恢复所有 compact 前内容

因此旧机制真正的问题不是：

> 历史消失了。

而是：

> 历史还在，但已经脱离模型正常可访问的 working memory。

---

## 3. 新机制的核心思想

新机制大致可以理解为：

```text
Window 1
   │
   ├── 当前任务
   ├── 对话
   ├── tool calls
   │
   └── notes
         ↓
     new_context
         ↓
Window 2
   │
   ├── notes
   ├── current context
   └── 按需读取 Window 1 的 history
```

它不追求让模型永远携带全部历史。

相反，它试图实现：

> 当前窗口只保留当前任务真正需要的信息，需要旧信息时再随机访问历史。

从计算机系统角度看，很像：

```text
active context = RAM
history = disk
notes = index / checkpoint
```

---

## 4. `new_context` 后模型不会完全失忆吗？

这是新机制最关键的问题。

如果新窗口什么都不知道，那么模型就面临：

```text
我不知道之前发生了什么
↓
也不知道该搜索什么
```

因此新机制真正关键的不是 `history.search`，而是：

> 在切换 context 前，对当前任务状态做结构化 checkpoint。

理想情况下旧窗口会写下类似：

```text
Current task:
实现 refresh-token rotation

Progress:
- schema migration 已完成
- refresh endpoint 已修改
- integration tests 尚未完成

Important decisions:
- rotating refresh token
- grace period = 30 秒
- public API 不允许改变

Relevant history:
- 用户原始约束：W3:item82
- OAuth 设计讨论：W4:item31
- migration output：W4:item93

Next:
1. 写 integration tests
2. 跑测试
3. 修 race condition
```

然后：

```text
notes
↓
new_context
↓
新窗口读取 notes
```

新窗口因此仍然知道：

* 自己在做什么
* 已经做到哪里
* 哪些规则不能违反
* 下一步是什么
* 如果需要细节，应读取哪些历史 item

所以它并不是完全从零开始。

---

## 5. History 不一定依赖搜索

新 history 工具的关键能力不仅是搜索，还包括类似：

```text
list_windows
list_items
read_item
search_contents
```

其中 `read_item` 尤其重要。

如果旧窗口已经记录：

```text
关键 API 约束在 W4:item82
```

新窗口就可以直接：

```text
read_item(W4, item82)
```

而不是重新搜索整个历史。

这种模式可以理解成：

```text
notes = pointer table
history = immutable data
```

或者：

```text
notes 保存 inode
history.read_item 类似按 inode 读取文件
```

因此理想状态下，最精确的历史恢复根本不依赖模糊搜索。

---

## 6. 当前 History Search 的局限

目前公开实现中，`history.search_contents` 并不是 embedding / semantic search。

而是类似：

```text
case-sensitive literal substring search
```

也就是说：

历史内容：

```text
We chose PostgreSQL because advisory locks are required.
```

如果模型搜索：

```text
database choice
```

可能完全搜不到。

同样：

```text
历史：
Use optimistic concurrency control.

搜索：
version conflict
```

语义接近，但字符串不同，也可能没有结果。

所以当前 history search 更像：

```text
grep
```

而不是：

```text
vector database
```

这说明 History Search 目前更适合作为 fallback，而不是整个记忆系统的主要索引。

---

## 7. 真正的 Primary Index：模型自己写的 Notes

整个系统更合理的理解是：

```text
               Active Context
                     │
                     │ 快满
                     ▼
             model writes notes
                     │
       ┌─────────────┼──────────────┐
       │             │              │
     state        decisions       pointers
                                      │
                     │                │
                new_context           │
                     │                │
                     ▼                │
                New Window            │
                     │                │
                  read notes          │
                     │                │
                     └──── read_item ─┘
```

因此：

* History 保存原始事实
* Notes 保存高层状态和索引
* `new_context` 完成工作窗口切换

其中 `search_contents` 更像：

> 当 notes 没有保存正确 pointer 时，再进行补救搜索。

---

## 8. 新机制解决了什么？

传统 compact：

```text
100K token
↓
5K summary
↓
再产生 100K
↓
再次 summary
↓
summary of summary
```

新机制：

```text
Window 1: 100K ──────┐
Window 2: 100K ──────┤ 原始历史仍然保存
Window 3: 30K        │
       ▲             │
       │             │
     notes           │
       │             │
       └─read_item───┘
```

假设当前窗口只需要历史中的一个 2K-token 片段：

```text
Current context: 30K
Notes:            1K
Retrieved item:   2K
---------------------
Total:           33K
```

而不是重新加载：

```text
Window 1 100K
+ Window 2 100K
+ Window 3 30K
= 230K
```

因此这不是所谓「无限上下文」。

更准确的说法是：

> 有限工作窗口 + 外部长期历史 + 按需检索。

---

## 9. 新机制最大的风险：Awareness Failure

即使未来加入了非常强的 semantic search，仍然存在一个更深层的问题：

> 模型不知道自己忘掉了什么。

例如用户早期曾说：

```text
Don't change the public API even if this requires some duplication.
```

如果旧窗口写 notes 时只留下：

```text
Refactor parser.
```

没有记录：

```text
public API 不允许变化
```

也没有保存对应 item pointer。

那么到了新窗口，模型甚至不会意识到存在这个约束。

这时问题不是：

```text
retrieval failure
```

而是：

```text
awareness failure
```

二者区别：

### Retrieval failure

模型知道：

> 我以前好像讨论过 PostgreSQL 版本。

但搜不到。

### Awareness failure

模型根本不知道：

> 用户以前要求 PostgreSQL 13 兼容。

于是根本不会搜索。

第二种问题更加危险。

---

## 10. 为什么模型本身的能力变得非常关键

传统 compact 机制中：

```text
模型正常完成任务
↓
runtime 触发和编排 compaction，而模型或服务端生成压缩后的上下文表示。
```

模型本身不需要特别擅长管理自己的记忆。

新机制则要求模型完成一系列「元认知」操作：

1. 判断什么时候 context window 应该结束
2. 判断未来什么信息最重要
3. 把关键状态写进 notes
4. 保存必要的 history pointers
5. 判断哪些信息可以丢弃
6. 在新窗口中识别自己缺失的信息
7. 判断什么时候应该读取 history
8. 设计有效的搜索词
9. 从结果中判断哪个 item 最相关
10. 在未来再次正确 checkpoint

因此模型实际上需要具备：

```text
task reasoning
+
memory management
+
state serialization
+
state reconstruction
```

这是一种比传统「单窗口推理」更高阶的 agent 能力。

---

## 11. Astra 与新 Context Management 同时出现可能不是巧合

新的 context management 与 Astra 在非常接近的时间开放，因此很可能属于同一套 agent 架构升级。

虽然目前不能直接断言：

> OpenAI 因为 Astra 才推出新 context mechanism。

但二者在架构上非常匹配。

可以理解成：

```text
Astra
│
├── stronger reasoning
├── planning
├── tool use
├── self-monitoring
└── long-horizon agent capability

            +

Codex Runtime
│
├── current context
├── notes
├── history
└── new_context
```

组合起来才形成完整的 long-horizon coding agent。

---

## 12. 为什么强模型在这种系统中优势会被放大

假设两个模型单窗口任务能力：

```text
Model A = 95
Model B = 90
```

差距并不大。

但如果每一次 context handoff 的信息保持率分别是：

```text
A = 98%
B = 90%
```

经过多轮上下文切换后，长期任务中的差距可能快速扩大。

简单示意：

```text
0.98^10 ≈ 82%
0.90^10 ≈ 35%
```

真实系统当然不是简单相乘，但它说明：

> context management 中很小的质量差异，在超长 agent task 中可能累积成巨大差异。

因此未来 agent benchmark 很可能不再只是：

```text
同样给 100K context
谁回答得最好
```

而会越来越关注：

```text
给一个持续数小时甚至数天的任务

Window 1
↓
Window 2
↓
Window 3
↓
Window 4
↓
Window N

最后模型是否仍然正确记得：

- 用户原始要求
- 不允许违反的约束
- 架构决策
- 决策原因
- 已失败的路线
- 当前代码状态
- 下一步工作
```

---

## 13. Notes 可以理解成「模型写给下一窗口自己的 System Prompt」

这可能是新机制中最有意思的一点。

传统模型状态主要由：

```text
system prompt
+ current conversation
+ compact summary
```

决定。

新机制加入：

```text
model-authored notes
```

于是 Window N 实际上会给 Window N+1 的自己留下一封 handoff：

```text
我们正在做什么
↓
哪些约束不可违反
↓
什么方案已经失败
↓
哪些事实已经确认
↓
需要精确原文时去哪里读取
↓
下一步首先做什么
```

所以模型实际上在做两件额外的事情：

### State serialization

把当前思维状态转化成可持久化 checkpoint。

### State reconstruction

下一窗口根据 checkpoint 恢复任务状态。

这已经非常接近真正的软件 agent runtime。

---

## 14. 当前机制最准确的定义

不应该把它叫做：

> 无限上下文。

也不只是：

> 更好的 compact。

更准确的是：

> **窗口化上下文 + 模型维护的 checkpoint / index + 可随机访问的原始历史。**

它把问题从：

```text
怎么让模型永久看到 500K / 1M token？
```

转化成：

```text
怎么让模型当前只看到真正需要的 30K token，
同时仍然可以准确访问过去数十万甚至数百万 token 中的相关信息？
```

这条路线本质上更像传统计算机系统：

```text
working memory
+
persistent storage
+
index
+
retrieval
```

而不是简单无限扩大 RAM。

---

## 15. 对当前实验机制的评价

### 优点

* 避免多次 summary-of-summary 带来的累计信息损失
* 原始历史可以保留
* 可以随机读取具体历史 item
* 当前 context 可以保持干净
* 对超长 coding task 更适合
* 理论上任务持续时间不再直接绑定单个 context window

### 当前短板

* history search 仍然是 literal substring search
* 缺乏真正 semantic retrieval
* notes 质量强依赖模型能力
* 模型可能产生 awareness failure
* context handoff 错误可能逐渐固化
* 目前仍属于实验机制

---

## 16. 可能的未来演进

非常自然的下一步是加入 hybrid retrieval：

```text
model-authored pointers
+
literal search
+
BM25
+
embedding retrieval
+
reranker
+
recency
+
role / tool filters
```

例如：

```text
history.semantic_search(
    "之前用户关于数据库兼容性的要求"
)
```

后台：

```text
历史 items
↓
embedding / lexical retrieval
↓
top-k candidates
↓
reranker
↓
item IDs
↓
read_item
```

不过即使这样，也只能改善 retrieval failure。

对于 awareness failure：

> 模型根本不知道某个被遗忘的信息值得检索。

仍然需要更强的：

* checkpoint generation
* constraint tracking
* automatic salience detection
* persistent task state

才能真正解决。

---

## 17. 最终结论

Codex 新机制的重要性不在于「上下文变大了」，而在于：

> **它开始把上下文管理本身变成 agent 的一个主动能力。**

旧模式：

```text
Context
↓
满
↓
Compact
↓
继续
```

新模式：

```text
Current Window
↓
识别长期重要信息
↓
Notes + History Pointers
↓
New Context
↓
恢复任务状态
↓
按需读取历史原文
↓
继续
```

因此模型本身的 planning、self-monitoring、tool use 和 memory-management 能力变得极其关键。

这也解释了为什么 Astra 和新的 context management 同时出现非常值得关注：

> **未来 Codex 的能力可能越来越不能只看底层模型本身，而需要把「模型 + context runtime + history + notes + tools」作为一个完整 agent system 来评价。**

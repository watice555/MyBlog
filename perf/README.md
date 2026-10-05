# 性能验证

常规 `npm run test:export` 会检查静态资源预算，CI 和 Pages 发布也自动执行。
字体上限为 6.5 KB；JS 预算允许已发布元数据本身的合理增长，不把新增文章误判成代码退化。

浏览器测试需要一次性执行 `npx playwright install chromium`。测速依赖已经固定在开发依赖中。

先在基线提交构建并保存产物，再在候选提交重复同样操作。下面以项目子路径为例：

```sh
GITHUB_ACTIONS=true GITHUB_REPOSITORY=watice555/MyBlog npm run build:github
mkdir -p .local/perf/baseline
cp -R out .local/perf/baseline/MyBlog
# 修改完成后重新构建，保存到 .local/perf/candidate/MyBlog

npm run perf:guard -- .local/perf/baseline .local/perf/candidate
PERF_ROUTES='/MyBlog/|/MyBlog/article/2026-10-04-合并日报/|/MyBlog/#archive|/MyBlog/#editor' \
  npm run perf:measure -- .local/perf/baseline .local/perf/candidate .local/perf/desktop.json
PERF_WIDTH=390 PERF_ROUTES='/MyBlog/|/MyBlog/article/2026-10-04-合并日报/|/MyBlog/#archive|/MyBlog/#editor' \
  npm run perf:measure -- .local/perf/baseline .local/perf/candidate .local/perf/mobile.json
node perf/bench/ratchet.mjs .local/perf/desktop.json
node perf/bench/ratchet.mjs .local/perf/mobile.json
```

每个版本默认 10 次，使用新 context、禁用缓存、对所有请求限速，交替 A/B 与 B/A。
不要同时跑构建或其他负载。`PERF_RUNS` 可提高样本数；少于 10 次不能通过最终时延检查。
默认路由是首页和固定的代表性日报，其他路由通过 `PERF_ROUTES` 指定。

`ready` 为字体稳定后的可见内容/归档搜索框/已解除恢复门的正文输入框；详情见 BRIEF。
搜索另记从输入 AI 到结果出现的 `actionMs`。编辑器会真输入并等待公式预览，确认输入未丢失。
编辑器使用仅驻留内存的空草稿 API fixture，只测前端冷启动，不代表真实磁盘、恢复草稿或 LLM 性能。
`bytes` 是观察结束时的响应体总量，归档包括搜索索引，编辑器包括预览依赖，并非所有字节都属于首屏关键路径。

截图护栏比较同一浏览器生成的 PNG 字节，覆盖两个视口、首页、日报、公式长文、归档、关于。
内容 HTML 逐字一致，SEO 字段排序后比较（标签顺序不影响字段含义）。
截图、构建副本、原始 JSON 仅写入忽略的 `.local/perf/`，不提交。

时延检查允许 5% 或一个 60Hz 帧的采样噪声，取较大者，不应把容差内差异称为提速。
确定性资源上限没有时延容差；预算变更应附新的配对证据，不能只为了通过检查而扩大上限。

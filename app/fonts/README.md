# 文章序号字体

`index-digits.woff2` 来自 `@fontsource-variable/source-serif-4` 5.3.0
的 Source Serif 4 拉丁斜体可变字重字体，仅保留数字与空格。
保留原字形轮廓、提示信息及字重轴，衍生字体命名为 **Ningling Index Serif**，
继续遵循随附的 OFL 许可证。

仅 `.article-index` 使用此字体，其他文本保留现有字体。
子集必须同时包含 U+0020 和 U+0030–0039：缺少空格时，即使元素只有数字，
Chromium 仍会为字体度量下载完整的回退字体。

通过 `scripts/subset-index-font.py` 重新生成，安装命令见脚本顶部。
字体是正式应用资产，正常构建不需要 Python。重新生成后应复查截图及传输量。

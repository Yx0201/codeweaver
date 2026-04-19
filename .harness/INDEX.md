# Harness 主索引

> 任何 agent 启动时必须先读本文件,然后按需读取子文件。
> 禁止全量读取 .harness/ 目录,必须通过索引检索。

## 快速导航

| 用途                       | 文件                               |
|----------------------------|------------------------------------|
| 查页面/路由                | route-map.index.md → route-map.md  |
| 查代码约定                 | conventions.md（带章节索引）        |
| 查历史架构决策             | decisions.md（带 ID 索引）          |
| 查模块间依赖               | dependency-graph.md                |
| 查某模块历史/坑点          | module-history/INDEX.md            |
| 查历史任务                 | task-archive/INDEX.md              |
| 查未解答疑问               | unknowns.md                        |
| 提问策略                   | questioning-policy.md              |
| E2E 配置                   | e2e-config.md                      |
| 跨会话恢复                 | handover.md                        |

## 检索协议

1. 从任务描述提取关键词（页面名、模块名、功能词）
2. 根据关键词类型选择对应索引
3. 在索引中定位具体文件/章节
4. 只读定位到的内容

## 当前项目状态

- 考古状态: [x] 已完成
- 初次考古时间: 2026-04-19
- 最近更新时间: 2026-04-19 (TASK-001 首页重构，E2E 9/9 PASS)
- 已归档任务数: 1

## 考古产出摘要

- 页面路由: 6 个页面 + 7 个 API 路由（首页已从静态页重构为 AI 问答页）
- 代码约定: 16 条 + 1 条待写入（CONV-017: PromptInputSubmit status 无需 normalize）
- 架构决策: 4 条
- 模块依赖: 15 个模块已建图（新增 homepage）
- 待澄清: 3 个 pending（非关键）

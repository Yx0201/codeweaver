---
name: task-summary
description: 任务归档 + 从对话中挖掘隐性知识。
---

# Task Summary Skill

## 产出位置

.harness/task-archive/YYYY-MM/task-NNN-<slug>.md

## 必含字段

- 任务描述
- 涉及页面（关联 route-map ID）
- 变更清单
- 关键对话摘要
- 【刻意保留的设计】（很重要）
- 【刻意没做的事】（很重要）
- 【用户纠正 AI 的地方】（提取为隐性知识）
- 遗留问题

## 隐性知识挖掘

扫描本次对话,提取所有"用户纠正 AI"的片段:
- 提问用户:"这些纠正点是否应升级为 conventions?"
- 用户确认后写入 conventions.md

## 索引更新

追加到 task-archive/INDEX.md:
| 任务 ID | 标题 | 涉及模块 | 关键词 | 日期 |

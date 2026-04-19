---
name: project-preview
description: 任务完成后增量更新 route-map 和相关索引。
---

# Project Preview Skill

## 触发时机

任务完成,task-summary 之后。

## 动作

1. 读取本次变更文件列表
2. 定位影响的 route-map 条目
3. 追加任务总结到对应条目的"历史任务总结"
4. 若新增页面,创建新 section 并更新 route-map.index.md
5. 若新增模块依赖,更新 dependency-graph.md

## 禁止

- 删除历史记录
- 修改 conventions/decisions

# Architecture Decisions Record

> 记录项目的架构决策和业务规则。修改必须经人类确认。

## 索引

- [DEC-001] 首页将重构为交互式对话页面
- [DEC-002] SearchMode 三种模式的语义定义
- [DEC-003] 文件状态单向流转,无回退
- [DEC-004] 可选服务采用 fire-and-forget / graceful degradation

## 决策详情

### [DEC-001] 首页将重构为交互式对话页面

- **背景**: src/app/page.tsx 当前是纯展示的欢迎页,但已标记 "use client"
- **决定**: 保留 "use client" 标记,首页计划重构为可交互的对话入口页面
- **原因**: 提前为后续重构准备,避免到时再修改组件边界
- **记录时间**: 2026-04-19
- **记录来源**: 人工口述（考古 Phase 3）

### [DEC-002] SearchMode 三种模式的语义定义

- **背景**: 对话支持三种搜索模式选择
- **决定**:
  - `hybrid`: 混合检索（向量 + 关键词 + RRF）+ reranker,完整管线
  - `graph`: 混合检索 + 图谱检索（实体匹配 + 图遍历）
  - `fast`: 混合检索但关闭 reranker,速度快精度低
- **原因**: 用户可根据场景在精度和速度间权衡
- **记录时间**: 2026-04-19
- **记录来源**: 考古推断 + 人工确认

### [DEC-003] 文件状态单向流转,无回退

- **背景**: uploaded_files.status 字段
- **决定**: 状态流向为 `uploaded → processing → completed/failed`,不支持回退
- **原因**: 重新处理直接删除重传,比状态回退更简单可靠
- **记录时间**: 2026-04-19
- **记录来源**: 人工确认

### [DEC-004] 可选服务采用 fire-and-forget / graceful degradation

- **背景**: reranker、graph search、query rewriter 等可选服务可能不可用
- **决定**:
  - lib 层:try-catch + console.error + fallback（reranker 返回原序,graph 跳过,rewriter 返回原查询）
  - UI 层:知识库绑定等非关键操作使用 `.catch(() => {})` 静默处理
- **原因**: 刻意设计,可选服务故障不应阻断主流程
- **记录时间**: 2026-04-19
- **记录来源**: 考古推断 + 人工确认

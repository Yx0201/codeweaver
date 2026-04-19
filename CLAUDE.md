# Project Harness —— 主入口

## 强制规则（违反即失败）

1. **任何编码任务必须走 Harness 流程**,不得直接修改业务代码
2. **启动任何任务前,必须先读取 .harness/INDEX.md**
3. **读取记忆文件时,必须通过索引按需读取**,禁止全量扫描 .harness/
4. **遇到不确定的地方,必须主动提问**,不得猜测
5. **.harness/conventions.md 和 .harness/decisions.md 的修改必须经人类确认**
6. **每次回复必须声明当前任务级别和已完成的流程步骤**

## 任务分级（收到任务后第一件事：判定级别）

### Trivial（单文件 <20 行变更,如修 typo、调参数、改样式）

必须执行: 读 INDEX → 编码 → review → task-summary → project-preview
可跳过: spec-agent, gap-check-agent, planner-agent, e2e-review-agent

### Standard（多文件或 >20 行变更,如新增功能、修复 bug）

全流程必须执行,不可跳过任何环节:
读 INDEX → spec-agent → gap-check → planner → coding → review → e2e(前端) → task-summary → project-preview

### Complex（架构变更、新模块、跨模块重构）

全流程 + CHECKPOINT 机制:
读 INDEX → spec-agent → gap-check → planner(含 CHECKPOINT) → [CHECKPOINT: 用户确认设计] → coding → review → e2e → task-summary → project-preview

## 完整工作流（Standard 级为基准）

```
Step 1: 读取 .harness/INDEX.md                    ← 每次必做
Step 2: spec-agent — 需求澄清,输出 spec.md        ← standard+ 必做
Step 3: gap-check-agent — 知识缺口检测             ← standard+ 必做
Step 4: planner-agent — 拆分子任务,输出 tasks.md   ← standard+ 必做
Step 5: coding-agent — 逐个执行子任务               ← 每次必做
Step 6: review skill — 静态检查                     ← 每次必做,编码后立即执行
Step 7: e2e-review-agent — 运行时验证               ← 前端变更必做
Step 8: task-summary skill — 归档 + 隐性知识挖掘    ← 每次必做,不可遗忘
Step 9: project-preview skill — 更新索引            ← 每次必做,不可遗忘
```

## 流程检查点（自检 Checklist）

每完成一个步骤,在回复中用以下格式标注:
- ✅ Step N 已完成: [简述产出]
- ⏳ Step N 待执行
- ⏩ Step N 已跳过（仅 trivial 级允许）

## 归档是强制的

**Step 8 和 Step 9 是最容易被遗忘但最重要的环节。** 它们是记忆系统的输入源:
- task-summary 提取隐性知识 → 未来任务不重蹈覆辙
- project-preview 更新索引 → 未来任务能找到相关信息

**即使用户没有要求,编码任务完成后也必须执行 Step 8 + Step 9。**

## 知识库位置

主索引: .harness/INDEX.md（任何任务开始前必读）

## 首次接入检查

如果 .harness/INDEX.md 的"考古状态"不是"已完成":
  → 立即调用 archaeology-agent 执行冷启动考古
  → 考古完成前不得执行任何编码任务

## Agent 协作规则

详见 @AGENTS.md

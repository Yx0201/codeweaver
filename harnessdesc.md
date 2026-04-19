# Harness 系统完整说明文档

> 本文档用于在新机器上从零复现同一套 Harness 系统。
> 读完本文档后，应能理解每个模块的作用、文件位置、协调原理，并按照说明创建所有文件。

---

## 一、系统概述

**Harness 是什么？**

Harness 是一套强制 AI（Claude Code）按照结构化流程执行编码任务的脚手架系统。它解决的核心问题是：AI 在自由状态下容易跳步（直接写代码而不澄清需求）、容易遗忘归档、容易在多次会话间丢失项目上下文。

**核心思想：**

- 知识库（`.harness/`）：持久化项目记忆，跨会话共享上下文
- 流程强制（`CLAUDE.md` + hooks）：让 AI 无法绕过既定步骤
- 角色分离（agents + skills）：每个 agent/skill 只做一件事，防止越权
- 分级处理：小改动走简化流程，大改动走完整流程，避免过度过程化

**系统由四层组成：**

```
┌─────────────────────────────────────────────────────────────┐
│  Layer 1: 流程规则  CLAUDE.md + AGENTS.md                   │
│  Layer 2: 知识库    .harness/ 目录                          │
│  Layer 3: 执行者    .claude/agents/ + .claude/skills/       │
│  Layer 4: 守卫      .claude/hooks/ + .claude/settings.json  │
└─────────────────────────────────────────────────────────────┘
```

---

## 二、目录结构总览

```
项目根目录/
├── CLAUDE.md                        # 主流程规则（AI 必读，最高优先级）
├── AGENTS.md                        # Agent 协作规则（CLAUDE.md 引用）
├── harnessdesc.md                   # 本文档
│
├── .harness/                        # 项目知识库（持久化记忆）
│   ├── INDEX.md                     # 总索引（每个任务必读的第一个文件）
│   ├── conventions.md               # 代码约定（16+ 条，带置信度，禁止 AI 直接修改）
│   ├── decisions.md                 # 架构决策记录（ADR，禁止 AI 直接修改）
│   ├── route-map.md                 # 页面/路由详情（每页的文件、组件、API 清单）
│   ├── route-map.index.md           # 路由索引（快速定位用）
│   ├── dependency-graph.md          # 模块间依赖图
│   ├── unknowns.md                  # 未解答问题记录
│   ├── questioning-policy.md        # AI 提问规范（何时问、如何问）
│   ├── e2e-config.md                # E2E 测试环境配置
│   ├── handover.md                  # 跨会话交接文档
│   ├── current-spec.md              # 当前任务 spec（任务进行中存在）
│   ├── current-tasks.md             # 当前任务拆分（任务进行中存在）
│   ├── module-history/
│   │   └── INDEX.md                 # 模块历史索引
│   └── task-archive/
│       ├── INDEX.md                 # 已归档任务索引
│       └── YYYY-MM/task-NNN-*.md   # 具体任务归档文件
│
├── .claude/
│   ├── settings.json                # 权限控制 + hooks 配置
│   ├── agents/                      # 自定义 agent 定义文件
│   │   ├── archaeology-agent.md
│   │   ├── spec-agent.md
│   │   ├── gap-check-agent.md
│   │   ├── planner-agent.md
│   │   ├── coding-agent.md
│   │   └── e2e-review-agent.md
│   ├── skills/                      # 自定义 skill 定义文件
│   │   ├── review/SKILL.md
│   │   ├── task-summary/SKILL.md
│   │   ├── project-preview/SKILL.md
│   │   ├── browser-control/SKILL.md
│   │   ├── api-probe/SKILL.md
│   │   ├── visual-check/SKILL.md
│   │   └── test-case-gen/SKILL.md
│   └── hooks/                       # Shell 脚本 hooks
│       ├── on-user-prompt.sh        # UserPromptSubmit hook
│       └── post-code-edit.sh        # PostToolUse hook
```

---

## 三、Layer 1：流程规则

### 3.1 CLAUDE.md — 主入口规则

**文件位置：** 项目根目录 `CLAUDE.md`

**作用：** Claude Code 每次会话启动时自动读取，是 AI 行为的最高约束。所有规则以"违反即失败"的语气写明，确保 AI 无法忽略。

**核心内容：**

#### 强制规则（6 条）

1. 任何编码任务必须走 Harness 流程，不得直接修改业务代码
2. 启动任务前必须先读 `.harness/INDEX.md`
3. 读记忆文件时必须通过索引按需读取，禁止全量扫描
4. 遇到不确定必须主动提问，不得猜测
5. `conventions.md` 和 `decisions.md` 的修改必须经人类确认
6. 每次回复必须声明当前任务级别和已完成步骤

#### 任务分级系统

| 级别 | 判定条件 | 必须执行 | 可跳过 |
|------|---------|---------|--------|
| **Trivial** | 单文件 <20 行变更（typo、调参、改样式） | 读 INDEX → 编码 → review → task-summary → project-preview | spec-agent, gap-check, planner, e2e |
| **Standard** | 多文件或 >20 行变更（新功能、修 bug） | 完整 9 步全流程 | 无 |
| **Complex** | 架构变更、新模块、跨模块重构 | 完整流程 + CHECKPOINT 用户确认设计 | 无 |

**收到任务后第一件事是判定级别**，然后在每次回复中用以下格式声明进度：

```
✅ Step N 已完成: [简述产出]
⏳ Step N 待执行
⏩ Step N 已跳过（仅 trivial 级允许）
```

#### 完整工作流（9 步）

```
Step 1: 读取 .harness/INDEX.md                    ← 每次必做
Step 2: spec-agent — 需求澄清，输出 spec.md        ← standard+ 必做
Step 3: gap-check-agent — 知识缺口检测             ← standard+ 必做
Step 4: planner-agent — 拆分子任务，输出 tasks.md  ← standard+ 必做
Step 5: coding-agent — 逐个执行子任务               ← 每次必做
Step 6: review skill — 静态检查                     ← 每次必做
Step 7: e2e-review-agent — 运行时验证               ← 前端变更必做
Step 8: task-summary skill — 归档 + 隐性知识挖掘    ← 每次必做（最常被遗忘）
Step 9: project-preview skill — 更新索引            ← 每次必做（最常被遗忘）
```

> Step 8 和 Step 9 是记忆系统的输入源，即使用户没要求也必须执行。

#### 首次接入检查

如果 `.harness/INDEX.md` 的"考古状态"不是"已完成"，必须先调用 `archaeology-agent` 做冷启动考古，考古完成前不得执行任何编码任务。

---

### 3.2 AGENTS.md — Agent 协作规则

**文件位置：** 项目根目录 `AGENTS.md`（由 CLAUDE.md `@AGENTS.md` 引用）

**作用：** 定义每个 agent 的职责边界、上下文读取顺序、禁止事项和失败处理策略。

**上下文注入优先级（每个 agent 的读取顺序）：**

1. `.harness/INDEX.md`（总索引，必读）
2. 当前任务关键词对应的子索引
3. `.harness/conventions.md`（硬约束）
4. `.harness/decisions.md`（历史决策）
5. 当前任务涉及的 module-history（按需）
6. 相关 task-archive（按需）

**失败处理策略：**

- gap-check 失败 → 向用户提问，回答后更新 decisions 再继续
- coding 失败 → 返回 planner 重新规划（最多 3 次）
- e2e 失败 → 返回 coding 修复（最多 3 次，超过则 handoff 给人类）

---

## 四、Layer 2：知识库（.harness/）

知识库是 Harness 的核心价值所在。它将项目理解从"每次会话重新扫描代码"升级为"从结构化记忆出发"。

### 4.1 INDEX.md — 总索引（必读文件）

**作用：** 每个 agent 启动时必须读的第一个文件。提供快速导航表，告诉 agent 根据任务关键词去读哪个子文件，避免全量扫描。

**包含内容：**
- 快速导航表（用途 → 文件路径的映射）
- 检索协议（关键词 → 索引类型 → 具体文件/章节 → 只读定位到的内容）
- 当前项目状态（考古状态、最近更新时间、已归档任务数）
- 考古产出摘要（路由数、约定数、决策数、模块数）

**重要：** `INDEX.md` 顶部必须有"考古状态"字段。未完成时会触发 archaeology-agent。

---

### 4.2 conventions.md — 代码约定

**作用：** 记录项目的代码规范、模式约定。每条约定必须标注置信度（high/medium/low）、来源和最后验证时间。

**保护级别：** AI 禁止直接修改（settings.json deny + PreToolUse hook 双重保护）。修改路径：task-summary skill 提问用户 → 用户确认 → 人工操作。

**约定格式：**
```markdown
### [CONV-NNN] 约定标题
- **内容**: 具体规则
- **证据**: 文件路径 + 行号或统计数字
- **置信度**: high/medium/low
- **来源**: 考古推断 / 人工确认
- **最后验证**: YYYY-MM-DD
- **状态**: 已确认 / 未确认
```

---

### 4.3 decisions.md — 架构决策记录（ADR）

**作用：** 记录项目的架构决策和业务规则。重点记录"为什么这样做"，防止未来重蹈覆辙或被新成员改回去。

**保护级别：** 与 conventions.md 相同，AI 禁止直接修改。

**决策格式：**
```markdown
### [DEC-NNN] 决策标题
- **背景**: 为什么会有这个决策
- **决定**: 具体选择了什么
- **原因**: 理由
- **记录时间**: YYYY-MM-DD
- **记录来源**: 人工口述 / 考古推断 + 人工确认
```

---

### 4.4 route-map.md + route-map.index.md

**route-map.md：** 完整的页面/路由文档。每个路由条目包含：文件路径、组件列表、调用的 API、关联模块、历史任务总结。

**route-map.index.md：** 路由快速索引，用于 spec-agent 通过关键词快速定位相关页面，避免读完整 route-map。

---

### 4.5 dependency-graph.md

**作用：** 记录模块间依赖关系。spec-agent 和 planner-agent 用它评估变更的影响范围。新增模块或依赖时由 project-preview skill 更新。

---

### 4.6 unknowns.md

**作用：** 记录考古阶段发现的、尚未解答的业务问题。gap-check-agent 检查时会扫描此文件，若涉及的模块有 `[unknown]` 标记则暂停流程提问。

---

### 4.7 questioning-policy.md

**作用：** 规范 AI 何时提问、如何提问。防止 AI 过度打断用户，也防止 AI 靠猜测填补知识缺口。

**核心规则：**
- 必须是选择题，不能开放式提问
- 必须提供默认选项
- 必须说明"如不回答将如何处理"
- 单次提问不超过 3 个问题
- 禁止问可以通过 grep/read 解决的问题

---

### 4.8 e2e-config.md

**作用：** E2E 测试的环境配置。e2e-review-agent 启动时读取此文件获取 dev_url、测试账号、超时配置、脱敏字段列表、视觉对比阈值。

**必须配置字段：**
- `dev_url`（本地开发服务器地址）
- `sensitive_fields`（需要脱敏的字段名）
- 超时配置（page_load / action / api）

---

### 4.9 handover.md

**作用：** 跨会话交接文档。会话结束前由 task-summary 更新，新会话启动时优先读取，恢复中断的任务进度。

**包含字段：** 当前任务、进度、已变更文件、待完成事项、关键上下文、恢复指令。

---

### 4.10 module-history/

**作用：** 每个模块的历史变更记录，包括历史 bug、踩过的坑、重要设计决策。coding-agent 执行前读取对应模块的 history，避免重蹈覆辙。

**组织方式：** `module-history/INDEX.md` 为索引，具体文件按模块名命名。

---

### 4.11 task-archive/

**作用：** 已完成任务的归档文件。包含任务描述、变更清单、关键对话摘要、隐性知识（刻意保留的设计、刻意没做的事、用户纠正 AI 的地方）。

**组织方式：** `task-archive/INDEX.md` 为索引（表格格式），具体文件按 `YYYY-MM/task-NNN-slug.md` 组织。

---

## 五、Layer 3：执行者（Agents & Skills）

### 5.1 Agents（子 Agent）

Agent 通过 Claude Code 的 Agent 工具调用，拥有独立的上下文和工具权限。

#### archaeology-agent（考古 Agent）

**触发条件：** `.harness/INDEX.md` 考古状态不是"已完成"时，自动触发。仅执行一次。

**工具：** Read, Grep, Glob, Bash

**职责：** 从零建立项目知识库（冷启动）。

**工作流（按 Phase 执行，Phase 3 和 Phase 4 必须暂停等用户）：**

- Phase 1：扫描 package.json、路由配置、src/、git log，生成 route-map 草稿
- Phase 2：推断代码约定（HTTP 方式、状态管理、样式方案等），每条标注置信度，写入 conventions.md 并标记"未确认"
- Phase 3：提取业务语义问题（枚举值含义、TODO/FIXME、命名异常），写入 unknowns.md，**暂停等待用户回答**
- Phase 4：将 Phase 2 的约定逐条向用户确认，**暂停等待用户回答**
- Phase 5：生成所有 INDEX 文件
- Phase 6：更新 `.harness/INDEX.md` 考古状态为"已完成"

**禁止：** 修改业务代码

---

#### spec-agent（需求澄清 Agent）

**触发条件：** Standard/Complex 级任务，Step 2。

**工具：** Read, Grep, Glob

**职责：** 将用户模糊需求转化为明确的产品规格文档（spec.md）。不写代码，不拆任务。

**工作流：**
1. 读 INDEX.md → 提取关键词 → 通过 route-map.index.md 定位相关页面
2. 查 module-history 是否有相关历史
3. 读 conventions.md 相关章节
4. 从四个维度澄清需求：目标、边界（不做什么）、验收标准、非功能需求
5. 若涉及状态名/枚举值未在 decisions.md 定义，先提问再继续

**输出 spec.md 格式：**
- 任务目标
- 影响范围（文件/模块，关联 route-map）
- 验收标准
- 已知风险
- 引用的 conventions/decisions IDs

**禁止：** 输出代码、拆分子任务、跳过索引全量读文件

---

#### gap-check-agent（知识缺口检测 Agent）

**触发条件：** spec-agent 完成后，planner-agent 启动前。

**工具：** Read, Grep, Glob

**职责：** 流程守门员。检测知识缺口，缺口存在则暂停流程提问，全部通过才放行给 planner。

**检查项（5 项）：**
1. spec 涉及的每个文件是否在 route-map 中有记录
2. 涉及模块是否有 `[unknown]` 标记
3. 涉及模块是否在 module-history 中有文件
4. conventions 是否覆盖涉及的模式
5. dependency-graph 是否显示跨模块影响

**输出：**
- 全通过 → 输出 `GAP_CHECK_PASSED`，控制权交给 planner
- 有缺口 → 输出问题清单，**暂停流程等待用户回答** → 用户回答后更新记忆文件，重新检查

**禁止：** 猜测填补缺口、不提问直接放行、提开放式问题

---

#### planner-agent（任务拆分 Agent）

**触发条件：** gap-check 通过后，Step 4。

**工具：** Read

**职责：** 将 spec 拆分为可独立执行的子任务列表（tasks.md）。不写代码。

**风险评估（第一步）：**
- 简单（已知模式，单文件）→ 直接拆分
- 中等（多文件，已知模块）→ 标准拆分
- 复杂（架构决策）→ 先产出设计方案，经用户确认（CHECKPOINT）
- 探索（需求不明）→ 先做 spike，丢弃后正式规划

**拆分规则：**
- 每个子任务：可独立测试、变更 < 200 行、有明确验收点
- 任务间声明依赖
- 高风险任务前后插入 CHECKPOINT

**输出 tasks.md 格式：**
```markdown
## Task 1: ...
- 目标:
- 文件:
- 验收:
- 风险: low/medium/high

## CHECKPOINT 1: 验证 xxx 假设

## Task 2: ...
```

**禁止：** 写代码、跳过风险评估、拆出超过 200 行变更的单任务

---

#### coding-agent（编码执行 Agent）

**触发条件：** planner 完成后，逐个执行每个子任务，Step 5。

**工具：** Read, Write, Edit, Bash, Grep, Glob

**职责：** 执行单个已拆分的编码子任务。一次只处理一个任务。

**执行前强制读取：**
1. 当前 task 描述
2. conventions.md 中相关章节（通过 INDEX 定位）
3. 当前文件所在模块的 module-history
4. dependency-graph 中该模块的依赖关系

**编码中探针（模式冲突检测）：**
若即将写的代码与周边代码模式不一致，扫描同模块其他文件的多数派写法，若冲突则暂停提问："本模块 11/12 文件用 A 写法，我计划用 B，是否有特殊原因？"用户选择后记入 conventions.md。

**执行后：** 调用 review skill 做静态检查。review 通过后交还控制权。review 失败则自行修复，最多 3 次。

**禁止：** 跨任务操作、忽略 conventions 硬约束、引入新的 unknown 模式而不声明

---

#### e2e-review-agent（E2E 验证 Agent）

**触发条件：** coding 完成，涉及前端变更时，Step 7。

**工具：** Read, Bash, mcp__playwright__*（依赖 Playwright MCP）

**职责：** 运行时验证。驱动真实浏览器验证功能、接口、视觉。只验证不修复代码。

**前置检查：**
1. 确认本次变更涉及前端（纯后端则直接跳过）
2. 读 e2e-config.md 获取环境配置
3. curl 检测 dev server 是否运行，未运行则提示用户启动

**工作流（5 个 Phase）：**
- Phase 1：调用 test-case-gen skill 生成测试场景
- Phase 2：调用 browser-control skill 执行浏览器操作
- Phase 3：调用 api-probe skill 验证接口
- Phase 4：调用 visual-check skill 做视觉对比
- Phase 5：产出 e2e-report.md

**失败诊断决策树：** console error → network fail → element 不存在 → element 不可见 → 报告人类

**禁止：** 修改代码、自行启停服务、在生产环境执行、忽略失败

**依赖安装：**
```bash
claude mcp add playwright npx '@playwright/mcp@latest'
```

---

### 5.2 Skills（技能）

Skill 通过 Claude Code 的 `/skill-name` 命令调用，在主会话上下文中执行（不是独立子 agent）。

#### /review — 静态检查 Skill

**触发时机：** 每个 coding 子任务完成后，Step 6。

**检查维度（5 项）：**
1. 语法/类型（运行 tsc/eslint）
2. 符合 conventions.md 硬约束
3. 代码风格
4. 是否引入新的 `[unknown]` 模式
5. 测试是否存在

**输出：**
- PASS → 继续下一步
- FAIL → 返回 coding-agent 并给出具体问题

---

#### /task-summary — 任务归档 Skill

**触发时机：** 所有子任务完成后，Step 8。即使用户没要求也必须执行。

**输出位置：** `.harness/task-archive/YYYY-MM/task-NNN-slug.md`

**必含字段：**
- 任务描述
- 涉及页面（关联 route-map ID）
- 变更清单
- 关键对话摘要
- 【刻意保留的设计】
- 【刻意没做的事】
- 【用户纠正 AI 的地方】（最重要，提取为隐性知识）
- 遗留问题

**隐性知识挖掘：** 扫描本次对话，提取"用户纠正 AI"的片段，提问用户是否应升级为 conventions，确认后写入 conventions.md。

**索引更新：** 追加到 `task-archive/INDEX.md`。

---

#### /project-preview — 索引更新 Skill

**触发时机：** task-summary 之后，Step 9。即使用户没要求也必须执行。

**动作（5 步）：**
1. 读取本次变更文件列表
2. 定位影响的 route-map 条目
3. 追加任务总结到对应条目的"历史任务总结"
4. 若新增页面，创建新 section 并更新 route-map.index.md
5. 若新增模块依赖，更新 dependency-graph.md

**禁止：** 删除历史记录、修改 conventions/decisions

---

#### /browser-control — 浏览器操作 Skill

**作用：** 封装 Playwright MCP 的浏览器操作原语，供 e2e-review-agent 调用。

**能力：** navigate, fill, click, wait_for, screenshot, get_console_logs, execute_script

**Selector 优先级：** data-testid > ARIA role+name > text content > CSS（最后选择）

**禁止：** 固定 sleep（必须用 waitFor）、吞异常（失败必须截图 + 抓日志）

---

#### /api-probe — 网络请求监控 Skill

**作用：** 监控浏览器期间的网络请求，供 e2e-review-agent 验证接口调用。

**能力：** start_recording, stop_recording, assert_request(url/method/status/body), get_failed_requests

**自动脱敏：** 使用 e2e-config.md 中 `sensitive_fields` 定义的字段列表。

---

#### /visual-check — 视觉回归检查 Skill

**作用：** 视觉回归对比 + AI 多模态视觉判断，供 e2e-review-agent 调用。

**能力：** snapshot, compare, check_layout, check_responsive

**基线存放：** `.harness/e2e-baselines/`，首次建立必须人工确认，不自动更新。

**AI 视觉判断维度：** 元素遮挡、文字溢出、对比度、与设计图一致性（若提供）

---

#### /test-case-gen — 测试场景生成 Skill

**作用：** 根据 spec 生成 E2E 测试场景，供 e2e-review-agent 使用。

**生成维度（4 类）：**
- 正向场景（from spec 验收标准）
- 异常场景（空值/超长/特殊字符/网络错误）
- 边界场景（空数据/极大数据/极端分辨率）
- 回归场景（from module-history 历史 bug）

**输出：** `e2e-plan.md`，可被 e2e-review-agent 直接执行。

---

## 六、Layer 4：守卫（Hooks & Permissions）

### 6.1 settings.json — 权限与 Hooks 配置

**文件位置：** `.claude/settings.json`

**作用：** 定义 AI 的文件操作权限白名单/黑名单，以及 hooks 配置。

#### 权限配置

```json
{
  "permissions": {
    "allow": [
      "Read(.harness/**)",
      "Write(.harness/module-history/**)",
      "Write(.harness/task-archive/**)",
      "Write(.harness/unknowns.md)",
      "Write(.harness/handover.md)",
      "Write(.harness/current-spec.md)",
      "Write(.harness/current-tasks.md)",
      "Edit(.harness/route-map.md)",
      "Edit(.harness/route-map.index.md)",
      "Edit(.harness/dependency-graph.md)",
      "Edit(.harness/INDEX.md)",
      "Edit(.harness/**/INDEX.md)",
      "Bash(git log:*)",
      "Bash(git show:*)",
      "Bash(git blame:*)",
      "Bash(git diff:*)"
    ],
    "deny": [
      "Write(.harness/conventions.md)",
      "Write(.harness/decisions.md)",
      "Edit(.harness/conventions.md)",
      "Edit(.harness/decisions.md)"
    ]
  }
}
```

**权限设计逻辑：**
- `.harness/` 整体可读（AI 需要读取所有记忆）
- 任务归档类文件（task-archive/, module-history/, unknowns 等）允许写入（AI 需要更新）
- 路由图、依赖图允许编辑（project-preview skill 需要更新）
- **conventions.md 和 decisions.md 禁止 AI 直接修改**（必须人工确认）
- git 只读命令允许（考古和历史查询需要）

---

### 6.2 Hooks 配置

Hooks 是 Claude Code 在特定事件时自动执行的 shell 命令，输出 JSON 可向 AI 注入额外上下文（`additionalContext`）或拦截操作（`permissionDecision: deny`）。

#### Hook 1: SessionStart（会话启动）

**触发：** Claude Code 会话启动时

**动作：** 内联 echo 命令，直接在 settings.json 中定义

**注入内容：**
```
[Harness] 必须先读取 .harness/INDEX.md 再执行任何任务。
每次编码任务必须声明任务级别(trivial/standard/complex)并逐步完成流程检查点。
```

**目的：** 确保 AI 在最开始就知道需要读 INDEX。

---

#### Hook 2: UserPromptSubmit（用户每次发消息）

**触发：** 用户每次提交一条消息

**脚本：** `.claude/hooks/on-user-prompt.sh`

**逻辑：**
1. 检测 `.harness/current-tasks.md` 是否存在 → 若存在，标注当前处于 CODING 阶段
2. 检测 `.harness/current-spec.md` 是否存在 → 若存在，标注处于 PLANNING 阶段
3. 否则标注为 NEW_TASK 状态

**注入内容：** 流程检查清单（9 步全列，勾选框）+ 任务分级规则 + 要求 AI 在回复中声明级别和步骤

**目的：** 每次对话都提醒 AI 当前流程状态，防止跳步。

---

#### Hook 3: PreToolUse（Edit 工具使用前）

**触发：** AI 调用 Edit 工具编辑文件之前

**逻辑：** 提取 `file_path`，若文件名以 `conventions.md` 或 `decisions.md` 结尾，输出 deny 决策

**动作：** 拦截操作，输出：
```
conventions.md 和 decisions.md 的修改必须经人工确认。
请先向用户展示变更内容并获得明确批准。
```

**目的：** 与 permissions.deny 形成双重保护，防止 AI 意外修改核心约定文件。

---

#### Hook 4: PostToolUse（Write/Edit 工具使用后）

**触发：** AI 调用 Write 或 Edit 工具之后

**脚本：** `.claude/hooks/post-code-edit.sh`

**逻辑：** 提取修改文件路径，若路径包含 `/src/`（即修改了业务代码），注入提醒。

**注入内容：**
```
[Harness 编码后提醒] 已修改 {filename}。后续步骤:
□ review skill 静态检查
□ [前端] e2e-review-agent 验证
□ task-summary skill 归档
□ project-preview skill 更新索引
```

**目的：** 每次修改业务代码后自动提醒后续步骤，防止遗漏 review 和归档。

---

## 七、MCP（Model Context Protocol）

### Playwright MCP

**作用：** 为 e2e-review-agent 提供真实浏览器自动化能力。

**安装命令：**
```bash
claude mcp add playwright npx '@playwright/mcp@latest'
```

**暴露的工具（`mcp__playwright__*`）：** browser_navigate, browser_click, browser_type, browser_snapshot, browser_take_screenshot, browser_console_messages, browser_network_requests 等。

**被使用方：**
- e2e-review-agent（直接调用）
- browser-control skill（封装调用）
- api-probe skill（监控网络请求）
- visual-check skill（截图对比）

---

## 八、协调原理

### 8.1 信息流转图

```
用户需求
    │
    ▼
[UserPromptSubmit Hook] — 注入流程检查清单 + 当前阶段状态
    │
    ▼
Step 1: 读 .harness/INDEX.md（总索引定位）
    │
    ▼
Step 2: spec-agent
    │ 读: route-map.index → conventions → decisions
    │ 写: .harness/current-spec.md
    │ 如发现枚举/状态未定义 → 提问用户
    ▼
Step 3: gap-check-agent
    │ 读: current-spec + INDEX + route-map + unknowns
    │ 通过 → GAP_CHECK_PASSED
    │ 失败 → 提问 → 更新 decisions → 重检
    ▼
Step 4: planner-agent
    │ 读: current-spec + conventions + dependency-graph
    │ 写: .harness/current-tasks.md
    │ Complex 级 → CHECKPOINT → 用户确认设计
    ▼
Step 5: coding-agent (逐个子任务)
    │ 读: task + conventions + module-history + dependency-graph
    │ 写/改: src/ 业务代码
    │ [PostToolUse Hook] — 自动注入后续步骤提醒
    ▼
Step 6: review skill
    │ 运行 tsc/eslint + 检查 conventions 合规
    │ FAIL → 返回 coding-agent（最多 3 次）
    ▼
Step 7: e2e-review-agent（前端变更）
    │ 调用: test-case-gen → browser-control → api-probe → visual-check
    │ 写: .harness/e2e-report.md
    │ FAIL → 返回 coding-agent（最多 3 次）
    ▼
Step 8: task-summary skill
    │ 读: 整个对话历史
    │ 写: .harness/task-archive/YYYY-MM/task-NNN.md
    │ 写: .harness/task-archive/INDEX.md（追加）
    │ 挖掘隐性知识 → 提问用户 → 可能写 conventions.md
    ▼
Step 9: project-preview skill
    │ 写: .harness/route-map.md（追加历史任务总结）
    │ 写: .harness/route-map.index.md（新页面时）
    │ 写: .harness/dependency-graph.md（新依赖时）
    ▼
任务完成，知识库已更新
```

---

### 8.2 防遗忘机制

系统针对最容易被遗忘的三类行为设计了双重保障：

| 遗忘风险 | 第一道防线 | 第二道防线 |
|---------|-----------|-----------|
| 跳过 review | CLAUDE.md 强制规则 | PostToolUse hook 在每次写代码后提醒 |
| 遗忘归档（Step 8/9） | CLAUDE.md 标注"最容易遗忘" | UserPromptSubmit hook 每次对话前刷新检查清单 |
| 误改 conventions/decisions | settings.json deny | PreToolUse hook 拦截 |

---

### 8.3 上下文控制策略

**问题：** 知识库文件多，全量读取会消耗大量 context window。

**解决：** 三级索引结构 + 按需读取协议

```
INDEX.md（必读，轻量）
  └─ route-map.index.md（关键词定位）
       └─ route-map.md 对应章节（按需）
  └─ module-history/INDEX.md
       └─ 具体模块 history（按需）
  └─ task-archive/INDEX.md
       └─ 具体任务归档（按需）
```

每个 agent 按"关键词 → 索引 → 定位 → 只读定位到的内容"四步操作，禁止全量扫描。

---

### 8.4 质量门控链

```
spec（需求明确）→ gap-check（知识完整）→ plan（方案合理）→ code → review（静态正确）→ e2e（运行时正确）→ archive（知识沉淀）
```

每一道门都有明确的通过标准和失败处理策略，失败不跳过，最多重试 3 次后 handoff 给人类。

---

## 九、在新项目上复现此系统

### 步骤 1：创建目录结构

```bash
mkdir -p .harness/module-history
mkdir -p .harness/task-archive
mkdir -p .harness/e2e-baselines
mkdir -p .claude/agents
mkdir -p .claude/skills/review
mkdir -p .claude/skills/task-summary
mkdir -p .claude/skills/project-preview
mkdir -p .claude/skills/browser-control
mkdir -p .claude/skills/api-probe
mkdir -p .claude/skills/visual-check
mkdir -p .claude/skills/test-case-gen
mkdir -p .claude/hooks
```

### 步骤 2：创建核心规则文件

按本文档第三节的内容创建：
- `CLAUDE.md`（主流程规则）
- `AGENTS.md`（Agent 协作规则）

### 步骤 3：初始化知识库骨架

创建以下文件（内容可为空或使用模板）：

```bash
# 必须存在，考古状态初始为"未完成"
touch .harness/INDEX.md  # 写入考古状态: [ ] 未完成

# 其他知识库文件
touch .harness/conventions.md
touch .harness/decisions.md
touch .harness/route-map.md
touch .harness/route-map.index.md
touch .harness/dependency-graph.md
touch .harness/unknowns.md
touch .harness/questioning-policy.md
touch .harness/e2e-config.md
touch .harness/handover.md
touch .harness/module-history/INDEX.md
touch .harness/task-archive/INDEX.md
```

**INDEX.md 初始内容（关键是考古状态字段）：**

```markdown
# Harness 主索引
> 任何 agent 启动时必须先读本文件。

## 当前项目状态
- 考古状态: [ ] 未完成
```

### 步骤 4：创建 Agent 定义文件

在 `.claude/agents/` 下按本文档第五节的内容创建 6 个 `.md` 文件，每个文件有 YAML frontmatter：

```yaml
---
name: agent-name
description: 触发时机描述（Claude Code 用此判断何时调用）
tools: Read, Grep, Glob  # 该 agent 可用的工具列表
---

# Agent 指令内容...
```

### 步骤 5：创建 Skill 定义文件

在 `.claude/skills/{name}/SKILL.md` 下创建 7 个 skill 文件，frontmatter 格式：

```yaml
---
name: skill-name
description: 技能描述
---

# Skill 内容...
```

### 步骤 6：创建 Hook 脚本

```bash
# 创建并赋可执行权限
touch .claude/hooks/on-user-prompt.sh
touch .claude/hooks/post-code-edit.sh
chmod +x .claude/hooks/on-user-prompt.sh
chmod +x .claude/hooks/post-code-edit.sh
```

按本文档第六节的内容填写脚本内容。关键点：
- `on-user-prompt.sh`：检测 current-spec.md 和 current-tasks.md 是否存在，输出流程状态 + 检查清单 JSON
- `post-code-edit.sh`：提取 file_path，若含 `/src/` 则输出编码后提醒 JSON

### 步骤 7：配置 settings.json

按本文档第六节的内容创建 `.claude/settings.json`，包含 permissions 和 hooks 配置。

### 步骤 8：安装 Playwright MCP（E2E 需要）

```bash
claude mcp add playwright npx '@playwright/mcp@latest'
```

### 步骤 9：触发考古

完成上述步骤后，在 Claude Code 中开始对话，系统会检测到考古状态为"未完成"，自动触发 archaeology-agent 执行冷启动考古（6 个 Phase，其中 Phase 3 和 Phase 4 需要用户参与回答问题）。

---

## 十、常见问题

**Q: 为什么 conventions.md 和 decisions.md 要双重保护？**

A: 这两个文件是整个系统中最核心的知识。一旦被 AI 错误修改，会影响所有后续任务的判断。双重保护（deny + PreToolUse hook）确保即使 AI 试图绕过权限也会被拦截，修改必须经过人工确认。

**Q: Trivial 级任务能跳过哪些步骤？**

A: 可以跳过 spec-agent（Step 2）、gap-check-agent（Step 3）、planner-agent（Step 4）、e2e-review-agent（Step 7）。但 review（Step 6）、task-summary（Step 8）、project-preview（Step 9）不可跳过——即使是小改动也要归档，否则知识库会有盲点。

**Q: 如果 archaeology-agent 推断的约定不准确怎么办？**

A: Phase 4 专门设计了确认环节，所有推断都会逐条向用户确认。否认的约定会被删除，不确定的会降级为 low 置信度。关键是 conventions.md 的修改需要人工操作（AI 被禁止直接修改）。

**Q: handover.md 是自动更新的吗？**

A: 目前需要 task-summary skill 在任务归档时顺带更新。建议在会话结束前手动触发 `/task-summary`。

**Q: 新项目使用但没有 src/ 目录怎么办？**

A: 修改 `post-code-edit.sh` 中 `grep -q "/src/"` 的判断条件，改为你的项目业务代码目录路径（如 `/app/`、`/lib/` 等）。

---

*文档生成时间: 2026-04-19*
*基于 Harness v1.0（首次 E2E 通过版本）*

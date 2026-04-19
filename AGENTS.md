# Agent 协作总纲

## Agent 职责边界

| Agent              | 输入                         | 输出              | 禁止          |
|--------------------|------------------------------|-------------------|---------------|
| archaeology-agent  | 空项目/现有代码              | .harness/* 初版   | 修改业务代码  |
| spec-agent         | 用户需求                     | spec.md           | 写代码/拆任务 |
| gap-check-agent    | spec.md + INDEX              | gaps.md / 放行    | 做决定        |
| planner-agent      | spec.md + 已知信息           | tasks.md          | 写代码        |
| coding-agent       | 单个 task                    | 代码变更          | 跨任务操作    |
| e2e-review-agent   | 已完成的变更                 | e2e-report.md     | 修复代码      |

## 上下文注入优先级（每个 agent 读取顺序）

1. .harness/INDEX.md（总索引,必读）
2. 当前任务关键词对应的子索引
3. .harness/conventions.md（硬约束）
4. .harness/decisions.md（历史决策）
5. 当前任务涉及的 module-history（按需）
6. 相关 task-archive（按需）

## 禁止事项

- coding-agent 不得绕过 planner 直接响应用户
- 任何 agent 不得跳过 gap-check
- e2e-review-agent 不得自行修复代码
- 发现 unknowns 时不得猜测,必须提问

## 失败处理

- gap-check 失败 → 向用户提问,回答后更新 decisions 再继续
- coding 失败 → 返回 planner 重新规划（最多 3 次）
- e2e 失败 → 返回 coding 修复（最多 3 次,超过则 handoff 给人类）

---
name: review
description: 每个 coding 子任务完成后的静态检查。
---

# Review Skill

## 检查维度

1. 语法 / 类型（运行 tsc/eslint）
2. 符合 conventions.md 硬约束
3. 代码风格
4. 是否引入新的 [unknown] 模式
5. 测试是否存在

## 输出

- PASS: 继续下一步
- FAIL: 返回 coding-agent 并给出具体问题

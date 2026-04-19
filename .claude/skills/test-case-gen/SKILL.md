---
name: test-case-gen
description: 根据 spec 生成 E2E 测试场景。
---

# Test Case Generator Skill

## 生成维度

- 正向场景（from spec 验收标准）
- 异常场景（空值/超长/特殊字符/网络错误）
- 边界场景（空数据/极大数据/极端分辨率）
- 回归场景（from module-history 历史 bug）

## 输出

e2e-plan.md,可被 e2e-review-agent 直接执行。

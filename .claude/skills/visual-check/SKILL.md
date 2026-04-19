---
name: visual-check
description: 视觉回归对比 + AI 视觉判断。
---

# Visual Check Skill

## 能力

- snapshot / compare / check_layout / check_responsive

## 基线

存于 .harness/e2e-baselines/
首次建立必须人工确认,不自动更新。

## AI 视觉判断

调用多模态能力判断:
- 元素遮挡
- 文字溢出
- 对比度
- 与设计图一致性（若提供）

---
name: browser-control
description: 封装 Playwright MCP 的浏览器操作原语。
---

# Browser Control Skill

## 依赖

Playwright MCP（需用户先执行）:
  claude mcp add playwright npx '@playwright/mcp@latest'

## 能力

- navigate / fill / click / wait_for / screenshot
- get_console_logs / execute_script
- 所有操作通过 mcp__playwright__* 工具调用

## Selector 优先级

1. data-testid
2. ARIA role + name
3. text content
4. CSS（最后选择）

易碎 selector 时建议业务代码添加 data-testid,记入 conventions。

## 禁止

- 固定 sleep（必须用 waitFor）
- 吞异常（失败必须截图 + 抓日志）

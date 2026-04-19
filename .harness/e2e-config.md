# E2E 配置

## 环境

- dev_url: http://localhost:3000
- staging_url: （待填）
- 禁用环境: production

## 测试账号

- 普通用户: （待填）
- 管理员: （待填）

## 脱敏字段

sensitive_fields:
  - password
  - token
  - idCard
  - phone
  - bankCard

## 超时

- page_load: 30s
- action: 10s
- api: 15s

## 视觉对比

- pixel_diff_threshold: 0.05
- ignore_regions: [".timestamp", ".random-avatar"]

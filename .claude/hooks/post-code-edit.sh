#!/bin/bash
# PostToolUse hook: 监控 src/ 目录的代码变更,提醒执行后续流程
# 仅在 Write/Edit 操作命中 src/ 时触发提醒

INPUT=$(cat)

# 提取 tool_input 中的 file_path (处理嵌套 JSON)
FILE_PATH=$(echo "$INPUT" | sed -n 's/.*"tool_input".*"file_path"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -1)

# 回退: 直接提取任意 file_path
if [ -z "$FILE_PATH" ]; then
  FILE_PATH=$(echo "$INPUT" | grep -o '"file_path"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed 's/"file_path"[[:space:]]*:[[:space:]]*"//;s/"$//')
fi

# 只对 src/ 下的文件变更触发
if echo "$FILE_PATH" | grep -q "/src/"; then
  BASENAME=$(basename "$FILE_PATH")
  cat <<HOOKEOF
{
  "additionalContext": "[Harness 编码后提醒] 已修改 ${BASENAME}。后续步骤:\n□ review skill 静态检查\n□ [前端] e2e-review-agent 验证\n□ task-summary skill 归档\n□ project-preview skill 更新索引"
}
HOOKEOF
fi

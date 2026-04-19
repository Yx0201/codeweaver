#!/bin/bash
# UserPromptSubmit hook: 每次用户提交消息时注入 Harness 流程指令
# 读取用户输入,判断是否为编码任务,注入对应级别的流程提醒

INPUT=$(cat)
USER_MSG=$(echo "$INPUT" | grep -o '"content":\s*"[^"]*"' | head -1 | sed 's/"content":\s*"//;s/"$//')

# 检查是否存在进行中的 harness 流程文件
HAS_SPEC=false
HAS_TASKS=false
[ -f ".harness/current-spec.md" ] && HAS_SPEC=true
[ -f ".harness/current-tasks.md" ] && HAS_TASKS=true

# 构建流程状态提醒
if [ "$HAS_TASKS" = true ]; then
  PHASE="CODING 阶段: 有已拆分的任务,请继续执行 current-tasks.md 中的下一个子任务"
elif [ "$HAS_SPEC" = true ]; then
  PHASE="PLANNING 阶段: spec 已就绪,请运行 gap-check → planner"
else
  PHASE="NEW_TASK: 如果这是编码任务,必须先运行 spec-agent 澄清需求"
fi

cat <<HOOKEOF
{
  "additionalContext": "[Harness 流程守卫]\n当前状态: ${PHASE}\n\n⚠️ 强制检查清单（编码任务必须逐项完成）:\n□ 1. 已读取 .harness/INDEX.md\n□ 2. 已通过 spec-agent 澄清需求（或判定为 trivial 级跳过）\n□ 3. 已通过 gap-check-agent 检测知识缺口\n□ 4. 已通过 planner-agent 拆分子任务（或 trivial 级跳过）\n□ 5. coding-agent 单任务执行\n□ 6. review skill 静态检查\n□ 7. [前端任务] e2e-review-agent 运行时验证\n□ 8. task-summary skill 归档\n□ 9. project-preview skill 更新索引\n\n任务分级规则:\n- trivial（单文件 <20 行变更）: 可跳过 2/3/4,直接编码,但 6/8/9 不可跳过\n- standard（多文件或 >20 行）: 全流程必须执行\n- complex（架构变更/新模块）: 全流程 + CHECKPOINT 机制\n\n请在回复中明确声明当前任务级别和已完成的步骤编号。"
}
HOOKEOF

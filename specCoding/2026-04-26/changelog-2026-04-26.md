# Changelog 2026-04-26

## P3.1 图谱可视化接入

### 前端展示
- `src/app/knowledge/[id]/_components/knowledge-graph-panel.tsx`
  - 知识库详情页新增图谱可视化面板
  - 使用 `echarts` 做节点/边展示、拖拽和关系标签渲染
- `src/app/knowledge/[id]/page.tsx`
  - 文件列表页接入图谱统计和图谱面板

### 依赖
- `package.json`
  - 增加 `echarts`
  - `build` 改为 `prisma generate && next build`
  - 增加 `postinstall: prisma generate`

---

## P3.2 文件上传改为异步多阶段处理

### 新增后台处理接口
- `src/app/api/knowledge/[id]/files/[fileId]/process/route.ts`
  - 上传后不再同步完成所有处理
  - 改为前端轮询推进的异步处理链

### 状态机
- `src/lib/upload-processing.ts`
  - 初版五阶段：上传保存 / 文本分块 / 向量构建 / 图谱抽取 / 完成收尾
  - 后续扩展为六阶段（见 P3.5）

### 前端进度展示
- `src/app/knowledge/[id]/_components/upload-file-button.tsx`
  - 显示总进度、阶段名、分阶段进度条
- `src/app/knowledge/[id]/_components/file-list.tsx`
  - 列表页显示处理中状态与百分比
- `src/app/knowledge/[id]/page.tsx`
  - 解析并透传处理元数据

### 上传入口
- `src/app/api/knowledge/[id]/upload/route.ts`
  - 仅负责保存原始文件、文本内容和初始处理状态
  - 不再在单个请求内同步完成 embedding / 图谱构建

---

## P3.3 Vercel / 构建问题修复

### Prisma Client 生成
- `package.json`
  - 构建前显式执行 `prisma generate`
  - 修复 Vercel 构建时 `src/generated/prisma` 缺失问题

### 动态页面预渲染修复
- `src/app/chat/page.tsx`
- `src/app/chat/[conversationId]/page.tsx`
  - 显式声明 `export const dynamic = "force-dynamic"`
  - 修复构建阶段访问数据库导致的 prerender error

---

## P3.4 图谱展示与数据清理联动

### 图谱数据源
- `src/lib/knowledge-graph.ts`
  - 增加知识库图谱查询与聚合统计
  - 关系写入时保存来源 chunk 元数据

### 删除文件联动清理
- `src/actions/knowledge.ts`
  - 删除文件时同步清理失效图谱关系

---

## P3.5 小说场景下的双 Chunk 重构

### 核心目标
- 混合检索与图谱检索分离两套 chunk 策略
- 检索 chunk 为召回服务
- graph chunk 为实体/关系抽取服务

### Schema / Migration
- `prisma/schema.prisma`
  - 新增 `graph_chunks` 表
  - `uploaded_files` 增加 `graph_chunks` 反向关系
  - `kg_entity_chunk` 从映射 `document_chunks` 改为映射 `graph_chunks`
- `prisma/migrations/202604261830_dual_chunk_graph_pipeline/migration.sql`
  - 补齐历史 `db push` 漂移的正式迁移
  - 创建 `graph_chunks`
  - 将 `kg_entity_chunk` 外键迁移到 `graph_chunks`
  - 回填旧 parent chunk 到 `graph_chunks`

### 小说专用分块器
- `src/lib/novel-chunking.ts`
  - 识别 `第X章`、`第X卷`、`【第X卷 完】`
  - 生成两套 chunk：
    - Retrieval chunks：parent/child，用于混合检索
    - Graph chunks：更大、更完整，用于图谱抽取
  - graph chunk 参数后续调整为更大的目标尺寸以减少总调用次数

### 上传处理链升级为六阶段
- `src/lib/upload-processing.ts`
  - 阶段改为：
    1. 上传保存
    2. 检索分块
    3. 向量构建
    4. 图谱分块
    5. 图谱构建
    6. 完成收尾
- `src/app/api/knowledge/[id]/files/[fileId]/process/route.ts`
  - 检索分块写入 `document_chunks`
  - 图谱分块写入 `graph_chunks`
  - 图谱构建从 `graph_chunks` 读取并抽取

---

## P3.6 三种检索模式真正分流

### 检索模式
- `hybrid`
  - 混合检索 + reranker
- `fast`
  - 混合检索，不走 reranker
- `graph`
  - 只走图谱检索

### 代码拆分
- `src/lib/search-service.ts`（新建）
  - 统一按 `searchMode` 分流检索路径
- `src/lib/hybrid-search.ts`
  - 去掉把 graph 结果混入 RRF 的旧逻辑
  - 专注 vector + keyword + reranker
- `src/lib/graph-search.ts`
  - 从 `graph_chunks` 取回图谱上下文
- `src/app/api/vector-search/route.ts`
  - 改为接受 `searchMode`
- `src/app/api/chat/route.ts`
  - 构建 system prompt 时按 `searchMode` 调用对应检索链路
- `src/app/chat/_components/chat-interface.tsx`
  - 前端改为直接传递 `searchMode`

---

## P3.7 预览页与换行兼容修复

### 文件预览
- `src/app/knowledge/[id]/files/[fileId]/page.tsx`
  - 渲染前统一 `\r\n` → `\n`
  - 修复文本预览页 hydration mismatch

### 上传归一化
- `src/app/api/knowledge/[id]/upload/route.ts`
  - 文件入库前统一换行格式

---

## P3.8 图谱抽取改造：显式使用 Ollama /api/generate

### 抽取入口
- `src/lib/graph-extractor.ts`
  - 不再依赖通用 `generateText` 隐式调用链
  - 改为显式 `fetch` 到 Ollama `/api/generate`

### 显式参数
- `model: "qwen3:8b"`
- `stream: false`
- `think: false`
- `keep_alive: "5m"`
- `options.num_ctx: 4096`
- `options.num_predict: 512`
- `temperature: 0`
- `top_p: 0.8`
- `repeat_penalty: 1.05`

### Prompt / Schema 约束
- 系统提示词明确：
  - 不要解释
  - 不要 Markdown
  - 不要推理过程
  - 只输出 JSON
- 使用 JSON Schema 约束 `entities` 与 `relations`
- query 实体提取也显式关闭 `think`

---

## P3.9 图谱抽取容错链

### 容错链路
- `src/lib/graph-extractor.ts`
  - 原始 JSON 解析
  - 本地 `jsonrepair`
  - 模型二次修复 JSON
  - 再次本地 `jsonrepair`
  - 字段级清洗
  - Zod 最终校验

### 字段级清洗
- 对 `name / source / target / relation / description`
  - 去除代码块符号
  - 清理控制字符
  - 统一换行
  - 限制长度
- 丢弃缺少关键字段的脏实体 / 脏关系

### 失败策略调整
- 初版：任意 graph chunk 最终失败时，中断整次文件处理
- 最终调整：允许单个 graph chunk 失败并跳过
  - `src/app/api/knowledge/[id]/files/[fileId]/process/route.ts`
  - 单个 chunk 抽取失败仅 `console.warn`
  - 写入 `metadata.graph_error`
  - 标记 `graph_processed: true`
  - 整体文件处理继续执行，不再整批失败

---

## P3.10 当前结论

### 已解决
- 图谱可视化已接入
- 双 chunk 路线已完成
- graph 检索与混合检索已彻底分流
- 图谱抽取显式关闭 think
- JSON 坏格式与缺字段问题已做多层容错
- 单个 graph chunk 失败不再导致整批上传失败

### 仍然存在的现实问题
- 本地 `qwen3:8b` 结构化抽取稳定性有限
- graph chunk 数量较多时，图谱构建仍然偏慢
- 目前主要瓶颈已从“流程错误”转为“本地模型吞吐与稳定性”

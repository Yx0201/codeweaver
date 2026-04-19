# Route Map 子索引

> 用于快速定位 route-map.md 中的具体页面条目。
> 按页面路径字母排序,带关键词 tag。

## 索引表

| 页面路径 | Section ID | 关键词 | 关联模块 |
|---------|-----------|-------|---------|
| / | ROUTE-001 | 首页, 欢迎, landing | - |
| /chat | ROUTE-002 | 对话, 聊天, chat, 新对话 | ChatShell, ChatInterface, ConversationSidebar |
| /chat/[conversationId] | ROUTE-003 | 对话详情, 历史消息, 会话 | ChatShell, ChatInterface |
| /knowledge | ROUTE-004 | 知识库, 列表, knowledge | KnowledgeBaseCard, CreateKnowledgeDialog |
| /knowledge/[id] | ROUTE-005 | 知识库详情, 文件列表, 上传 | FileList, UploadFileButton |
| /knowledge/[id]/files/[fileId] | ROUTE-006 | 文件详情, 预览 | - |
| POST /api/chat | API-001 | 对话API, 流式, RAG, 检索 | hybrid-search, rag-service, model |
| POST /api/vector-search | API-002 | 搜索API, 混合检索 | hybrid-search |
| POST /api/knowledge/[id]/upload | API-003 | 上传, 分块, 嵌入, 向量化 | embedding, prisma |
| PATCH /api/conversations/[id]/kb | API-004 | 知识库绑定, 搜索模式 | - |
| PATCH /api/conversations/[id]/title | API-005 | 标题更新 | - |
| GET /api/files/[fileId] | API-006 | 文件下载 | - |
| POST /api/system-prompt | API-007 | system prompt, RAG提示词 | rag-service |

## 使用方式

1. 用任务关键词匹配"页面路径"或"关键词"列
2. 跳转到 route-map.md 的对应 section
3. 不读 route-map.md 的其他部分

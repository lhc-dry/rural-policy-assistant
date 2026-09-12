# 乡村助农政策知识库

前后端分离的政策问答系统：React 18 + TypeScript + Vite 负责页面交互，Fastify + Prisma + PostgreSQL 负责业务数据、文件、会话、问答统计和检索。

## 主要功能

- 访客免登录进入政策服务台，按板块连续对话，匿名 Cookie 绑定服务端会话。
- 消息从服务端加载并持久化，支持虚拟列表、动态高度、流式输出、中断、重试、反馈和 PDF 引用预览。
- 管理员可维护板块、PDF 文件、公告和统计数据。文件上传、替换、移动、删除和失败重试都通过 HTTP 接口完成。
- 管理端只显示“处理中”“上传完成”“处理失败”三种业务状态；访客端只获取“上传完成”的 PDF。
- 后端处理进程负责 PDF 按页提取、分块、关键词召回、Embedding 写入 pgvector，以及版本校验和过期结果丢弃。
- 检索先按板块和勾选文件过滤，再进行关键词与向量双路召回、RRF 融合、规则精排和同文档去重，最多向回答服务提供三个片段。

## 环境变量

复制 `.env.example` 后配置：`DATABASE_URL`、`REDIS_URL`、`FILE_STORAGE_DIR`、`SESSION_SECRET`、管理员账号，以及 `EMBEDDINGS_BASE_URL`、`EMBEDDINGS_MODEL`、`LLM_BASE_URL`、`LLM_MODEL` 和对应密钥。未配置真实模型时，接口会返回配置错误，不会生成伪造向量或虚假引用。

PDF 是首版唯一允许上传和解析的格式；扫描 PDF 若无法提取文字会进入“处理失败”。系统不提供跨设备数据同步、生产级授权或真实模型服务，部署时应由后端环境变量接入企业模型网关。
<img width="552" height="262" alt="image" src="https://github.com/user-attachments/assets/c230c64f-435c-47da-b76e-5b2978e444b5" />

## 校验命令

```bash
npm run server:typecheck
npm run build
npm run lint
npm test
```

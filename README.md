## 📖 项目简介

面向乡村助农政策咨询场景，基于 RAG 检索增强生成技术搭建政策知识库系统，分为**访客对话前端**和**运维后台管理系统**两大模块。
系统依托大模型 + 知识库实现政策文档检索、多轮对话、流式答案输出；后台支持 PDF 政策文档管理、异步文档解析、问答数据统计、公告维护与权限管控，帮助基层用户快速理解涉农政策，降低政策信息获取门槛。

## 🛠️ 技术栈

### 访客对话端

`React18` + `TypeScript` + `Vite` + `react-window` + `Fetch-SSE` + `LocalStorage`

### 后台管理系统

`React18` + `TypeScript` + `Vite` + `Ant Design` + `Axios` + `React Router` + `ECharts`

## ✨ 功能亮点

### 访客对话端

- ✅ RAG 多轮对话：对话上下文记忆，理解连续政策咨询问题
- ✅ SSE 流式输出：逐 Token 返回大模型回答，支持回答中断、消息列表自动滚动跟随
- ✅ 虚拟列表优化：长对话场景下使用`react-window`渲染，减少 DOM 节点，控制内存开销
- ✅ 组件懒加载：`React.lazy + Suspense` + Vite 分包，优化首屏加载速度
- ✅ 多模态输入：文本提问、语音输入，消息状态统一管理

> <img width="1907" height="1036" alt="image" src="https://github.com/user-attachments/assets/f7b96e59-a88a-4d86-80b9-2dc93e57c265" />
<img width="1906" height="1030" alt="image" src="https://github.com/user-attachments/assets/da0f30ba-c414-4136-a4e7-2735f00c550b" />



### 后台管理系统

- ✅ 权限管控：路由守卫 + Session + HttpOnly Cookie，实现登录鉴权
- ✅ PDF 文档管理：政策文档上传、删除、查看，对接后端异步解析队列
- ✅ 异步任务看板：文档处理中 / 成功 / 失败状态展示，失败文档支持一键重解析
- ✅ 数据可视化：ECharts 实现问答统计、高频问题排行、词云，自动适配窗口，防止内存泄漏
- ✅ 内容管理：政策分类维护、公告草稿保存、发布 / 下架管理

> 
> <img width="1905" height="1028" alt="image" src="https://github.com/user-attachments/assets/a65748de-6a93-41ba-81a9-839522bdeecd" />


## 🚀 本地启动

> 
> 前提：安装 Node.js (>=18)

```
# 安装依赖
npm install

# 本地开发启动
npm run dev

# 项目打包构建
npm run build
```

## 📁 目录简要说明

```
├── src/                 # 源码目录
│   ├── api/             # 请求封装，SSE流式接口
│   ├── components/      # 公共组件
│   ├── pages/           # 页面路由（对话页、登录页、后台管理页面）
│   ├── stores/          # 状态管理
│   └── utils/           # 工具函数
├── public/              # 静态资源
├── server/              # 后端相关定义、类型、docker配置
├── .gitignore
├── package.json
└── vite.config.ts
```

## 📌 项目说明

本项目为**校级大学生创新创业训练计划项目**前端工程，配套后端实现文档向量入库、混合检索、大模型调用、异步任务队列等 RAG 核心能力。前端负责交互渲染、流式通信、可视化展示与系统权限管理


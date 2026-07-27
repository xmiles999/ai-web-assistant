# 技术开发说明

版本：0.2.1

## 模块

- `src/background/service-worker.ts`：安装初始化、右键菜单、消息路由、任务校验、Side Panel 和 AI 流。初始化使用 single-flight，菜单重建通过 Promise 队列串行执行，避免安装事件与 Service Worker 启动同时触发时产生重复 ID 或父菜单缺失。
- `src/background/content-injection.ts`：在安装、更新、新增站点权限和标签页重新激活时，对已打开页面执行幂等 Content Script 补注入。
- `src/content/content-script.tsx`：选区读取、Shadow DOM 工具栏和内联流式结果弹窗，不接触密钥。扩展 CSS 通过 Shadow Root 的构造样式表与 CSSOM 静态规则双路安装，严格 CSP 下仍能保留工具栏的关键布局。Content Script 启动入口位于样式常量初始化之后，防止 IIFE 构建产物在样式赋值前提前创建工具栏。
- `src/providers/`：Provider URL 校验、SSE 解析、OpenAI/Azure 请求适配。
- `src/security/crypto.ts`：PBKDF2-SHA-256 与 AES-GCM。
- `src/storage/`：Chrome Storage 和 IndexedDB 历史。
- `src/options/`、`src/popup/`、`src/sidepanel/`：设置、快速状态和结果工作区。

## 构建

Vite 主配置构建 Popup、Options、Side Panel 和 module Service Worker；独立配置把 Content Script 打包为 `dist/content-script.js` IIFE。Manifest 通过静态 `content_scripts` 在 HTTP/HTTPS 页面注入该文件，并由 `public/manifest.json` 原样复制。

## 权限与数据流

基础权限为 contextMenus、scripting、sidePanel、storage；安装时通过 `host_permissions` 请求全部 HTTP/HTTPS 网站。该权限同时允许静态注入工具栏、对已打开页面补注入和访问用户配置的 AI 接口。Service Worker 是唯一 AI 请求入口，API Key 位于扩展可信上下文的 session storage；Content Script 只发送结构化任务并通过 Port 接收流式文本。

## Provider 请求

兼容接口使用 `POST {baseUrl}/chat/completions`、Bearer Authorization、`stream: true` 和分块 SSE。Azure 使用独立的 deployment、api-version 和 `api-key` 头。请求设置 AbortController、超时和最多一次的无输出可重试逻辑。

## 测试映射

Vitest 覆盖 Prompt 插值、URL 校验、加密解密、SSE 分块、并发菜单重建和旧标签页补注入。Playwright 通过本地 fixture 实际执行生产 Content Script，并验证工具栏、内联弹窗、流式文本和严格 `style-src` CSP 下的样式隔离；运行环境能够暴露扩展 Service Worker 时，再执行本地 Mock SSE 完整链路。无头 Chromium 不支持该能力时测试会明确跳过，不会伪报通过。真实付费 API 不在自动化测试中使用。

## 已知限制

Chrome 受限页面禁止注入；全站权限会在安装时产生明确的高权限提示；工具栏拖动未纳入首期；内联结果使用安全纯文本而非富 Markdown；原生 Claude API 不在首期范围；请求所属网页弹窗或 Side Panel 被关闭时，当前请求会取消。

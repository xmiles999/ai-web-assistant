# 技术开发说明

版本：0.1.0

## 模块

- `src/background/service-worker.ts`：安装初始化、右键菜单、消息路由、Side Panel、AI 流和权限协调。
- `src/content/content-script.tsx`：选区读取和 Shadow DOM 工具栏，不接触密钥。
- `src/providers/`：Provider URL 校验、SSE 解析、OpenAI/Azure 请求适配。
- `src/security/crypto.ts`：PBKDF2-SHA-256 与 AES-GCM。
- `src/storage/`：Chrome Storage 和 IndexedDB 历史。
- `src/options/`、`src/popup/`、`src/sidepanel/`：设置、快速状态和结果工作区。

## 构建

Vite 主配置构建 Popup、Options、Side Panel 和 module Service Worker；独立配置把 Content Script 打包为 `dist/content-script.js` IIFE，以便 `chrome.scripting.registerContentScripts` 动态注册。Manifest 由 `public/manifest.json` 原样复制。

## 权限与数据流

基础权限为 activeTab、contextMenus、scripting、sidePanel、storage；站点和 API 域名使用可选主机权限。右键菜单使用 selectionText；悬浮工具栏须按 origin 授权。Service Worker 是唯一 AI 请求入口，API Key 位于扩展可信上下文的 session storage，Content Script 只能发送结构化消息。

## Provider 请求

兼容接口使用 `POST {baseUrl}/chat/completions`、Bearer Authorization、`stream: true` 和分块 SSE。Azure 使用独立的 deployment、api-version 和 `api-key` 头。请求设置 AbortController、超时和最多一次的无输出可重试逻辑。

## 测试映射

Vitest 覆盖 Prompt 插值、URL 和权限模式、加密解密、SSE 分块。Playwright 通过本地 fixture 实际执行生产 Content Script；运行环境能够暴露扩展 Service Worker 时，再执行站点授权和本地 Mock SSE 完整链路。无头 Chromium 不支持该能力时测试会明确跳过，不会伪报通过。真实付费 API 不在自动化测试中使用。

## 已知限制

Chrome 受限页面禁止注入；网站授权撤销后已有页面需刷新；工具栏拖动未纳入首期；原生 Claude API 不在首期范围；Service Worker 或 Side Panel 被浏览器关闭时，当前请求会取消。

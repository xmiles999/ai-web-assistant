# AI 网页助手

AI 网页助手是一个 Manifest V3 Chrome 扩展：选择网页文字后，通过右键菜单或用户授权的网站悬浮工具栏调用自己配置的 OpenAI Chat Completions 兼容接口。

当前版本 `0.1.0` 是本地优先的首期实现：支持选区、动态网站权限、Side Panel 流式输出、OpenAI/Azure Provider 档案、自定义 Prompt、可选本地历史和口令加密的持久 API Key。未实现账号、云同步、官网、Agent 和自动发布。

## 开发

环境要求：Node.js 22+、npm 10+。

```text
npm install
npm run icons
npm run dev
```

生产构建：

```text
npm run build
```

构建结果位于 `dist/`。在 Chrome 打开 `chrome://extensions`，开启“开发者模式”，选择“加载已解压的扩展程序”，选中 `dist/`。

检查和测试：

```text
npm run lint
npm run typecheck
npm run test:coverage
npm run build
PLAYWRIGHT_BROWSERS_PATH=/data/services/playwright npm run test:e2e
```

首次运行 E2E 前可执行 `PLAYWRIGHT_BROWSERS_PATH=/data/services/playwright npx playwright install chromium`。E2E 使用本地 fixture 和 Mock 服务，不调用真实付费 AI 接口。无头 Chromium 不暴露扩展 Service Worker 时，打包后的 Content Script 场景仍会执行，完整扩展流式链路会明确标记为跳过；可在带图形环境的 headed Chromium 中补充验证。

## 配置

在扩展设置中新增服务：

- OpenAI 兼容：例如 `https://api.openai.com/v1`，请求会发送到 `/chat/completions`。
- Azure OpenAI：填写实际 resource endpoint、deployment 和 api-version。
- Ollama 等本地服务仅允许 `http://localhost`、`127.0.0.1` 或 `::1`，并需要用户主动配置。

模型名称不由插件硬编码，必须填写服务商实际支持的名称。远程服务会收到用户主动提交的选中文字；插件不运营中转服务器。

“测试”按钮会发送一条要求回复 `OK` 的最小生成请求，可能产生少量费用，执行前会再次确认。

API Key 默认只存当前浏览器会话。如果选择持久保存，使用用户口令通过 PBKDF2-SHA-256 派生 AES-GCM 密钥加密；口令不保存。Chrome 扩展不能提供操作系统级密钥链，详情见 [安全说明](docs/SECURITY.md)。

## 文档

- [功能说明](docs/FUNCTIONAL_SPEC.md)
- [技术开发说明](docs/TECHNICAL_DEVELOPMENT.md)
- [安全说明](docs/SECURITY.md)
- [隐私说明](docs/PRIVACY.md)

## SEO 结论

本项目只输出 Chrome 扩展的 Popup、Options 和 Side Panel，不是公开网站，不存在可被搜索引擎抓取的业务 URL，因此 SEO 不适用。独立官网属于后续独立项目。

## 发布状态

当前为本地开发构建，未提交 Git、未发布 Chrome Web Store、未部署任何服务。发布前应由维护者审阅权限、隐私文案、依赖许可证和打包制品哈希。

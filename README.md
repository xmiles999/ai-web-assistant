# AI 网页助手

> Privacy-first Chrome extension for selected-text AI actions with user-provided OpenAI-compatible APIs.

AI 网页助手是一个 Manifest V3 Chrome 扩展：安装时请求普通 HTTP/HTTPS 网站权限，选择网页文字后自动显示工具栏，并通过自己配置的 OpenAI Chat Completions 兼容接口处理内容。扩展安装、更新或新增站点权限后，会尝试对已打开的普通网页补注入 Content Script，无需依赖下次导航。

当前版本 `0.2.1` 是本地优先的开源发布基线：工具栏操作默认在选区附近显示流式结果弹窗，右键菜单和扩展入口继续使用 Side Panel。项目支持 OpenAI/Azure Provider 档案、自定义 Prompt、可选本地历史和口令加密的持久 API Key。未实现账号、云同步、官网、Agent 和自动发布。

## 兼容性与边界

- Chrome 116 或更高版本。
- 支持普通 HTTP/HTTPS 网页；Chrome 内部页面、Chrome 网上应用店和受限 PDF 页面不能注入。
- 需要用户自行配置 AI 服务和 API Key；扩展没有自有中转服务。
- 当前尚未发布 Chrome Web Store，详见 [发布记录](CHANGELOG.md)。

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
- [变更记录与发布说明](CHANGELOG.md)
- [贡献指南](CONTRIBUTING.md)

## 开源协作

欢迎提交 Issue 和 Pull Request。请先阅读 [贡献指南](CONTRIBUTING.md)；安全漏洞请勿公开创建 Issue，应通过 GitHub Private Security Advisory 报告，流程见 [安全说明](docs/SECURITY.md)。提交不得包含 API Key、Cookie、网页私密内容或其他秘密。

本项目采用 [MIT License](LICENSE)。贡献者确认其提交有权在 MIT License 下分发。

## SEO 结论

本项目只输出 Chrome 扩展的 Popup、Options 和 Side Panel，不是公开网站，不存在可被搜索引擎抓取的业务 URL，因此 SEO 不适用。独立官网属于后续独立项目。

## 发布状态

当前开源版本为 `v0.2.1`；尚未发布 Chrome Web Store、未部署任何服务。发布前应由维护者在桌面 Chrome 验证全站权限提示、选区弹窗和 Side Panel，并审阅隐私文案、依赖许可证和打包制品哈希。

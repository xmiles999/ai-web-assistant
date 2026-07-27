# 贡献指南

感谢你对 AI 网页助手的关注。提交 Issue 或 Pull Request 前，请阅读本指南和 [安全说明](docs/SECURITY.md)。

## 开始开发

环境要求：Node.js 22+、npm 10+、Chrome 116+。

```text
npm install
npm run lint
npm run typecheck
npm run test:coverage
npm run build
PLAYWRIGHT_BROWSERS_PATH=/data/services/playwright npm run test:e2e
```

请在 `chrome://extensions` 开启开发者模式，并加载构建生成的 `dist/` 目录进行人工验证。

## 提交 Issue

- Bug 请提供最小复现步骤、预期结果、实际结果、Chrome 版本和扩展版本。
- 功能建议请说明用户问题、建议交互和可接受的替代方案。
- 不要在 Issue、截图、日志或测试用例中提交 API Key、Cookie、选中文字或其他私密网页数据。
- 安全问题请按 [安全说明](docs/SECURITY.md) 使用 Private Security Advisory，不要公开报告。

## 提交 Pull Request

1. 从最新 `main` 创建主题分支。
2. 保持改动聚焦，并为缺陷或新规则补充相应测试。
3. 同步 README、功能说明、技术说明或安全文档中的受影响内容。
4. 提交前运行本文件中的检查命令，并在 PR 中说明未运行的检查及原因。
5. 提交信息使用中文 Conventional Commits，例如 `fix(工具栏): 修复选区定位`。

提交 Pull Request 即表示你确认拥有该贡献的分发权，并同意其在 [MIT License](LICENSE) 下发布。

# 安全说明

## 密钥

新配置默认采用“记住 API Key”：明文 Key 随 Provider 的 `localSecret` 字段保存在 `chrome.storage.local`，无需口令，浏览器重启后可继续使用。此方式以便利性换取较弱的静态数据保护，仅建议用于自己的设备；不应把它描述为加密存储。访问本机浏览器配置目录的攻击者可能读取密钥。

用户仍可选择仅会话保存（`chrome.storage.session`），或口令加密保存（随机 salt、随机 IV、PBKDF2-SHA-256 和 AES-GCM）；口令不持久化，加密模式每个新浏览器会话需要解锁。旧配置不会自动转为明文持久保存，必须由用户编辑并保存。切换模式时移除旧的持久密钥表示；删除服务配置时移除对应密钥。卸载扩展或清除数据也会丢失 Key。

读取 Provider、初始化或写入 Provider 前，将 local 和 session storage 的访问级别限制为 `TRUSTED_CONTEXTS`；失败时不继续保存。网页 Content Script 不可直接读取这些存储。密钥不写入历史导出、不通过任务消息返回网页，仅用于用户配置的 AI 接口认证。普通 Chrome 扩展不能承诺操作系统级安全存储。

## 漏洞报告

请通过仓库的 GitHub Private Security Advisory 报告安全漏洞，不要使用公开 Issue。报告请包含受影响版本、最小复现步骤、影响范围和可选修复建议，但不要包含 API Key、Cookie 或真实网页私密数据。维护者会在修复后通过发布记录说明影响和升级方式。

## 信任边界

Content Script 会静态注入普通 HTTP/HTTPS 页面，但只能发送用户主动触发的选区结构化消息。Service Worker、Options 和 Side Panel 是扩展可信上下文。AI 请求、密钥读取和历史写入不在 Content Script 执行。

`scripting` 权限仅用于向安装、更新或授权前已经打开的 HTTP/HTTPS 标签页补注入同一个 Content Script。注入代码使用页面内幂等标记，不重复注册监听器；Chrome 内部页、商店页和用户禁止访问的页面会被跳过。

工具栏和内联弹窗使用 Shadow DOM 与页面样式隔离。扩展同时保留构造样式表和 CSSOM 静态规则：前者提供 hover、焦点和暗色状态，后者保证页面使用 `style-src 'none'` 时工具栏仍保持固定定位和完整布局。

## Prompt 注入

选中文字和网页元数据是不可信数据。系统 Prompt 明确禁止选区内容改变规则、泄露秘密、调用工具或执行网页操作。插件没有模型工具调用能力。

## 输出

网页内联弹窗使用 `textContent` 渲染纯文本结果，不解释模型返回的 HTML。Side Panel 的 Markdown 先由 marked 解析，再通过 DOMPurify 清洗；禁止原始 HTML、脚本、事件属性和危险 URI。

## 自定义接口

远程接口必须 HTTPS；HTTP 只允许用户主动配置的 localhost/127.0.0.1/::1。使用自定义接口即表示用户接受选中文本会发送给该接口。

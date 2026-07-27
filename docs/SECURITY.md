# 安全说明

## 密钥

默认 API Key 仅存在 `chrome.storage.session`。持久模式使用随机 salt、随机 IV、PBKDF2-SHA-256 和 AES-GCM；用户口令不持久化。普通 Chrome 扩展不能承诺操作系统级安全存储，已被控制的浏览器配置目录仍可被攻击者读取。

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

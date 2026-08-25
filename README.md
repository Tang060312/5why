# 5Why 根因分析工具（AI 对话式）

AI 对话式 5Why 分析工具：用户描述问题 → AI 依据 `promt.txt` 中的提示词逐层追问（一次一问、验证证据、拒绝个人归因）→ 直至找到可改善的根本原因。支持多会话历史管理、导出 Markdown 报告。

## 启动

```bash
npm install
npm start
```

访问 http://localhost:3000

## 提示词

系统提示词直接读取当前目录下的 **`promt.txt`**（每次请求时实时读取，修改后无需重启服务）。

## 接入你的 AI API（必读）

后端通过 **OpenAI 兼容接口**调用大模型（DeepSeek、通义千问、Kimi、GPT、本地 Ollama 等均支持）。

**唯一需要修改的位置：`server.js` 顶部的 `AI_CONFIG` 配置块**（文件内已用 `★★★ 在这里接入你的大模型 API ★★★` 标注）。

```js
const AI_CONFIG = {
  endpoint: 'https://api.deepseek.com/chat/completions', // ← 接口地址（含 /chat/completions）
  apiKey: 'sk-你的Key',                                   // ← 你的 API Key
  model: 'deepseek-chat',                                 // ← 模型名称
  temperature: 0.7,                                       // ← 采样温度
};
```

| 供应商 | endpoint | model 示例 |
|--------|----------|-----------|
| DeepSeek | `https://api.deepseek.com/chat/completions` | `deepseek-chat` |
| OpenAI | `https://api.openai.com/v1/chat/completions` | `gpt-4o-mini` |
| 通义千问 | `https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions` | `qwen-plus` |
| Kimi | `https://api.moonshot.cn/v1/chat/completions` | `moonshot-v1-8k` |
| 本地 Ollama | `http://localhost:11434/v1/chat/completions` | `qwen2.5`（无需 Key） |

填好 Key 后重启服务即生效。**未配置 Key 时自动使用内置模拟回复**，可先体验完整流程。

## 接口说明

`POST /api/5why/analyze`，请求体为完整对话历史：

```json
{
  "messages": [
    { "role": "user", "content": "今天早上A产线良品率下降了5%" },
    { "role": "assistant", "content": "..." }
  ]
}
```

服务端自动注入 `promt.txt` 作为系统提示词（最多携带最近 30 条消息）。返回 SSE 流：`data: {"type":"chunk","content":"..."}` 直至 `data: {"type":"done"}`，失败时 `data: {"type":"error","message":"..."}`。

## 目录结构

```
5why/
├── server.js       # Express 服务器 + AI 接口代理转发（AI_CONFIG 在此配置）
├── promt.txt       # AI 系统提示词（直接编辑生效）
├── package.json
└── public/         # 前端页面
    ├── index.html
    ├── style.css
    └── app.js
```

## 页面功能

- 自由对话：Enter 发送，AI 流式回复（打字机效果），Shift+Enter 换行
- 对话历史：多会话自动保存至浏览器 localStorage，侧边栏可新建 / 切换 / 删除 / 清空
- 导出报告：将当前对话导出为 Markdown

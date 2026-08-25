const express = require('express');
const path = require('path');
const fs = require('fs');

/* =====================================================================
 * ★★★ 在这里接入你的大模型 API ★★★
 * ---------------------------------------------------------------------
 * 本服务通过「OpenAI 兼容接口」调用大模型（DeepSeek / 通义千问 /
 * Kimi / GPT / 本地 Ollama 等均支持该协议）。
 *
 * 接入步骤：
 *   1. 把 apiKey 换成你的真实 Key（保留 "sk-" 前缀）
 *   2. 若供应商接口地址不同，修改 endpoint
 *   3. 若模型名不同，修改 model
 *   4. 重启服务：npm start
 *
 * 未配置（apiKey 仍为占位符）时，服务会返回内置模拟回复，
 * 方便先体验完整流程；配置后自动切换为真实 AI。
 * ===================================================================== */
const AI_CONFIG = {
  endpoint: 'https://api.deepseek.com/chat/completions', // ← 接口地址
  apiKey: 'sk-946a73929a0840bb9b0c878117c25dc5',         // ← 你的 API Key
  model: 'deepseek-v4-flash',                            // ← 模型名称
  temperature: 0.7,                                      // ← 采样温度
};

/* =====================================================================
 * 以下为服务实现代码，一般无需修改
 * ===================================================================== */
const app = express();
const PORT = process.env.PORT || 3000;
const PLACEHOLDER_KEY = 'sk-在这里填入你的APIKey';

/* 系统提示词：直接读取 public/promt.txt（每次请求时读取，
   修改 promt.txt 后无需重启服务即可生效） */
const PROMPT_FILE = path.join(__dirname, 'public', 'promt.txt');
const FALLBACK_PROMPT = '你是一位5Why根因分析助手，请逐层追问用户，引导其找到根本原因并形成改善措施。';

function getSystemPrompt() {
  try {
    const content = fs.readFileSync(PROMPT_FILE, 'utf8');
    return content.trim() || FALLBACK_PROMPT;
  } catch {
    return FALLBACK_PROMPT;
  }
}

function isAIConfigured() {
  return !!AI_CONFIG.apiKey && AI_CONFIG.apiKey !== PLACEHOLDER_KEY && AI_CONFIG.apiKey !== '';
}

app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, 'public')));

/* 调用真实 AI（OpenAI 兼容流式接口），onChunk 收到一段文本 */
async function callAIStream(apiMessages, onChunk) {
  const res = await fetch(AI_CONFIG.endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${AI_CONFIG.apiKey}`,
    },
    body: JSON.stringify({
      model: AI_CONFIG.model,
      temperature: AI_CONFIG.temperature,
      stream: true,
      messages: apiMessages,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`AI 接口返回 ${res.status}: ${text.slice(0, 200)}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split('\n');
    buffer = lines.pop();

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;
      const payload = trimmed.slice(5).trim();
      if (payload === '[DONE]') return;
      try {
        const json = JSON.parse(payload);
        const delta = json.choices?.[0]?.delta?.content;
        if (delta) onChunk(delta);
      } catch { /* 忽略无法解析的行 */ }
    }
  }
}

/* 未配置真实 AI 时的模拟回复，便于先跑通全流程 */
function mockStream(onChunk) {
  const mock = '好的，我们先确认问题描述是否完整。\n\n请问这个问题具体发生在什么时间、什么地点？影响程度如何？请补充以上信息，我们再开始 5Why 逐层分析。';
  for (let i = 0; i < mock.length; i += 12) {
    onChunk(mock.slice(i, i + 12));
  }
}

/* POST /api/5why/analyze
 * body: { messages: [{ role: "user" | "assistant", content: string }] }
 *        messages 为完整对话历史（最新的排最后），系统提示词自动取自 promt.txt
 * 返回: SSE 流，事件格式：
 *   data: {"type":"chunk","content":"..."}
 *   data: {"type":"done"}    或   data: {"type":"error","message":"..."}
 */
app.post('/api/5why/analyze', async (req, res) => {
  const messages = req.body && req.body.messages;

  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: '缺少 messages 参数（对话历史）' });
  }

  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  const send = (obj) => res.write(`data: ${JSON.stringify(obj)}\n\n`);

  const apiMessages = [
    { role: 'system', content: getSystemPrompt() },
    ...messages.slice(-30), // 最多携带最近 30 条，避免超长
  ];

  try {
    if (!isAIConfigured()) {
      mockStream((chunk) => send({ type: 'chunk', content: chunk }));
    } else {
      await callAIStream(apiMessages, (chunk) => send({ type: 'chunk', content: chunk }));
    }
    send({ type: 'done' });
  } catch (e) {
    send({ type: 'error', message: e.message });
  } finally {
    res.end();
  }
});

app.listen(PORT, () => {
  console.log('5Why AI 分析工具已启动: http://localhost:' + PORT);
  console.log('提示词来源: ' + PROMPT_FILE);
  console.log('AI 状态: ' + (isAIConfigured() ? '已配置（真实 AI）' : '未配置（使用内置模拟回复）'));
});

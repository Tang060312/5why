(() => {
  const $ = (sel) => document.querySelector(sel);
  const chat = $('#chat');
  const input = $('#chat-input');
  const ctxInput = $('#chat-context');
  const sendBtn = $('#btn-send');
  const listEl = $('#session-list');

  const SESSIONS_KEY = '5why_sessions';
  const CONFIG_KEY = '5why_ai_config';
  const GREETING = '你好，我是 5Why 分析助手。\n\n请在下方"问题背景"区域描述你遇到的问题（建议包含：具体异常、发生时间、发生地点、涉及对象、影响程度、正常标准与实际差异）。提交后我会逐层追问"为什么"，你也可以在"问题 / 我的解答"两栏填写自己的思考，由我校验方向是否合理。';
  const FALLBACK_PROMPT = '你是一位5Why根因分析助手，请逐层追问用户，引导其找到根本原因并形成改善措施。';

  /* 本地模式：通过本机 server.js 代理调用（读取 server.js 的 AI_CONFIG 与 public/promt.txt）
     部署模式（GitHub Pages 等静态托管）：浏览器直连大模型 API，Key 由各使用者自行填写 */
  const IS_PROXY = ['localhost', '127.0.0.1', '::1'].includes(location.hostname);

  const DEFAULT_CONFIG = {
    endpoint: 'https://api.deepseek.com/chat/completions',
    apiKey: '',
    model: 'deepseek-v4-flash',
  };

  let sessions = [];
  let current = null;
  let busy = false;
  let pendingDeleteId = null;
  let cachedPrompt = null;

  /* ---------- 设置（部署模式下使用者自填 Key） ---------- */
  function loadConfig() {
    try {
      return Object.assign({}, DEFAULT_CONFIG, JSON.parse(localStorage.getItem(CONFIG_KEY)));
    } catch {
      return Object.assign({}, DEFAULT_CONFIG);
    }
  }

  function saveConfig(cfg) {
    localStorage.setItem(CONFIG_KEY, JSON.stringify(cfg));
  }

  function openSettings() {
    const cfg = loadConfig();
    $('#set-endpoint').value = cfg.endpoint;
    $('#set-key').value = cfg.apiKey;
    $('#set-model').value = cfg.model;
    $('#settings-hint').textContent = IS_PROXY
      ? '当前为本地模式：AI 调用走 server.js 代理（使用其中配置的 AI_CONFIG），以下设置仅部署模式生效。'
      : '请填写你自己的大模型 API Key（仅保存在本浏览器 localStorage，不会上传）。';
    $('#settings-modal').classList.remove('hidden');
  }

  function closeSettings() {
    const cfg = loadConfig();
    cfg.endpoint = $('#set-endpoint').value.trim() || DEFAULT_CONFIG.endpoint;
    cfg.apiKey = $('#set-key').value.trim();
    cfg.model = $('#set-model').value.trim() || DEFAULT_CONFIG.model;
    saveConfig(cfg);
    $('#settings-modal').classList.add('hidden');
  }

  /* ---------- 提示词（部署模式下从 promt.txt 加载） ---------- */
  async function getPrompt() {
    if (cachedPrompt !== null) return cachedPrompt;
    if (IS_PROXY) return ''; // 代理模式由服务端注入
    try {
      const res = await fetch('promt.txt');
      if (res.ok) {
        const text = await res.text();
        cachedPrompt = text.trim() || FALLBACK_PROMPT;
        return cachedPrompt;
      }
    } catch { /* 继续走兜底 */ }
    cachedPrompt = FALLBACK_PROMPT;
    return cachedPrompt;
  }

  /* ---------- 会话历史（localStorage 持久化） ---------- */
  function loadSessions() {
    try {
      sessions = JSON.parse(localStorage.getItem(SESSIONS_KEY)) || [];
    } catch {
      sessions = [];
    }
  }

  function persist() {
    localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions));
  }

  function newSession() {
    const s = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
      title: '新对话',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      messages: [{ role: 'assistant', content: GREETING }],
    };
    sessions.unshift(s);
    persist();
    switchSession(s.id);
  }

  function switchSession(id) {
    const s = sessions.find((x) => x.id === id);
    if (!s) return;
    current = s;
    renderSessions();
    renderChat();
  }

  function deleteSession(id) {
    sessions = sessions.filter((s) => s.id !== id);
    persist();
    if (current && current.id === id) {
      current = null;
      if (sessions.length) switchSession(sessions[0].id);
      else newSession();
    } else {
      renderSessions();
    }
  }

  function touchSession() {
    if (!current) return;
    current.updatedAt = Date.now();
    if (current.title === '新对话') {
      const first = current.messages.find((m) => m.role === 'user');
      if (first) {
        current.title = first.content.replace(/\s+/g, ' ').slice(0, 20);
        $('#session-title').textContent = current.title;
      }
    }
    persist();
    renderSessions();
  }

  function renderSessions() {
    listEl.innerHTML = '';
    if (!sessions.length) {
      const li = document.createElement('li');
      li.className = 'session-item';
      li.style.cursor = 'default';
      li.innerHTML = '<span class="s-title" style="color:#94a3b8">（暂无对话）</span>';
      listEl.appendChild(li);
      return;
    }
    sessions.forEach((s) => {
      const li = document.createElement('li');
      li.className = 'session-item' + (current && current.id === s.id ? ' active' : '');
      const t = document.createElement('span');
      t.className = 's-title';
      t.textContent = s.title;
      const time = document.createElement('span');
      time.className = 's-time';
      time.textContent = new Date(s.updatedAt).toLocaleString('zh-CN', {
        month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
      });
      const del = document.createElement('button');
      del.className = 's-del';
      del.textContent = '×';
      del.title = '删除对话';
      del.addEventListener('click', (e) => {
        e.stopPropagation();
        pendingDeleteId = s.id;
        $('#modal-text').textContent = `确定要删除对话「${s.title}」吗？`;
        $('#confirm-modal').classList.remove('hidden');
      });
      li.appendChild(t);
      li.appendChild(time);
      li.appendChild(del);
      li.addEventListener('click', () => switchSession(s.id));
      listEl.appendChild(li);
    });
  }

  /* ---------- 消息渲染 ---------- */
  function esc(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  }

  function renderMessage(m) {
    const wrap = document.createElement('div');
    wrap.className = 'msg ' + m.role;
    const av = document.createElement('div');
    av.className = 'avatar ' + m.role;
    av.textContent = m.role === 'user' ? '我' : 'AI';
    const bubble = document.createElement('div');
    bubble.className = 'bubble';
    const label = document.createElement('div');
    label.className = 'bubble-label';
    label.textContent = m.role === 'user' ? '我' : 'AI';
    const p = document.createElement('p');
    p.textContent = m.content;
    bubble.appendChild(label);
    bubble.appendChild(p);
    wrap.appendChild(av);
    wrap.appendChild(bubble);
    chat.appendChild(wrap);
  }

  function renderChat() {
    chat.innerHTML = '';
    if (!current) return;
    current.messages.forEach(renderMessage);
    applyInputPhase();
    scrollToBottom();
  }

  /* 输入区两阶段：尚无用户消息时显示"问题背景"单栏，提交后切换为"问题+我的解答"双栏 */
  function applyInputPhase() {
    const context = !current.messages.some((m) => m.role === 'user');
    $('#context-field').classList.toggle('hidden', !context);
    $('#qa-fields').classList.toggle('hidden', context);
    return context;
  }

  function scrollToBottom() {
    chat.scrollTop = chat.scrollHeight;
  }

  function setInputEnabled(enabled) {
    busy = !enabled;
    input.disabled = !enabled;
    ctxInput.disabled = !enabled;
    $('#chat-answer').disabled = !enabled;
    sendBtn.disabled = !enabled;
    input.placeholder = enabled ? '输入问题或回答，Enter 发送，Shift+Enter 换行' : 'AI 正在回复中...';
  }

  /* ---------- AI 接口调用 ----------
     统一解析两种 SSE 格式：
       - 本地代理：data: {"type":"chunk","content":"..."}
       - 部署模式（OpenAI 兼容原生流）：data: {"choices":[{"delta":{"content":"..."}}]} */
  async function streamReply(messages, onChunk) {
    let res;
    if (IS_PROXY) {
      res = await fetch('/api/5why/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages }),
      });
    } else {
      const cfg = loadConfig();
      if (!cfg.apiKey) throw new Error('尚未配置 API Key，请点击右上角「设置」填写。');
      const prompt = await getPrompt();
      res = await fetch(cfg.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + cfg.apiKey },
        body: JSON.stringify({
          model: cfg.model,
          temperature: 0.7,
          stream: true,
          messages: [{ role: 'system', content: prompt }, ...messages.slice(-30)],
        }),
      });
    }
    if (!res.ok) {
      let detail = '';
      try {
        const err = await res.json();
        detail = (err.error && (err.error.message || err.error)) || '';
      } catch { /* ignore */ }
      throw new Error(detail || ('请求失败 (HTTP ' + res.status + ')'));
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let error = null;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop();
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const payload = line.slice(6).trim();
        if (payload === '[DONE]') continue;
        try {
          const msg = JSON.parse(payload);
          if (msg.type === 'chunk') onChunk(msg.content);
          else if (msg.type === 'error') error = new Error(msg.message);
          else if (msg.type === 'done') return error;
          else if (msg.choices) {
            const delta = msg.choices[0] && msg.choices[0].delta;
            if (delta && delta.content) onChunk(delta.content);
          }
        } catch { /* 忽略无法解析的行 */ }
      }
    }
    return error;
  }

  async function onSubmit() {
    if (busy || !current) return;
    const inContext = applyInputPhase();
    const text = (inContext ? ctxInput.value : input.value).trim();
    const answer = $('#chat-answer').value.trim();
    if (!text) return;

    if (!IS_PROXY) {
      const cfg = loadConfig();
      if (!cfg.apiKey) {
        openSettings();
        return;
      }
    }

    const content = inContext
      ? text
      : (answer ? `【问题】${text}\n【我的解答】${answer}` : text);
    current.messages.push({ role: 'user', content });
    ctxInput.value = '';
    input.value = '';
    $('#chat-answer').value = '';
    renderChat();
    touchSession();

    setInputEnabled(false);

    const wrap = document.createElement('div');
    wrap.className = 'msg ai';
    const av = document.createElement('div');
    av.className = 'avatar ai';
    av.textContent = 'AI';
    const bubble = document.createElement('div');
    bubble.className = 'bubble';
    const label = document.createElement('div');
    label.className = 'bubble-label';
    label.textContent = 'AI';
    const p = document.createElement('p');
    p.textContent = '';
    bubble.appendChild(label);
    bubble.appendChild(p);
    wrap.appendChild(av);
    wrap.appendChild(bubble);
    chat.appendChild(wrap);

    const typing = document.createElement('span');
    typing.className = 'typing';
    typing.innerHTML = '<i></i><i></i><i></i>';
    p.appendChild(typing);
    scrollToBottom();

    let full = '';
    try {
      const err = await streamReply(current.messages, (chunk) => {
        if (typing.parentNode) typing.remove();
        full += chunk;
        p.textContent = full;
        scrollToBottom();
      });
      if (err) throw err;
    } catch (e) {
      if (typing.parentNode) typing.remove();
      const errPanel = document.createElement('div');
      errPanel.className = 'error-panel';
      errPanel.textContent = 'AI 回复失败：' + (e.message || '未知错误') + '，请重试。';
      p.textContent = '';
      bubble.appendChild(errPanel);
      full = '';
    }

    if (full) {
      current.messages.push({ role: 'assistant', content: full });
      touchSession();
    }
    setInputEnabled(true);
  }

  /* ---------- 导出 Markdown 报告 ---------- */
  function exportReport() {
    if (!current || !current.messages.length) return;
    let md = `# 5Why 问题分析报告\n\n> 🔍 AI 辅助分析 | 制造业一线管理者专用\n\n`;
    md += `**分析时间**: ${new Date(current.updatedAt).toLocaleString('zh-CN')}\n\n---\n\n`;
    current.messages.forEach((m) => {
      const who = m.role === 'user' ? '**我**' : '**AI 助手**';
      md += `### ${who}\n${m.content}\n\n---\n\n`;
    });
    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `5why-analysis-${Date.now()}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  /* ---------- 事件绑定 ---------- */
  $('#btn-new-chat').addEventListener('click', newSession);
  $('#btn-send').addEventListener('click', onSubmit);
  $('#btn-settings').addEventListener('click', openSettings);
  $('#btn-settings-save').addEventListener('click', closeSettings);
  $('#btn-settings-cancel').addEventListener('click', () => $('#settings-modal').classList.add('hidden'));
  const autoResize = (el) => {
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 200) + 'px';
  };
  [input, $('#chat-answer'), ctxInput].forEach((el) => {
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        onSubmit();
      }
    });
    el.addEventListener('input', () => autoResize(el));
  });
  $('#btn-export').addEventListener('click', exportReport);
  $('#btn-clear').addEventListener('click', () => {
    if (!current) return;
    current.messages = [{ role: 'assistant', content: GREETING }];
    current.title = '新对话';
    touchSession();
    renderChat();
    input.focus();
  });
  $('#btn-confirm-no').addEventListener('click', () => $('#confirm-modal').classList.add('hidden'));
  $('#btn-confirm-yes').addEventListener('click', () => {
    $('#confirm-modal').classList.add('hidden');
    if (pendingDeleteId) deleteSession(pendingDeleteId);
    pendingDeleteId = null;
  });

  /* ---------- 初始化 ---------- */
  loadSessions();
  if (sessions.length) {
    current = sessions[0];
  } else {
    const s = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
      title: '新对话',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      messages: [{ role: 'assistant', content: GREETING }],
    };
    sessions.unshift(s);
    persist();
    current = s;
  }
  renderSessions();
  renderChat();
  input.focus();
})();

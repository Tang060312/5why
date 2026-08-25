# 5Why 根因分析工具（AI 对话式）

AI 对话式 5Why 分析工具：用户描述问题 → AI 依据 `public/promt.txt` 中的提示词逐层追问（一次一问、验证证据、拒绝个人归因）→ 直至找到可改善的根本原因。支持多会话历史管理、导出 Markdown 报告。

支持**两种运行方式**：本地模式（Node 代理）和 GitHub Pages 静态部署（浏览器直连 AI，使用者自填 Key）。

## 方式一：本地运行

```bash
npm install
npm start
```

访问 http://localhost:3000（AI 调用走 `server.js` 代理，配置见 `server.js` 顶部 `AI_CONFIG`）。

## 方式二：GitHub Pages 部署（供他人使用）

GitHub Pages 只能托管静态文件，因此部署版由**浏览器直接调用大模型 API**，每个使用者点击「设置」填入自己的 API Key（仅存于各自浏览器 localStorage，不会泄露你的 Key）。

### 部署步骤

1. 在 GitHub 上新建公开仓库，命名为 `5why`（不要勾选初始化 README）
2. 本地推送（仓库已初始化并提交完毕）：

   ```bash
   git remote add origin https://github.com/你的用户名/5why.git
   git push -u origin main
   ```

3. 打开仓库 → Settings → Pages → **Source 选择「GitHub Actions」**（工作流会自动部署 `public/` 目录）
4. 等待 Actions 跑完（约 1 分钟），访问 `https://你的用户名.github.io/5why/`

### 使用说明

- 打开页面后点击右上角「设置」，填写自己的 **API Key**（DeepSeek 开放平台申请，默认可不改接口地址与模型）
- 填写后即可对话；Key 保存在本浏览器 localStorage
- 修改提示词：编辑 `public/promt.txt` 后推送，重新部署自动生效

### 注意事项

- 仅 DeepSeek 等允许浏览器跨域（CORS）的接口可直接使用；更换其他供应商时若提示跨域错误，需改用方式一
- 页面地址若部署在非仓库根路径，所有资源均为相对路径引用，无需额外配置

## 目录结构

```
5why/
├── server.js                 # 本地模式：Express + AI 代理（AI_CONFIG 在此配置）
├── package.json
├── .github/workflows/deploy.yml  # GitHub Pages 自动部署工作流
├── public/                   # 站点根目录（Pages 部署此目录，也可直接静态托管）
│   ├── index.html
│   ├── style.css
│   ├── app.js                # 自动识别本地/部署模式
│   ├── promt.txt             # AI 系统提示词（修改后部署即生效）
```

## 接口说明（本地模式）

`POST /api/5why/analyze`，请求体为完整对话历史：

```json
{
  "messages": [
    { "role": "user", "content": "今天早上A产线良品率下降了5%" },
    { "role": "assistant", "content": "..." }
  ]
}
```

服务端自动注入 `public/promt.txt` 作为系统提示词（最多携带最近 30 条消息）。返回 SSE 流：`data: {"type":"chunk","content":"..."}` 直至 `data: {"type":"done"}`。

## 页面功能

- 自由对话：Enter 发送，AI 流式回复（打字机效果），Shift+Enter 换行
- 对话历史：多会话自动保存至浏览器 localStorage，侧边栏可新建 / 切换 / 删除 / 清空
- API 设置：部署模式下使用者自填 Key / 接口地址 / 模型（存 localStorage）
- 导出报告：将当前对话导出为 Markdown

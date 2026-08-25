# 5Why 根因分析工具（AI 对话式）

AI 对话式 5Why 分析工具：用户描述问题 → AI 依据 `promt.txt` 中的提示词逐层追问（一次一问、验证证据、拒绝个人归因）→ 直至找到可改善的根本原因。支持多会话历史管理、导出 Markdown 报告。

支持**两种运行方式**：本地模式（Node 代理）和 GitHub Pages 静态部署（浏览器直连 AI，使用者自填 Key）。

## 方式一：本地运行

```bash
cd server
npm install
npm start
```

访问 http://localhost:3000（AI 调用走 `server/server.js` 代理，配置见其顶部 `AI_CONFIG`）。

## 方式二：GitHub Pages 部署（供他人使用）

站点文件在**仓库根目录**，GitHub Pages 由浏览器直接调用大模型 API，每个使用者点击「设置」填入自己的 API Key（仅存于各自浏览器 localStorage，不会泄露你的 Key）。

### 启用步骤（设置一次即可）

1. 打开 https://github.com/Tang060312/5why/settings/pages
2. **Source 选择「Deploy from a branch」**
3. Branch 选择 **`main`**，目录选择 **`/ (root)`** → 点 Save
4. 等待 1-2 分钟（首次构建），访问 `https://tang060312.github.io/5why/`

之后每次 `git push` 都会自动重新部署。

> 若希望使用 GitHub Actions 方式（需 Source 选「GitHub Actions」），本仓库已附带 `.github/workflows/deploy.yml`，两种方式均可。

### 使用说明

- 打开页面后点击右上角「设置」，填写自己的 **API Key**（DeepSeek 开放平台申请，默认可不改接口地址与模型）
- 填写后即可对话；Key 保存在本浏览器 localStorage
- 修改提示词：编辑根目录 `promt.txt` 后推送即可

### 注意事项

- 仅 DeepSeek 等允许浏览器跨域（CORS）的接口可直接使用；更换其他供应商时若提示跨域错误，需改用方式一
- 页面地址若部署在非仓库根路径，所有资源均为相对路径引用，无需额外配置

## 目录结构

```
5why/
├── index.html               # 站点根目录（GitHub Pages 部署内容）
├── style.css
├── app.js                   # 自动识别本地/部署模式
├── promt.txt                # AI 系统提示词（修改后部署即生效）
├── server/                  # 本地模式：Node 代理服务
│   ├── server.js            #   Express + AI 代理（AI_CONFIG 在此配置）
│   └── package.json
└── .github/workflows/deploy.yml  # GitHub Actions 部署工作流（可选）
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

服务端自动注入 `promt.txt` 作为系统提示词（最多携带最近 30 条消息）。返回 SSE 流：`data: {"type":"chunk","content":"..."}` 直至 `data: {"type":"done"}`。

## 页面功能

- 自由对话：Enter 发送，AI 流式回复（打字机效果），Shift+Enter 换行
- 对话历史：多会话自动保存至浏览器 localStorage，侧边栏可新建 / 切换 / 删除 / 清空
- API 设置：部署模式下使用者自填 Key / 接口地址 / 模型（存 localStorage）
- 导出报告：将当前对话导出为 Markdown

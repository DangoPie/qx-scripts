# Quantumult X 自动化脚本集合

本仓库包含用于 Quantumult X (QX) 的自动化脚本，配合青龙面板实现微信小程序签到等任务的完全自动化。

## 脚本列表

### 1. 酷乐光年 token 自动同步 (`kule_token_sync.js`)

**功能**：自动拦截微信小程序"酷乐光年潮玩体验"的请求，提取登录 token 并同步到青龙面板，实现每日自动签到。

**工作原理**：
- QX 拦截小程序对 `pw.gzych.vip` 的所有请求
- 从请求头提取 `Authorization: Token xxx`
- 自动 POST 到青龙面板 API 更新环境变量 `KULE_SIGN_HEADERS`
- 青龙面板的定时任务使用最新 token 执行签到

**使用场景**：
- 配合青龙面板的定时签到脚本（每天 8:00 自动签到）
- 用户每天打开小程序时，token 自动同步
- 无需手动抓包更新 token

## 配置方法

### 步骤 1：添加 QX 重写规则

在 Quantumult X 的配置文件中添加：

```ini
[Rewrite]
^https://pw\.gzych\.vip/.* url script-request-header https://cdn.jsdelivr.net/gh/DangoPie/qx-scripts@main/kule_token_sync.js
```

或者在 QX 的"重写"界面手动添加上述规则。

**推荐 URL**：使用 jsDelivr CDN（`https://cdn.jsdelivr.net/gh/...`）比 GitHub raw URL 更稳定。

**注意**：如果面板地址变更（如使用 Tailscale），请修改脚本中的 `panelUrl` 变量。

### 步骤 2：修改脚本中的面板地址（如需要）

如果你的青龙面板地址不是 `http://192.168.6.114:5700`，需要修改脚本中的 `panelUrl` 变量：

```javascript
const panelUrl = 'http://你的面板IP:端口';
```

### 步骤 3：测试

1. 配置完成后，打开"酷乐光年潮玩体验"小程序
2. QX 会弹出通知："酷乐光年 - token 已自动同步"
3. 登录青龙面板，检查环境变量 `KULE_SIGN_HEADERS` 是否已更新

## 注意事项

- **网络要求**：iPad 和青龙面板需在同一局域网，或面板地址可访问
- **Token 有效期**：约 3-4 小时，需每天打开小程序至少一次以保持 token 新鲜
- **签到时间**：建议青龙面板的签到任务设置在每天 8:00，确保在前一天最后一次 token 同步后的有效期内
- **隐私**：脚本会将 token 发送到你的青龙面板，不会发送到其他服务器

## 项目结构

```
qx-scripts/
├── kule_token_sync.js    # 酷乐光年 token 自动同步脚本
└── README.md             # 本文件
```

## 致谢

本项目由 AI 辅助生成，用于个人自动化签到场景。

## License

MIT License - 仅供学习和个人使用，请勿用于商业用途。

# Quantumult X 自动化脚本集合

本仓库包含用于 Quantumult X (QX) 的自动化脚本，配合青龙面板实现微信小程序签到等任务的完全自动化。

## 脚本列表

### 1. 酷乐光年 token 自动同步 (`kule_token_sync.js`)

**功能**：自动拦截微信小程序"酷乐光年潮玩体验"的请求，提取登录 token 并同步到青龙面板环境变量 `KULE_SIGN_HEADERS`，配合面板的定时签到任务实现每日自动签到。

**工作原理**：
- QX 拦截小程序对 `pw.gzych.vip` 的所有请求
- 从请求头提取 `Authorization: Token xxx`
- 登录青龙面板，更新环境变量 `KULE_SIGN_HEADERS`（只替换 Authorization，保留 User-Agent 等其他头）
- 面板的定时任务（如每天 8:00）用最新 token 执行签到

## 配置方法

### 脚本配置（hash 参数，等价于"环境变量"）

脚本内**不写死任何 IP / 账号 / 密码**，全部通过重写规则 URL 的 hash 参数传入（QX 通过 `$environment.variables` 暴露给脚本）：

| 参数 | 说明 |
| --- | --- |
| `panelUrls` | 多个面板地址，用 `|` 分隔，按顺序尝试 |
| `panelUser` | 面板用户名 |
| `panelPass` | 面板密码 |

**多地址容错**：任一地址连接失败会自动尝试下一个；最近成功的地址会缓存（存于 QX 的 `$prefs`），下次优先使用，避免每次都先试死地址。注意地址里不要含 `&`（它是参数分隔符），特殊字符需 URL 编码。

### 步骤 1：添加 QX 重写规则

方式 A（推荐，隐私安全）：把下面这条规则直接写进 QX 配置文件的 `[rewrite_local]`：

```ini
[rewrite_local]
^https://pw\.gzych\.vip/.* url script-request-header https://raw.githubusercontent.com/DangoPie/qx-scripts/main/kule_token_sync.js#panelUrls=http://你的面板IP:5700|http://备用地址:5700&panelUser=你的用户名&panelPass=你的密码
```

方式 B（方便，但本仓库公开）：在 QX「重写」页面的「引用资源」中添加 `kule.conf` 的 URL（`https://raw.githubusercontent.com/DangoPie/qx-scripts/<commit>/kule.conf`）。注意该文件内含面板账号密码，任何人可见，请尽快修改面板密码或改用方式 A。

### 步骤 2：分流规则

- 面板地址必须直连，在 QX 分流规则里加上：`ip-cidr, 192.168.0.0/16, direct`
- 如果配置里包含 Tailscale 地址（100.64.0.0/10 网段），建议加：`ip-cidr, 100.64.0.0/10, direct`，让不可达的地址快速失败而不是卡满超时

### 步骤 3：测试

1. 打开"酷乐光年潮玩体验"小程序
2. QX 弹出通知"token 已自动同步"
3. 登录青龙面板，检查环境变量 `KULE_SIGN_HEADERS` 是否更新

## 注意事项

- **QX 与 Tailscale 不能同时使用**：iOS 同一时间只允许一个 VPN 隧道运行，两者互斥。所以 iPad 上的 QX 永远无法通过 Tailscale 访问 NanoPi；出门在外如需访问面板，建议用 frp / Cloudflare Tunnel 把面板映射为公网地址（注意做好密码与访问控制）
- **Token 有效期**：约 6 天（需面板上的保活任务每 20 分钟调用一次接口维持），每天打开一次小程序即可保持 token 新鲜
- **同步频率保护**：同一 token 只同步一次；失败通知 10 分钟限频；请求最多阻塞 10 秒，不影响小程序正常使用
- **隐私**：脚本只会把 token 发送到你配置的面板，不会发到其他服务器

## 项目结构

```
qx-scripts/
├── kule_token_sync.js    # 酷乐光年 token 自动同步脚本
├── kule.conf             # QX 重写规则（含 hash 参数配置示例）
└── README.md             # 本文件
```

## 致谢

本项目由 AI 辅助生成，用于个人自动化签到场景。

## License

MIT License - 仅供学习和个人使用，请勿用于商业用途。

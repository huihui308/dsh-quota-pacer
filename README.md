# 额度配速 · dsh-quota-pacer

DeepSeek Harness 插件：把 **OpenCode Go 的 5 小时 / 周 / 月额度** 和 **时间进度** 放在一起看，
判断「按现在这个用法会不会超」，并支持选择显示哪些已配置的 provider / 模型。

> 状态：v0.1 开发中。`master` 为稳定分支（默认），`develop` 为开发分支。

## 解决的两个问题

### 1. 金额口径不对

余额类插件通常把订阅调用按 **token 单价折算成等值美元**，但 OpenCode Go 真正扣的是
`opencode.allowance`，不是列表价：

- Go 的额度百分比按 **每个模型各自的月度额度** 归一化（例如 DeepSeek V4.1 Flash：Go $100 / Go Plus $200）。
- 同一请求的 `list_cost` 与 `allowance` 可能不同。实测 Go Plus 的一笔请求：
  `list_cost = 0.0000105`，`allowance = 0.0000126`（约 1.2 倍）。
- 峰谷价按 UTC 周一至周五 01:00–04:00、06:00–10:00 加倍；本地时区直接套会算错。
- token 桶不止 input/output/cache_read，还有 `cache_write_5m` / `cache_write_1h` / `reasoning`。

v0.1 先显示「套餐折算金额」（列表价 × 档位倍率），并在今日一行同时给出列表价，
避免再把列表价直接当成实际扣费；API 等值 / 现金支出的完整三列放到 v0.2。

### 2. 额度和时间对不上

只看「月用了 9%」没有意义。本插件为每个窗口计算：

- 已用百分比 vs 已过时间百分比
- 配速倍数 = 已用% ÷ 已过时间%
- 按当前速度到窗口结束时的预测用量
- 剩余额度、剩余时间、允许的燃烧速度
- 预计触顶时间
- 结论：余量充足 / 正常 / 偏快 / 将超限，并给出可执行建议

5 小时、周、月三个窗口用同一套算法。5 小时窗口按官方固定 5 小时块计算；
如果官方改成真正的滚动窗口，再补「近一小时燃烧速度」的修正。

## 显示配置

已配置多个 provider（DeepSeek 官方、OpenCode Go 等）时，可以逐项选择：

- 显示哪些 provider（OpenCode Go / DeepSeek 官方）
- OpenCode Go 显示哪些窗口（5h / 周 / 月）
- 是否显示套餐折算金额
- 套餐档位（自动 / Go / Go Plus / Go Teams）与主模型
- 刷新间隔与预警阈值

## 使用

安装后打开侧栏「额度配速」，或在主面板点「额度配速」。

- **配速**：5 小时 / 本周 / 本月三条，进度条上的白点是时间进度；蓝/红条是已用额度。
- **结论**：余量充足 / 正常 / 偏快 / 将超限；「将超限」会给出预计触顶时间和降速建议。
- **今日套餐折算**：本地账本列表价 × 档位倍率，用来核对「今天大概扣了多少额度」。
- **显示设置**：选择显示 OpenCode Go / DeepSeek 官方，选择窗口、是否显示金额、刷新间隔和阈值。
- 首次使用会自动做一次 1-token 探测，读 `billing_source` 与 `allowance/list_cost` 倍率；可在配置里关掉 `autoProbe`。

## 已验证（2026-11-27）

- `GET /zen/go/v1/usage` 返回 `rolling` / `weekly` / `monthly` 三个窗口，含 `percent` 与 `resetsAt`。
- `GET /zen/go/v1/models` 返回 DeepSeek V4.1 Flash 的月度额度：Go $100、Go Plus $200、Go Teams $105。
- 实测 Go Plus 一笔请求：`list_cost=0.0000105`、`allowance=0.0000126`，倍率约 1.2。
- 月度 9% 与本地账本按 1.2 折算后的金额基本对齐；旧插件直接显示列表价，所以看起来「金额不对」。
- 面板已在 DSH Web 实际打开验证；设置保存写回 `$DSH_HOME/quota-pacer/config.json`。

## 限制

- 官方百分比是整数，金额对账有 ±0.5% 的粒度误差。
- 今日/本月金额依赖 cost-meter 账本；未安装或账本重置时只显示官方百分比。
- 多模型混用时，金额按「主模型」的月度额度折算，不是逐模型拆分。
- 5 小时窗口按官方固定 5 小时块计算；官方若改为滚动窗口，需要调整算法。

## 数据来源

| 数据 | 来源 |
|---|---|
| 5h / 周 / 月 百分比与重置时间 | `GET https://opencode.ai/zen/go/v1/usage` |
| 模型价格、峰谷倍率、各套餐月度额度 | `GET https://opencode.ai/zen/go/v1/models` |
| DSH 本地 token / 金额 | DSH 会话事件与账本（只读，按来源去重） |
| 套餐档位与 allowance 倍率 | usage 响应 / `opencode.allowance` / 官方目录 |

## 分支约定

- `master`：默认分支，稳定版本
- `develop`：开发分支，功能未稳定前不并回 `master`

## License

MIT

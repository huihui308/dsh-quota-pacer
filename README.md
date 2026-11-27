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

本插件把「套餐折算金额」「API 列表等值」「现金支出」分开展示，并用官方 usage 百分比做校准，
不再把等值金额当成实际扣费。

### 2. 额度和时间对不上

只看「月用了 9%」没有意义。本插件为每个窗口计算：

- 已用百分比 vs 已过时间百分比
- 配速倍数 = 已用% ÷ 已过时间%
- 按当前速度到窗口结束时的预测用量
- 剩余额度、剩余时间、允许的燃烧速度
- 预计触顶时间
- 结论：余量充足 / 正常 / 偏快 / 将超限，并给出可执行建议

5 小时、周、月三个窗口用同一套算法；5 小时窗口额外按「近一小时的燃烧速度」修正，
避免用滚动窗口的起点做线性外推。

## 显示配置

已配置多个 provider（DeepSeek 官方、OpenCode Go 等）时，可以逐项选择：

- 显示哪些 provider
- 每个 provider 显示哪些窗口（5h / 周 / 月）
- 显示哪些指标（百分比 / 套餐折算金额 / 等值金额 / token）
- 显示位置（侧栏、设置页、会话顶部）
- 刷新间隔与预警阈值

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

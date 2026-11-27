# 设计：额度配速

## 目标

1. 用官方额度百分比，而不是本地估算金额，作为「用了多少」的权威口径。
2. 把额度消耗与时间进度对齐，预测窗口结束时的用量，提前给出「会不会超」。
3. 允许用户选择显示哪些 provider / 模型 / 窗口 / 指标。
4. 金额分层：套餐折算、API 列表等值、现金支出，不混在一起。

## 窗口模型

每个窗口有：

- `percent`：官方已用百分比（0–100）
- `resetsAt`：官方重置时间（ISO 8601）
- `durationMs`：窗口总时长
  - 5h：5 小时（滚动窗口，官方 `rolling`）
  - 周：7 天（周一 00:00 UTC 重置）
  - 月：上一个订阅周期同一时刻到本次 `resetsAt`

由 `resetsAt - durationMs` 得到窗口起点 `startAt`。

### 基础指标

```text
elapsedMs   = clamp(now - startAt, 0, durationMs)
remainingMs = max(resetsAt - now, 0)
timeFrac    = elapsedMs / durationMs
usedFrac    = percent / 100
pace        = usedFrac / max(timeFrac, epsilon)
projected   = usedFrac / max(timeFrac, epsilon)   // 期末预测（0–1+）
remaining   = max(1 - usedFrac, 0)
```

### 结论分级

| 条件 | 结论 | 建议 |
|---|---|---|
| `pace <= 0.85` | 余量充足 | 可按当前节奏继续 |
| `0.85 < pace <= 1.00` | 正常 | 保持 |
| `1.00 < pace <= 1.15` | 偏快 | 注意，减少长上下文/子代理 |
| `pace > 1.15` 或 `projected >= 1` | 将超限 | 降速或换模型/渠道 |

阈值可配置。

### 5 小时滚动窗口

`rolling` 是滚动窗口，用窗口起点做线性外推会失真。对 5h 窗口额外计算：

```text
recentRate = 最近 N 分钟新增百分比 / N        // 默认 N = 60
etaMs      = remaining / recentRate
projectedAtReset = percent + recentRate * remainingMs
```

结论优先用 `recentRate`，没有足够样本时回退到平均配速。

### 月/周窗口的每日预算

```text
daysLeft     = remainingMs / 86400000
dailyBudget  = remaining / daysLeft
todayUsed    = 当日新增百分比
```

若 `todayUsed > dailyBudget`，提示「今天用超了日预算」。

## 金额口径

### 套餐折算

Go 的额度扣减以 `allowance` 为准。逐请求拿不到时：

```text
allowance ≈ list_cost × planFactor
```

`planFactor` 通过 `billing_source` 或校准得到；实测 Go Plus 为 1.2。
插件显示校准偏差：

```text
impliedMonthlyLimit = percent/100 * monthlyLimit
estimatedAllowance  = localPlanCost
drift               = estimatedAllowance / impliedMonthlyLimit - 1
```

偏差超过阈值时提示「本地估算与官方额度不一致」，而不是静默显示。

### 三列金额

| 列 | 含义 | 用途 |
|---|---|---|
| 套餐折算 | `allowance` 或 `list_cost × planFactor` | 与官方百分比对账 |
| API 等值 | 按官方目录的 token 单价（含峰谷） | 跨渠道比较 |
| 现金支出 | 订阅制为 0，按量渠道为实际扣费 | 看真实花钱 |

## 峰谷价

OpenCode Go 的峰谷按 **UTC** 周一至周五：

- 01:00–04:00 UTC
- 06:00–10:00 UTC

价格 ×2；周末全天 off-peak。插件内部统一用 UTC 计算，显示时再转本地时区。

## Token 桶

官方响应可能包含：

```json
{"input": 31, "output": 1, "reasoning": 1, "cache_read": 0, "cache_write_5m": 0, "cache_write_1h": 0}
```

本地统计必须保留全部桶，不能把 `cache_write_5m/1h` 合并或丢掉，否则金额会偏。

## 显示配置

```yaml
sources:
  - id: opencode-go
    enabled: true
    label: OpenCode Go
    windows: [fiveHour, weekly, monthly]
    metrics: [percent, planCost, pace, projection]
  - id: deepseek-official
    enabled: true
    label: DeepSeek 官方
    metrics: [balance, todayCost]
display:
  placement: sidebar   # sidebar | settings | header
  compact: true
  refreshMinutes: 5
alerts:
  paceWarn: 1.0
  paceCritical: 1.15
  notify: true
```

## v0.1 范围

- OpenCode Go 一个来源，读官方 usage + models。
- 三窗口配速、预测、结论、重置倒计时。
- provider/窗口/指标显示开关。
- 金额：今日套餐折算（列表价 × 倍率）+ 窗口套餐折算（百分比 × 窗口额度）。
- 不做：多账号、自动切换模型、历史曲线、近一小时燃烧速度（v0.2）。

## 风险

- 官方 usage 百分比是整数，粒度粗；金额对账要容忍 ±0.5%。
- 滚动窗口的 `resetsAt` 语义需用真实数据验证。
- `opencode.allowance` 可能被 DSH provider 丢弃；v0.1 用倍率校准，v0.2 再考虑拦截响应。
- 不同套餐/模型的 `monthly_usage` 不同，不能用一个总额度除。

# baidu-acquisition · 百度推广诊断与运营技能

通过百度官方 Open API 读取账户、计划、oCPC 项目与转化数据，做投放诊断和受控写入的 WorkBuddy 技能。所有 API 调用统一走 `scripts/cli.ts`，不在 workflow 里直连百度端点；写入必须走「预览 → 确认 → 执行 → 复查 → 审计」的受控流程。

## 能做什么

- **账户诊断**：消费 / 展现 / 点击 / CTR / CPC / CPA，结构盘点（计划数、oCPC 托管数、项目外计划），转化追踪核对。
- **转化口径**：落地页报告（5381679）读取线索 API 回传的百度标准转化事件——三句话咨询、留线索、电话拨通、意向客户、自定义转化等，并去重计算线索总量与来源计划。
- **oCPC 项目**：把投放包（targetPackage）与计划按 `scope[].levelId` 关联，识别哪些计划在项目内、哪些在项目外；支持查询与新建投放包。
- **搜索词 / 匹配 / 否词**：搜索词复核队列、自动匹配与源词偏离、否定词冲突排查（只产出人工复核队列，绝不自动写否词）。
- **层级与产品诊断**：账户→计划→单元→关键词→搜索词全链路；按产品必含词/禁含词核对推广对象一致性。
- **受控写入**：否定词、关键词、创意、计划的增删改，以及新建 oCPC 投放包，全部带 dry-run 与确认令牌。

## 目录结构

```
scripts/
  cli.ts                  唯一命令入口
  api/
    client.ts             API 客户端（含 write 拦截，写操作必须走 executor）
    credentials.ts        凭证加载与 OAuth 自动刷新（读外部 token store）
    registry.ts           API action → 端点映射
    writes.ts             受控写执行器（plan / dry-run / confirm / execute / audit）
    types.ts              共享类型
  reports/
    registry.ts           报告类型与列定义、转化字段映射、口径去重规则
    fetch.ts              报告分页拉取
  workflows/              账户 / 项目 / 搜索词 / 层级 / 匹配 / 否词 / 产品 / 关键词扩展诊断
references/
  actions.md              action 输入说明
  security.md             写入安全规范（新增写操作前必读）
tests/                    node:test 单元测试
config/products.example.json  产品诊断配置样例
```

## 环境准备

```bash
npm install
npm run check     # tsc --noEmit
npm test          # node --test
```

凭证**不放在仓库里**，从环境变量或外部 token store 读取：

| 变量 | 说明 |
| --- | --- |
| `BAIDU_USER_NAME` | 广告账户名（也可用 `--user-name` 传入） |
| `BAIDU_ACCESS_TOKEN` | 访问令牌 |
| `BAIDU_TOKEN_STORE` | token store 路径，默认 `~/.baidu-acquisition/.baidu-auth.env` |
| `BAIDU_APP_ID` / `BAIDU_SECRET_KEY` | access token 过期时自动刷新所需 |
| `BAIDU_AUTH_USER_ID` | 刷新 token 所需的用户 ID |
| `BAIDU_REFRESH_TOKEN` | 旧 refresh token；若已写入 token store 建议不要用它覆盖新值 |

令牌过期时 `credentials.ts` 会自动刷新并写回 token store（权限 0600）。仓库的 `.gitignore` 已排除 `.env`、`*.token`、`*.log` 及本地调试产物，token store 位于用户主目录、不在仓库内，不会随备份外泄。

## 常用命令

```bash
# 账户与计划
node scripts/cli.ts account get  --user-name "账户名"
# 账户实时消费（今日累计，撞线当天核对口径；报表当日滞后，实时接口为准）
node scripts/cli.ts account live --user-name "账户名" [--device 0|1|2]   # 0全部(默认)/1PC/2移动
node scripts/cli.ts campaign list --user-name "账户名"

# oCPC 项目（需 user-id，可用 account get 查 userId）
node scripts/cli.ts project list --user-name "账户名" --user-id 123

# 各类诊断
node scripts/cli.ts diagnose account      --user-name "账户名" --user-id 123 --start-date 2026-11-01 --end-date 2026-11-07
node scripts/cli.ts diagnose search-terms --user-name "账户名" --start-date 2026-11-01 --end-date 2026-11-07 --review-cost 20
node scripts/cli.ts diagnose hierarchy    --user-name "账户名" --start-date 2026-11-01 --end-date 2026-11-07
node scripts/cli.ts diagnose match-deviation --user-name "账户名" --start-date 2026-11-01 --end-date 2026-11-07
node scripts/cli.ts diagnose negatives    --user-name "账户名" --start-date 2026-11-01 --end-date 2026-11-07
node scripts/cli.ts diagnose products     --user-name "账户名" --products-file config/products.json

# 关键词扩展
node scripts/cli.ts expand keywords --user-name "账户名" --seeds "词1,词2" --max-num 300
```

`diagnose account` 的 `performance.leadConversionTotal` 为线索转化合计，`leadByCampaign` 定位来源计划；总量取账户级汇总（部分转化归不到具体计划），来源取计划级，两路分别查询。

## 报告类型

统一接口 `OpenApiReportService/getReportData`，报告类型见 `scripts/reports/registry.ts`：

| reportType | 名称 |
| --- | --- |
| 170026 | 搜索推广账户报告（CPL / RFQ） |
| 2290316 | 搜索推广计划报告 |
| 2284618 | 搜索推广单元报告 |
| 2602783 | 搜索推广关键词报告 |
| 2307838 | 搜索词报告 |
| 5381679 | 搜索推广落地页报告（转化事件） |

**关键口径**：线索 API 回传的标准转化事件只在落地页报告 5381679 里有数，账户报告 170026 的 `cplConversions` 和 oCPC 报告的 detail 字段都读不到，不能据此判断「无转化」。去重规则：19（一句话咨询）包含 17（三句话咨询），二者不可相加；1、2 是按钮点击属互动行为，不计入线索合计。

## 受控写入

写入用 plan 文件，ID 不要凭空捏造——先 dry-run 解析名称、拿到确认令牌，再带令牌执行。每次执行追加到 `~/.baidu-acquisition/audit.jsonl`。

```bash
node scripts/cli.ts write dry-run  --user-name "账户名" --plan plan.json
node scripts/cli.ts write execute  --user-name "账户名" --plan plan.json --confirm TOKEN
```

plan 格式：

```json
{
  "userName": "账户名",
  "operations": [
    { "type": "negative-delete", "ids": [123], "reason": "原因" },
    { "type": "negative-add", "campaignName": "计划名", "words": [{ "word": "词", "match": "phrase" }] },
    { "type": "keyword-add", "adgroupId": 456, "words": [{ "word": "词", "match": "phrase", "price": 5.5 }] },
    { "type": "ocpc-package-add", "packageName": "投放包名", "campaignIds": [743317210, 737143427],
      "bidMode": 2, "dataFlow": 1000, "transTypes": [120], "marketingTargetId": 7, "reason": "原因" }
  ]
}
```

`ocpc-package-add` 参数：`bidMode` 取 1（目标转化成本，需配 `targetCpa`）或 2（增强模式，一阶段按原 CPC 出价）；`dataFlow` / `transTypes` 默认 `1000` / `[120]`（综合线索收集，与现有账户包口径一致）。`match` 支持 `phrase` / `exact`。

**铁律**：先 dry-run、把预览给人看、拿到明确批准才 execute；绝不跳过确认，绝不擅自扩大写入范围。新增写操作前先读 `references/security.md`。

## 设计原则

1. `scripts/cli.ts` 是唯一 API 入口，workflow 不直连端点。
2. 先解析具体广告账户，再查业务端点。
3. 原始数据先归一化，再下业务结论。
4. oCPC 结论必须经 `scope[].levelId` 把投放包和计划关联；项目外计划不能仅凭出价字段判定为 CPC。
5. 搜索词是人工复核队列，不是自动否词指令；需交叉核对产品相关性、CRM 结果和转化追踪。
6. 优先官方 API，仅当 API 拿不到所需字段时才用浏览器查。
7. 写入全程可审计、可追溯，任何执行都必须有 dry-run 与确认令牌。

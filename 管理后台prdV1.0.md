# 管理后台 PRD V1.0｜用户端数据可视化与运营分析

## 1. 背景与目标
- 背景：用户端 H5 已具备上传朋友圈截图并生成销售策略的能力，需要一套管理后台用于监控核心使用指标与健康度，指导投放与产品迭代。
- 目标：提供可视化看板，覆盖 PV、UV、上传图片数量及相关转化与性能指标，支持维度筛选、时间对比与导出，帮助销售管理与运营快速评估成效与问题。
- 成功标准：
  - 运营可在 3 次点击内获得最近 7 天 PV/UV/上传总量与转化。
  - 关键查询（7 天范围）后端接口响应 ≤ 1s（缓存命中）。
  - 指标口径清晰一致，图表与明细可相互验证。

## 2. 角色与权限
- 角色：
  - Viewer：只读看板（销售主管、运营）
  - Admin：配置维度、管理埋点字段、数据导出、成员管理（产品/数据/研发）
- 鉴权：后台需登录，最小权限原则；可选 IP 白名单；所有导出行为记录审计日志。

## 3. 指标定义（口径统一）
- PV（Page View）：用户端页面被打开的次数（去除后端/机器人流量；同一会话多次进入均计数）。
- UV（Unique Visitor）：按匿名设备指纹或 user_id 聚合的独立访客数（按自然日去重）。
- 上传图片数量：用户完成“选择文件”动作的图片张数之和（含多次上传）。
- 有效上传次数：成功提交到后端并通过格式校验的上传事件次数。
- 分析启动次数：调用后端 analyze 的次数。
- 分析完成次数：模型返回成功结果且前端成功渲染的次数。
- 转化率：
  - 上传转化率 = 有效上传次数 / UV
  - 分析完成率 = 分析完成次数 / 分析启动次数
- 性能指标：
  - 上传端到端耗时（选择→提交成功）
  - 模型响应耗时（后端请求→收到响应）
  - 首次可见结果的渲染耗时
  - 各项耗时的 P50/P90/P95
- 错误指标：
  - 上传失败率（含前端校验失败、网络失败、413 过大等）
  - 模型调用失败率（分状态码，如 401 鉴权、400 参数、5xx 上游）
  - 常见错误消息跟踪（如 AuthenticationError: the API key or AK/SK is missing or invalid）

## 4. 维度（可筛选/对比）
- 时间：今日、昨日、近7天、近30天、自定义日期；支持“对比上一周期/去年同期”。
- 渠道：utm_source / 推广渠道 / 二维码场景值。
- 终端环境：OS（iOS/Android/Windows/Mac）、浏览器、微信内/外。
- 地域：省/市（基于 IP 粗定位，脱敏）。
- 版本：前端版本、后端版本（用于排查回归）。
- 文件特征：单次上传的图片数分布、平均大小分布。

## 5. 页面与图表
- 概览页（Dashboard）
  - 指标卡片：PV、UV、有效上传次数、上传图片总数、分析启动、分析完成、分析完成率、P95 模型耗时
  - 趋势图：PV/UV/上传/分析完成（多序列可切换）
  - 漏斗图：PV → 有效上传 → 分析启动 → 分析完成
  - 分布图：单次上传张数分布直方图（1–5、6–10、11–20… trunc tyl）
  - 错误概览：Top 错误类型与占比（饼图/条形图）
- 维度分析页
  - 分组表：按渠道/地域/终端/版本聚合 PV、UV、上传、完成率、P95 耗时
  - 排序与筛选：TOP N、阈值过滤
  - 导出：当前查询条件下 CSV
- 明细列表页（问题排查）
  - 明细表：时间、会话/设备、渠道、文件数、大小、状态、错误码、耗时
  - 支持 keyword 搜索、分页、列选择、下载日志片段（带脱敏）

## 6. 交互与可用性
- 全局筛选：时间、渠道、地域、终端，应用于当前页面所有图表与表格。
- 对比：开启对比后，曲线展示本期与对比期两条折线，卡片显示环比/同比百分比。
- 协作：图表可复制图片、数据可导出 CSV；记录导出操作。
- 空态与错误态：无数据/查询失败/超时报错提示，提供重试与“清空筛选”。

## 7. 数据埋点与上报
- 前端事件（建议）
  - page_view：{ page, route, referrer, session_id, anon_id, utm, ts }
  - upload_start：{ files_count, total_size_mb, session_id, ts }
  - upload_success / upload_fail：{ files_count, total_size_mb, error_code?, http_status?, ts }
  - analyze_start：{ files_count, ts }
  - analyze_success / analyze_fail：{ latency_ms, status_code?, model_error?, ts }
  - copy_click / export_click：{ type, ts }
- 上报方式：优先使用 navigator.sendBeacon；退化为 fetch POST；离线重试（可选）。
- 字段规范：所有事件包含 session_id、anon_id（无登录时基于指纹）、ts（毫秒）、app_version、env。
- 隐私：不采集个人身份信息；IP 仅用于地域聚合；日志脱敏。

## 8. 数据管道与存储（参考实现）
- 接入：前端→/api/track（后端接收并校验）→消息队列/流式写入
- 存储：ClickHouse（优先）或 PostgreSQL
  - 表：events_raw（宽表）、daily_agg（按日维度聚合）、dim_channel 等
  - 去重：事件 idempotency_key；同一 key 仅计一次
  - 留存：明细 30 天，聚合 180 天（可配置）
- 预聚合：每日/每小时批处理 PV/UV/转化/分布；热区间（近 7 天）建立物化视图或缓存

## 9. 后端接口（管理端）
- GET `/admin/metrics/overview?from=...&to=...&channel=...&region=...`
  - 返回：{ pv, uv, upload_valid, images_total, analyze_start, analyze_success, analyze_rate, p95_latency }
- GET `/admin/metrics/trends?metric=pv,uv,upload,analyze_success&interval=hour|day&from=&to=`
  - 返回：时间序列数组
- GET `/admin/metrics/funnel?from=&to=&filters...`
  - 返回：{ pv, upload_valid, analyze_start, analyze_success }
- GET `/admin/metrics/grouped?group_by=channel|region|device|version&from=&to=`
  - 返回：分组聚合表
- GET `/admin/events?from=&to=&page=&page_size=&filters...`
  - 返回：明细记录
- GET `/admin/export?type=grouped|events&...`
  - 返回：CSV 下载
- 性能：近 7 天查询 ≤ 1s（缓存）；近 30 天 ≤ 3s；超时 8s 断开返回错误。

## 10. 技术与架构
- 前端（管理后台）：基于 Ant Design 或 Element Plus 的单页应用；图表库 ECharts/AntV/G2。
- 后端：Node.js（Koa/Express）/ Go；提供 metrics 与 events 聚合查询；接入缓存（Redis）。
- 缓存策略：查询条件标准化为 cache key；近 7 天窗口 TTL 60s。
- 容错：数据库故障时降级返回最近缓存；导出异步任务 + 回调下载链接。

## 11. 安全与合规
- 鉴权：JWT + 服务端会话/或企业 SSO；权限校验在接口层。
- 审计：记录登录、导出、删除、权限变更。
- 限流：管理端 API QPS 限制；导出限并发与总量。
- 合规：事件仅包含匿名标识；遵守个人信息保护要求；提供数据删除流程。

## 12. 监控与告警
- 采集：接口错误率、P95 查询耗时、缓存命中率、埋点接收队列积压。
- 告警：错误率 > 3%、模型 401/400/5xx 异常激增、查询超时占比 > 5%。

## 13. 里程碑与验收
- M1（1 周）：完成埋点方案与数据接收 API，上线基础明细与日聚合。
- M2（1–2 周）：完成概览页/趋势/漏斗/分组表与导出；接入缓存与权限。
- M3（1 周）：性能优化（预聚合/索引）、监控告警与审计；灰度发布。
- 验收：指标对齐（明细与聚合一致性）、接口性能达标、导出正确、权限与审计可追溯。

## 14. 指标字段示例（事件 Schema）
```json
{
  "common": {
    "session_id": "string",
    "anon_id": "string",
    "ts": 1710000000000,
    "app_version": "1.0.0",
    "env": "prod",
    "utm": { "source": "douyin", "campaign": "q1" },
    "device": { "os": "iOS", "browser": "WeChat" },
    "region": "Beijing"
  },
  "page_view": { "page": "home", "route": "/upload" },
  "upload_start": { "files_count": 7, "total_size_mb": 12.4 },
  "upload_success": { "files_count": 7, "total_size_mb": 12.4 },
  "upload_fail": { "files_count": 7, "error_code": "413", "http_status": 413 },
  "analyze_start": { "files_count": 7 },
  "analyze_success": { "latency_ms": 23880, "status_code": 200 },
  "analyze_fail": { "status_code": 401, "model_error": "AuthenticationError" },
  "copy_click": { "type": "all" },
  "export_click": { "type": "csv" }
}
```

---
文档状态：V1.0（首版需求）  
范围：覆盖 PV/UV/上传/转化/性能的核心可视化与运营分析需求。


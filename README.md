# 注意厨房

工程心理学作业二：把多源监控与显示设计变成两个厨房任务，比较原有方案与可检验的改进。使用普通电脑摄像头和自托管 WebGazer 估计烤箱任务中的观看分配；果汁任务只采行为数据。

**正式协议为 `kitchen-v1.0.0`，默认入口已开放。** 本机摄像头与眼动流程已经过人工测试。两项任务完成后各自自动上传并核验；发布后还需在实际 GitHub Pages 地址核对 HTTPS 资源和课程接口。

## 正式参与入口

正式收数部署在 GitHub Pages。参与者只需用电脑 Chrome 打开发布后的 HTTPS 首页：

<https://bnu-engpsy-fall26.github.io/ZhuangXin202411260030_assignment2/>

参与者不需要下载仓库、不需要运行任何脚本，也不需要打开 `启动预览.command`。发布前以仓库 **Settings → Pages** 实际显示的网址为准；网址不要添加 `?mode=pilot`。HTTPS 用于正常申请摄像头权限并加载本项目自托管的 WebGazer 资源。

推荐流程：参与说明与同意 → 匿名编号 → 摄像头校准和验证 → 烤箱练习与两段任务 → 果汁练习与三段任务 → 结果、热图及本机备份。正式模式在每个完整实验结束后自动保存到课程接口，再回读核验；真人先导使用 `?mode=pilot`，保持测试身份，可手动上传。

正常单次预算为 **570.8 秒，约 9 分 31 秒**：摄像头准备 120 秒、烤箱练习 18 秒与任务 170 秒、果汁练习最多 16.8 秒与任务最多 201 秒、说明与切换约 45 秒。这不是强制截止；权限等待、重校准、重复练习和休息会延长。

## 两个实验：保留什么，改进什么

| 项目 | 烤箱：多源监控 | 果汁：显示与任务匹配 |
|---|---|---|
| 理论依据 | SEEV 相关的事件预期、任务价值与注意分配；参考 Horrey 等（2006） | 邻近兼容原则 PCP；参考 Wickens 与 Andre（1990）、Wickens 与 Carswell（1995） |
| 参与者做什么 | 监控四个烤箱，在饼干出炉后及时取出 | 单项题判断“甜度是否至少为 6”；比较题判断“甜度是否大于酸度” |
| 保留的机制 | 事件频率高低×漏单损失高低交叉；同时测操作与观看分配 | 单项读取与双项整合需要不同的信息组织方式；比较多种显示 |
| 实现的条件 | `baseline` 普通、`value_cue` 价值提示 | `separated` 分离、`integrated` 共框、`task_matched` 按任务显示 |
| 待检验的改进 | 突出高损失烤箱，帮助参与者分配有限注意 | 单项题强调甜度，比较题采用对齐共框；两个原始读数始终保留，不直接给答案 |
| 正式数量 | 每条件 50 事件；两个高频炉各 15、两个低频炉各 10；合计 100 | 每显示×任务 10 题，每格 5 是/5 否；三显示×两任务合计 60 |
| 时限与反馈 | 每段 85 秒，事件响应窗 1800 ms；正式阶段无逐事件正误提示 | 每题 3000 ms，正式题间隔 350 ms；练习有 1200 ms 解释反馈，正式无正误反馈 |

这是机制层面的厨房改编。Horrey 等研究的是驾驶与车内任务；本项目没有复刻驾驶情境，也没有拟合完整 SEEV 数学模型。PCP 原研究中，空间距离、颜色与对象化的作用不同；本项目的共框条形读数不等价于原文的对象几何显示。“放得近就更好”不是本项目预设结论。[Horrey 等原文信息](https://pubmed.ncbi.nlm.nih.gov/16802889/)、[Wickens 与 Andre 原文](https://journals.sagepub.com/doi/10.1177/001872089003200105)

按任务显示是本项目提出的待检验扩展，布局切换也可能带来成本。相关研究提示，显示是否有利取决于可感知的信息与任务是否匹配，不能仅凭“更整合”判断优劣。[Wickens 与 Carswell 理论综述](https://journals.sagepub.com/doi/10.1518/001872095779049408)、[Sanderson 等研究](https://journals.sagepub.com/doi/10.1177/001872088903100207)

两个实验内部按匿名编号种子分配条件顺序：烤箱两种顺序、果汁六种顺序。烤箱位置因素在同一人内固定；果汁三个显示使用相同数值集合、各自打乱。**种子可复现不等于小样本已平衡**，须在招募安排及报告中检查各顺序人数。整套流程固定先烤箱后果汁，不据此比较两个实验“谁更难”。

## 研究问题、预测与分析

以下预测、指标与分析规则均在正式收数前确定，完整内容见[预测与分析方案](docs/predictions-v1.md)。

| 研究问题 | 主要预测与指标 | 次要指标及代价 |
|---|---|---|
| 突出高损失烤箱能否减少重要订单漏取？ | 每人高损失漏取率 `价值提示−普通 < 0`；每条件分母为 25 个高损失事件 | 低损失漏取率、总加权损失、误按、命中反应时；合格眼动的高损失区域采样比例 |
| 按当前任务组织显示是否有帮助？ | 两类任务等权后，每人正确率 `按任务−两种固定显示的平均 > 0` | 正确反应时、超时率、显示×任务差异、探索性的任务切换成本 |

计划招募 **10 名独立真人，至少满足 5 名他人的课程要求**。每名参与者须达到每个实验条件的规定数量。开发自测、先导与模拟不计入正式人数；眼动有效人数与行为有效人数分别报告。

统计单位是参与者：先计算每人的条件摘要和配对差，再报告配对差的均值、95% t 置信区间与个人连线，不能把所有试次或眼动采样点当作独立被试。约 5–10 人的区间不稳定、功效有限；未达预期、正确率天花板与速度—准确率权衡都应如实报告。即时结果页是原始操作摘要，不是最终组水平统计。

预先规定的纳入与排除规则包括：仅当前正式协议和有效同意；不完整或技术中止不进入该实验完整配对；重复参加优先采用最早的有效完整一轮；错误和超时保留在行为分析。**正确反应 RT<150 ms 只从正确 RT 摘要中剔除，保留原始行与全部行为统计；PCP 不设低正确率排除阈值或额外理解检查，保留现有练习。** 不得依据是否支持预测选择被试或轮次。极短 RT 筛选属于研究分析规则，当前即时结果页仍显示未经该筛选的原始摘要。

## 眼动质量与边界

九点×五次点击校准后，独立验证四个实际烤箱区域。每区分类准确比例和采样覆盖比例均须达到 60%；任务阶段按有效 100 ms 采样格检查每段覆盖率，门槛同为 60%。只有两条件均合格，才进入对应的眼动配对比较。窗口变化、页面隐藏、严重绘制停顿及摄像头失联会中止当前轮次并保留已有记录。

**60% 是本项目的工程试行门槛，不是通用科学合格线。** WebGazer 提供的是普通摄像头估计，当前设备的精度必须实测。正式任务中不继续用按键或鼠标训练眼动模型。视频不录制、不上传；原始视线坐标只保存在本机 JSON，课程接口只接收行为、质量及区域汇总。[WebGazer 官方论文](https://ijcai.org/proceedings/2016/540)

热图只使用烤箱任务中的真实有效采样，两条件采用相同色标和时间归一。眼动缺失或不合格时不绘制替代热图，也不把行为预览称为眼动完成。若行为任务完整有效但眼动质量不足，行为与眼动分别决定是否纳入。热图是描述性分布，不能单独证明改进有效。

## 正式、先导和历史数据

公开课程项目码为 `8P4BGM`；下载密钥不放入前端、Git、README 或备份。

| 身份 | 正式 | 真人先导 |
|---|---|---|
| `collectionMode` | `formal` | `pilot` |
| 协议 | `kitchen-v1.0.0` | `kitchen-pilot-v1.0.0` |
| 烤箱实验 / 版本 | `seev_bakery_v1` / `seev-v1.0.0` | `test_seev_bakery_v1` / `test-seev-v1.0.0` |
| 果汁实验 / 版本 | `pcp_juice_v1` / `pcp-v1.0.0` | `test_pcp_juice_v1` / `test-pcp-v1.0.0` |
| 同意版本 | `kitchen-formal-2026-11-08-v1` | `kitchen-pilot-2026-11-08-v1` |
| 标记 | `testOnly/test_only:false`、`simulation:false` | `testOnly/test_only:true`；真人先导 `simulation:false` |
| 默认匿名编号 | `P_` 加 10 位随机字符 | `test_` 加 10 位随机字符 |

正式编号拒绝 test、qa、sim、pilot、demo、auto 等测试前缀；网页不要求姓名、学号、电话。新模式的同意信息随每个实验结果保存，不单独发 onboarding 测试记录。自动化验收使用隔离模拟；`simulation:true` 的结果被禁止发往真实接口。

每个完整实验先保留本机，再 POST 并 GET 回读全部唯一试次和发送字段，成功核验后才显示已保存。失败或网络不确定时可下载完整 JSON；重试先查后发，不能仅凭 POST 成功认定数据齐全。支持 Web Locks 的同源标签页按同一轮次串行提交并刷新保存状态；课程接口未证明服务端幂等，跨浏览器或存储失效时仍须按唯一编号去重。中止/未完成记录留本机，不冒充完整实验上传。

按 `session_id`、`bundle_id` 和独立 `run_id` 关联两实验；分析行为试次时筛选 `record_kind === 'event'`，不把 `false_alarm`、`block_quality`、`gaze_validation` 辅助行混作试次数。各行不超过 40 字段，原始眼动 `x/y` 不上传。旧阶段的测试结果和同意记录保留原名及原存储位置，不自动升级为正式、改名或补传。当前接口合同见 [data-release.md](docs/data-release.md)。

## 方案状态与验收

研究问题、两项主要预测、排除规则和眼动工程门槛均已在收数前冻结，正式入口已开放。发布状态和剩余的线上检查统一记录在[发布检查表](docs/recruitment-checklist.md)。

运行逻辑测试：`node --test tests/*.test.cjs`。110 项逻辑测试及隔离浏览器验收通过，见[技术验收](docs/acceptance-release.md)。自动验收使用模拟接口；GitHub Pages 发布后仍需核对线上资源和课程接口。历史阶段文档保留当时的过程记录，其中的旧状态不代表当前正式版。

Git 推送、Pages 设置与实际发布后检查见 [部署说明](docs/deployment.md)。

主要文件：`js/protocol.js` 冻结协议身份；`js/app.js` 控制参与流程；`js/seev.js`、`js/pcp.js` 负责实验；`js/gaze.js` 与 `js/heatmap.js` 负责眼动及热图；`js/data.js` 负责保存与核验。第三阶段设计取舍见 [design-stage3.md](docs/design-stage3.md)，发布研究决定以本 README 和最终确认的预测文件为准。

## 老师或开发者本地检查

本节不属于被试参与流程。项目是纯 HTML、CSS、JavaScript，无需构建或安装 npm 包。老师或开发者 clone 仓库后，可在项目目录运行：

```sh
python3 -m http.server 8766 --bind 127.0.0.1
```

然后用电脑 Chrome 打开 `http://localhost:8766`。不要用 `file://` 直接打开 `index.html` 验收摄像头；浏览器只会在 HTTPS 或 localhost 等可信环境下稳定开放摄像头和相关资源。

## 参考文献

Horrey, W. J., Wickens, C. D., & Consalus, K. P. (2006). Modeling drivers’ visual attention allocation while interacting with in-vehicle technologies. *Journal of Experimental Psychology: Applied, 12*(2), 67–78. https://doi.org/10.1037/1076-898X.12.2.67

Wickens, C. D., & Andre, A. D. (1990). Proximity compatibility and information display: Effects of color, space, and objectness on information integration. *Human Factors, 32*(1), 61–77. https://doi.org/10.1177/001872089003200105

Wickens, C. D., & Carswell, C. M. (1995). The proximity compatibility principle: Its psychological foundation and relevance to display design. *Human Factors, 37*(3), 473–494. https://doi.org/10.1518/001872095779049408

Papoutsaki, A., Sangkloy, P., Laskey, J., Daskalova, N., Huang, J., & Hays, J. (2016). WebGazer: Scalable webcam eye tracking using user interactions. In *Proceedings of the Twenty-Fifth International Joint Conference on Artificial Intelligence (IJCAI-16)* (pp. 3839–3844). AAAI Press. https://ijcai.org/proceedings/2016/540

Sanderson, P. M., Flach, J. M., Buttigieg, M. A., & Casey, E. J. (1989). Object displays do not always support better integrated task performance. *Human Factors, 31*(2), 183–198. https://doi.org/10.1177/001872088903100207

## AI 使用与素材

AI 协助文献查找、设计讨论、编码、测试、文案与原创插画。研究问题、预测和分析规则在正式收数前冻结；最终数据解释以实际收集结果为准。目前未声称已收集正式结果，未生成或篡改正式数据。

插画与提示记录见 [assets.md](docs/assets.md)。票根参考 Gamefinity 的形式，未复制其品牌与游戏素材。WebGazer 3.5.3 的 GPL-3.0-or-later 源码和许可随仓库保留，发布时不可遗漏。

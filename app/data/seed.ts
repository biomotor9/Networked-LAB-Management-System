import type { Dependency, Entry, Plan } from "../features/workspace/model";

export const seedDependencies: Dependency[] = [
  { id: "d1", sourceId: "p0", targetId: "p1" },
  { id: "d2", sourceId: "p1", targetId: "p8" },
  { id: "d3", sourceId: "p8", targetId: "p12" },
  { id: "d4", sourceId: "p2", targetId: "p4" },
  { id: "d5", sourceId: "p3", targetId: "p4" },
  { id: "d6", sourceId: "p5", targetId: "p17" },
  { id: "d7", sourceId: "p9", targetId: "p10" },
  { id: "d8", sourceId: "p10", targetId: "p11" },
  { id: "d9", sourceId: "p13", targetId: "p15" },
  { id: "d10", sourceId: "p14", targetId: "p15" },
];

export const seedPlans: Plan[] = [
  { id: "p0", parentId: null, title: "研究问题与评价体系", domain: "综合", status: "已完成", summary: "明确靶点边界、候选定义和跨阶段评价指标。", objective: "把科学问题转化为可执行、可比较的验收条件。", success: "数据、模型和湿实验团队采用同一候选定义。", tags: ["立项", "评价体系"], updatedAt: "7月22日" },
  { id: "p01", parentId: "p0", title: "靶点边界定义", domain: "湿实验", status: "已完成", summary: "确定目标蛋白家族、排除条件和活性范围。", objective: "形成筛选对象的正式定义。", success: "研究团队完成评审并冻结版本。", tags: ["靶点"], updatedAt: "7月20日" },
  { id: "p02", parentId: "p0", title: "统一评价指标", domain: "机器学习", status: "已完成", summary: "统一离线排序指标、筛选命中率与复测通过率。", objective: "让不同阶段结果可以追溯比较。", success: "形成指标字典和计算口径。", tags: ["指标"], updatedAt: "7月22日" },
  { id: "p1", parentId: null, title: "多模态蛋白筛选平台", domain: "综合", status: "进行中", summary: "建立从计算预测、高通量筛选到自动化验证的一体化探索流程。", objective: "验证跨学科实验计划能否在一个工作区内被连续管理。", success: "完成计算、湿实验与自动化三个方向的首轮闭环。", tags: ["主项目", "蛋白筛选"], updatedAt: "今天 10:24" },
  { id: "p2", parentId: "p1", title: "主干网络选择", domain: "机器学习", status: "进行中", summary: "比较 Transformer、图网络与混合架构在候选排序任务上的表现。", objective: "确定首版候选蛋白排序模型的主干架构。", success: "交叉验证 AUPRC 提升超过 8%，推理成本可接受。", tags: ["模型", "对照"], updatedAt: "今天 09:48" },
  { id: "p3", parentId: "p1", title: "输入特征探索", domain: "机器学习", status: "未开始", summary: "评估序列、结构置信度与功能注释特征的增益。", objective: "确定最小而有效的输入特征集合。", success: "找到稳定增益的特征组合，并完成消融实验。", tags: ["特征工程"], updatedAt: "昨天 17:30" },
  { id: "p4", parentId: "p1", title: "目标蛋白高通量筛选", domain: "湿实验", status: "进行中", summary: "建立 96 孔板筛选条件并记录候选命中率。", objective: "筛选具有目标活性的候选蛋白。", success: "获得不少于 12 个可复测候选，并通过阳性对照。", tags: ["筛选", "96孔板"], updatedAt: "昨天 15:12" },
  { id: "p5", parentId: "p4", title: "筛选条件优化", domain: "湿实验", status: "已完成", summary: "优化缓冲体系、反应时间与检测窗口。", objective: "降低背景并提高检测动态范围。", success: "Z-factor ≥ 0.5，重复间 CV < 15%。", tags: ["方法开发"], updatedAt: "7月29日" },
  { id: "p6", parentId: "p1", title: "自动化样品处理", domain: "硬件", status: "终止", summary: "验证移液、扫码与板位识别模块的组合方案。", objective: "形成可复用的样品处理硬件原型。", success: "连续处理 10 块板无人工干预，关键步骤成功率 ≥ 99%。", tags: ["自动化", "原型"], updatedAt: "7月28日" },
  { id: "p7", parentId: "p6", title: "设备通信服务", domain: "软件", status: "未开始", summary: "统一移液工作站、扫码器和板位传感器的通信接口。", objective: "验证统一设备适配层的可行性。", success: "三类设备可通过同一任务接口完成联调。", tags: ["接口", "设备控制"], updatedAt: "7月27日" },
  { id: "p17", parentId: "p4", title: "正式批次筛选", domain: "湿实验", status: "未开始", summary: "使用冻结条件完成首批候选的高通量筛选。", objective: "获得可进入复测的候选集合。", success: "阳性对照稳定且得到不少于 12 个候选。", tags: ["正式筛选"], updatedAt: "今天 08:40" },
  { id: "p18", parentId: "p6", title: "板位与条码识别", domain: "硬件", status: "进行中", summary: "验证板位传感器与条码读取的容错方案。", objective: "避免样品与孔板身份错配。", success: "连续 500 次读取无误识别。", tags: ["传感器", "追踪"], updatedAt: "昨天 16:20" },
  { id: "p8", parentId: null, title: "候选蛋白复测与机制验证", domain: "湿实验", status: "未开始", summary: "对筛选命中候选进行复测、正交验证和初步机制确认。", objective: "确认候选效应真实、可重复并具有机制解释。", success: "得到 3–5 个进入深入研究的高置信候选。", tags: ["验证阶段"], updatedAt: "昨天 14:05" },
  { id: "p9", parentId: "p8", title: "候选重复验证", domain: "湿实验", status: "未开始", summary: "独立制备样品并进行剂量梯度复测。", objective: "排除偶然命中和批次效应。", success: "至少 60% 候选通过复测。", tags: ["复测"], updatedAt: "昨天 13:40" },
  { id: "p10", parentId: "p8", title: "正交检测验证", domain: "湿实验", status: "未开始", summary: "使用不同检测原理确认候选活性。", objective: "排除检测体系特异性干扰。", success: "关键候选在两种方法中方向一致。", tags: ["正交验证"], updatedAt: "7月31日" },
  { id: "p11", parentId: "p8", title: "初步机制分析", domain: "湿实验", status: "未开始", summary: "通过竞争、突变和结合实验推断作用机制。", objective: "建立候选作用的初步机制假设。", success: "形成可供下一轮验证的机制模型。", tags: ["机制"], updatedAt: "7月31日" },
  { id: "p12", parentId: null, title: "自动化验证闭环", domain: "综合", status: "未开始", summary: "连接样品处理、设备控制、数据采集和结果回写。", objective: "验证跨软硬件的无人值守实验闭环。", success: "完成一个批次从任务下发到结果回写的端到端运行。", tags: ["闭环", "自动化"], updatedAt: "7月30日" },
  { id: "p13", parentId: "p12", title: "样品处理工作站", domain: "硬件", status: "终止", summary: "集成移液、扫码与板位识别模块。", objective: "稳定执行标准化样品处理流程。", success: "关键移液步骤成功率达到 99%。", tags: ["工作站"], updatedAt: "7月29日" },
  { id: "p14", parentId: "p12", title: "实验数据采集服务", domain: "软件", status: "进行中", summary: "统一采集仪器文件、任务状态和质控信息。", objective: "让结果自动关联到对应计划和实验记录。", success: "三类设备输出可被自动解析并回写。", tags: ["数据管道"], updatedAt: "今天 11:05" },
  { id: "p15", parentId: "p12", title: "端到端联调", domain: "综合", status: "未开始", summary: "联调任务编排、硬件执行、数据采集和结果回写。", objective: "验证完整自动化实验闭环。", success: "连续完成三个批次且无人工修正数据关联。", tags: ["系统联调"], updatedAt: "今天 10:50" },
  { id: "p16", parentId: "p15", title: "异常恢复演练", domain: "软件", status: "未开始", summary: "模拟断连、耗材不足和文件延迟并验证恢复策略。", objective: "确保实验异常可追踪、可恢复。", success: "关键异常均能安全停止或自动恢复。", tags: ["容错"], updatedAt: "今天 10:12" },
];

export const seedEntries: Entry[] = [
  { id: "e1", planId: "p2", date: "2026-08-01", type: "计划", title: "第一轮架构基线", content: "固定数据划分、训练预算和评价指标，分别训练轻量 Transformer、GNN 与混合模型。" },
  { id: "e2", planId: "p2", date: "2026-08-01", type: "过程", title: "Transformer 基线完成", content: "训练过程稳定，验证集 AUPRC 为 0.742；长序列样本的显存占用偏高，下一轮加入分块策略。" },
  { id: "e3", planId: "p5", date: "2026-07-29", type: "结果", title: "检测窗口确认", content: "反应 35 分钟时动态范围最佳，Z-factor 0.61。采用该条件进入正式筛选。" },
  { id: "e4", planId: "p1", date: "2026-07-30", type: "决策", title: "首轮并行推进", content: "模型、湿实验和自动化样品处理三个方向并行开展，先验证各自最小闭环。" },
  { id: "e5", planId: "p0", date: "2026-07-22", type: "决策", title: "评价口径冻结", content: "候选排序使用 AUPRC 与 Top-K recall，湿实验以复测通过率作为阶段出口。" },
  { id: "e6", planId: "p4", date: "2026-07-31", type: "计划", title: "首轮 96 孔筛选设计", content: "设置阳性、阴性和空白对照，每个候选双复孔；条件优化完成后进入正式批次。" },
  { id: "e7", planId: "p9", date: "2026-08-01", type: "计划", title: "复测批次安排", content: "按初筛效应值分层选取候选，加入独立制备与三点剂量梯度。" },
  { id: "e8", planId: "p14", date: "2026-08-01", type: "过程", title: "文件监听原型", content: "已完成板读仪目录监听和基础元数据解析，待接入任务编号校验。" },
  { id: "e9", planId: "p18", date: "2026-07-31", type: "结果", title: "条码识别压力测试", content: "连续读取 320 次无错误；反光膜条件下有 4 次重试，需调整补光角度。" },
  { id: "e10", planId: "p12", date: "2026-07-30", type: "分析", title: "闭环边界梳理", content: "首版只覆盖任务下发、执行状态、原始结果定位和记录回写，不包含自动科学结论。" },
];


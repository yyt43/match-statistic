import { X, Trophy, Users, Swords, Settings, Download, HelpCircle, FlaskConical, Eye, ArrowLeftRight, UserCog, Database, Shield, GripVertical, History, Keyboard } from 'lucide-react';
import { useEscapeClose } from '../hooks/useEscapeClose';

interface HelpPageProps {
  isOpen: boolean;
  onClose: () => void;
}

export function HelpPage({ isOpen, onClose }: HelpPageProps) {
  useEscapeClose(isOpen, onClose);
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/95 backdrop-blur-sm z-50 overflow-y-auto">
      <div className="max-w-4xl mx-auto px-6 py-12">
        {/* 关闭按钮 */}
        <button
          onClick={onClose}
          className="fixed top-6 right-6 p-3 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {/* 标题 */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-3 mb-4">
            <Trophy className="w-10 h-10 text-gold-400" />
            <h1 className="text-3xl font-bold text-white">诗意 · 比赛战绩统计系统</h1>
          </div>
          <p className="text-slate-400">专业的比赛管理与战绩统计工具</p>
        </div>

        {/* 功能介绍 */}
        <section className="mb-10">
          <h2 className="text-xl font-semibold text-white mb-6 flex items-center gap-2">
            <HelpCircle className="w-5 h-5 text-gold-400" />
            功能介绍
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FeatureCard
              icon={<Users className="w-5 h-5" />}
              title="多小组管理"
              description="支持手动设置小组数量（1~20 个，如 128 人分 4 组、每组 32 人），新增小组自动延续选手编号。各小组既能独立比赛，也可一键同时开赛。"
            />
            <FeatureCard
              icon={<Eye className="w-5 h-5" />}
              title="选手整体预览"
              description="比赛开始前可一键预览全部小组的选手名单，自动检测重名与空小组，支持搜索过滤与一键复制全部名单，便于核对录入。"
            />
            <FeatureCard
              icon={<UserCog className="w-5 h-5" />}
              title="选手名单管理"
              description="支持手动逐个编辑选手名称，或通过「批量导入」一次性粘贴多行名单；并通过「批量设置所有小组」入口统一配置各组人数、轮次、赛制后一键「应用至所有小组」。"
            />
            <FeatureCard
              icon={<Swords className="w-5 h-5" />}
              title="双赛制支持"
              description="提供瑞士轮与单败淘汰两种配对方式：前者按同战绩配对，后者每轮淘汰败者直至决出冠军。两种赛制均支持 BO1~BO7 局数设置。"
            />
            <FeatureCard
              icon={<ArrowLeftRight className="w-5 h-5" />}
              title="对阵编辑"
              description="单败淘汰当前轮支持整轮对阵编辑：点击选手金色高亮选中（带脉动光点），再点击另一槽位即可交换两人，可跨场比赛调整。另提供「随机分配」与「按录入顺序」一键重排，保存后立即生效。"
            />
            <FeatureCard
              icon={<Trophy className="w-5 h-5" />}
              title="实时排名"
              description="根据 BO1/BO3/BO5/BO7 赛制自动计算胜率、对手胜率、局胜率等排名指标，数值均精确到小数点后两位；单败淘汰另按淘汰轮次排名，被淘汰选手与弃赛选手区分显示。"
            />
            <FeatureCard
              icon={<Settings className="w-5 h-5" />}
              title="灵活配置"
              description="先选配对方式（瑞士轮/单败淘汰），再选比赛局数（BO1/BO3/BO5/BO7）。单败淘汰每轮可独立设置不同局数（如决赛用 BO5/BO7 更公平）。"
            />
            <FeatureCard
              icon={<Download className="w-5 h-5" />}
              title="数据导出"
              description="支持将排行榜 / 对阵表导出为图片或 Excel 文件（Excel 另含「总表」类型，含排行榜 + 各轮对阵），可单独导出当前小组，也可导出所有小组。还可导出 JSON 文件备份完整赛事数据。导出的图片左下角自动添加系统标题水印。"
            />
            <FeatureCard
              icon={<Database className="w-5 h-5" />}
              title="双备份本地存储"
              description="比赛数据自动保存到浏览器本地存储，采用主键 + 备份键双写机制：主键损坏时自动从备份键恢复。支持导出/导入 JSON 文件实现备份与跨设备迁移；比赛开始后导入功能自动禁用，需先重置再导入。"
            />
            <FeatureCard
              icon={<FlaskConical className="w-5 h-5" />}
              title="测试模式"
              description="开启后在左侧排行榜面板顶部提供随机生成比赛结果的快捷按钮，便于演示、调试排名算法或预览导出效果，无需逐场手动录入。随机生成多轮结果时显示实时进度条。"
            />
            <FeatureCard
              icon={<GripVertical className="w-5 h-5" />}
              title="对阵拖拽改序"
              description="非编辑模式下，对阵列表中的比赛卡片可直接拖拽调整显示顺序。鼠标悬停时左上角出现拖拽手柄提示，拖拽中被拖卡片半透明、目标位置顶部高亮，释放后立即保存新顺序。"
            />
            <FeatureCard
              icon={<History className="w-5 h-5" />}
              title="自动快照备份"
              description="每轮完赛时自动创建快照（保留最近 5 份），无需手动操作。点击控制面板底部的「备份管理」可查看所有快照、手动创建快照、恢复到任意快照或删除快照。恢复时自动重算所有排名数据。"
            />
            <FeatureCard
              icon={<Keyboard className="w-5 h-5" />}
              title="快捷操作"
              description="Ctrl+Z（Mac 为 Cmd+Z）撤回上一轮比赛结果，无需点击按钮；生成下一轮前弹出配对预览面板，展示本轮双负/轮空/弃赛摘要及下一轮对阵预览；所有破坏性操作均使用统一确认弹窗，替代浏览器原生 confirm。"
            />
          </div>
        </section>

        {/* 使用指南 */}
        <section className="mb-10">
          <h2 className="text-xl font-semibold text-white mb-6">使用指南</h2>

          <div className="space-y-6">
            <StepBlock
              number={1}
              title="创建比赛"
              steps={[
                '设置比赛名称：点击顶部赛事名称即可编辑',
                '设置小组数量：在左侧「小组管理」区域拖动滑块或直接输入数字（1~20），数字输入框可完全清空后重新输入，新增小组自动延续选手编号',
                '配置小组参数：先选配对方式（瑞士轮 / 单败淘汰），再选比赛局数（BO1 / BO3 / BO5 / BO7）',
                '单败淘汰的轮次会按人数自动计算，修改人数后轮次自动同步（如 32 人 = 5 轮，16 人 = 4 轮）；瑞士轮可手动指定',
                '管理选手名单：支持手动逐个编辑，或通过「批量导入」粘贴名单',
                '点击「预览选手」按钮，整体核对所有小组的选手名称（自动检测重名/空小组）',
                '点击「开始本组比赛」或「全部小组同时开赛」'
              ]}
            />

            <StepBlock
              number={2}
              title="录入比赛结果"
              steps={[
                '比赛开始后自动生成第一轮对阵表',
                '在中路对阵表中点击待进行的比赛卡片以展开结果录入区',
                'BO1：点击「左侧胜 (1-0)」「右侧胜 (0-1)」或「双负 (0-0)」按钮',
                'BO3/BO5/BO7：点击具体比分按钮录入（如「左侧 2-0」「右侧 1-2」），并支持「双负 (0-0)」',
                '录入错误时点击「重置」按钮可清除该场比赛结果，重新录入',
                '当前轮所有比赛录完后，「生成下一轮」按钮自动解锁'
              ]}
            />

            <StepBlock
              number={3}
              title="编辑对阵（单败淘汰）"
              steps={[
                '单败淘汰的当前轮对阵表上方会显示「编辑对阵」按钮',
                '点击进入整轮编辑模式，展示本轮所有可编辑（待进行且非轮空）的比赛',
                '点击任意选手槽位将其选中（金色高亮 + 右上角脉动光点），再次点击同一槽位可取消选中',
                '选中一个槽位后再点击另一槽位即可交换两人，可跨场比赛交换',
                '工具栏提供「随机分配」（打乱全部选手后两两配对）与「按录入顺序」（选手1 vs 选手2，选手3 vs 选手4...）一键重排',
                '若某场比赛双方为同一人，卡片会变红并提示「双方为同一人，请调整」',
                '调整完成后点击「保存对阵」生效，或点击「取消」放弃修改'
              ]}
            />

            <StepBlock
              number={4}
              title="生成下一轮"
              steps={[
                '当前轮所有比赛完成后，点击「生成下一轮对阵」',
                '瑞士轮按战绩分组 → 对折匹配 → 下移组跨组匹配的完整规则配对（详见下方「瑞士轮配对规则」）',
                '单败淘汰按上轮胜者顺序配对',
                '支持「全部小组开始下一轮」批量操作',
                '如需修改已录入的结果，可点击「撤回第 X 轮结果」按钮回到上一步（X 为当前轮次）。撤回会同时恢复被淘汰选手状态'
              ]}
            />

            <StepBlock
              number={5}
              title="使用测试模式"
              steps={[
                '点击页面右上角的紫色烧瓶图标开启/关闭测试模式',
                '开启后，中路对阵表顶部会出现以下随机生成按钮（按需显示，编辑对阵模式下隐藏）',
                '「随机生成当前轮结果」：为本组本轮所有待进行的比赛随机录入胜负与比分',
                '「随机生成所有小组当前轮结果」：当多个小组均在进行中时出现，一键为各小组当前轮随机录入结果',
                '「随机生成所有小组比赛结果」：一键模拟完所有小组全部轮次，用于快速预览。生成过程中显示实时进度条（骰子图标旋转）',
                '适用于演示、调试排名算法、预览导出图片/Excel 效果等场景',
                '注意：随机生成会覆盖真实数据，正式比赛中请勿开启'
              ]}
            />

            <StepBlock
              number={6}
              title="拖拽调整对阵顺序"
              steps={[
                '在非编辑模式下（即正常对阵列表显示时），每张比赛卡片均可拖拽',
                '鼠标悬停在卡片上时，左上角会出现拖拽手柄图标作为提示',
                '按住并拖动卡片到目标位置释放：被拖卡片显示半透明 + 金色边框，目标卡片顶部显示金色高亮条',
                '释放后新顺序立即保存并持久化，刷新页面后仍然保留',
                '编辑对阵模式下拖拽自动禁用，避免与选手交换操作冲突',
                '注意：拖拽仅调整显示顺序，不影响比赛结果与配对逻辑'
              ]}
            />

            <StepBlock
              number={7}
              title="快照备份与恢复"
              steps={[
                '系统在每轮完赛时自动创建快照，保留最近 5 份，无需手动操作',
                '点击右侧控制面板底部的「备份管理」按钮打开快照管理面板',
                '面板中显示所有快照的标签（如「小组01·第3轮完赛」）和保存时间',
                '点击「立即创建快照」可手动保存当前状态',
                '点击「恢复」可将数据回滚到该快照状态（恢复前会弹出确认，恢复后自动重算所有排名）',
                '点击「删除」可删除单条快照（需确认）',
                '快照存储在浏览器 localStorage 中，清除浏览器数据会同时清除快照'
              ]}
            />

            <StepBlock
              number={8}
              title="快捷键与配对预览"
              steps={[
                'Ctrl+Z（Mac 为 Cmd+Z）：撤回上一轮比赛结果，页面底部显示橙色提示条',
                '快捷键在以下情况下不生效：任意弹窗打开时、焦点在输入框/文本域中、比赛未开始或无可撤回轮次',
                '点击「生成下一轮」按钮后会弹出确认面板，包含本轮摘要（双负/轮空/弃赛信息）和下一轮配对预览',
                '配对预览展示下一轮的完整对阵，便于在确认前核对配对结果',
                '所有破坏性操作（撤回/重置/随机生成）均使用统一风格的自制确认弹窗，替代浏览器原生 confirm'
              ]}
            />

            <StepBlock
              number={9}
              title="导出数据"
              steps={[
                '导出图片：点击页面顶部工具栏的「导出图片」按钮，将排行榜或对阵表生成为 PNG 图片，可选择「当前小组」或「所有小组」。图片左下角自动添加系统标题水印',
                '导出 Excel：点击页面顶部工具栏的「导出 Excel」按钮，可选「排行榜」「对阵表」或「总表（含排行榜 + 各轮对阵）」三种类型，同样支持「当前小组 / 所有小组」',
                '导出比赛数据：点击左侧控制面板顶部赛事名称下方的「导出比赛数据」按钮，下载 JSON 文件备份完整赛事数据，用于跨设备迁移',
                '导入比赛数据：同样位于左侧赛事设置区域，选择 JSON 文件即可加载；比赛开始后导入按钮自动禁用并显示提示，需先重置比赛再导入',
                '导出限制：为避免排行榜出现选手「比赛场数不一致」的情况，排行榜与总表的导出受本轮完赛状态限制 —— 本小组本轮对局未全部结束时，无法导出本组排行榜/总表；导出「所有小组排行榜/总表」时，要求所有有进度的小组本轮均已完赛。对阵表导出不受此限制'
              ]}
            />
          </div>
        </section>

        {/* 赛制规则说明 */}
        <section className="mb-10">
          <h2 className="text-xl font-semibold text-white mb-6">赛制规则说明</h2>

          <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-6 space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-gold-400 mb-2">瑞士轮配对规则（10 条完整规则）</h3>
              <div className="text-sm text-slate-300 space-y-3">
                <p className="text-slate-400 text-xs leading-relaxed">系统严格遵循标准瑞士轮配对规则，按以下顺序执行：</p>
                <RuleItem num="1" title="首轮随机配对">
                  选手根据赛前抽签获取编号，第一轮随机生成对阵。这是后续战绩分组的起点。
                </RuleItem>
                <RuleItem num="2" title="不重复对阵">
                  任意两人不会在整个赛事中重复匹配第二次。所有配对步骤均会检查历史对阵记录。
                </RuleItem>
                <RuleItem num="3" title="战绩分组下移选择">
                  如相同战绩人数为奇数，按以下优先级选择进入下移组的人：
                  <span className="block mt-1 pl-3 text-slate-400">a. 优先有向下标记的玩家 → b. 向下匹配次数最少的玩家 → c. 排名最靠后的玩家</span>
                </RuleItem>
                <RuleItem num="4" title="下移组与下一组1V1">
                  下移组选手与下一战绩组匹配时，选择向上匹配选手的优先级：
                  <span className="block mt-1 pl-3 text-slate-400">a. 优先有向上标记的玩家 → b. 向上匹配次数最少的玩家 → c. 排名最靠前的玩家</span>
                </RuleItem>
                <RuleItem num="5" title="上下匹配标记补偿">
                  向下匹配的选手获得一次优先向上匹配权利（使用后清零）；向上匹配的选手获得一次优先向下匹配权利（使用后清零）。防止同一选手反复被跨组调配。
                </RuleItem>
                <RuleItem num="6" title="二次标记兜底">
                  如战绩组内所有人都已用过上下匹配标记，需再次跨组时，赋予该组排名第一或最末的人第二次匹配次数。
                </RuleItem>
                <RuleItem num="7" title="最后轮空">
                  向下递归匹配尽后，最后一组下移组中无法匹配到的玩家直接轮空。
                </RuleItem>
                <RuleItem num="8" title="轮空计分">
                  轮空选手该轮得分为 2-0（BO1=1-0，BO3=2-0，BO5=3-0，BO7=4-0），该场次有效并计入局胜率、对手胜率等所有小分统计。轮空对手视为一个"0 胜 1 场（BO3=0 胜局/2 总局）"的虚拟对手，会轻微拉低轮空者的对手胜率。
                </RuleItem>
                <RuleItem num="9" title="组内匹配两级策略">
                  战绩组组内匹配优先执行对折匹配（前半 vs 后半一一配对）；对折失败则进行组内穷举（回溯法寻找无重复对阵方案）；穷举仍失败则进入下移组。
                </RuleItem>
                <RuleItem num="10" title="下移组有序处理">
                  下移组进入下一战绩组时：先在 downPool 内部互相匹配 → 剩余的与下一组 1V1 匹配（按规则4选对手）→ 仍无法匹配的进入再下一组。所有战绩组处理完毕后，最终残余的下移组再次优先内部互相匹配，仍无法匹配的才轮空（规则7）。下移组按排名靠前先匹配，下一组的组内匹配需等下移组全部处理完才开始。
                </RuleItem>
              </div>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-gold-400 mb-2">瑞士轮轮空说明</h3>
              <ul className="text-sm text-slate-300 space-y-1 list-disc list-inside">
                <li>奇数人数：必然出现 1 个轮空（数学必然）</li>
                <li>偶数人数：理论上 0 轮空，但赛程后半段可能出现偶数个轮空（2、4 个）。原因是"不重复对阵 + 战绩严格分层"两个硬约束冲突时，少数选手找不到合法对手。这是规则设计的正常行为，轮空人数始终为偶数</li>
                <li>轮空场次有效：比分按赛制自动填充（BO1=1-0, BO3=2-0...），计入局胜率与对手胜率（轮空对手视为"0 胜 / 1 场"的虚拟对手，按聚合公式计入）</li>
              </ul>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-gold-400 mb-2">单败淘汰规则</h3>
              <ul className="text-sm text-slate-300 space-y-1 list-disc list-inside">
                <li>第一轮随机配对，后续轮次按上轮胜者顺序配对</li>
                <li>支持手动编辑对阵：进入编辑模式后点选两个选手即可交换；另提供「随机分配」与「按录入顺序」一键重排</li>
                <li>每场比赛败者直接被淘汰（自动标记为「淘汰」，与手动弃赛不同）</li>
                <li>奇数人数时最后一人轮空，奇数胜者数时同样轮空</li>
                <li>总轮次自动计算：⌈log₂(人数)⌉，如 32 人 = 5 轮；调整人数后轮次自动同步</li>
                <li>每轮可独立设置赛制（BO1~BO7），决赛用 BO5/BO7 更公平</li>
                <li>排行榜显示头衔（冠军/亚军/四强/八强等）、战绩与淘汰轮次</li>
                <li>排名依据：未被淘汰轮次 → 胜场数 → 败场数 → 姓名</li>
                <li>撤回上一轮时自动恢复被淘汰选手状态（eliminated 重置为 false）</li>
              </ul>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-gold-400 mb-2">排名规则</h3>
              <div className="space-y-2">
                <div>
                  <span className="text-slate-400 text-xs">BO1 赛制：</span>
                  <p className="text-sm text-slate-300">胜率 → 对手胜率（SOS） → 对手对手胜率（SOSOS） → 积分</p>
                </div>
                <div>
                  <span className="text-slate-400 text-xs">BO3 / BO5 / BO7 赛制：</span>
                  <p className="text-sm text-slate-300">胜率 → 对手胜率 → 局胜率 → 对手局胜率 → 积分</p>
                </div>
                <div>
                  <span className="text-slate-400 text-xs">单败淘汰：</span>
                  <p className="text-sm text-slate-300">未被淘汰轮次 → 胜场数 → 败场数 → 姓名</p>
                </div>
                <div>
                  <span className="text-slate-400 text-xs">对手胜率 / 对手局胜率 计算方式（聚合公式）：</span>
                  <p className="text-sm text-slate-300">
                    对手胜率 = 所有对手的<strong>胜场和 / 总场次和</strong>；对手局胜率 = 所有对手的<strong>胜局和 / 总局和</strong>；对手对手胜率同理摊平计算。
                    <span className="block mt-0.5 text-slate-400">优势：弃赛选手因场次少会被自动降权，后续未打轮次不会进入分子分母；举例：对手一个 5-0、一个 0-1 弃赛，则对手胜率 = (5+0)/(5+1)=5/6，而非被 0% 人均公式过度拉低。</span>
                  </p>
                </div>
                <div>
                  <span className="text-slate-400 text-xs">战绩分组键（瑞士轮第2轮起配对用）：</span>
                  <p className="text-sm text-slate-300">与排名规则完全一致，所有战绩指标完全相同的选手才会被分到同一战绩组进行组内配对</p>
                </div>
              </div>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-gold-400 mb-2">特殊情况</h3>
              <ul className="text-sm text-slate-300 space-y-1 list-disc list-inside">
                <li>双负（平局）：BO1 与多局赛制均支持，双方均不计胜场，仅用于极端特殊情况。单败淘汰中出现双负时双方均会被淘汰出局</li>
                <li>弃赛管理：比赛进行中（in_progress）可对选手点击「弃赛」按钮标记弃权，后续轮次不再参与配对；如需恢复可在「已弃赛」列表点击「恢复」。单败淘汰中已被淘汰的选手会显示在「已淘汰」分组，与弃赛选手区分开，且不参与后续配对</li>
              </ul>
            </div>
          </div>
        </section>

        {/* 数据存储说明 */}
        <section className="mb-10">
          <h2 className="text-xl font-semibold text-white mb-6 flex items-center gap-2">
            <Shield className="w-5 h-5 text-gold-400" />
            数据存储说明
          </h2>

          <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-6 space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-gold-400 mb-2">存储机制</h3>
              <ul className="text-sm text-slate-300 space-y-1 list-disc list-inside">
                <li>采用浏览器 localStorage 持久化存储，关闭浏览器/标签页后数据保留</li>
                <li><strong className="text-white">双 key 备份</strong>：每次保存同时写入主键（swiss_tournament_data）和备份键（swiss_tournament_data_backup），主键损坏时自动从备份键恢复</li>
                <li>每次保存写入时间戳，便于追踪数据保存时机</li>
                <li><strong className="text-white">自动快照</strong>：每轮完赛时自动创建快照（保留最近 5 份），可在控制面板的「备份管理」中恢复或删除</li>
                <li>容量预警：数据接近 4MB 时顶部横幅提示「建议导出备份」</li>
                <li>旧数据自动迁移：兼容 Envelope v2、原始 v1、以及最老的 LegacyTournament 三种格式，加载时自动补全新字段</li>
              </ul>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-gold-400 mb-2">数据保留场景</h3>
              <div className="space-y-2">
                <div className="flex items-start gap-2">
                  <span className="text-emerald-400 text-xs mt-0.5">✓ 保留</span>
                  <p className="text-sm text-slate-300">关闭标签页、关闭浏览器、重启电脑、浏览器升级</p>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-amber-400 text-xs mt-0.5">⚠ 不共享</span>
                  <p className="text-sm text-slate-300">不同浏览器（Chrome/Edge/Firefox）、不同用户配置、隐身模式、localhost 与 127.0.0.1、不同端口（5173 vs 5174）</p>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-rose-400 text-xs mt-0.5">✗ 丢失</span>
                  <p className="text-sm text-slate-300">手动清除浏览器数据、系统重装、更换电脑、硬盘故障（除非已导出 JSON 备份）</p>
                </div>
              </div>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-gold-400 mb-2">数据安全建议</h3>
              <ul className="text-sm text-slate-300 space-y-1 list-disc list-inside">
                <li>每场重要比赛结束后使用「导出比赛数据」保存 JSON 文件到本地/U盘/云盘</li>
                <li>赛中每隔几轮导出一次增量备份（JSON 文件很小，几 KB~几百 KB）</li>
                <li>关闭浏览器前若赛事仍在进行中，至少导出一次 JSON</li>
                <li>双 key 备份仅能缓解代码层面的数据损坏，无法防止浏览器/系统级风险</li>
              </ul>
            </div>
          </div>
        </section>

        {/* 常见问题 */}
        <section className="mb-10">
          <h2 className="text-xl font-semibold text-white mb-6">常见问题</h2>

          <div className="space-y-4">
            <FAQItem
              question="如何修改已录入的比赛结果？"
              answer="点击「撤回第 X 轮结果」按钮（X 为当前轮次）可回退到上一轮状态：当前轮所有比赛结果、对阵与积分变动会被一并清除，需要重新「生成下一轮对阵」并录入。单败淘汰中撤回会自动恢复被淘汰选手状态。该操作不可撤销。"
            />
            <FAQItem
              question="如何一次性设置多个小组？"
              answer="在左侧「小组管理」区域使用「小组数量」滑块或数字输入框，可直接设置 1~20 个小组。增加小组时新小组自动沿用首组配置（人数/轮次/赛制）并延续选手编号；减少小组时仅删除未开始比赛的 setup 状态小组，已开始比赛的小组不会被删除。"
            />
            <FAQItem
              question="「预览选手」按钮有什么用？"
              answer="点击页面顶部工具栏（与「导出图片」「导出 Excel」同行）的「预览选手」按钮可打开整体预览弹窗，集中展示所有小组的全部选手名单。预览支持搜索过滤、一键复制全部名单（用于粘贴到外部文档），并会自动高亮重名选手、提示空小组，便于在开赛前核对录入是否正确。"
            />
            <FAQItem
              question="如何继续之前的比赛？"
              answer="比赛数据会自动保存到浏览器本地（双 key 备份）。如需在其他设备继续，请先导出 JSON 文件，再在新设备上导入。注意：不同浏览器、不同端口、隐身模式之间数据不共享。"
            />
            <FAQItem
              question="如何处理选手弃赛？单败淘汰中被淘汰和手动弃赛有什么区别？"
              answer="在右侧控制面板的「弃赛管理」区域，点击选手旁的「弃赛」按钮即可标记弃权。标记后该选手后续轮次不再参与配对；如需恢复，可在「已弃赛」列表中点击「恢复」按钮。单败淘汰中比赛败者会被自动标记为「淘汰」，与手动弃赛是两种不同状态：淘汰选手在排行榜显示灰色「淘汰」标签，仍保留在排行榜中；弃赛选手显示红色「弃赛」标签并加删除线，排在最后。两者均不参与后续轮次配对。"
            />
            <FAQItem
              question="为什么无法生成下一轮对阵？"
              answer="请确保当前轮的所有比赛结果都已录入完成。系统会在所有比赛完成后自动解锁「生成下一轮」按钮。"
            />
            <FAQItem
              question="为什么导出图片 / Excel 时提示「本轮未完赛，无法导出」？"
              answer="为保证排行榜数据一致（避免同一组选手比赛场数不同），排行榜与总表的导出需本轮全部完赛：单小组模式下要求本组本轮无 pending 对局；「全部小组」模式下要求所有有进度的小组本轮均已完赛。弹窗内会显示琥珀色提示横幅并禁用下载按钮，待本轮完赛后自动恢复。如急需导出，可改导出「对阵表」（不受此限制）。"
            />
            <FAQItem
              question="单败淘汰如何手动调整对阵？"
              answer="单败淘汰当前轮对阵表上方有「编辑对阵」按钮，点击进入整轮编辑模式。点击任意选手选中（金色高亮 + 右上角脉动光点），再点击另一选手即可交换两人位置，可跨场比赛交换。工具栏另提供「随机分配」（打乱后两两配对）与「按录入顺序」（选手1 vs 选手2，选手3 vs 选手4...）一键重排。若某场双方为同一人，卡片会变红提示。调整完点击「保存对阵」生效。"
            />
            <FAQItem
              question="测试模式的随机数据会覆盖真实比赛吗？"
              answer="会。测试模式的「随机生成」按钮会直接写入比赛结果并覆盖原有数据。虽然可通过「撤回第 X 轮结果」逐轮回退，但多轮随机生成后逐个撤回较繁琐，建议仅在演示或调试时使用，正式比赛请勿开启。如需保留真实数据，可先导出 JSON 备份。随机生成所有小组全部轮次时，按钮会显示进度条与骰子旋转动画，避免重复点击导致卡顿。"
            />
            <FAQItem
              question="重置比赛会清除哪些数据？"
              answer="点击左侧控制面板底部的「重置比赛」按钮并确认后，会清空当前所有比赛数据（选手、对阵、结果、排名），并生成一个全新的默认赛事。操作前请确保已通过「导出比赛数据」备份所需内容。"
            />
            <FAQItem
              question="为什么导入比赛数据按钮用不了？"
              answer="比赛开始后（任一小组处于进行中或已完成状态），导入功能会自动禁用，按钮下方会显示琥珀色提示「比赛已开始，导入功能已禁用，请先重置比赛数据」。这是为了防止误导入覆盖正在进行的比赛数据。如需导入新的数据，请先点击「重置比赛」清空当前数据后再导入。"
            />
            <FAQItem
              question="为什么偶数人也会出现轮空？"
              answer="瑞士轮中，当赛程进入后半段（R4、R5、R6），选手交手历史增多，可能出现「不重复对阵」与「战绩严格分层」两个硬约束冲突的情况——某些选手找不到合法对手。此时按规则7，下移组剩余者直接轮空（最终残余的下移组会先优先内部互相匹配，仍无法匹配的才轮空）。轮空人数始终为偶数（0、2、4 个），且轮空场次按赛制自动填充比分（BO1=1-0, BO3=2-0...），计入局胜率与对手胜率（轮空对手视为 0 胜 / 1 场的虚拟对手，与弃赛对手一样按聚合公式胜场和/总场次和计入），统计公平性有保障。这是规则设计的正常行为，不是 bug。"
            />
            <FAQItem
              question="浏览器数据会被意外清除吗？"
              answer="localStorage 数据在正常使用下不会丢失，但以下场景会清除：手动「清除浏览数据」、系统重装、更换电脑、浏览器配置目录损坏、企业策略配置为关闭即清空。系统采用双 key 备份机制（主键 + 备份键）防止代码层面的数据损坏，但无法防止上述浏览器/系统级风险。强烈建议每场重要比赛后导出 JSON 文件备份。"
            />
            <FAQItem
              question="导出的图片有水印吗？"
              answer="有。导出的排行榜和对阵表图片左下角自动添加「诗意 · 比赛战绩统计系统」水印，与图例同行，不影响图片主体内容。水印样式为半透明灰色文字 + 金色装饰圆点，与网站主题色呼应。"
            />
            <FAQItem
              question="如何拖拽调整对阵卡片的顺序？"
              answer="在非编辑模式下（即正常显示对阵列表时），每张比赛卡片都可以直接拖拽。鼠标悬停在卡片上时左上角会出现拖拽手柄图标提示。按住卡片拖到目标位置释放即可：被拖卡片会半透明显示，目标位置顶部出现金色高亮条。释放后新顺序立即保存并持久化。编辑对阵模式下拖拽自动禁用。拖拽仅调整显示顺序，不影响比赛结果与配对逻辑。"
            />
            <FAQItem
              question="快照备份是什么？和 JSON 导出有什么区别？"
              answer="快照是系统在每轮完赛时自动保存的比赛数据副本，保留最近 5 份，存储在浏览器 localStorage 中。与 JSON 文件导出的区别：① 快照是自动的，无需手动操作；② 快照在浏览器内，恢复只需一键；③ JSON 文件需要手动导出/导入，可跨设备迁移。建议两者结合使用：快照用于赛中快速回滚，JSON 导出用于跨设备迁移和长期备份。"
            />
            <FAQItem
              question="恢复快照后排名数据会正确吗？"
              answer="会。快照为节省存储空间将胜率字段置零，恢复时系统会自动为每个小组重新计算所有胜率指标（胜率、对手胜率、局胜率等）和排名，确保恢复后的数据与快照时的状态完全一致。"
            />
            <FAQItem
              question="Ctrl+Z 撤回快捷键什么时候可用？"
              answer="当比赛进行中且当前轮有可撤回的轮次时，按 Ctrl+Z（Mac 为 Cmd+Z）可撤回上一轮。以下情况快捷键不生效：① 任意弹窗打开时（导出/确认/帮助/预览）；② 焦点在输入框或文本域中（此时 Ctrl+Z 为浏览器原生撤销文本）；③ 比赛未开始或当前无可撤回轮次。撤回成功后页面底部显示橙色提示条。"
            />
          </div>
        </section>

        {/* 底部 */}
        <div className="text-center text-slate-500 text-sm pt-6 border-t border-slate-700/50">
          诗意 · 比赛战绩统计系统 · 本地数据存储 · 无需联网
        </div>
      </div>
    </div>
  );
}

function FeatureCard({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
  return (
    <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5 hover:border-gold-500/30 transition-colors">
      <div className="flex items-start gap-3">
        <div className="text-gold-400 mt-0.5">{icon}</div>
        <div>
          <h3 className="text-sm font-semibold text-white mb-1">{title}</h3>
          <p className="text-xs text-slate-400 leading-relaxed">{description}</p>
        </div>
      </div>
    </div>
  );
}

function StepBlock({ number, title, steps }: { number: number; title: string; steps: string[] }) {
  return (
    <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-7 h-7 rounded-full bg-gold-500/20 text-gold-400 flex items-center justify-center text-sm font-bold">
          {number}
        </div>
        <h3 className="text-base font-semibold text-white">{title}</h3>
      </div>
      <ul className="space-y-1.5 pl-10">
        {steps.map((step, idx) => (
          <li key={idx} className="text-sm text-slate-300 flex items-start gap-2">
            <span className="text-slate-500">•</span>
            <span>{step}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function RuleItem({ num, title, children }: { num: string; title: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <div className="flex-shrink-0 w-6 h-6 rounded-full bg-gold-500/20 text-gold-400 flex items-center justify-center text-xs font-bold mt-0.5">
        {num}
      </div>
      <div className="flex-1">
        <span className="text-white font-medium">{title}：</span>
        <span className="text-slate-300">{children}</span>
      </div>
    </div>
  );
}

function FAQItem({ question, answer }: { question: string; answer: string }) {
  return (
    <div className="bg-slate-800/30 border border-slate-700/30 rounded-lg p-4">
      <h4 className="text-sm font-medium text-white mb-1">{question}</h4>
      <p className="text-sm text-slate-400">{answer}</p>
    </div>
  );
}

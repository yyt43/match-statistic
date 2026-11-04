import type { ExcelSheetPayload } from '../../workers/excelWorker';
import { writeExcelWorkbook } from '../export/excelWorkbook';

export interface RosterTemplateOptions {
  /** 当前赛事的小组名，用来在示例行里填「小组」列。 */
  groupNames?: string[];
  isEnglish?: boolean;
}

const HEADERS = ['游戏昵称', '选手编号', 'UID', 'QQ', '小组'] as const;

/** 选手信息导入模板的工作表内容：一张名单示例 + 一张填写说明。 */
export function buildRosterTemplateSheets(options: RosterTemplateOptions = {}): ExcelSheetPayload[] {
  const groupNames = (options.groupNames ?? []).filter(Boolean);
  const firstGroup = groupNames[0] ?? '小组01';
  const secondGroup = groupNames[1] ?? firstGroup;

  const rows: (string | number)[][] = [
    [...HEADERS],
    ['示例选手1', 'A01', '900000001', '100000000001', firstGroup],
    ['示例选手2', 'A02', '900000002', '', firstGroup],
    ['示例选手3', 'B01', '900000003', '100000000003', secondGroup],
  ];

  const guide: (string | number)[][] = [
    ['列名', '是否必填', '说明'],
    ['游戏昵称', '必填', '比赛时显示的名字，重复昵称会提示重名。'],
    ['选手编号', '建议填写', '如 A01、A02；空着可以开赛前一键补齐，同一赛事内不能重复。'],
    ['UID', '选填', '9 位原神 UID，用于赛果导入的编号 + UID 双重确认。'],
    ['QQ', '选填', '联系用，不随导出公开。'],
    ['小组', '选填', '填写时按这一列归组；留空时按工作表名归组。'],
    [],
    ['示例数据', '', '示例行的昵称、编号、UID、QQ 都是占位数据（UID 以 9 开头、QQ 为 12 位），请先替换成真实信息再导入。'],
    ['用法', '', '一张表里放全部选手，用「小组」列区分；也可以每组一张工作表（如 A组、B组），表名即小组名。'],
    ['提示', '', '表头行必须在第一张有内容的行；多余的说明行、空行会被跳过。'],
  ];

  return [
    { name: '选手名单', rows },
    { name: '填写说明', rows: guide },
  ];
}

/** 下载选手信息导入模板（xlsx）。 */
export async function downloadRosterTemplate(options: RosterTemplateOptions = {}): Promise<void> {
  const fileName = options.isEnglish ? 'player-roster-template.xlsx' : '选手信息导入模板.xlsx';
  await writeExcelWorkbook(buildRosterTemplateSheets(options), fileName);
}

export type MatchResultTemplateGameType = 'bo1' | 'bo3' | 'bo5' | 'bo7';

const WINS_NEEDED: Record<MatchResultTemplateGameType, number> = {
  bo1: 1,
  bo3: 2,
  bo5: 3,
  bo7: 4,
};

/** 赛果导入模板：示例行按赛制给出合法的比分，另附填写说明。 */
export function buildMatchResultTemplateSheets(
  gameType: MatchResultTemplateGameType
): ExcelSheetPayload[] {
  const required = WINS_NEEDED[gameType] ?? 2;
  const resultOptions = Array.from({ length: required }, (_, index) =>
    `我以 ${required}-${index} 获胜`
  );
  const samples: (string | number)[][] = [
    ['A01', '900000001', resultOptions[required - 1] ?? resultOptions[0], 'A-R1-01_01.png', '示例提交者', '2026-09-25 20:30', ''],
    ['A02', '900000002', resultOptions[0], 'A-R1-02_01.png', '示例提交者', '2026-09-25 20:45', ''],
  ];

  return [
    {
      name: '赛果导入',
      rows: [
        ['我的选手编号', '你的原神UID', '比赛结果', '结算截图', '提交者', '提交时间', '备注'],
        ...samples,
      ],
    },
    {
      name: '填写说明',
      rows: [
        ['列名', '是否必填', '说明'],
        ['我的选手编号', '必填', '系统按这一列匹配选手；填选手编号（如 A01）即可，编号会跨小组自动查找。'],
        ['你的原神UID', '建议填写', '9 位 UID，会与选手档案里的 UID 做双重确认；赛事没有 UID 时可留空。'],
        ['比赛结果', '必填', `写获胜方比分，格式「我以 ${required}-${required - 1} 获胜」或直接写「${required}-${required - 1}」；${gameType.toUpperCase()} 需要赢 ${required} 局。`],
        ['结算截图', '选填', '截图文件名或链接，用于赛后核验；不填也能导入，只是缺少截图证据。'],
        ['提交者 / 提交时间 / 备注', '选填', '原样记录，不影响匹配。'],
        [],
        ['示例数据', '', '示例行的选手编号与 UID 都是占位数据（UID 以 9 开头），请替换成真实信息。'],
        ['注意', '', '一行只写一场比赛；同一选手在同一轮出现两次会被判为矛盾，需要在预览里处理。'],
      ],
    },
  ];
}

export function matchResultTemplateFileName(gameType: MatchResultTemplateGameType): string {
  return `诗意杯-${gameType.toUpperCase()}-赛果导入模板.xlsx`;
}

/** 下载赛果导入模板（xlsx）。 */
export async function downloadMatchResultTemplate(
  gameType: MatchResultTemplateGameType
): Promise<void> {
  await writeExcelWorkbook(
    buildMatchResultTemplateSheets(gameType),
    matchResultTemplateFileName(gameType)
  );
}

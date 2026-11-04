import { describe, expect, it } from 'vitest';
import {
  buildMatchResultTemplateSheets,
  buildRosterTemplateSheets,
  matchResultTemplateFileName,
} from './importTemplates';
import {
  detectRosterColumns,
  parseRosterProfilesFromSheets,
} from './rosterProfileImport';

describe('roster import template', () => {
  it('ships a roster sheet with the documented header row', () => {
    const [roster, guide] = buildRosterTemplateSheets();
    expect(roster.name).toBe('选手名单');
    expect(roster.rows[0]).toEqual(['游戏昵称', '选手编号', 'UID', 'QQ', '小组']);
    expect(roster.rows.length).toBe(4);
    expect(guide.name).toBe('填写说明');
    expect(guide.rows[0]).toEqual(['列名', '是否必填', '说明']);
  });

  it('fills sample rows with the current group names', () => {
    const [roster] = buildRosterTemplateSheets({ groupNames: ['A组', 'B组'] });
    const groups = roster.rows.slice(1).map(row => row[4]);
    expect(groups).toContain('A组');
    expect(groups).toContain('B组');
  });

  it('can be parsed back by the roster importer', () => {
    const [roster] = buildRosterTemplateSheets({ groupNames: ['A组', 'B组'] });
    const headers = roster.rows[0].map(String);
    const columns = detectRosterColumns(headers);
    expect(columns.name).toBe('游戏昵称');
    expect(columns.participantCode).toBe('选手编号');
    expect(columns.uid).toBe('UID');
    expect(columns.qq).toBe('QQ');
    expect(columns.groupName).toBe('小组');

    const players = parseRosterProfilesFromSheets(
      [{ name: roster.name, rows: roster.rows as unknown[] }],
      columns
    );
    expect(players).toHaveLength(3);
    expect(players[0]).toMatchObject({
      name: '示例选手1',
      participantCode: 'A01',
      groupName: 'A组',
      profile: { uid: '180748058', qq: '123456789' },
    });
  });
});

describe('match result import template', () => {
  it('offers a legal score for each format', () => {
    const required: Record<string, number> = { bo1: 1, bo3: 2, bo5: 3, bo7: 4 };
    (['bo1', 'bo3', 'bo5', 'bo7'] as const).forEach(gameType => {
      const [sheet] = buildMatchResultTemplateSheets(gameType);
      expect(sheet.name).toBe('赛果导入');
      expect(sheet.rows[0]).toEqual([
        '我的选手编号', '你的原神UID', '比赛结果', '结算截图', '提交者', '提交时间', '备注',
      ]);
      const winners = sheet.rows.slice(1).map(row => String(row[2]));
      winners.forEach(score => {
        expect(score).toContain(`${required[gameType]}-`);
        expect(score).toMatch(/^我以 [0-9]-[0-9] 获胜$/);
      });
      expect(matchResultTemplateFileName(gameType)).toBe(`诗意杯-${gameType.toUpperCase()}-赛果导入模板.xlsx`);
    });
  });

  it('ships a field guide sheet', () => {
    const [, guide] = buildMatchResultTemplateSheets('bo3');
    expect(guide.name).toBe('填写说明');
    expect(guide.rows[0]).toEqual(['列名', '是否必填', '说明']);
    const names = guide.rows.map(row => String(row[0]));
    expect(names).toContain('比赛结果');
    expect(names).toContain('我的选手编号');
  });
});

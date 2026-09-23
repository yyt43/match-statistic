import { describe, expect, it } from 'vitest';
import {
  detectRosterColumns,
  isResultCollectionWorkbook,
  parseRosterProfilesFromSheets,
} from './rosterProfileImport';

describe('roster profile column detection', () => {
  it('detects nickname, participant code, UID, and QQ columns', () => {
    expect(detectRosterColumns([
      '选手编号',
      '游戏昵称',
      '你的原神UID',
      'QQ号',
    ])).toEqual({
      name: '游戏昵称',
      participantCode: '选手编号',
      uid: '你的原神UID',
      qq: 'QQ号',
    });
  });

  it('does not fall back to the first column when nickname is missing', () => {
    expect(detectRosterColumns([
      '提交时间（自动）',
      '你的组别（必填）',
      '选手编号.（必填）',
      '你获胜的比分是（必填）',
    ]).name).toBe('');
  });

  it('recognizes a match-result collection workbook', () => {
    expect(isResultCollectionWorkbook([
      '提交时间（自动）',
      '你的组别（必填）',
      '选手编号.（必填）',
      '你获胜的比分是（必填）',
      '你的原神UID（必填）',
      '请上传小王子对局截图（必填）',
      '提交者（自动）',
    ])).toBe(true);
  });

  it('does not mistake a player roster for a match-result workbook', () => {
    expect(isResultCollectionWorkbook([
      '组别',
      '选手编号',
      '游戏昵称',
      'UID',
      'QQ号',
    ])).toBe(false);
  });

  it('resolves equivalent columns independently for each worksheet', () => {
    const rows = parseRosterProfilesFromSheets([
      {
        name: 'A组',
        rows: [
          ['选手编号', '游戏昵称', 'UID', 'QQ号'],
          ['A01', '甲选手', '180748058', '2957815893'],
        ],
      },
      {
        name: 'B组',
        rows: [
          ['第二小组选手名单'],
          ['选手编号', '昵称', '玩家UID', 'QQ'],
          ['B01', '乙选手', '338916899', '1615852778'],
        ],
      },
    ], {
      name: '游戏昵称',
      participantCode: '选手编号',
      uid: 'UID',
      qq: 'QQ号',
    });

    expect(rows).toEqual([
      {
        name: '甲选手',
        groupName: 'A组',
        participantCode: 'A01',
        profile: { uid: '180748058', qq: '2957815893' },
      },
      {
        name: '乙选手',
        groupName: 'B组',
        participantCode: 'B01',
        profile: { uid: '338916899', qq: '1615852778' },
      },
    ]);
  });

  it('keeps same-name players from different worksheets', () => {
    const rows = parseRosterProfilesFromSheets([
      { name: 'A组', rows: [['昵称'], ['同名选手']] },
      { name: 'B组', rows: [['昵称'], ['同名选手']] },
    ], { name: '昵称' });

    expect(rows.map(row => row.groupName)).toEqual(['A组', 'B组']);
    expect(rows.map(row => row.name)).toEqual(['同名选手', '同名选手']);
  });

  it('skips a registration summary sheet before importing group sheets', () => {
    const rows = parseRosterProfilesFromSheets([
      {
        name: '报名信息',
        rows: [
          ['雪中刀杯报名信息'],
          ['序号', '游戏内昵称', 'UID', 'QQ号'],
          ['1', '甲选手', '180748058', '2957815893'],
          ['2', '乙选手', '338916899', '1615852778'],
        ],
      },
      {
        name: 'A组',
        rows: [
          ['A组名单（1人）'],
          ['序号', '游戏内昵称', 'UID', 'QQ号'],
          ['1', '甲选手', '180748058', '2957815893'],
        ],
      },
      {
        name: 'B组',
        rows: [
          ['B组名单（1人）'],
          ['序号', '游戏内昵称', 'UID', 'QQ号'],
          ['1', '乙选手', '338916899', '1615852778'],
        ],
      },
    ], {
      name: '游戏内昵称',
      uid: 'UID',
      qq: 'QQ号',
    });

    expect(rows.map(row => [row.groupName, row.name])).toEqual([
      ['A组', '甲选手'],
      ['B组', '乙选手'],
    ]);
  });
});

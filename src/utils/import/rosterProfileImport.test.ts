import { describe, expect, it } from 'vitest';
import {
  detectRosterColumns,
  isResultCollectionWorkbook,
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
});

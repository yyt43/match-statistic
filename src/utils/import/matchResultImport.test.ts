import { describe, expect, it } from 'vitest';
import { createNewCompetition } from '../../store/tournamentFactory';
import { getDefaultPlayerFields } from '../playerProfiles';
import {
  buildMatchImportPreview,
  normalizeSubmissionRows,
  type MatchSubmissionRow,
} from './matchResultImport';

function competitionWithMatch() {
  const competition = createNewCompetition('Import', 1, 2, 3, 'bo3');
  competition.playerSchemaId = 'poetryCupS2';
  competition.playerFields = getDefaultPlayerFields('poetryCupS2');
  const group = competition.groups[0];
  group.players[0].participantCode = 'A01';
  group.players[0].profile = { uid: '180748058', qq: '2957815893' };
  group.players[1].participantCode = 'A02';
  group.players[1].profile = { uid: '338916899', qq: '1615852778' };
  group.currentRound = 1;
  group.status = 'in_progress';
  group.matches = [{
    id: 'm1',
    round: 1,
    player1Id: group.players[0].id,
    player2Id: group.players[1].id,
    result: 'pending',
  }];
  return competition;
}

function row(overrides: Partial<MatchSubmissionRow> = {}): MatchSubmissionRow {
  return {
    rowNumber: 2,
    participantCode: 'A01',
    uid: '180748058',
    resultOption: '我以 2-1 获胜',
    evidenceRef: 'A-R1-01_01.png',
    ...overrides,
  };
}

describe('match result import', () => {
  it('recognizes the Tencent Docs test table headers', () => {
    const rows = normalizeSubmissionRows({
      name: '小组赛赛果收集仅胜者填写测试表格（收集结果）',
      rows: [
        [
          '提交时间（自动）',
          '你的组别（必填）',
          '选手编号.（大写字母加两位数字，如A05）（必填）',
          '你获胜的比分是（必填）',
          '你的原神UID（必填）',
          '请上传小王子对局截图（必填）',
          '备注',
          '提交者（自动）',
        ],
        [
          '2026年9月22日 10:13',
          'A组',
          'A05',
          '2-0',
          '257081134.00 ',
          '诗意π_2026-09-22 10.13.46_1000060897.jpg',
          '',
          '诗意π',
        ],
      ],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].participantCode).toBe('A05');
    expect(rows[0].resultOption).toBe('2-0');
    expect(rows[0].evidenceRef).toContain('1000060897.jpg');
  });

  it('converts winner-perspective score for the left player', () => {
    const preview = buildMatchImportPreview(
      competitionWithMatch(),
      [row()]
    );
    expect(preview.issues).toHaveLength(0);
    expect(preview.ready[0].result).toBe('player1');
    expect(preview.ready[0].canonicalScore).toBe('2-1');
  });

  it('converts winner-perspective score for the right player', () => {
    const preview = buildMatchImportPreview(
      competitionWithMatch(),
      [row({ participantCode: 'A02', uid: '338916899' })]
    );
    expect(preview.ready[0].result).toBe('player2');
    expect(preview.ready[0].canonicalScore).toBe('1-2');
  });

  it('merges identical duplicates and rejects conflicting results', () => {
    const same = buildMatchImportPreview(
      competitionWithMatch(),
      [row(), row({ rowNumber: 3 })]
    );
    expect(same.duplicates).toHaveLength(1);
    expect(same.issues).toHaveLength(0);

    const conflict = buildMatchImportPreview(
      competitionWithMatch(),
      [row(), row({ rowNumber: 3, resultOption: '我以 2-0 获胜' })]
    );
    expect(conflict.ready).toHaveLength(0);
    expect(conflict.issues.some(issue => issue.code === 'CONFLICT')).toBe(true);
  });

  it('rejects illegal winner score for BO3', () => {
    const preview = buildMatchImportPreview(
      competitionWithMatch(),
      [row({ resultOption: '我以 3-1 获胜' })]
    );
    expect(preview.issues.some(issue => issue.code === 'INVALID_SCORE')).toBe(true);
  });

  it('requires player code and UID to identify the same player', () => {
    const mismatch = buildMatchImportPreview(
      competitionWithMatch(),
      [row({ uid: '999999999' })]
    );
    expect(mismatch.ready).toHaveLength(0);
    expect(mismatch.issues.some(issue => issue.code === 'UID_MISMATCH')).toBe(true);

    const crossPlayer = buildMatchImportPreview(
      competitionWithMatch(),
      [row({ uid: '338916899' })]
    );
    expect(crossPlayer.ready).toHaveLength(0);
    expect(crossPlayer.issues.some(issue => issue.code === 'UID_CODE_MISMATCH')).toBe(true);
  });

  it('matches rows across multiple groups from one workbook', () => {
    const competition = createNewCompetition('Import', 2, 2, 3, 'bo3');
    competition.playerSchemaId = 'poetryCupS2';
    competition.playerFields = getDefaultPlayerFields('poetryCupS2');
    for (const [groupIndex, prefix] of ['A', 'B'].entries()) {
      const group = competition.groups[groupIndex];
      group.players[0].participantCode = `${prefix}01`;
      group.players[0].profile = { uid: groupIndex === 0 ? '180748058' : '346732256' };
      group.players[1].participantCode = `${prefix}02`;
      group.players[1].profile = { uid: groupIndex === 0 ? '338916899' : '283093920' };
      group.currentRound = 1;
      group.status = 'in_progress';
      group.matches = [{
        id: `m${groupIndex + 1}`,
        round: 1,
        player1Id: group.players[0].id,
        player2Id: group.players[1].id,
        result: 'pending',
      }];
    }

    const preview = buildMatchImportPreview(competition, [
      row(),
      row({
        rowNumber: 3,
        participantCode: 'B01',
        uid: '346732256',
        resultOption: '我以 2-0 获胜',
      }),
    ]);

    expect(preview.ready).toHaveLength(2);
    expect(preview.ready.map(candidate => candidate.groupIndex)).toEqual([0, 1]);
  });

});

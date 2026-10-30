import { describe, expect, it } from 'vitest';
import { mapRosterRowsToGroups, type RosterGroupMappingGroup } from './rosterGroupMapping';
import type { RosterProfileImportRow } from './rosterProfileImport';

const groups: RosterGroupMappingGroup[] = [
  { id: 'g1', name: '小组1' },
  { id: 'g2', name: '小组2' },
];

function row(name: string, groupName?: string): RosterProfileImportRow {
  return { name, groupName };
}

describe('mapRosterRowsToGroups', () => {
  it('把填了小组的行分配到对应小组，并记录来源标签', () => {
    const result = mapRosterRowsToGroups(groups, [
      row('甲', '小组1'),
      row('乙', '小组2'),
      row('丙', 'A组'),
    ]);

    expect(result).toHaveLength(2);
    expect(result[0].groupId).toBe('g1');
    expect(result[0].rows.map(item => item.name)).toEqual(['甲', '丙']);
    expect(result[1].rows.map(item => item.name)).toEqual(['乙']);
    expect(result[0].sourceLabels).toEqual(['小组1', 'A组']);
    expect(result.ungroupedRows).toEqual([]);
  });

  it('组别为空的行不会被轮转塞进小组，而是单独标记为未分组', () => {
    const result = mapRosterRowsToGroups(groups, [
      row('甲', '小组1'),
      row('乙'),
      row('丙'),
      row('丁'),
    ]);

    // 只有明确填了小组的选手进入映射。
    expect(result.flatMap(mapping => mapping.rows.map(item => item.name))).toEqual(['甲']);
    // 无法判断归属的行保留下来，供导入预览提示用户补填。
    expect(result.ungroupedRows.map(item => item.name)).toEqual(['乙', '丙', '丁']);
    // 空的组别列（空白字符串）同样视为未分组。
    const blank = mapRosterRowsToGroups(groups, [row('戊', '   ')]);
    expect(blank.ungroupedRows.map(item => item.name)).toEqual(['戊']);
    expect(blank.flatMap(mapping => mapping.rows)).toEqual([]);
  });

  it('小组别名匹配：序号、字母、Group 前缀都能识别', () => {
    const result = mapRosterRowsToGroups(groups, [
      row('甲', '1'),
      row('乙', 'B'),
      row('丙', 'Group A'),
    ]);

    expect(result[0].rows.map(item => item.name)).toEqual(['甲', '丙']);
    expect(result[1].rows.map(item => item.name)).toEqual(['乙']);
    expect(result.ungroupedRows).toEqual([]);
  });

  it('allowNewGroups 时，未匹配的小组名可以复用空小组或新建小组', () => {
    const reuse = mapRosterRowsToGroups(groups, [row('甲', '小组9')], {
      allowNewGroups: true,
      createGroupId: () => 'new-1',
    });
    expect(reuse).toHaveLength(2);
    expect(reuse[0].groupId).toBe('g1');
    expect(reuse[0].groupName).toBe('小组9');
    expect(reuse[0].rows.map(item => item.name)).toEqual(['甲']);

    const created = mapRosterRowsToGroups(
      [{ id: 'g1', name: '小组1' }],
      [row('甲', '小组1'), row('乙', '小组9')],
      { allowNewGroups: true, createGroupId: () => 'new-1' }
    );
    expect(created).toHaveLength(2);
    expect(created[1]).toMatchObject({
      groupId: 'new-1',
      groupName: '小组9',
      isNew: true,
    });
    expect(created[1].rows.map(item => item.name)).toEqual(['乙']);
  });

  it('未开启 allowNewGroups 时，未匹配的小组名按原有规则轮转分配到现有小组', () => {
    // 同名来源会先聚合成一个来源，再整体落到一个现有小组。
    const sameSource = mapRosterRowsToGroups(groups, [
      row('甲', '小组9'),
      row('乙', '小组9'),
      row('丙', '小组9'),
    ]);
    expect(sameSource[0].rows.map(item => item.name)).toEqual(['甲', '乙', '丙']);
    expect(sameSource[1].rows).toEqual([]);
    expect(sameSource.ungroupedRows).toEqual([]);

    // 不同来源按来源序号轮流落到现有小组，避免全部堆在第一组。
    const distinctSources = mapRosterRowsToGroups(groups, [
      row('甲', '小组9'),
      row('乙', '小组10'),
    ]);
    expect(distinctSources[0].rows.map(item => item.name)).toEqual(['甲']);
    expect(distinctSources[1].rows.map(item => item.name)).toEqual(['乙']);
    expect(distinctSources.ungroupedRows).toEqual([]);
  });
});

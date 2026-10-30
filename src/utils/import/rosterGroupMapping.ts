import { generateId } from '../../store/tournamentFactory';
import type { RosterProfileImportRow } from './rosterProfileImport';

export interface RosterGroupMappingGroup {
  id: string;
  name: string;
}

export interface RosterGroupMapping {
  groupId: string;
  groupName: string;
  rows: RosterProfileImportRow[];
  sourceLabels: string[];
  isNew?: boolean;
}

export interface RosterGroupMappingOptions {
  allowNewGroups?: boolean;
  createGroupId?: () => string;
}

/**
 * 组别映射结果：保持数组形态以兼容既有调用方，同时把「组别列为空、无法判断属于哪个小组」
 * 的行单独返回。调用方应当提示用户补填小组，而不是把这些行静默塞进任意小组。
 */
export type RosterGroupMappingResult = RosterGroupMapping[] & {
  ungroupedRows: RosterProfileImportRow[];
};

function normalize(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[\s\u3000_\-—–]/g, '')
    .replace(/[()（）[\]【】]/g, '');
}

function getGroupAliases(group: RosterGroupMappingGroup, index: number): string[] {
  const name = normalize(group.name);
  const bareName = name
    .replace(/^(小组|第)/, '')
    .replace(/组$/, '');
  const withoutGroupPrefix = name.replace(/^group/, '');
  const letter = String.fromCharCode(65 + index).toLowerCase();
  const number = String(index + 1);
  return Array.from(new Set([
    name,
    bareName,
    withoutGroupPrefix,
    letter,
    number,
    `${letter}${number}`,
  ].filter(Boolean)));
}

function normalizeSourceKey(rawGroupName: string): string {
  return normalize(rawGroupName)
    .replace(/^group/, '')
    .replace(/^(小组|第)/, '')
    .replace(/组$/, '');
}

function findGroupIndex(
  groups: RosterGroupMappingGroup[],
  rawGroupName: string
): number {
  const sourceKey = normalizeSourceKey(rawGroupName);
  if (!sourceKey) return -1;
  return groups.findIndex((group, index) => {
    const aliases = getGroupAliases(group, index);
    return aliases.includes(sourceKey) || aliases.includes(normalize(rawGroupName));
  });
}

export function mapRosterRowsToGroups(
  groups: RosterGroupMappingGroup[],
  rows: RosterProfileImportRow[],
  options: RosterGroupMappingOptions = {}
): RosterGroupMappingResult {
  const createGroupId = options.createGroupId ?? generateId;
  const mappings: RosterGroupMapping[] = groups.map(group => ({
    groupId: group.id,
    groupName: group.name,
    rows: [],
    sourceLabels: [],
  }));
  const sourceLabels = new Map<string, Set<string>>();
  const unmatchedBySource = new Map<string, {
    label: string;
    rows: RosterProfileImportRow[];
  }>();
  const ungrouped: RosterProfileImportRow[] = [];

  rows.forEach(row => {
    const rawGroupName = row.groupName?.trim() ?? '';
    if (!rawGroupName) {
      ungrouped.push(row);
      return;
    }
    const groupIndex = findGroupIndex(groups, rawGroupName);
    if (groupIndex < 0) {
      const sourceKey = normalizeSourceKey(rawGroupName) || rawGroupName.toLowerCase();
      const source = unmatchedBySource.get(sourceKey) ?? {
        label: rawGroupName,
        rows: [],
      };
      source.rows.push(row);
      unmatchedBySource.set(sourceKey, source);
      return;
    }
    mappings[groupIndex].rows.push(row);
    const labels = sourceLabels.get(mappings[groupIndex].groupId) ?? new Set<string>();
    labels.add(rawGroupName);
    sourceLabels.set(mappings[groupIndex].groupId, labels);
  });

  if (unmatchedBySource.size > 0 && mappings.length > 0) {
    const unmatchedSources = Array.from(unmatchedBySource.values());
    if (options.allowNewGroups) {
      const availableMappings = mappings.filter(mapping => mapping.rows.length === 0);
      unmatchedSources.forEach((source, index) => {
        const reusable = availableMappings[index];
        if (reusable) {
          reusable.groupName = source.label;
          reusable.rows.push(...source.rows);
          const labels = sourceLabels.get(reusable.groupId) ?? new Set<string>();
          labels.add(source.label);
          sourceLabels.set(reusable.groupId, labels);
          return;
        }
        const groupId = createGroupId();
        mappings.push({
          groupId,
          groupName: source.label,
          rows: source.rows,
          sourceLabels: [source.label],
          isNew: true,
        });
        sourceLabels.set(groupId, new Set([source.label]));
      });
    } else {
      unmatchedSources.forEach((source, sourceIndex) => {
        const mapping = mappings[sourceIndex % mappings.length];
        mapping.rows.push(...source.rows);
        const labels = sourceLabels.get(mapping.groupId) ?? new Set<string>();
        labels.add(source.label);
        sourceLabels.set(mapping.groupId, labels);
      });
    }
  }

  // 组别列为空的行不再轮转分配到各小组：无法判断归属时宁可保留为「未分组」，
  // 交由导入预览提示用户补填，避免把选手悄悄塞进错误的小组。
  const result = mappings.map(mapping => ({
    ...mapping,
    sourceLabels: Array.from(sourceLabels.get(mapping.groupId) ?? []),
  })) as RosterGroupMappingResult;
  result.ungroupedRows = [...ungrouped];
  return result;
}

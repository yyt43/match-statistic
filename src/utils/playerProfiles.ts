import type {
  Player,
  PlayerFieldDefinition,
  PlayerSchemaId,
  TournamentCompetition,
} from '../types';

export interface RosterValidationIssue {
  code:
    | 'MISSING_NAME'
    | 'MISSING_PARTICIPANT_CODE'
    | 'DUPLICATE_PARTICIPANT_CODE'
    | 'INVALID_PARTICIPANT_CODE'
    | 'MISSING_UID'
    | 'INVALID_UID'
    | 'DUPLICATE_UID'
    | 'MISSING_QQ'
    | 'INVALID_QQ'
    | 'UID_ID_MISMATCH';
  message: string;
  messageEn?: string;
  groupIndex?: number;
  playerId?: string;
  fieldKey?: string;
}

export interface RosterValidationSummary {
  valid: boolean;
  issues: RosterValidationIssue[];
  playerCount: number;
  participantCodes: Map<string, string>;
  uidToPlayerId: Map<string, string>;
  playerIdToUid: Map<string, string>;
}

export const PARTICIPANT_CODE_PATTERN = '^[A-Z](0[1-9]|[1-9][0-9])$';
export const PARTICIPANT_CODE_MAX = 99;

export const UNIFIED_PLAYER_FIELDS: PlayerFieldDefinition[] = [
  {
    key: 'participantCode',
    label: '选手编号',
    type: 'text',
    required: false,
    unique: true,
    immutableAfter: 'rosterLock',
    visibility: 'public',
    searchable: true,
    showInPairings: true,
    pattern: PARTICIPANT_CODE_PATTERN,
    importAliases: ['选手编号', '编号', '参赛编号'],
  },
  {
    key: 'uid',
    label: '游戏UID',
    type: 'gameUid',
    required: false,
    unique: true,
    immutableAfter: 'rosterLock',
    visibility: 'public',
    searchable: true,
    showInPairings: true,
    pattern: '^[0-9]{9}$',
    importAliases: ['UID', '玩家UID', '游戏UID', '游戏 UID'],
  },
  {
    key: 'qq',
    label: 'QQ号',
    type: 'qq',
    required: false,
    unique: false,
    immutableAfter: 'rosterLock',
    visibility: 'admin',
    searchable: true,
    showInPairings: false,
    pattern: '^[1-9][0-9]{4,11}$',
    importAliases: ['QQ', 'QQ号', 'QQ 号', '联系QQ'],
  },
];

export const GENERIC_PLAYER_FIELDS = UNIFIED_PLAYER_FIELDS;
export const POETRY_CUP_PLAYER_FIELDS = UNIFIED_PLAYER_FIELDS;

export function getPlayerSchemaId(competition: TournamentCompetition): PlayerSchemaId {
  return competition.playerSchemaId === 'poetryCupS2' ? 'poetryCupS2' : 'generic';
}

export function getDefaultPlayerFields(schemaId: PlayerSchemaId): PlayerFieldDefinition[] {
  void schemaId;
  return UNIFIED_PLAYER_FIELDS
    .map(field => ({ ...field, importAliases: field.importAliases ? [...field.importAliases] : undefined }));
}

export function getPlayerFields(competition: TournamentCompetition): PlayerFieldDefinition[] {
  if (competition.playerFields && competition.playerFields.length > 0) {
    return competition.playerFields;
  }
  return getDefaultPlayerFields(getPlayerSchemaId(competition));
}

export function getPlayerFieldValue(player: Player, key: string): string {
  if (key === 'participantCode') return player.participantCode?.trim() ?? '';
  if (key === 'name') return player.name?.trim() ?? '';
  return player.profile?.[key]?.trim() ?? '';
}

export function setPlayerFieldValue(
  player: Player,
  key: string,
  value: string
): Player {
  if (key === 'participantCode') {
    return { ...player, participantCode: value.trim() };
  }
  if (key === 'name') {
    return { ...player, name: value.trim() };
  }
  return {
    ...player,
    profile: {
      ...(player.profile ?? {}),
      [key]: value.trim(),
    },
  };
}

export function getPlayerDisplayName(player: Player): string {
  const code = player.participantCode?.trim();
  return code ? `${code} · ${player.name}` : player.name;
}

export function getPlayerPairingLabel(player: Player): string {
  const code = player.participantCode?.trim();
  const uid = player.profile?.uid?.trim();
  const codeAndName = code ? `${code} · ${player.name}` : player.name;
  return uid ? `${codeAndName}\nUID: ${uid}` : codeAndName;
}

export function sortPlayersByParticipantCode(players: Player[]): Player[] {
  return [...players].sort((a, b) => {
    const aCode = a.participantCode?.trim() ?? '';
    const bCode = b.participantCode?.trim() ?? '';
    if (!aCode && !bCode) return a.name.localeCompare(b.name);
    if (!aCode) return 1;
    if (!bCode) return -1;
    return aCode.localeCompare(bCode, undefined, { numeric: true, sensitivity: 'base' });
  });
}

export function normalizeUid(value: string): string {
  return value.replace(/[\s\u3000-]/g, '').trim();
}

export function validateRoster(competition: TournamentCompetition): RosterValidationSummary {
  const fields = getPlayerFields(competition);
  const issues: RosterValidationIssue[] = [];
  const participantCodes = new Map<string, string>();
  const uidToPlayerId = new Map<string, string>();
  const playerIdToUid = new Map<string, string>();
  const playerGroupName = new Map<string, string>();
  let playerCount = 0;

  competition.groups.forEach((group, groupIndex) => {
    group.players.forEach(player => {
      playerCount += 1;
      playerGroupName.set(player.id, group.name);
      const code = player.participantCode?.trim() ?? '';
      const playerLabel = `${group.name} / ${code || '未编号'} / ${player.name}`;
      if (!player.name.trim()) {
        issues.push({
          code: 'MISSING_NAME',
          message: `${playerLabel} 缺少昵称`,
          messageEn: `${group.name} / ${code || 'No code'} / Unnamed player is missing a nickname`,
          groupIndex,
          playerId: player.id,
          fieldKey: 'name',
        });
      }

      if (code) {
        const previous = participantCodes.get(code);
        if (previous && previous !== player.id) {
          issues.push({
            code: 'DUPLICATE_PARTICIPANT_CODE',
            message: `${playerLabel} 的选手编号重复`,
            messageEn: `${group.name} / ${code} / ${player.name} has a duplicated participant code`,
            groupIndex,
            playerId: player.id,
            fieldKey: 'participantCode',
          });
        } else {
          participantCodes.set(code, player.id);
        }
      } else {
        issues.push({
          code: 'MISSING_PARTICIPANT_CODE',
          message: `${group.name} / 未编号 / ${player.name} 缺少选手编号`,
          messageEn: `${group.name} / No code / ${player.name} is missing a participant code`,
          groupIndex,
          playerId: player.id,
          fieldKey: 'participantCode',
        });
      }
    });
  });

  competition.groups.forEach((group, groupIndex) => {
    group.players.forEach(player => {
      const code = player.participantCode?.trim() ?? '';
      const playerLabel = `${group.name} / ${code || '未编号'} / ${player.name}`;
      const uid = normalizeUid(player.profile?.uid ?? '');
      const qq = player.profile?.qq?.trim() ?? '';
      const codeField = fields.find(field => field.key === 'participantCode');
      const uidField = fields.find(field => field.key === 'uid');
      const qqField = fields.find(field => field.key === 'qq');

      if (code && codeField?.pattern && !new RegExp(codeField.pattern).test(code)) {
        issues.push({
          code: 'INVALID_PARTICIPANT_CODE',
          message: `${playerLabel} 的选手编号格式错误`,
          messageEn: `${group.name} / ${code} / ${player.name} has an invalid participant code`,
          groupIndex,
          playerId: player.id,
          fieldKey: 'participantCode',
        });
      }

      if (uid && uidField?.pattern && !new RegExp(uidField.pattern).test(uid)) {
        issues.push({
          code: 'INVALID_UID',
          message: `${playerLabel} 的 UID ${uid} 格式错误`,
          messageEn: `${group.name} / ${code || 'No code'} / ${player.name} has an invalid UID: ${uid}`,
          groupIndex,
          playerId: player.id,
          fieldKey: 'uid',
        });
      } else if (uid) {
        const previous = uidToPlayerId.get(uid);
        if (previous && previous !== player.id) {
          issues.push({
            code: 'DUPLICATE_UID',
            message: `${playerLabel} 的 UID ${uid} 重复`,
            messageEn: `${group.name} / ${code || 'No code'} / ${player.name} has a duplicated UID: ${uid}`,
            groupIndex,
            playerId: player.id,
            fieldKey: 'uid',
          });
        } else {
          uidToPlayerId.set(uid, player.id);
          playerIdToUid.set(player.id, uid);
        }
      }

      if (qq && qqField?.pattern && !new RegExp(qqField.pattern).test(qq)) {
        issues.push({
          code: 'INVALID_QQ',
          message: `${playerLabel} 的 QQ ${qq} 格式错误`,
          messageEn: `${group.name} / ${code || 'No code'} / ${player.name} has an invalid QQ number: ${qq}`,
          groupIndex,
          playerId: player.id,
          fieldKey: 'qq',
        });
      }
    });
  });

  for (const [playerId, uid] of playerIdToUid) {
    if (uidToPlayerId.get(uid) !== playerId) {
      issues.push({
        code: 'UID_ID_MISMATCH',
        message: `${playerGroupName.get(playerId) ?? '未知组别'} / ${uid} 与 Player.id 映射不一致`,
        messageEn: `${playerGroupName.get(playerId) ?? 'Unknown group'} / ${uid} is not mapped one-to-one with Player.id`,
        playerId,
        fieldKey: 'uid',
      });
    }
  }

  return {
    valid: issues.length === 0,
    issues,
    playerCount,
    participantCodes,
    uidToPlayerId,
    playerIdToUid,
  };
}

export function isRosterLocked(competition: TournamentCompetition): boolean {
  return !!competition.rosterLockedAt
    || competition.groups.some(group => group.status !== 'setup' || group.currentRound > 0);
}

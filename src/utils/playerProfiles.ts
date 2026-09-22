import type {
  Player,
  PlayerFieldDefinition,
  PlayerSchemaId,
  TournamentCompetition,
} from '../types';

export interface RosterValidationIssue {
  code:
    | 'MISSING_NAME'
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
    pattern: '^[A-D](0[1-9]|[12][0-9]|3[0-2])$',
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

export function normalizeUid(value: string): string {
  return value.replace(/[\s\u3000-]/g, '').trim();
}

export function generateParticipantCodes(competition: TournamentCompetition): TournamentCompetition {
  const groups = competition.groups.map((group, groupIndex) => {
    const groupPrefix = String.fromCharCode(65 + groupIndex);
    return {
      ...group,
      players: group.players.map((player, playerIndex) => ({
        ...player,
        participantCode: `${groupPrefix}${String(playerIndex + 1).padStart(2, '0')}`,
      })),
    };
  });
  return { ...competition, groups };
}

export function validateRoster(competition: TournamentCompetition): RosterValidationSummary {
  const fields = getPlayerFields(competition);
  const issues: RosterValidationIssue[] = [];
  const participantCodes = new Map<string, string>();
  const uidToPlayerId = new Map<string, string>();
  const playerIdToUid = new Map<string, string>();
  let playerCount = 0;

  competition.groups.forEach((group, groupIndex) => {
    group.players.forEach(player => {
      playerCount += 1;
      if (!player.name.trim()) {
        issues.push({
          code: 'MISSING_NAME',
          message: `${group.name} 存在空昵称`,
          messageEn: `${group.name} contains an empty nickname`,
          groupIndex,
          playerId: player.id,
          fieldKey: 'name',
        });
      }

      const code = player.participantCode?.trim() ?? '';
      if (code) {
        const previous = participantCodes.get(code);
        if (previous && previous !== player.id) {
          issues.push({
            code: 'DUPLICATE_PARTICIPANT_CODE',
            message: `选手编号 ${code} 重复`,
            messageEn: `Participant code ${code} is duplicated`,
            groupIndex,
            playerId: player.id,
            fieldKey: 'participantCode',
          });
        } else {
          participantCodes.set(code, player.id);
        }
      }
    });
  });

  competition.groups.forEach((group, groupIndex) => {
    group.players.forEach(player => {
      const code = player.participantCode?.trim() ?? '';
      const uid = normalizeUid(player.profile?.uid ?? '');
      const qq = player.profile?.qq?.trim() ?? '';
      const codeField = fields.find(field => field.key === 'participantCode');
      const uidField = fields.find(field => field.key === 'uid');
      const qqField = fields.find(field => field.key === 'qq');

      if (code && codeField?.pattern && !new RegExp(codeField.pattern).test(code)) {
        issues.push({
          code: 'INVALID_PARTICIPANT_CODE',
          message: `${player.name} 的选手编号 ${code} 格式错误`,
          messageEn: `${player.name} has an invalid participant code: ${code}`,
          groupIndex,
          playerId: player.id,
          fieldKey: 'participantCode',
        });
      }

      if (uid && uidField?.pattern && !new RegExp(uidField.pattern).test(uid)) {
        issues.push({
          code: 'INVALID_UID',
          message: `${player.name} 的 UID ${uid} 格式错误`,
          messageEn: `${player.name} has an invalid UID: ${uid}`,
          groupIndex,
          playerId: player.id,
          fieldKey: 'uid',
        });
      } else if (uid) {
        const previous = uidToPlayerId.get(uid);
        if (previous && previous !== player.id) {
          issues.push({
            code: 'DUPLICATE_UID',
            message: `UID ${uid} 重复`,
            messageEn: `UID ${uid} is duplicated`,
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
          message: `${player.name} 的 QQ ${qq} 格式错误`,
          messageEn: `${player.name} has an invalid QQ number: ${qq}`,
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
        message: `UID ${uid} 与 Player.id 映射不一致`,
        messageEn: `UID ${uid} is not mapped one-to-one with Player.id`,
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

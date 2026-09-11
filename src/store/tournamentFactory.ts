import type { GameType, PairingType, TournamentCompetition, TournamentGroup } from '../types';
import { createPlayersFromNames, getSingleEliminationRounds } from '../utils/swissPairing';

export function generateId(): string {
  return Math.random().toString(36).substring(2, 11);
}

export function createNewGroup(
  name: string,
  playerCount: number = 32,
  rounds: number = 5,
  gameType: GameType = 'bo1',
  pairingType: PairingType = 'swiss',
  startPlayerIndex: number = 1
): TournamentGroup {
  const playerNames: string[] = [];
  for (let i = 0; i < playerCount; i++) {
    playerNames.push(`选手${String(startPlayerIndex + i).padStart(3, '0')}`);
  }

  const players = createPlayersFromNames(playerNames);
  const totalRounds = pairingType === 'single_elimination'
    ? getSingleEliminationRounds(playerCount)
    : rounds;

  return {
    id: generateId(),
    name,
    currentRound: 0,
    totalRounds,
    status: 'setup',
    players,
    matches: [],
    createdAt: new Date().toISOString(),
    pairingType,
    gameType,
    roundGameTypes: new Array(totalRounds).fill(gameType),
  };
}

export function createNewCompetition(
  name: string,
  groupCount: number = 1,
  playerCountPerGroup: number = 32,
  roundsPerGroup: number = 5,
  gameType: GameType = 'bo1',
  pairingType: PairingType = 'swiss'
): TournamentCompetition {
  const groups: TournamentGroup[] = [];
  for (let i = 0; i < groupCount; i++) {
    const startIdx = i * playerCountPerGroup + 1;
    groups.push(createNewGroup(`小组${String(i + 1).padStart(2, '0')}`, playerCountPerGroup, roundsPerGroup, gameType, pairingType, startIdx));
  }

  return {
    id: generateId(),
    name,
    groups,
    currentGroupIndex: 0,
    createdAt: new Date().toISOString(),
  };
}

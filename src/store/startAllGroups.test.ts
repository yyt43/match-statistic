import { beforeEach, describe, expect, it } from 'vitest';
import { useTournamentStore } from './useTournamentStore';
import {
  createDefaultStageDraft,
  createMultiStageCompetition,
  createPoetryCupS3Competition,
} from './multiStageFactory';
import type { MultiStageDraftStage } from '../utils/multiStage';

describe('simultaneous group start', () => {
  beforeEach(() => {
    useTournamentStore.getState().initCompetition('多组赛事', 3, 4, 3, 'bo1', 'swiss');
  });

  it('starts every group together when a single-group start is requested', () => {
    useTournamentStore.getState().startTournament(3);

    const groups = useTournamentStore.getState().competition.groups;
    expect(groups).toHaveLength(3);
    expect(groups.every(group => group.status === 'in_progress')).toBe(true);
    expect(groups.every(group => group.currentRound === 1)).toBe(true);
  });

  it('does not partially start groups when one group has fewer than two players', () => {
    const state = useTournamentStore.getState();
    const competition = state.competition;
    useTournamentStore.setState({
      competition: {
        ...competition,
        groups: competition.groups.map((group, index) =>
          index === 1 ? { ...group, players: group.players.slice(0, 1) } : group
        ),
      },
    });

    useTournamentStore.getState().startAllGroups();

    const groups = useTournamentStore.getState().competition.groups;
    expect(groups.every(group => group.status === 'setup')).toBe(true);
    expect(groups.every(group => group.currentRound === 0)).toBe(true);
  });

  it('starts only the current stage of a multi-stage event', () => {
    useTournamentStore.getState().initMultiStageCompetition(createPoetryCupS3Competition());

    useTournamentStore.getState().startAllGroups();

    const groups = useTournamentStore.getState().competition.groups;
    expect(groups).toHaveLength(6);
    expect(groups.slice(0, 4).every(group => group.status === 'in_progress')).toBe(true);
    expect(groups.slice(0, 4).every(group => group.currentRound === 1)).toBe(true);
    expect(groups.slice(4).every(group => group.status === 'setup')).toBe(true);
    expect(groups.slice(4).every(group => group.currentRound === 0)).toBe(true);
  });

  it('starts a later stage once its roster is filled in', () => {
    const first: MultiStageDraftStage = {
      ...createDefaultStageDraft(1),
      name: '小组赛',
      playerCountPerGroup: 4,
      rounds: 3,
    };
    const second: MultiStageDraftStage = {
      ...createDefaultStageDraft(2),
      name: '第二轮',
      playerCountPerGroup: 4,
      rounds: 3,
      sourceStageIds: [first.id],
    };
    useTournamentStore.getState().initMultiStageCompetition(
      createMultiStageCompetition('多阶段', [first, second])
    );

    const competition = useTournamentStore.getState().competition;
    const laterIndex = competition.groups.findIndex(group => group.name === '第二轮');
    expect(competition.groups[laterIndex].players).toHaveLength(0);

    const sourcePlayers = competition.groups[0].players.slice(0, 4);
    useTournamentStore.setState({
      competition: {
        ...competition,
        currentGroupIndex: laterIndex,
        // 上游已确认晋级后才允许下游开赛。
        stageAdvancements: [
          {
            id: 'adv-upstream',
            sourceStageId: first.id,
            confirmedAt: new Date().toISOString(),
            seats: [],
            breakoutPairings: [],
          },
        ],
        groups: competition.groups.map((group, index) =>
          index === laterIndex
            ? {
                ...group,
                players: sourcePlayers.map((player, position) => ({
                  ...player,
                  id: `later-${position}`,
                  participantCode: `B0${position + 1}`,
                })),
              }
            : group
        ),
      },
    });

    useTournamentStore.getState().startAllGroups();

    const groups = useTournamentStore.getState().competition.groups;
    expect(groups[laterIndex].status).toBe('in_progress');
    expect(groups[laterIndex].currentRound).toBe(1);
    expect(groups[0].status).toBe('setup');
    expect(groups[0].currentRound).toBe(0);
  });

  it('refuses to start a stage whose upstream advancement is not confirmed', () => {
    useTournamentStore.getState().initMultiStageCompetition(createPoetryCupS3Competition());
    const competition = useTournamentStore.getState().competition;
    const laterIndex = competition.groups.findIndex(group => group.name === '突围赛');
    const seeded = competition.groups[0].players.slice(0, 4).map((player, position) => ({
      ...player,
      id: `staged-${position}`,
      participantCode: `E0${position + 1}`,
    }));
    useTournamentStore.setState({
      competition: {
        ...competition,
        currentGroupIndex: laterIndex,
        groups: competition.groups.map((group, index) =>
          index === laterIndex ? { ...group, players: seeded } : group
        ),
      },
    });

    useTournamentStore.getState().startAllGroups();

    const groups = useTournamentStore.getState().competition.groups;
    expect(groups[laterIndex].status).toBe('setup');
    expect(groups[laterIndex].currentRound).toBe(0);
  });
});

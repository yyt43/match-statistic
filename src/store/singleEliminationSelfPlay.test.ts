import { beforeEach, describe, expect, it } from 'vitest';
import { useTournamentStore } from './useTournamentStore';
import { getEliminationBracketView } from '../utils/elimination';

describe('single elimination self play guard', () => {
  beforeEach(() => {
    useTournamentStore.getState().initCompetition('单败自战回归', 1, 8, 3, 'bo3', 'single_elimination');
  });

  for (const count of [2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 16, 17]) {
    it(`never pairs a player with themselves with ${count} players`, () => {
      const store = useTournamentStore.getState();
      const competition = store.competition;
      useTournamentStore.setState({
        competition: {
          ...competition,
          groups: competition.groups.map(group => ({
            ...group,
            players: group.players.slice(0, count),
          })),
        },
      });

      useTournamentStore.getState().prepareEliminationBracket(0);
      useTournamentStore.getState().confirmEliminationBracket(0);

      for (let round = 1; round <= 6; round += 1) {
        const current = useTournamentStore.getState().competition.groups[0];
        const pending = current.matches.filter(
          match => match.round === round && match.result === 'pending'
        );
        for (const match of pending) {
          const groups = useTournamentStore.getState().competition.groups;
          useTournamentStore.setState({
            competition: {
              ...useTournamentStore.getState().competition,
              groups: groups.map((group, index) =>
                index === 0
                  ? {
                      ...group,
                      matches: group.matches.map(item =>
                        item.id === match.id ? { ...item, result: 'player1' } : item
                      ),
                    }
                  : group
              ),
            },
          });
        }

        const after = useTournamentStore.getState().competition.groups[0];
        expect(after.matches.filter(match => match.player1Id === match.player2Id)).toHaveLength(0);
        const view = getEliminationBracketView(after);
        expect(
          view.rounds.flatMap(item =>
            item.nodes.filter(node => node.player1Id && node.player1Id === node.player2Id)
          )
        ).toHaveLength(0);

        if (after.currentRound >= after.totalRounds) break;
        useTournamentStore.getState().generateNextRoundForGroup(0);
      }
    });
  }
});

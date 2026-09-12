import type { TournamentCompetition } from '../types';

export interface CompetitionHistoryEntry {
  id: string;
  label: string;
  timestamp: string;
  competition: TournamentCompetition;
  viewRound: number;
}

export interface CompetitionHistoryState {
  past: CompetitionHistoryEntry[];
  future: CompetitionHistoryEntry[];
}

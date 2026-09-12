import type { CompetitionState } from '../useTournamentStore';

export type StoreSet = (
  partial:
    | Partial<CompetitionState>
    | ((state: CompetitionState) => Partial<CompetitionState>)
) => void;

export type StoreGet = () => CompetitionState;

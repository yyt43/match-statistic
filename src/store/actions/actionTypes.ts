import type { CompetitionState } from '../useTournamentStore';

export interface StoreSetOptions {
  history?: 'record' | 'skip' | 'replace';
  allowReadOnly?: boolean;
  label?: string;
  persist?: boolean;
}

export type StoreSet = (
  partial:
    | Partial<CompetitionState>
    | ((state: CompetitionState) => Partial<CompetitionState>),
  options?: StoreSetOptions
) => void;

export type StoreGet = () => CompetitionState;

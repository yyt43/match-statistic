import { Trash2 } from 'lucide-react';
import { useLanguagePreference } from '../../i18n/context';
import { useCurrentGroup, useTournamentStore } from '../../store/useTournamentStore';
import { isRosterLocked, sortPlayersByParticipantCode } from '../../utils/playerProfiles';

export function PlayerManagerList() {
  const currentGroup = useCurrentGroup();
  const { language } = useLanguagePreference();
  const isEnglish = language === 'en';
  const { competition, removePlayer, updatePlayerProfile } = useTournamentStore();
  const rosterLocked = isRosterLocked(competition);
  const sortedPlayers = sortPlayersByParticipantCode(currentGroup.players);
  const groupIndex = competition.currentGroupIndex;

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <div className="grid items-center gap-2 px-3 text-[10px] text-slate-500 grid-cols-[24px_58px_minmax(100px,1fr)_104px_82px_28px]">
          <span>#</span>
          <span>{isEnglish ? 'Code' : '编号'}</span>
          <span>{isEnglish ? 'Name' : '昵称'}</span>
          <span>UID</span>
          <span>QQ</span>
          <span />
        </div>

        {sortedPlayers.map((player, index) => (
          <div
            key={`${player.id}:${player.participantCode ?? ''}:${player.name}:${player.profile?.uid ?? ''}:${player.profile?.qq ?? ''}`}
            className="grid items-center gap-2 rounded-lg bg-slate-800/30 px-3 py-2 transition-colors hover:bg-slate-800/50 grid-cols-[24px_58px_minmax(100px,1fr)_104px_82px_28px]"
          >
            <span className="font-mono text-xs text-slate-500">{index + 1}.</span>
            <input
              defaultValue={player.participantCode ?? ''}
              disabled={rosterLocked}
              onBlur={event => updatePlayerProfile(player.id, {
                participantCode: event.target.value.toUpperCase(),
              }, groupIndex)}
              placeholder="A01"
              className="min-w-0 rounded border border-slate-700/70 bg-slate-900/50 px-1.5 py-1 font-mono text-[11px] text-gold-300 outline-none focus:border-gold-500/40 disabled:opacity-70"
            />
            <input
              defaultValue={player.name}
              disabled={rosterLocked}
              onBlur={event => updatePlayerProfile(player.id, { name: event.target.value }, groupIndex)}
              className="min-w-0 rounded border border-slate-700/70 bg-slate-900/50 px-2 py-1 text-sm text-slate-200 outline-none focus:border-gold-500/40 disabled:opacity-70"
            />
            <input
              defaultValue={player.profile?.uid ?? ''}
              disabled={rosterLocked}
              onBlur={event => updatePlayerProfile(player.id, { uid: event.target.value }, groupIndex)}
              placeholder="UID"
              className="min-w-0 rounded border border-slate-700/70 bg-slate-900/50 px-1.5 py-1 font-mono text-[11px] text-sky-300 outline-none focus:border-sky-500/40 disabled:opacity-70"
            />
            <input
              defaultValue={player.profile?.qq ?? ''}
              disabled={rosterLocked}
              onBlur={event => updatePlayerProfile(player.id, { qq: event.target.value }, groupIndex)}
              placeholder="QQ"
              className="min-w-0 rounded border border-slate-700/70 bg-slate-900/50 px-1.5 py-1 font-mono text-[11px] text-slate-300 outline-none focus:border-slate-500/40 disabled:opacity-70"
            />
            <button
              onClick={() => removePlayer(player.id)}
              disabled={rosterLocked}
              className="rounded p-1 text-slate-500 transition-colors hover:bg-rose-500/10 hover:text-rose-400 disabled:cursor-not-allowed disabled:opacity-30"
              title={isEnglish ? 'Remove player' : '删除选手'}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

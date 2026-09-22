import { BadgeCheck, Lock, Save, Upload } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useLanguagePreference } from '../../i18n/context';
import { useTournamentStore } from '../../store/useTournamentStore';
import type { PlayerSchemaId } from '../../types';
import {
  getRosterWorkbookColumnsFromFile,
  parseRosterProfilesFromWorkbook,
  type RosterColumnChoices,
} from '../../utils/import/rosterProfileImport';
import {
  isRosterLocked,
  validateRoster,
  type RosterValidationSummary,
} from '../../utils/playerProfiles';

export function RosterProfilePanel() {
  const { language } = useLanguagePreference();
  const isEnglish = language === 'en';
  const {
    competition,
    setPlayerSchema,
    importPlayerProfiles,
    assignParticipantCodes,
    lockRoster,
  } = useTournamentStore();
  const [columns, setColumns] = useState<RosterColumnChoices>({ name: '' });
  const [headers, setHeaders] = useState<string[]>([]);
  const [summary, setSummary] = useState<RosterValidationSummary>(() => validateRoster(competition));
  const [message, setMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const locked = isRosterLocked(competition);
  const schemaId: PlayerSchemaId = competition.playerSchemaId ?? 'generic';

  useEffect(() => {
    setSummary(validateRoster(competition));
  }, [competition]);

  const handleFile = async (file?: File) => {
    if (!file) return;
    try {
      const detected = await getRosterWorkbookColumnsFromFile(file);
      setHeaders(detected.headers);
      setColumns(detected.detected);
      if (detected.detected.uid || detected.detected.qq) {
        setPlayerSchema('poetryCupS2');
      }
      if (detected.detected.name) {
        await importProfiles(file, detected.detected, true);
      } else {
        setMessage(isEnglish
          ? 'Columns detected, but no nickname column was found.'
          : '已识别表头，但没有找到昵称列。');
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    }
  };

  const importProfiles = async (
    file: File,
    selectedColumns: RosterColumnChoices,
    autoAssignCodes = false
  ) => {
    const rows = await parseRosterProfilesFromWorkbook(file, selectedColumns);
    const result = importPlayerProfiles(rows);
    const hasCodes = rows.some(row => !!row.participantCode?.trim());
    const nextCompetition = useTournamentStore.getState().competition;
    const canGenerateCodes = nextCompetition.groups.length <= 4
      && nextCompetition.groups.every(group => group.players.length <= 32);
    if (autoAssignCodes && !hasCodes && canGenerateCodes) {
      assignParticipantCodes();
    }
    const finalCompetition = useTournamentStore.getState().competition;
    const finalSummary = validateRoster(finalCompetition);
    setSummary(finalSummary);
    setMessage(isEnglish
      ? `Imported ${result.playerCount} player profiles${autoAssignCodes && !hasCodes && canGenerateCodes ? ' and generated participant codes' : ''}.`
      : `已自动导入 ${result.playerCount} 名选手档案${autoAssignCodes && !hasCodes && canGenerateCodes ? '，并生成选手编号' : ''}。`);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleImport = async () => {
    const file = fileInputRef.current?.files?.[0];
    if (!file) return;
    try {
      await importProfiles(file, columns);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    }
  };

  const handleAssignCodes = () => {
    assignParticipantCodes();
    setMessage(isEnglish ? 'Participant codes generated.' : '选手编号已生成。');
  };

  const handleLock = () => {
    const result = lockRoster();
    setSummary(result);
    setMessage(result.valid
      ? (isEnglish ? 'Roster locked.' : '选手档案已锁定。')
      : (isEnglish ? 'Roster validation failed.' : '选手档案校验未通过。'));
  };

  const selectOptions = [
    ['name', isEnglish ? 'Nickname' : '游戏昵称'],
    ['participantCode', isEnglish ? 'Participant code' : '选手编号'],
    ['uid', 'UID'],
    ['qq', 'QQ'],
  ] as const;

  return (
    <div className="space-y-3 rounded-lg border border-slate-700/50 bg-slate-900/25 p-3">
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setPlayerSchema('generic')}
              disabled={locked || schemaId === 'generic'}
              className={`rounded-lg border px-3 py-2 text-xs ${
                schemaId === 'generic'
                  ? 'border-sky-500/40 bg-sky-500/15 text-sky-300'
                  : 'border-slate-700 bg-slate-800/40 text-slate-400'
              } disabled:opacity-60`}
            >
              {isEnglish ? 'Generic' : '通用模板'}
            </button>
            <button
              onClick={() => setPlayerSchema('poetryCupS2')}
              disabled={locked || schemaId === 'poetryCupS2'}
              className={`rounded-lg border px-3 py-2 text-xs ${
                schemaId === 'poetryCupS2'
                  ? 'border-gold-500/40 bg-gold-500/15 text-gold-400'
                  : 'border-slate-700 bg-slate-800/40 text-slate-400'
              } disabled:opacity-60`}
            >
              诗意杯 S2
            </button>
          </div>

          {schemaId === 'poetryCupS2' && (
            <>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                onChange={event => void handleFile(event.target.files?.[0])}
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={locked}
                className="w-full rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300 disabled:opacity-40"
              >
                <Upload className="mr-1 inline h-3.5 w-3.5" />
                {isEnglish ? 'Import nickname / UID / QQ' : '导入昵称、UID、QQ'}
              </button>

              {headers.length > 0 && !locked && (
                <div className="space-y-2 rounded-lg border border-slate-700/60 bg-slate-800/35 p-2">
                  {selectOptions.map(([key, label]) => (
                    <label key={key} className="grid grid-cols-[90px_1fr] items-center gap-2 text-[11px] text-slate-400">
                      <span>{label}</span>
                      <select
                        value={columns[key] ?? ''}
                        onChange={event => setColumns(previous => ({
                          ...previous,
                          [key]: event.target.value || undefined,
                        }))}
                        className="rounded border border-slate-700 bg-slate-800 px-2 py-1 text-slate-200"
                      >
                        <option value="">{isEnglish ? 'Not mapped' : '不映射'}</option>
                        {headers.map(header => (
                          <option key={header} value={header}>{header}</option>
                        ))}
                      </select>
                    </label>
                  ))}
                  <button
                    onClick={() => void handleImport()}
                    disabled={!columns.name}
                    className="w-full rounded-lg bg-emerald-500/15 px-3 py-2 text-xs text-emerald-300 disabled:opacity-40"
                  >
                    <Save className="mr-1 inline h-3.5 w-3.5" />
                    {isEnglish ? 'Import mapped profiles' : '按当前映射导入'}
                  </button>
                </div>
              )}

              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={handleAssignCodes}
                  disabled={locked}
                  className="rounded-lg border border-sky-500/25 bg-sky-500/10 px-3 py-2 text-xs text-sky-300 disabled:opacity-40"
                >
                  {isEnglish ? 'Generate codes' : '生成 A01-D32'}
                </button>
                <button
                  onClick={handleLock}
                  disabled={locked}
                  className="rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-xs text-amber-300 disabled:opacity-40"
                >
                  <Lock className="mr-1 inline h-3.5 w-3.5" />
                  {isEnglish ? 'Validate and lock' : '校验并锁定'}
                </button>
              </div>
            </>
          )}

          {message && (
            <div className="rounded-lg border border-slate-700/60 bg-slate-800/50 px-2 py-1.5 text-[11px] text-slate-300">
              {message}
            </div>
          )}

          <div className="grid grid-cols-3 gap-2 text-center text-[10px]">
            <div className="rounded bg-slate-800/60 px-2 py-1.5 text-slate-300">
              {isEnglish ? 'Players' : '选手'} {summary.playerCount}
            </div>
            <div className="rounded bg-slate-800/60 px-2 py-1.5 text-slate-300">
              UID {summary.uidToPlayerId.size}
            </div>
            <div className={`rounded px-2 py-1.5 ${
              summary.valid ? 'bg-emerald-500/10 text-emerald-300' : 'bg-rose-500/10 text-rose-300'
            }`}>
              {summary.valid
                ? (isEnglish ? 'Valid' : '校验通过')
                : (isEnglish ? `${summary.issues.length} issues` : `${summary.issues.length} 项异常`)}
            </div>
          </div>

          {summary.issues.length > 0 && (
            <div className="max-h-32 space-y-1 overflow-y-auto rounded-lg border border-rose-500/20 bg-rose-500/5 p-2 text-[10px] text-rose-300">
              {summary.issues.slice(0, 20).map((issue, index) => (
                <div key={`${issue.code}-${issue.playerId ?? index}`}>
                  {isEnglish ? issue.messageEn ?? issue.message : issue.message}
                </div>
              ))}
            </div>
          )}

          {locked && (
            <div className="flex items-center gap-1.5 text-[10px] text-emerald-400">
              <BadgeCheck className="h-3.5 w-3.5" />
              {isEnglish ? 'UID and participant codes are immutable.' : 'UID 和选手编号已锁定，不可修改。'}
            </div>
          )}
    </div>
  );
}

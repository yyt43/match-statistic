import { BadgeCheck, ListPlus, Lock, Save, Upload } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useLanguagePreference } from '../../i18n/context';
import { useTournamentStore } from '../../store/useTournamentStore';
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
    generateMissingParticipantCodes,
    importPlayerProfiles,
    lockRoster,
  } = useTournamentStore();
  const [columns, setColumns] = useState<RosterColumnChoices>({ name: '' });
  const [headers, setHeaders] = useState<string[]>([]);
  const [summary, setSummary] = useState<RosterValidationSummary>(() => validateRoster(competition));
  const [message, setMessage] = useState<string | null>(null);
  const [hasImported, setHasImported] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const locked = isRosterLocked(competition);
  const missingCodeCount = summary.issues.filter(
    issue => issue.code === 'MISSING_PARTICIPANT_CODE'
  ).length;

  useEffect(() => {
    setSummary(validateRoster(competition));
  }, [competition]);

  const handleFile = async (file?: File) => {
    if (!file) return;
    try {
      const detected = await getRosterWorkbookColumnsFromFile(file);
      if (detected.isResultCollection) {
        setHeaders([]);
        setColumns({ name: '' });
        setMessage(isEnglish
          ? 'This is a match-result collection workbook, not a player roster. Current players, groups, and format settings were kept unchanged.'
          : '这是比赛结果收集表，不是选手信息表。当前选手、分组和赛制数据已保留。');
        return;
      }
      setHeaders(detected.headers);
      setColumns(detected.detected);
      if (detected.detected.name) {
        await importProfiles(file, detected.detected);
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
    selectedColumns: RosterColumnChoices
  ) => {
    const rows = await parseRosterProfilesFromWorkbook(file, selectedColumns);
    if (rows.length === 0) {
      throw new Error(isEnglish
        ? 'No player rows were found. Current players, groups, and format settings were kept unchanged.'
        : '没有从表格中读取到选手数据，当前选手、分组和赛制数据已保留。');
    }
    const result = importPlayerProfiles(rows);
    const finalCompetition = useTournamentStore.getState().competition;
    const finalSummary = validateRoster(finalCompetition);
    const importedGroupCount = new Set(
      rows
        .map(row => row.groupName?.trim())
        .filter((name): name is string => !!name)
    ).size || finalCompetition.groups.length;
    const missingCodes = finalSummary.issues.filter(
      issue => issue.code === 'MISSING_PARTICIPANT_CODE'
    ).length;
    setSummary(finalSummary);
    setHasImported(true);
    setHeaders([]);
    setColumns({ name: '' });
    setMessage(isEnglish
      ? `Imported ${result.playerCount} player profiles across ${importedGroupCount} groups.${missingCodes > 0 ? ` ${missingCodes} players still need participant codes; use Fill missing codes to complete them.` : ''}`
      : `已导入 ${importedGroupCount} 个小组、共 ${result.playerCount} 名选手。${missingCodes > 0 ? `另有 ${missingCodes} 名选手缺少编号，可点击“一键编号”补齐。` : ''}`);
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

  const handleLock = () => {
    const result = lockRoster();
    setSummary(result);
    setHasImported(true);
    setMessage(result.valid
      ? (isEnglish ? 'Roster locked.' : '选手档案已锁定。')
      : (isEnglish ? 'Roster validation failed.' : '选手档案校验未通过。'));
  };

  const handleGenerateMissingCodes = () => {
    const result = generateMissingParticipantCodes();
    const nextCompetition = useTournamentStore.getState().competition;
    setSummary(validateRoster(nextCompetition));
    setHasImported(true);
    if (result.assigned > 0) {
      setMessage(isEnglish
        ? `Filled ${result.assigned} missing participant codes. Existing codes were preserved.${result.unresolved > 0 ? ` ${result.unresolved} player(s) still need manual codes.` : ''}`
        : `已补齐 ${result.assigned} 个缺失编号，原有编号未被修改。${result.unresolved > 0 ? `另有 ${result.unresolved} 名选手因可用编号不足需要手动处理。` : ''}`);
    } else {
      setMessage(isEnglish
        ? 'No missing participant codes were found.'
        : '没有需要补齐的选手编号。');
    }
  };

  const selectOptions = [
    ['name', isEnglish ? 'Nickname' : '游戏昵称'],
    ['participantCode', isEnglish ? 'Participant code' : '选手编号'],
    ['uid', 'UID'],
    ['qq', 'QQ'],
  ] as const;

  return (
    <div className="space-y-2 rounded-lg border border-slate-700/50 bg-slate-900/25 p-3">
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={event => void handleFile(event.target.files?.[0])}
          />
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={locked}
              className="w-full rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300 disabled:opacity-40"
            >
              <Upload className="mr-1 inline h-3.5 w-3.5" />
              {isEnglish ? 'Import roster' : '导入选手信息表'}
            </button>
            <button
              onClick={handleGenerateMissingCodes}
              disabled={locked || missingCodeCount === 0}
              className="w-full rounded-lg border border-sky-500/25 bg-sky-500/10 px-3 py-2 text-xs text-sky-300 disabled:opacity-40"
              title={
                missingCodeCount === 0
                  ? (isEnglish ? 'All players already have codes.' : '所有选手都已有编号。')
                  : (isEnglish ? 'Fill missing codes only; existing codes are preserved.' : '仅补齐空编号，不覆盖已有编号。')
              }
            >
              <ListPlus className="mr-1 inline h-3.5 w-3.5" />
              {isEnglish ? `Fill missing codes (${missingCodeCount})` : `一键编号 (${missingCodeCount})`}
            </button>
          </div>
          <button
            onClick={handleLock}
            disabled={locked}
            className="w-full rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-xs text-amber-300 disabled:opacity-40"
          >
            <Lock className="mr-1 inline h-3.5 w-3.5" />
            {isEnglish ? 'Validate and lock' : '校验并锁定'}
          </button>

          <div className="max-h-52 space-y-2 overflow-y-auto overscroll-contain pr-1">
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

            {message && (
              <div className="rounded-lg border border-slate-700/60 bg-slate-800/50 px-2 py-1.5 text-[11px] text-slate-300">
                {message}
              </div>
            )}

            {!hasImported && !locked ? (
              <div className="rounded-lg border border-slate-700/60 bg-slate-800/45 px-3 py-2 text-[11px] text-slate-400">
                {isEnglish
                  ? 'Import one workbook containing nickname, participant code, UID, and QQ. Registration and summary sheets are skipped automatically; missing codes can be filled after import.'
                  : '请导入包含昵称、选手编号、UID、QQ 的选手信息表。报名信息、汇总和总表 Sheet 会自动跳过；缺少编号时可在导入后一键补齐。'}
              </div>
            ) : (
              <>
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
                  <div className="max-h-24 space-y-1 overflow-y-auto rounded-lg border border-rose-500/20 bg-rose-500/5 p-2 text-[10px] text-rose-300">
                    {summary.issues.slice(0, 20).map((issue, index) => (
                      <div key={`${issue.code}-${issue.playerId ?? index}`}>
                        {isEnglish ? issue.messageEn ?? issue.message : issue.message}
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}

            {locked && (
              <div className="flex items-center gap-1.5 text-[10px] text-emerald-400">
                <BadgeCheck className="h-3.5 w-3.5" />
                {isEnglish ? 'UID and participant codes are immutable.' : 'UID 和选手编号已锁定，不可修改。'}
              </div>
            )}
          </div>
    </div>
  );
}

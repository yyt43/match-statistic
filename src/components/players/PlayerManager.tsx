import { ChevronDown, ChevronUp, Edit2, FileText, Trash2, Upload, Users } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useLanguagePreference } from '../../i18n/context';
import { formatText } from '../../i18n/data';
import { useCurrentGroup, useTournamentStore } from '../../store/useTournamentStore';
import {
  getWorkbookImportColumnChoicesFromFile,
  parsePlayerGroupsFromExcel,
  parsePlayerNamesFromText,
  summarizePlayerNameInput,
} from '../../utils/import/playerImport';
import { createPlayersFromNames } from '../../utils/swissPairing';
import { downloadErrorReport } from '../../utils/errorReport';
import { VirtualizedList } from '../common/VirtualizedList';

export function PlayerManager() {
  const currentGroup = useCurrentGroup();
  const { language, t } = useLanguagePreference();
  const isEnglish = language === 'en';
  const { competition, importCompetition, removePlayer, replacePlayers, updatePlayerName } = useTournamentStore();

  const [expanded, setExpanded] = useState(false);
  const [showBatchImport, setShowBatchImport] = useState(false);
  const [batchNames, setBatchNames] = useState('');
  const [playerImportError, setPlayerImportError] = useState<string | null>(null);
  const [playerImportErrorFile, setPlayerImportErrorFile] = useState('');
  const [excelColumnSelections, setExcelColumnSelections] = useState<Record<string, string>>({});
  const [excelColumnChoices, setExcelColumnChoices] = useState<Array<{ sheetName: string; columns: string[]; detectedColumn: string }>>([]);
  const [editingPlayerId, setEditingPlayerId] = useState<string | null>(null);
  const [editNameValue, setEditNameValue] = useState('');
  const playerFileInputRef = useRef<HTMLInputElement>(null);
  const batchImportSummary = useMemo(() => summarizePlayerNameInput(batchNames), [batchNames]);
  const importRuleText = isEnglish
    ? t.importRuleTextZh
    : 'Excel 会优先读取表头包含 姓名 / Name / Player 的列；若没有此列，则按当前表格第一列兜底。用户也可以在导入前手动指定某一列作为选手名称。';

  useEffect(() => {
    setEditingPlayerId(null);
    setEditNameValue('');
    setPlayerImportError(null);
    setExcelColumnChoices([]);
    setExcelColumnSelections({});
  }, [competition.id]);

  const handleConfirmEditName = () => {
    if (editingPlayerId && editNameValue.trim()) {
      updatePlayerName(editingPlayerId, editNameValue.trim());
      setEditingPlayerId(null);
      setEditNameValue('');
    }
  };

  const handleImportPlayersFromText = () => {
    const names = parsePlayerNamesFromText(batchNames);
    if (names.length === 0) {
      setPlayerImportError(t.textImportNoValidNames);
      return;
    }
    replacePlayers(names);
    setBatchNames('');
    setPlayerImportError(null);
    setShowBatchImport(false);
  };

  const prepareExcelImport = async (file?: File) => {
    const selectedFile = file ?? playerFileInputRef.current?.files?.[0];
    if (!selectedFile) return;

    try {
      const choices = await getWorkbookImportColumnChoicesFromFile(selectedFile);
      setExcelColumnChoices(choices);
      setPlayerImportError(null);
      if (choices.length === 0) setPlayerImportError(t.excelImportEmptySheets);
    } catch (error) {
      console.error(error);
      setPlayerImportError(error instanceof Error ? error.message : t.excelImportFailed);
      setPlayerImportErrorFile(selectedFile.name);
    }
  };

  const handleImportPlayersFromExcel = async () => {
    const selectedFile = playerFileInputRef.current?.files?.[0];
    if (!selectedFile) return;

    try {
      const selectedColumns = Object.fromEntries(
        excelColumnChoices.map(choice => [
          choice.sheetName,
          excelColumnSelections[choice.sheetName] || choice.detectedColumn || choice.columns[0] || '',
        ])
      );
      const groups = await parsePlayerGroupsFromExcel(selectedFile, selectedColumns);
      if (groups.length === 0) {
        setPlayerImportError(t.excelImportNoNames);
        return;
      }

      if (groups.length === 1) {
        replacePlayers(groups[0].names);
        setPlayerImportError(null);
        setShowBatchImport(false);
        resetFileSelection();
        return;
      }

      const nextGroups = groups.map((groupConfig, index) => {
        const template = competition.groups[index] ?? competition.groups[0];
        const fallbackGroupName = formatText(t.defaultGroupName, { index: String(index + 1).padStart(2, '0') });
        const generatedName = (groupConfig.groupName || fallbackGroupName).trim() || fallbackGroupName;
        const totalRounds = template?.totalRounds ?? 5;
        const roundGameTypes = template?.roundGameTypes
          ? [...template.roundGameTypes]
          : new Array(totalRounds).fill(template?.gameType ?? 'bo1');

        return {
          ...(template ?? {
            id: `group-${Date.now()}-${index}`,
            name: generatedName,
            currentRound: 0,
            totalRounds: 5,
            status: 'setup' as const,
            players: [],
            matches: [],
            createdAt: new Date().toISOString(),
            pairingType: 'swiss' as const,
            gameType: 'bo1' as const,
            roundGameTypes: new Array(5).fill('bo1' as const),
          }),
          id: template?.id ?? `group-${Date.now()}-${index}`,
          name: generatedName,
          currentRound: 0,
          status: 'setup' as const,
          players: createPlayersFromNames(groupConfig.names),
          matches: [],
          createdAt: new Date().toISOString(),
          totalRounds,
          pairingType: template?.pairingType ?? 'swiss',
          gameType: template?.gameType ?? 'bo1',
          roundGameTypes,
        };
      });

      importCompetition({ ...competition, groups: nextGroups, currentGroupIndex: 0 });
      setPlayerImportError(null);
      setShowBatchImport(false);
      resetFileSelection();
    } catch (error) {
      console.error(error);
      setPlayerImportError(error instanceof Error ? error.message : t.excelImportFailed);
      setPlayerImportErrorFile(selectedFile.name);
    }
  };

  const resetFileSelection = () => {
    if (playerFileInputRef.current) playerFileInputRef.current.value = '';
    setExcelColumnChoices([]);
    setExcelColumnSelections({});
  };

  return (
    <div className="space-y-2">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between text-xs font-medium text-slate-400 hover:text-slate-300 transition-colors"
      >
        <span className="flex items-center gap-2">
          <Users className="w-3.5 h-3.5" />
          {isEnglish ? 'Player management' : '选手管理'}
          <span className="text-slate-500">({currentGroup.players.length}{isEnglish ? ' players' : '人'})</span>
        </span>
        {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
      </button>

      {expanded && (
        <div className="mt-3 space-y-3">
          <button
            onClick={() => setShowBatchImport(!showBatchImport)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 text-xs font-medium transition-colors"
          >
            <Upload className="w-3.5 h-3.5" />
            {showBatchImport ? (isEnglish ? 'Collapse import' : '收起导入') : (isEnglish ? 'Bulk import' : '批量导入')}
          </button>

          {showBatchImport && (
            <div className="mt-2 space-y-2">
              <textarea
                value={batchNames}
                onChange={event => {
                  setBatchNames(event.target.value);
                  if (playerImportError) setPlayerImportError(null);
                }}
                placeholder={isEnglish ? "Paste like:\nAlice\nBob\nCharlie\nor: Alice, Bob; Charlie" : "支持粘贴：&#10;张三&#10;李四&#10;王五&#10;或：张三, 李四; 王五"}
                className="w-full h-24 px-3 py-2 bg-slate-800/50 border border-slate-700/50 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-gold-500/30 resize-none"
              />
              <div className="flex gap-2">
                <button
                  onClick={handleImportPlayersFromText}
                  className="flex-1 py-2 rounded-lg bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 text-sm font-medium transition-colors flex items-center justify-center gap-2"
                >
                  <FileText className="w-4 h-4" />
                  {isEnglish ? `Import ${batchImportSummary.validNames.length} players` : `导入 ${batchImportSummary.validNames.length} 名选手`}
                </button>
                <input
                  ref={playerFileInputRef}
                  type="file"
                  accept=".xlsx,.xls,.csv,.txt"
                  onChange={async event => prepareExcelImport(event.target.files?.[0])}
                  className="hidden"
                />
                <button
                  onClick={() => playerFileInputRef.current?.click()}
                  className="px-3 py-2 rounded-lg bg-slate-800/50 text-slate-300 hover:bg-slate-700/50 hover:text-white transition-colors text-xs border border-slate-700/50"
                  title={isEnglish ? 'Bulk import player names from Excel / CSV / TXT' : '批量从 Excel / CSV / TXT 导入选手名单'}
                >
                  <Upload className="w-4 h-4" />
                </button>
              </div>
              <div className="rounded-lg border border-slate-700/60 bg-slate-900/40 px-3 py-2 text-[11px] text-slate-300 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span>{isEnglish ? 'Import rules' : '导入规则'}</span>
                  <span className="text-emerald-400">{isEnglish ? 'Prefer name column detection' : '优先识别姓名列'}</span>
                </div>
                <div className="text-slate-400 leading-relaxed">{importRuleText}</div>
              </div>

              {excelColumnChoices.length > 0 && (
                <div className="rounded-lg border border-slate-700/60 bg-slate-900/40 px-3 py-2 text-[11px] text-slate-300 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span>{isEnglish ? 'Header selection' : '表头选择'}</span>
                    <span className="text-emerald-400">{isEnglish ? `${excelColumnChoices.length} sheets` : `${excelColumnChoices.length} 个表格`}</span>
                  </div>
                  <div className="space-y-2">
                    {excelColumnChoices.map(choice => (
                      <label key={choice.sheetName} className="block">
                        <span className="mb-1 block text-slate-400">{choice.sheetName}</span>
                        <select
                          value={excelColumnSelections[choice.sheetName] || choice.detectedColumn || choice.columns[0] || ''}
                          onChange={event => setExcelColumnSelections(previous => ({ ...previous, [choice.sheetName]: event.target.value }))}
                          className="w-full rounded-lg border border-slate-700 bg-slate-800 px-2 py-1.5 text-slate-200 focus:outline-none focus:border-gold-500/50"
                        >
                          {choice.columns.length === 0 ? (
                            <option value="">{isEnglish ? 'No available headers' : '无可用表头'}</option>
                          ) : (
                            choice.columns.map(column => <option key={column} value={column}>{column}</option>)
                          )}
                        </select>
                      </label>
                    ))}
                    <button
                      onClick={handleImportPlayersFromExcel}
                      className="w-full py-2 rounded-lg bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 text-sm font-medium transition-colors"
                    >
                      {isEnglish ? 'Import using current headers' : '使用当前表头导入'}
                    </button>
                  </div>
                </div>
              )}

              {batchNames.trim() && (
                <div className="rounded-lg border border-slate-700/60 bg-slate-900/40 px-3 py-2 text-[11px] text-slate-300 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span>{isEnglish ? 'Import preview' : '导入预览'}</span>
                    <span className="text-emerald-400">{isEnglish ? `Available ${batchImportSummary.validNames.length}` : `可用 ${batchImportSummary.validNames.length}`}</span>
                  </div>
                  <div className="flex gap-3 text-slate-400">
                    <span>{isEnglish ? `Duplicates ${batchImportSummary.duplicateNames.length}` : `重复 ${batchImportSummary.duplicateNames.length}`}</span>
                    <span>{isEnglish ? `Ignored ${batchImportSummary.ignoredEntries.length}` : `忽略 ${batchImportSummary.ignoredEntries.length}`}</span>
                  </div>
                  {batchImportSummary.duplicateNames.length > 0 && (
                    <div className="text-amber-300">
                      {isEnglish ? `Duplicates: ${batchImportSummary.duplicateNames.slice(0, 5).join(', ')}` : `重复：${batchImportSummary.duplicateNames.slice(0, 5).join('、')}`}
                      {batchImportSummary.duplicateNames.length > 5 ? '…' : ''}
                    </div>
                  )}
                  {batchImportSummary.ignoredEntries.length > 0 && (
                    <div className="text-slate-400">
                      {isEnglish ? `Ignored: ${batchImportSummary.ignoredEntries.slice(0, 5).join(', ')}` : `忽略：${batchImportSummary.ignoredEntries.slice(0, 5).join('、')}`}
                      {batchImportSummary.ignoredEntries.length > 5 ? '…' : ''}
                    </div>
                  )}
                </div>
              )}
              {playerImportError && (
                <div className="px-3 py-2 bg-rose-500/10 text-rose-400 rounded-lg text-xs space-y-2">
                  <div>{playerImportError}</div>
                  <button
                    onClick={() => downloadErrorReport('excel-player-import', playerImportError, {
                      fileName: playerImportErrorFile,
                    })}
                    className="text-[11px] underline hover:text-rose-300"
                  >
                    {t.downloadErrorReport}
                  </button>
                </div>
              )}
            </div>
          )}

          <VirtualizedList
            items={currentGroup.players}
            itemHeight={40}
            getKey={player => player.id}
            className="max-h-48"
            renderItem={(player, index) => (
              <div className="h-full pb-1">
                <div className="group flex h-full items-center gap-2 rounded-lg bg-slate-800/30 px-3 transition-colors hover:bg-slate-800/50">
                  <span className="text-slate-500 font-mono text-xs w-6">{index + 1}.</span>
                  {editingPlayerId === player.id ? (
                    <>
                      <input
                        type="text"
                        value={editNameValue}
                        onChange={event => setEditNameValue(event.target.value)}
                        onKeyDown={event => {
                          if (event.key === 'Enter') handleConfirmEditName();
                          if (event.key === 'Escape') {
                            setEditingPlayerId(null);
                            setEditNameValue('');
                          }
                        }}
                        autoFocus
                        className="flex-1 px-2 py-1 bg-slate-700 border border-gold-500/50 rounded text-sm text-white focus:outline-none"
                      />
                      <button onClick={handleConfirmEditName} className="px-2 py-1 rounded text-xs bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30">
                        {isEnglish ? 'Confirm' : '确认'}
                      </button>
                    </>
                  ) : (
                    <>
                      <span className="flex-1 text-sm text-slate-300 truncate">{player.name}</span>
                      <button
                        onClick={() => {
                          setEditingPlayerId(player.id);
                          setEditNameValue(player.name);
                        }}
                        className="p-1 rounded hover:bg-slate-700 text-slate-400 hover:text-white transition-colors opacity-0 group-hover:opacity-100"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => removePlayer(player.id)}
                        className="p-1 rounded hover:bg-rose-500/10 text-slate-400 hover:text-rose-400 transition-colors opacity-0 group-hover:opacity-100"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </>
                  )}
                </div>
              </div>
            )}
          />
        </div>
      )}
    </div>
  );
}

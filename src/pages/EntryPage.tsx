import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileUp, Languages, Layers, PlayCircle, Swords, Trophy } from 'lucide-react';
import type { TournamentCompetition } from '../types';
import { useLanguagePreference } from '../i18n/context';
import { useTournamentStore } from '../store/useTournamentStore';
import { createPoetryCupS3Competition } from '../store/multiStageFactory';
import { getCompetitionKind } from '../utils/multiStage';
import { importCompetitionFromFile } from '../utils/export/fileStorage';
import { ConfirmDialog } from '../components/common/ConfirmDialog';
import { StorageBanner } from '../components/common/StorageBanner';
import { WriterLockBanner } from '../components/common/WriterLockBanner';
import { AppUpdatePrompt } from '../components/common/AppUpdatePrompt';

type EntryKind = 'single_stage' | 'multi_stage' | 'poetry_cup_s3';

interface EntryOption {
  kind: EntryKind;
  title: string;
  description: string;
  highlights: string[];
  badge?: string;
}

export default function EntryPage() {
  const navigate = useNavigate();
  const { language, setLanguage, t } = useLanguagePreference();
  const isEnglish = language === 'en';
  const competition = useTournamentStore(state => state.competition);
  const initCompetition = useTournamentStore(state => state.initCompetition);
  const initMultiStageCompetition = useTournamentStore(state => state.initMultiStageCompetition);
  const importCompetition = useTournamentStore(state => state.importCompetition);
  const loadSavedCompetition = useTournamentStore(state => state.loadSavedCompetition);

  const [hasSavedEvent, setHasSavedEvent] = useState(false);
  const [pendingKind, setPendingKind] = useState<EntryKind | null>(null);
  const [pendingImport, setPendingImport] = useState<TournamentCompetition | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let active = true;
    void loadSavedCompetition().then(loaded => {
      if (active) setHasSavedEvent(loaded);
    });
    return () => {
      active = false;
    };
  }, [loadSavedCompetition]);

  const openKind = (kind: EntryKind) => {
    if (kind === 'multi_stage') {
      navigate('/multi-stage');
      return;
    }
    if (kind === 'poetry_cup_s3') {
      initMultiStageCompetition(createPoetryCupS3Competition());
      navigate('/workspace');
      return;
    }
    initCompetition('新建赛事');
    navigate('/workspace');
  };

  const chooseKind = (kind: EntryKind) => {
    if (hasSavedEvent) {
      setPendingKind(kind);
      return;
    }
    openKind(kind);
  };

  const importedKindLabel = (competition: TournamentCompetition) => {
    const kind = getCompetitionKind(competition);
    if (kind === 'poetry_cup_s3') return isEnglish ? 'Poetry Cup S3' : '诗意杯 S3（专用）';
    if (kind === 'multi_stage') return isEnglish ? 'Multi-stage event' : '多阶段赛事';
    return isEnglish ? 'Single-stage event' : '单阶段赛事';
  };

  const applyImported = (competition: TournamentCompetition) => {
    importCompetition(competition);
    navigate('/workspace');
  };

  const handleImportFile = async (file: File) => {
    try {
      const data = await importCompetitionFromFile(file);
      setImportError(null);
      if (hasSavedEvent) {
        setPendingImport(data);
        return;
      }
      applyImported(data);
    } catch (error) {
      setImportError(error instanceof Error ? error.message : (isEnglish ? 'Import failed' : '导入失败'));
    }
  };

  const options: EntryOption[] = [
    {
      kind: 'single_stage',
      title: isEnglish ? 'Single-stage event' : '单阶段赛事',
      description: isEnglish
        ? 'The familiar workspace with one stage that can hold several groups.'
        : '沿用现有赛事工作区，一个赛段内可包含多个小组。',
      highlights: isEnglish
        ? ['Groups keep their own formats', 'Import rosters with automatic numbering', 'Same flow as 0.5.0']
        : ['各小组可独立设置赛制', '导入名单并自动补齐编号', '与 0.5.0 操作流程一致'],
    },
    {
      kind: 'multi_stage',
      title: isEnglish ? 'Multi-stage event (test feature)' : '多阶段赛事（测试功能）',
      description: isEnglish
        ? 'Configure stages and formats first, then work in the same workspace.'
        : '先设置赛段与赛制，再进入相同的赛事工作区。',
      highlights: isEnglish
        ? ['Define stage order and formats', 'Several groups per stage', 'Format tab shows the rules summary']
        : ['自定义赛段顺序与赛制', '每个赛段可包含多个小组', '赛制管理显示规则说明'],
      badge: isEnglish ? 'Not final' : '功能未定稿',
    },
    {
      kind: 'poetry_cup_s3',
      title: isEnglish ? 'Poetry Cup S3 (dedicated)' : '诗意杯 S3（专用）',
      description: isEnglish
        ? 'Locked three-stage template: group stage, breakout stage and playoffs.'
        : '锁定的小组赛、突围赛、淘汰赛三赛段模板。',
      highlights: isEnglish
        ? ['Rules, groups and seeds are locked', 'Only import the A-D rosters', 'Format tab shows the S3 rules']
        : ['规则、分组与签位全部锁定', '只需导入 A-D 四组名单', '赛制管理显示 S3 规则说明'],
      badge: isEnglish ? 'Locked template' : '规则锁定',
    },
  ];

  return (
    <div className="min-h-screen flex flex-col relative">
      <StorageBanner />
      <WriterLockBanner />
      <AppUpdatePrompt />

      <button
        onClick={() => setLanguage(isEnglish ? 'zh' : 'en')}
        className="fixed top-4 right-4 z-50 flex items-center gap-1.5 rounded-full border border-slate-700/40 bg-slate-800/60 px-2.5 py-2 text-xs font-medium text-slate-200 backdrop-blur-sm transition-all hover:border-gold-500/30 hover:bg-slate-700 hover:text-gold-400"
        title={isEnglish ? 'Switch to Chinese' : 'Switch to English'}
      >
        <Languages className="w-3.5 h-3.5" />
        <span>{t.swapLanguage}</span>
      </button>

      <header className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-indigo-900/50 to-transparent" />
        <div className="absolute top-0 left-1/4 h-96 w-96 rounded-full bg-gold-500/10 blur-3xl" />
        <div className="absolute top-0 right-1/4 h-96 w-96 rounded-full bg-indigo-700/20 blur-3xl" />

        <div className="relative px-4 py-6 sm:px-6 sm:py-8">
          <div className="mx-auto flex max-w-7xl items-center gap-4">
            <div className="relative">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-gold-400 to-gold-600 shadow-lg shadow-gold-500/30">
                <Trophy className="h-7 w-7 text-indigo-900" />
              </div>
              <div className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full border-2 border-indigo-900 bg-emerald-500">
                <Swords className="h-3 w-3 text-white" />
              </div>
            </div>

            <div className="min-w-0">
              <h1 className="font-display gold-gradient truncate text-xl font-bold tracking-wider sm:text-2xl md:text-3xl">
                {t.appName}
              </h1>
              <p className="mt-1 text-xs text-slate-400 sm:text-sm">
                {isEnglish ? 'Choose a tournament type to start' : '选择赛事类型后进入对应的设置界面'}
              </p>
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 px-3 py-4 sm:px-4 md:px-6">
        <div className="mx-auto max-w-7xl space-y-4">
          <section className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-700/50 bg-slate-800/50 p-3">
            <div className="min-w-0 flex-1">
              <div className="text-xs font-medium text-slate-300">
                {isEnglish ? 'Import tournament data' : '导入赛事数据'}
              </div>
              <p className="mt-0.5 text-[11px] text-slate-500">
                {isEnglish
                  ? 'Choose an exported JSON file; the type is detected automatically.'
                  : '选择导出的 JSON 文件，自动识别单阶段 / 多阶段 / 诗意杯 S3。'}
              </p>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              className="hidden"
              onChange={event => {
                const file = event.target.files?.[0];
                if (fileInputRef.current) fileInputRef.current.value = '';
                if (file) void handleImportFile(file);
              }}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex shrink-0 items-center justify-center gap-1.5 rounded-lg border border-slate-700/50 bg-slate-800/50 px-3 py-2 text-xs text-slate-300 transition-colors hover:bg-slate-700/50 hover:text-white"
            >
              <FileUp className="h-3.5 w-3.5" />
              {isEnglish ? 'Choose JSON' : '选择 JSON 文件'}
            </button>
            {importError && (
              <p className="w-full rounded bg-rose-500/10 px-2 py-1.5 text-[11px] text-rose-300">
                {importError}
              </p>
            )}
          </section>

          {hasSavedEvent && (
            <button
              onClick={() => navigate('/workspace')}
              className="flex w-full items-center justify-between gap-3 rounded-lg border border-gold-500/30 bg-gold-500/10 px-4 py-3 text-left transition-colors hover:bg-gold-500/15"
            >
              <span className="flex min-w-0 items-center gap-3">
                <PlayCircle className="h-5 w-5 shrink-0 text-gold-400" />
                <span className="min-w-0">
                  <span className="block text-xs text-gold-400/80">
                    {isEnglish ? 'Continue current event' : '继续当前赛事'}
                  </span>
                  <span className="block truncate text-sm font-medium text-slate-100">
                    {competition.name}
                  </span>
                </span>
              </span>
              <span className="shrink-0 text-xs text-slate-400">
                {isEnglish ? 'Open workspace' : '进入赛事工作区'}
              </span>
            </button>
          )}

          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            {options.map(option => (
              <section
                key={option.kind}
                className="flex flex-col gap-3 rounded-lg border border-slate-700/50 bg-slate-800/50 p-4 transition-colors hover:border-gold-500/30"
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-700/60 text-gold-400">
                    {option.kind === 'single_stage'
                      ? <Trophy className="h-4 w-4" />
                      : <Layers className="h-4 w-4" />}
                  </span>
                  {option.badge && (
                    <span className="shrink-0 rounded bg-slate-700/60 px-1.5 py-0.5 text-[10px] text-slate-400">
                      {option.badge}
                    </span>
                  )}
                </div>

                <div className="space-y-1.5">
                  <h2 className="text-sm font-semibold text-slate-100">{option.title}</h2>
                  <p className="text-xs leading-relaxed text-slate-400">{option.description}</p>
                </div>

                <ul className="flex-1 space-y-1.5 text-[11px] text-slate-500">
                  {option.highlights.map(highlight => (
                    <li key={highlight} className="flex gap-1.5">
                      <span className="text-gold-500/70">·</span>
                      <span>{highlight}</span>
                    </li>
                  ))}
                </ul>

                <button
                  onClick={() => chooseKind(option.kind)}
                  className="flex w-full items-center justify-center gap-2 rounded-lg border border-gold-500/40 bg-gold-500/20 py-2.5 text-sm font-medium text-gold-400 transition-colors hover:bg-gold-500/30"
                >
                  {isEnglish ? 'Open setup' : '进入设置'}
                </button>
              </section>
            ))}
          </div>
        </div>
      </main>

      <footer className="py-4 text-center text-xs text-slate-600">
        <div>{t.footerCopyright}</div>
      </footer>

      <ConfirmDialog
        isOpen={pendingKind !== null || pendingImport !== null}
        onClose={() => {
          setPendingKind(null);
          setPendingImport(null);
        }}
        title={isEnglish ? 'Replace current event' : '替换当前赛事'}
        message={
          pendingImport
            ? (isEnglish
                ? `Detected ${importedKindLabel(pendingImport)}. Importing will replace "${competition.name}". Continue?`
                : `识别为${importedKindLabel(pendingImport)}。导入后将替换当前赛事「${competition.name}」，是否继续？`)
            : (isEnglish
                ? `The current event "${competition.name}" will be replaced. Continue?`
                : `当前赛事「${competition.name}」将被替换，是否继续？`)
        }
        confirmText={isEnglish ? 'Continue' : '继续'}
        onConfirm={() => {
          if (pendingImport) {
            applyImported(pendingImport);
            setPendingImport(null);
            return;
          }
          const kind = pendingKind;
          setPendingKind(null);
          if (kind) openKind(kind);
        }}
      />
    </div>
  );
}

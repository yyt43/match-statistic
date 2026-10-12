import { Lock, ShieldCheck } from 'lucide-react';
import { useLanguagePreference } from '../../i18n/context';
import { useTournamentStore } from '../../store/useTournamentStore';
import {
  describeGroupConfig,
  describeStageKind,
  describeStageSource,
  getCompetitionKind,
  getOrderedStages,
  getPoetryCupS3Rules,
  getStageGroups,
} from '../../utils/multiStage';

/** 多阶段赛事与 S3 专用的只读规则说明，替代单阶段的赛制编辑器。 */
export function CompetitionRulesSummary() {
  const competition = useTournamentStore(state => state.competition);
  const { language } = useLanguagePreference();
  const isEnglish = language === 'en';
  const isS3 = getCompetitionKind(competition) === 'poetry_cup_s3';
  const stages = getOrderedStages(competition);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-xs font-medium text-slate-300">
        <ShieldCheck className="h-3.5 w-3.5 text-gold-400" />
        {isS3
          ? (isEnglish ? 'Poetry Cup S3 rules' : 'S3 规则说明')
          : (isEnglish ? 'Stage rules' : '规则说明')}
      </div>

      {isS3 && (
        <ul className="space-y-1.5 rounded-lg bg-slate-800/50 p-3 text-[11px] leading-relaxed text-slate-400">
          {getPoetryCupS3Rules(isEnglish).map(rule => (
            <li key={rule}>{rule}</li>
          ))}
        </ul>
      )}

      <ol className="space-y-2">
        {stages.map((stage, index) => (
          <li key={stage.id} className="space-y-2 rounded-lg bg-slate-800/50 p-3">
            <div className="flex items-center gap-2">
              <span className="shrink-0 text-[10px] text-slate-500">
                {isEnglish ? `Stage ${index + 1}` : `第${index + 1}赛段`}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm text-slate-200">{stage.name}</span>
              {stage.locked && <Lock className="h-3 w-3 shrink-0 text-gold-400" />}
            </div>

            <div className="flex flex-wrap gap-1.5 text-[10px] text-slate-400">
              <span className="rounded bg-slate-700/60 px-1.5 py-0.5">
                {describeStageKind(stage.kind, isEnglish)}
              </span>
              <span className="rounded bg-slate-700/60 px-1.5 py-0.5">
                {describeStageSource(competition, stage, isEnglish)}
              </span>
            </div>

            <ul className="space-y-1">
              {getStageGroups(competition, stage).map(group => (
                <li
                  key={group.id}
                  className="flex items-center justify-between gap-2 text-[11px] text-slate-400"
                >
                  <span className="min-w-0 truncate">{group.name}</span>
                  <span className="shrink-0 tabular-nums text-slate-500">
                    {describeGroupConfig(group, isEnglish)}
                  </span>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ol>

      <p className="text-[10px] leading-relaxed text-slate-500">
        {isS3
          ? (isEnglish
              ? 'Stage structure, groups and rules are fixed by the Poetry Cup S3 template.'
              : '赛段结构、分组与规则由诗意杯 S3 模板固定，比赛期间不可修改。')
          : (isEnglish
              ? 'Stages and formats are defined on the multi-stage setup page before the event starts.'
              : '赛段与赛制在开赛前由多阶段设置页确定。')}
      </p>
    </div>
  );
}

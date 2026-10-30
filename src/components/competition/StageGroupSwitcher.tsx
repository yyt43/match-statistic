import { useState } from 'react';
import { Edit2, Minus, Plus } from 'lucide-react';
import { useLanguagePreference } from '../../i18n/context';
import { useTournamentStore, useCurrentGroup } from '../../store/useTournamentStore';
import { useShallow } from 'zustand/react/shallow';
import { getOrderedStages, getStageGroups } from '../../utils/multiStage';

/** 赛段与小组切换器：统一放在工作区左上角，开赛前后位置一致。 */
export function StageGroupSwitcher() {
  const currentGroup = useCurrentGroup();
  const { language } = useLanguagePreference();
  const isEnglish = language === 'en';
  const {
    competition,
    setCurrentGroup,
    addGroup,
    removeGroup,
    updateGroupName,
  } = useTournamentStore(useShallow(state => ({
    competition: state.competition,
    setCurrentGroup: state.setCurrentGroup,
    addGroup: state.addGroup,
    removeGroup: state.removeGroup,
    updateGroupName: state.updateGroupName,
  })));
  const [editingGroupIndex, setEditingGroupIndex] = useState<number | null>(null);
  const [editGroupNameValue, setEditGroupNameValue] = useState('');

  const stageList = getOrderedStages(competition);
  const currentStage = stageList.find(stage => stage.groupIds.includes(currentGroup.id));
  const visibleGroups = stageList.length > 0
    ? [
        ...(currentStage ? getStageGroups(competition, currentStage) : []),
        // 兜底：不属于任何赛段的小组也要能切换。
        ...competition.groups.filter(group =>
          !group.stageId || !stageList.some(stage => stage.id === group.stageId)
        ),
      ]
    : competition.groups;

  return (
    <div className="rounded-lg border border-slate-700/50 bg-slate-800/40 px-3 py-2">
      {stageList.length > 0 && (
        <div className="mb-2 flex min-w-0 gap-1 overflow-x-auto">
          {stageList.map(stage => {
            const isActiveStage = currentStage?.id === stage.id;
            const firstGroupIndex = competition.groups.findIndex(
              group => group.id === stage.groupIds[0]
            );
            return (
              <button
                key={stage.id}
                onClick={() => {
                  if (firstGroupIndex >= 0) setCurrentGroup(firstGroupIndex);
                }}
                className={`shrink-0 rounded-md border px-2 py-1 text-xs font-medium transition-colors ${
                  isActiveStage
                    ? 'border-indigo-400/60 bg-indigo-500/20 text-indigo-200'
                    : 'border-slate-700/60 bg-slate-800/50 text-slate-400 hover:border-slate-600 hover:text-slate-200'
                }`}
              >
                {stage.name}
              </button>
            );
          })}
        </div>
      )}
      <div className="flex items-center gap-2 text-xs">
        <span className="shrink-0 text-slate-500">{isEnglish ? 'Current group' : '当前小组'}</span>
        {editingGroupIndex === competition.currentGroupIndex ? (
          <input
            autoFocus
            value={editGroupNameValue}
            onChange={event => setEditGroupNameValue(event.target.value)}
            onBlur={() => {
              if (editGroupNameValue.trim()) {
                updateGroupName(competition.currentGroupIndex, editGroupNameValue);
              }
              setEditingGroupIndex(null);
            }}
            onKeyDown={event => {
              if (event.key === 'Enter' && editGroupNameValue.trim()) {
                updateGroupName(competition.currentGroupIndex, editGroupNameValue);
                setEditingGroupIndex(null);
              } else if (event.key === 'Escape') {
                setEditingGroupIndex(null);
              }
            }}
            className="min-w-0 flex-1 rounded-md border border-gold-500/50 bg-slate-900/70 px-2 py-1 text-xs text-slate-200 outline-none"
          />
        ) : (
          <div className="flex min-w-0 flex-1 gap-1 overflow-x-auto">
            {visibleGroups.map((group, index) => {
              const groupIndex = stageList.length > 0
                ? competition.groups.findIndex(item => item.id === group.id)
                : index;
              const isActive = groupIndex === competition.currentGroupIndex;
              return (
                <button
                  key={group.id}
                  onClick={() => setCurrentGroup(groupIndex)}
                  className={`shrink-0 rounded-md border px-2 py-1 text-xs font-medium transition-colors ${
                    isActive
                      ? 'border-gold-500/50 bg-gold-500/15 text-gold-400'
                      : 'border-slate-700/60 bg-slate-800/50 text-slate-400 hover:border-slate-600 hover:text-slate-200'
                  }`}
                >
                  {group.name}
                </button>
              );
            })}
          </div>
        )}
        {stageList.length === 0 && (
          <button
            onClick={() => addGroup()}
            className="shrink-0 rounded-md border border-emerald-500/25 bg-emerald-500/10 p-1 text-emerald-300 hover:bg-emerald-500/20"
            title={isEnglish ? 'Add group' : '添加小组'}
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        )}
        <button
          onClick={() => {
            setEditingGroupIndex(competition.currentGroupIndex);
            setEditGroupNameValue(currentGroup.name);
          }}
          className="shrink-0 rounded-md border border-slate-700/60 bg-slate-800/50 p-1 text-slate-400 hover:text-gold-300"
          title={isEnglish ? 'Rename current group' : '修改当前小组名称'}
        >
          <Edit2 className="h-3.5 w-3.5" />
        </button>
        {stageList.length === 0 && (
          <button
            onClick={() => removeGroup(competition.currentGroupIndex)}
            disabled={competition.groups.length <= 1}
            className="shrink-0 rounded-md border border-rose-500/25 bg-rose-500/10 p-1 text-rose-300 hover:bg-rose-500/20 disabled:cursor-not-allowed disabled:opacity-30"
            title={isEnglish ? 'Delete current group' : '删除当前小组'}
          >
            <Minus className="h-3.5 w-3.5" />
          </button>
        )}
        <span className="shrink-0 text-slate-600">
          {currentGroup.players.length}{isEnglish ? '' : '人'}
        </span>
      </div>
    </div>
  );
}

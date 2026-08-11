import type { TournamentCompetition } from '../types';

/**
 * 将比赛数据导出为JSON文件
 */
export function exportCompetitionToFile(competition: TournamentCompetition): void {
  const dataStr = JSON.stringify(competition, null, 2);
  const blob = new Blob([dataStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  
  const link = document.createElement('a');
  link.href = url;
  link.download = `${competition.name}-${new Date().toISOString().split('T')[0]}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * 从文件导入比赛数据
 */
export function importCompetitionFromFile(file: File): Promise<TournamentCompetition> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = (event) => {
      try {
        const content = event.target?.result as string;
        const data = JSON.parse(content);
        
        // 验证数据格式
        if (!validateCompetitionData(data)) {
          reject(new Error('无效的比赛数据格式'));
          return;
        }
        
        resolve(data as TournamentCompetition);
      } catch {
        reject(new Error('解析文件失败，请确保文件格式正确'));
      }
    };
    
    reader.onerror = () => {
      reject(new Error('读取文件失败'));
    };
    
    reader.readAsText(file);
  });
}

/**
 * 验证比赛数据格式
 */
function validateCompetitionData(data: unknown): boolean {
  if (!data || typeof data !== 'object') return false;
  
  const competition = data as Record<string, unknown>;
  
  // 检查必要字段
  if (typeof competition.id !== 'string') return false;
  if (typeof competition.name !== 'string') return false;
  if (!Array.isArray(competition.groups)) return false;
  if (typeof competition.currentGroupIndex !== 'number') return false;
  
  // 检查每个小组的数据
  for (const group of competition.groups) {
    if (!group || typeof group !== 'object') return false;
    const g = group as Record<string, unknown>;
    
    if (typeof g.id !== 'string') return false;
    if (typeof g.name !== 'string') return false;
    if (typeof g.currentRound !== 'number') return false;
    if (typeof g.totalRounds !== 'number') return false;
    if (typeof g.status !== 'string') return false;
    if (!Array.isArray(g.players)) return false;
    if (!Array.isArray(g.matches)) return false;
    if (typeof g.gameType !== 'string') return false;
  }
  
  return true;
}
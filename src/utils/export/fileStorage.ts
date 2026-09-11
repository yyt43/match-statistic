import type { TournamentCompetition } from '../../types';
import { validateCompetitionData } from '../schema';

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

        const validation = validateCompetitionData(data);
        if (!validation.success) {
          reject(new Error(`Invalid tournament data: ${validation.message}`));
          return;
        }

        resolve(validation.data as TournamentCompetition);
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

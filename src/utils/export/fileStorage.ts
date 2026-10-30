import type { TournamentCompetition } from '../../types';
import type {
  JsonImportWorkerRequest,
  JsonImportWorkerResponse,
} from '../../workers/jsonImportWorker';
import { createAbortError, throwIfAborted } from '../async';
import {
  IMPORT_TIMEOUT_MS,
  BackupImportError,
  assertImportFileSize,
  buildCompetitionBackup,
  prepareImportedCompetitionText,
  restoreBackupImportError,
} from '../import/competitionBackup';
import { downloadBlob } from './download';

/**
 * 将比赛数据导出为JSON文件（带格式信封，导入时可识别版本并走迁移链）
 */
export function exportCompetitionToFile(competition: TournamentCompetition): void {
  const dataStr = JSON.stringify(buildCompetitionBackup(competition), null, 2);
  const blob = new Blob([dataStr], { type: 'application/json' });
  downloadBlob(blob, `${competition.name}-${new Date().toISOString().split('T')[0]}.json`);
}

export interface ImportCompetitionOptions {
  /** 取消导入：中止后立即终止 Worker。 */
  signal?: AbortSignal;
  /** 解析超时时间，默认 30 秒；超时后终止 Worker，避免界面一直等待。 */
  timeoutMs?: number;
}

/**
 * 从文件导入比赛数据：大小预检 → 迁移链 → 数据校验。
 * 有 Worker 的环境在后台线程读取并解析，主线程不会被大文件卡住。
 */
export async function importCompetitionFromFile(
  file: File,
  options: ImportCompetitionOptions = {}
): Promise<TournamentCompetition> {
  assertImportFileSize(file.size);
  throwIfAborted(options.signal);

  // 测试等没有 Worker 的环境降级到主线程，仍复用同一套迁移与校验逻辑。
  if (typeof Worker === 'undefined') {
    return parseInMainThread(file, options.signal);
  }

  let worker: Worker;
  try {
    worker = new Worker(
      new URL('../../workers/jsonImportWorker.ts', import.meta.url),
      { type: 'module' }
    );
  } catch {
    // 浏览器策略拒绝创建 Worker 时退回到主线程，导入功能本身保持可用。
    return parseInMainThread(file, options.signal);
  }

  return parseInWorker(worker, file, options);
}

function parseInWorker(
  worker: Worker,
  file: File,
  options: ImportCompetitionOptions
): Promise<TournamentCompetition> {
  const timeoutMs = options.timeoutMs ?? IMPORT_TIMEOUT_MS;
  const id = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);

  return new Promise<TournamentCompetition>((resolve, reject) => {
    let finished = false;

    function finish(): boolean {
      if (finished) return false;
      finished = true;
      window.clearTimeout(timeoutId);
      options.signal?.removeEventListener('abort', handleAbort);
      worker.terminate();
      return true;
    }
    function handleAbort(): void {
      if (finish()) reject(createAbortError());
    }
    function handleTimeout(): void {
      if (!finish()) return;
      reject(new BackupImportError(
        'timeout',
        `Parsing the backup timed out after ${Math.round(timeoutMs / 1000)} seconds.`
      ));
    }

    const timeoutId = window.setTimeout(handleTimeout, timeoutMs);
    options.signal?.addEventListener('abort', handleAbort, { once: true });

    worker.onmessage = (event: MessageEvent<JsonImportWorkerResponse>) => {
      if (event.data.id !== id) return;
      if (!finish()) return;
      if ('error' in event.data) {
        reject(restoreBackupImportError(event.data.error));
        return;
      }
      resolve(event.data.data);
    };
    worker.onerror = (event: ErrorEvent) => {
      if (!finish()) return;
      reject(new BackupImportError(
        'worker-unavailable',
        event.message || 'The JSON import worker failed to start.'
      ));
    };

    const request: JsonImportWorkerRequest = { id, type: 'parse-backup', file };
    worker.postMessage(request);
  });
}

async function parseInMainThread(
  file: File,
  signal?: AbortSignal
): Promise<TournamentCompetition> {
  let text: string;
  try {
    text = await file.text();
  } catch (error) {
    throw new BackupImportError(
      'read-failed',
      'Failed to read the backup file.',
      error instanceof Error ? error.message : String(error)
    );
  }
  throwIfAborted(signal);
  return prepareImportedCompetitionText(text);
}

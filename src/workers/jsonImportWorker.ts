/// <reference lib="webworker" />

import type { TournamentCompetition } from '../types';
import {
  BackupImportError,
  prepareImportedCompetitionText,
  toBackupImportErrorPayload,
  type BackupImportErrorPayload,
} from '../utils/import/competitionBackup';

export interface JsonImportWorkerRequest {
  id: string;
  type: 'parse-backup';
  file: File;
}

export type JsonImportWorkerResponse =
  | { id: string; data: TournamentCompetition }
  | { id: string; error: BackupImportErrorPayload };

// 大文件在 Worker 内读取+解析+迁移+校验，主线程只接收结果，避免长时间阻塞界面。
self.onmessage = async (event: MessageEvent<JsonImportWorkerRequest>) => {
  const request = event.data;
  if (request.type !== 'parse-backup') return;

  try {
    let text: string;
    try {
      text = await request.file.text();
    } catch (error) {
      throw new BackupImportError(
        'read-failed',
        'Failed to read the backup file.',
        error instanceof Error ? error.message : String(error)
      );
    }
    const data = prepareImportedCompetitionText(text);
    const response: JsonImportWorkerResponse = { id: request.id, data };
    self.postMessage(response);
  } catch (error) {
    const response: JsonImportWorkerResponse = {
      id: request.id,
      error: toBackupImportErrorPayload(error),
    };
    self.postMessage(response);
  }
};

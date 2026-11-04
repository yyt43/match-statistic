import {
  BackupImportError,
  IMPORT_TIMEOUT_MS,
  MAX_IMPORT_FILE_BYTES,
} from '../import/competitionBackup';

const IMPORT_LIMIT_MB = Math.round(MAX_IMPORT_FILE_BYTES / (1024 * 1024));
const IMPORT_TIMEOUT_SECONDS = Math.round(IMPORT_TIMEOUT_MS / 1000);

/** 把导入层错误码转成可读提示；版本号、校验细节等放在括号里便于排查。 */
export function describeImportError(error: unknown, isEnglish: boolean): string {
  if (!(error instanceof BackupImportError)) {
    return error instanceof Error ? error.message : (isEnglish ? 'Import failed' : '导入失败');
  }

  switch (error.code) {
    case 'too-large':
      return isEnglish
        ? `The backup file is larger than ${IMPORT_LIMIT_MB} MB and was not imported.`
        : `备份文件超过 ${IMPORT_LIMIT_MB} MB 上限，已拒绝导入。`;
    case 'invalid-json':
      return isEnglish
        ? 'The file is not valid JSON and may be corrupted.'
        : '文件不是有效的 JSON，可能已损坏。';
    case 'invalid-format':
      return isEnglish
        ? 'Unrecognized backup format. Choose a JSON file exported by this app.'
        : '无法识别的备份格式，请选择本应用导出的 JSON 文件。';
    case 'unsupported-version':
      return isEnglish
        ? `This backup comes from a newer app version (${error.detail ?? 'unknown'}) and cannot be read.`
        : `备份数据来自更新版本的应用（${error.detail ?? '未知版本'}），当前版本无法读取。`;
    case 'invalid-data':
      return isEnglish
        ? `Tournament data failed validation: ${error.detail ?? error.message}`
        : `赛事数据校验失败：${error.detail ?? error.message}`;
    case 'timeout':
      return isEnglish
        ? `Parsing did not finish within ${IMPORT_TIMEOUT_SECONDS} seconds, import cancelled.`
        : `解析超过 ${IMPORT_TIMEOUT_SECONDS} 秒仍未完成，已取消导入。`;
    case 'worker-unavailable':
      return isEnglish
        ? 'The background parser could not start in this browser, import failed.'
        : '当前浏览器无法启动后台解析，导入失败。';
    case 'read-failed':
      return isEnglish
        ? 'Failed to read the file. Choose it again.'
        : '读取文件失败，请重新选择。';
    case 'aborted':
      return isEnglish ? 'Import cancelled.' : '已取消导入。';
    case 'internal':
      return isEnglish ? `Import failed: ${error.message}` : `导入失败：${error.message}`;
    default:
      return error.message;
  }
}

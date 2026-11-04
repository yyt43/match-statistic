import type { EvidencePolicy, EvidenceVerificationStatus } from '../../types';

export const EVIDENCE_POLICY_VALUES: EvidencePolicy[] = ['off', 'required', 'strict'];

export const EVIDENCE_POLICY_LABELS: Record<EvidencePolicy, { zh: string; en: string; description: { zh: string; en: string } }> = {
  off: {
    zh: '关闭（截图可选）',
    en: 'Off (screenshots optional)',
    description: {
      zh: '缺少截图不阻塞；证据不符或图片不清的行会被拦住。',
      en: 'Missing screenshots never block. Only mismatched or unreadable evidence is held.',
    },
  },
  required: {
    zh: '要求提供截图',
    en: 'Require screenshots',
    description: {
      zh: '每行必须填写截图引用；未核验的行按「待核验」写入，可事后补核。',
      en: 'Every row needs an evidence reference. Unverified rows are imported as pending and can be reviewed later.',
    },
  },
  strict: {
    zh: '严格：必须核验通过',
    en: 'Strict: verified only',
    description: {
      zh: '只有标记为「核验通过」的行才允许写入成绩。',
      en: 'Only rows marked as verified are allowed to write results.',
    },
  },
};

export function normalizeEvidencePolicy(value: unknown): EvidencePolicy {
  return value === 'required' || value === 'strict' ? value : 'off';
}

/** 解析工作簿后给每行推导初始核验状态。 */
export function defaultEvidenceStatus(policy: EvidencePolicy): EvidenceVerificationStatus {
  return policy === 'off' ? 'not_required' : 'pending';
}

/** 切换策略时把旧状态宽松地迁移到新策略下仍合法的最低状态。 */
export function coerceEvidenceStatus(
  status: EvidenceVerificationStatus,
  policy: EvidencePolicy
): EvidenceVerificationStatus {
  if (policy === 'off') return status === 'pending' ? 'not_required' : status;
  return status === 'not_required' ? 'pending' : status;
}

/**
 * 该行在给定策略下是否会被拦住（不写入成绩）。
 * - off / required：证据不符、图片不清会被拦住；
 * - strict：除「核验通过」以外一律拦住。
 */
export function isEvidenceBlocked(
  status: EvidenceVerificationStatus,
  policy: EvidencePolicy
): boolean {
  if (status === 'mismatch' || status === 'unreadable') return true;
  if (policy === 'strict') return status !== 'verified';
  return false;
}

export interface EvidenceSummary {
  total: number;
  verified: number;
  pending: number;
  blocked: number;
}

export function summarizeEvidence(
  statuses: EvidenceVerificationStatus[],
  policy: EvidencePolicy
): EvidenceSummary {
  const summary: EvidenceSummary = { total: statuses.length, verified: 0, pending: 0, blocked: 0 };
  statuses.forEach(status => {
    if (isEvidenceBlocked(status, policy)) summary.blocked += 1;
    else if (status === 'verified') summary.verified += 1;
    else if (status === 'pending') summary.pending += 1;
  });
  return summary;
}

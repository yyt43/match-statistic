import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const packageJson = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
const version = packageJson.version;
const releaseTag = `v${version}`;
const checkOnly = process.argv.includes('--check');
const updates = [];

const metadataFiles = [
  {
    path: resolve(root, 'README.md'),
    label: '中文 README',
    patterns: [
      { test: /当前版本：v\d+\.\d+\.\d+/, replace: `当前版本：${releaseTag}` },
      {
        test: /Release-v\d+\.\d+\.\d+-orange/,
        replace: `Release-${releaseTag}-orange`,
      },
      {
        test: /releases\/tag\/v\d+\.\d+\.\d+/,
        replace: `releases/tag/${releaseTag}`,
      },
    ],
  },
  {
    path: resolve(root, 'README.en.md'),
    label: 'English README',
    patterns: [
      { test: /Current version: v\d+\.\d+\.\d+/, replace: `Current version: ${releaseTag}` },
      {
        test: /Release-v\d+\.\d+\.\d+-orange/,
        replace: `Release-${releaseTag}-orange`,
      },
      {
        test: /releases\/tag\/v\d+\.\d+\.\d+/,
        replace: `releases/tag/${releaseTag}`,
      },
    ],
  },
];

for (const file of metadataFiles) {
  const original = readFileSync(file.path, 'utf8');
  let updated = original;
  for (const pattern of file.patterns) {
    updated = updated.replace(pattern.test, pattern.replace);
  }
  if (updated === original) continue;
  updates.push(file.label);
  if (!checkOnly) writeFileSync(file.path, updated);
}

const changelogPath = resolve(root, 'CHANGELOG.md');
const changelog = readFileSync(changelogPath, 'utf8');
const versionHeading = new RegExp(`^## \\[${version.replace(/\./g, '\\.')}\\]`, 'm');
if (!versionHeading.test(changelog)) {
  updates.push(`CHANGELOG.md 缺少 ${releaseTag} 条目`);
}

if (updates.length > 0) {
  const action = checkOnly ? '需要更新' : '已更新';
  console.log(`${action}发布元数据：${updates.join('、')}`);
  if (checkOnly) process.exitCode = 1;
} else {
  console.log(`发布元数据已同步至 ${releaseTag}。`);
}

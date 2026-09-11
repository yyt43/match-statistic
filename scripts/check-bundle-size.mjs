import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const assetsDir = join(root, 'dist', 'assets');

if (!existsSync(assetsDir)) {
  throw new Error('dist/assets not found. Run npm run build first.');
}

const assets = readdirSync(assetsDir)
  .filter(file => /\.(?:js|css)$/.test(file))
  .map(file => {
    const contents = readFileSync(join(assetsDir, file));
    return {
      file,
      gzipBytes: gzipSync(contents).byteLength,
    };
  })
  .sort((a, b) => b.gzipBytes - a.gzipBytes);

const totalGzip = assets.reduce((sum, asset) => sum + asset.gzipBytes, 0);
const checks = [
  {
    name: 'total gzip',
    actual: totalGzip,
    limit: 420 * 1024,
  },
  {
    name: 'largest asset',
    actual: assets[0]?.gzipBytes ?? 0,
    limit: 180 * 1024,
  },
  {
    name: 'main application',
    actual: assets.find(asset => /^index-.*\.js$/.test(asset.file))?.gzipBytes ?? 0,
    limit: 90 * 1024,
  },
];

console.log('Bundle size report');
for (const asset of assets.slice(0, 12)) {
  console.log(`  ${(asset.gzipBytes / 1024).toFixed(1).padStart(7)} KB  ${asset.file}`);
}
console.log(`  ${(totalGzip / 1024).toFixed(1).padStart(7)} KB  total`);

const failures = checks.filter(check => check.actual > check.limit);
if (failures.length > 0) {
  for (const failure of failures) {
    console.error(
      `Bundle budget exceeded: ${failure.name} is `
      + `${(failure.actual / 1024).toFixed(1)} KB, limit is ${(failure.limit / 1024).toFixed(1)} KB.`
    );
  }
  process.exitCode = 1;
}

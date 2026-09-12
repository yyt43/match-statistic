export function downloadErrorReport(
  source: string,
  error: unknown,
  context: Record<string, string | number | undefined> = {}
): void {
  const lines = [
    'Tournament import error report',
    `Generated: ${new Date().toISOString()}`,
    `Source: ${source}`,
    ...Object.entries(context)
      .filter(([, value]) => value !== undefined && value !== '')
      .map(([key, value]) => `${key}: ${value}`),
    '',
    'Error:',
    error instanceof Error ? error.message : String(error),
  ];

  const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `import-error-${new Date().toISOString().replace(/[:.]/g, '-')}.txt`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

import fs from 'node:fs';
import path from 'node:path';

export function jsonFieldNonempty(filePath: string, field: string): boolean {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const re = new RegExp(`"${field}"\\s*:\\s*"([^"]+)"`);
    const m = re.exec(raw);
    return m !== null && m[1].trim() !== '';
  } catch {
    return false;
  }
}

export function jsonStringField(filePath: string, field: string): string {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const re = new RegExp(`"${field}"\\s*:\\s*"([^"]*)"`);
    const m = re.exec(raw);
    return m?.[1]?.trim() ?? '';
  } catch {
    return '';
  }
}

export async function writeJsonAtomic(filePath: string, value: unknown): Promise<void> {
  await fs.promises.mkdir(path.dirname(filePath), { recursive: true, mode: 0o700 });
  const b = JSON.stringify(value, null, 2) + '\n';
  const tmp = `${filePath}.tmp`;
  await fs.promises.writeFile(tmp, b, { mode: 0o600 });
  await fs.promises.rename(tmp, filePath);
}

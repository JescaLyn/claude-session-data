import { basename } from 'path';

export function projectFromCwd(cwd: string): string {
  return basename(cwd);
}

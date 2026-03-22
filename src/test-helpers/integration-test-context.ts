import { inject } from 'vitest';

declare module 'vitest' {
  interface ProvidedContext {
    tempVaultPath: string;
  }
}

export function getTempVaultPath(): string {
  return inject('tempVaultPath');
}

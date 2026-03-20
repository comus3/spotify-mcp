import * as fs from 'fs';
import * as path from 'path';
import { StoredTokens } from './types.js';

const TOKEN_PATH = path.join('/app/data', 'tokens.json');

export class TokenStore {
  load(): StoredTokens | null {
    try {
      const raw = fs.readFileSync(TOKEN_PATH, 'utf-8');
      const data = JSON.parse(raw);
      if (!data.accessToken || !data.refreshToken) return null;
      return data as StoredTokens;
    } catch {
      return null;
    }
  }

  save(tokens: StoredTokens): void {
    fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2), 'utf-8');
  }

  clear(): void {
    try { fs.unlinkSync(TOKEN_PATH); } catch { /* already gone */ }
  }
}

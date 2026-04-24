// ── Migrations de schéma ─────────────────────────────────────────────────────
// Chaque version correspond à un fichier SQL dans ./migrations/.
// Pour ajouter une migration : créer v<N>.sql et ajouter loadSql(<N>) ci-dessous.
//
// RÈGLE : ne jamais modifier un fichier SQL existant — ajouter une nouvelle version.

import * as fs from 'fs';
import * as path from 'path';

function loadSql(version: number): string {
  // __dirname pointe vers dist-electron/database/ en prod et en dev
  return fs.readFileSync(path.join(__dirname, 'migrations', `v${version}.sql`), 'utf-8');
}

export const MIGRATIONS: string[] = [
  loadSql(1),
  loadSql(2),
  loadSql(3),
];

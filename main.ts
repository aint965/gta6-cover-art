// Package Sundown Studio for the make.fun grader using only local files.

import { cpSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-app.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

mkdirSync(out, { recursive: true });
for (const directory of ['app', 'screenshots']) {
  cpSync(join(here, directory), join(out, directory), { recursive: true });
}

const dossierLimits = {
  text_max_bytes: 160 * 1024,
  screenshots: { max: 4, max_bytes: 256 * 1024 },
  app_max_files: 993,
  app_max_bytes: 48 * 1024 * 1024,
  app_path_max_bytes: 1000,
};
const dossier = buildDossier(out, dossierLimits);
writeFileSync(join(out, 'dossier.json'), dossier);

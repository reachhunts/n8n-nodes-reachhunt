import { copyFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = resolve(root, process.argv[2] ?? '../../docs/openapi.json');
copyFileSync(source, resolve(root, 'spec/openapi.json'));
console.log(`Copied ${source} to spec/openapi.json. Run npm run generate next.`);

import { access } from 'node:fs/promises';

for (const size of [16, 32, 48, 128]) {
  await access(new URL(`../public/icons/icon-${size}.png`, import.meta.url));
}
console.log('Static extension icons are present.');

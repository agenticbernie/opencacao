import {readFileSync, writeFileSync, mkdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
mkdirSync(`${root}frontend/src/contracts`, {recursive: true});
for (const name of ['MockUSDC', 'OpenCacaoCore', 'CertainaryModule']) {
  const {abi} = JSON.parse(readFileSync(`${root}contracts/out/${name}.sol/${name}.json`, 'utf8'));
  writeFileSync(`${root}frontend/src/contracts/${name}.json`, JSON.stringify(abi, null, 2) + '\n');
}
console.log('Exported compiler ABIs.');

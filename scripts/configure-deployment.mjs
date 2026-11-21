import {readFileSync, writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const broadcast = JSON.parse(readFileSync(`${root}contracts/broadcast/Deploy.s.sol/43113/run-latest.json`, 'utf8'));
const names = {MockUSDC: 'MOCK_USDC', OpenCacaoCore: 'CORE', CertainaryModule: 'CERTAINARY'};
const lines = ['NEXT_PUBLIC_FUJI_RPC_URL=https://api.avax-test.network/ext/bc/C/rpc'];
for (const [contract, key] of Object.entries(names)) {
  const tx = broadcast.transactions.find(t => t.transactionType === 'CREATE' && t.contractName === contract);
  if (!tx?.contractAddress) throw new Error(`Missing deployment: ${contract}`);
  lines.push(`NEXT_PUBLIC_${key}_ADDRESS=${tx.contractAddress}`);
}
if (!broadcast.receipts?.length || broadcast.receipts.some(r => BigInt(r.status) !== 1n)) throw new Error('Deployment receipts missing or failed');
const block = broadcast.receipts.reduce((min, r) => BigInt(r.blockNumber) < min ? BigInt(r.blockNumber) : min, BigInt(broadcast.receipts[0].blockNumber));
lines.push(`NEXT_PUBLIC_DEPLOYMENT_BLOCK=${block}`);
writeFileSync(`${root}frontend/.env.local`, lines.join('\n') + '\n');
console.log('Wrote frontend/.env.local from successful Fuji broadcast. Restart/rebuild the frontend.');

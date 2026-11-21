import {createConfig, http, injected} from 'wagmi';
import {avalancheFuji} from 'wagmi/chains';
import {createPublicClient, isAddress, formatUnits, zeroAddress, type Abi, type Address, type Log} from 'viem';
import tokenAbi from '../contracts/MockUSDC.json';
import coreAbi from '../contracts/OpenCacaoCore.json';
import shieldAbi from '../contracts/CertainaryModule.json';

const rpc = process.env.NEXT_PUBLIC_FUJI_RPC_URL || avalancheFuji.rpcUrls.default.http[0];
export const config = createConfig({chains: [avalancheFuji], transports: {[avalancheFuji.id]: http(rpc)}, connectors: [injected()], ssr: true});
export const client = createPublicClient({chain: avalancheFuji, transport: http(rpc)});
function contract(value: string | undefined, abi: Abi) {
  return {address: value && isAddress(value) ? value as Address : zeroAddress, abi};
}
export const token = contract(process.env.NEXT_PUBLIC_MOCK_USDC_ADDRESS, tokenAbi as Abi);
export const core = contract(process.env.NEXT_PUBLIC_CORE_ADDRESS, coreAbi as Abi);
export const shield = contract(process.env.NEXT_PUBLIC_CERTAINARY_ADDRESS, shieldAbi as Abi);
export const configured = [token, core, shield].every(c => c.address !== zeroAddress);
export const explorer = 'https://testnet.snowtrace.io';
export const unit = 1_000_000n;
export const money = (value: bigint) => {
  const [whole, fraction] = formatUnits(value, 6).split('.');
  return `${BigInt(whole).toLocaleString('en-US')}${fraction ? `.${fraction}` : ''}`;
};
export const same = (a?: string, b?: string) => Boolean(a && b && a.toLowerCase() === b.toLowerCase());
export const short = (value: string) => `${value.slice(0, 6)}…${value.slice(-4)}`;
export type Farm = {id: bigint; farmer: Address; farmName: string; region: string; gpsCoords: string; areaHectares: bigint; eudrCompliant: boolean};
export type Batch = {id: bigint; farmId: bigint; farmer: Address; buyer: Address; weightKg: bigint; escrowAmount: bigint; fermentationScore: number; status: number; insuredPoolId: bigint; insuredShares: bigint};
export type Pool = {id: bigint; region: string; triggerCondition: string; expiry: bigint; totalCollateral: bigint; impliedRiskBps: bigint; status: number};
export type Offer = {id: bigint; poolId: bigint; underwriter: Address; premiumPerShare: bigint; availableShares: bigint; active: boolean};
type Contract = typeof core;
export async function read<T>(c: Contract, functionName: string, args: readonly unknown[] = [], blockNumber?: bigint) {
  return client.readContract({...c, functionName, args, blockNumber}) as Promise<T>;
}
export async function snapshot(address?: Address) {
  const block = await client.getBlock();
  const at = <T,>(c: Contract, fn: string, args?: readonly unknown[]) => read<T>(c, fn, args, block.number);
  const [farmCount, batchCount, poolCount, offerCount, tvl, oracleOwner, coreOwner, balance] = await Promise.all([
    at<bigint>(core, 'farmCount'), at<bigint>(core, 'batchCount'), at<bigint>(shield, 'poolCount'), at<bigint>(shield, 'offerCount'),
    at<bigint>(core, 'escrowTVL'), at<Address>(shield, 'owner'), at<Address>(core, 'owner'), address ? at<bigint>(token, 'balanceOf', [address]) : 0n,
  ]);
  async function records<T>(c: Contract, fn: string, count: bigint) {
    const results: T[] = [];
    for (let i = 1n; i <= count; i += 30n) {
      const length = Number(count - i < 29n ? count - i + 1n : 30n);
      results.push(...await Promise.all(Array.from({length}, (_, j) => at<T>(c, fn, [i + BigInt(j)]))));
    }
    return results;
  }
  const [farms, batches, pools, offers] = await Promise.all([records<Farm>(core, 'getFarm', farmCount), records<Batch>(core, 'getBatch', batchCount), records<Pool>(shield, 'getPool', poolCount), records<Offer>(shield, 'getOffer', offerCount)]);
  const positions = address ? await Promise.all(pools.map(async p => ({pool: p, yes: await at<bigint>(shield, 'yesShares', [p.id, address]), no: await at<bigint>(shield, 'noShares', [p.id, address])}))) : [];
  return {farms, batches, pools, offers, tvl, oracleOwner, coreOwner, balance, positions, now: block.timestamp, block: block.number};
}
export type Snapshot = Awaited<ReturnType<typeof snapshot>>;

const batchEventNames = ['BatchCreated', 'EscrowFunded', 'MilestoneLogged', 'EscrowReleased', 'InsuranceLinked'];
export async function provenance(id: bigint) {
  const events = core.abi.filter(item => item.type === 'event' && batchEventNames.includes(item.name));
  const fromBlock = BigInt(process.env.NEXT_PUBLIC_DEPLOYMENT_BLOCK || 0);
  const latest = await client.getBlockNumber();
  const [cert, moisture, logs] = await Promise.all([read<string>(core, 'processingCertificates', [id]), read<bigint>(core, 'moistureBps', [id]), (async () => {
    const out: (Log & {eventName?: string})[] = [];
    for (const event of events) {
      if (event.type !== 'event') continue;
      const eventRead = (start: bigint, end: bigint) => client.getContractEvents({...core, eventName: event.name, args: {batchId: id}, fromBlock: start, toBlock: end, strict: true});
      try { out.push(...await eventRead(fromBlock, latest)); }
      catch (error) {
        if (latest - fromBlock < 2_000n || latest - fromBlock > 100_000n) throw error;
        for (let start = fromBlock; start <= latest; start += 2_000n) out.push(...await eventRead(start, start + 1_999n > latest ? latest : start + 1_999n));
      }
    }
    return out.sort((a, b) => Number((a.blockNumber ?? 0n) - (b.blockNumber ?? 0n)) || (a.logIndex ?? 0) - (b.logIndex ?? 0));
  })()]);
  return {cert, moisture, logs};
}

export function polygon(value: string): [number, number][] {
  const points: unknown = JSON.parse(value);
  if (!Array.isArray(points) || points.length < 4 || points.length > 100 || !points.every(p => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite) && Math.abs(p[0]) <= 180 && Math.abs(p[1]) <= 90) || JSON.stringify(points[0]) !== JSON.stringify(points.at(-1))) throw new Error('Enter a closed polygon of 4–100 [longitude, latitude] pairs.');
  return points;
}

export async function weather(gps: string) {
  const points = polygon(gps).slice(0, -1);
  const [lon, lat] = points.reduce(([x, y], [a, b]) => [x + a / points.length, y + b / points.length], [0, 0]);
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,apparent_temperature&daily=precipitation_sum,temperature_2m_max&past_days=30&forecast_days=1&timezone=auto`;
  const response = await fetch(url);
  if (!response.ok) throw new Error('Weather feed unavailable');
  const result = await response.json() as {current: {temperature_2m: number; apparent_temperature: number; time: string}; daily: {precipitation_sum: (number | null)[]; temperature_2m_max: (number | null)[]}};
  const rain = result.daily.precipitation_sum.slice(0, -1);
  const highs = result.daily.temperature_2m_max.slice(-6, -1);
  return {...result.current, rain: rain.length === 30 && rain.every(n => n != null) ? rain.reduce<number>((sum, n) => sum + (n ?? 0), 0) : null, highs};
}

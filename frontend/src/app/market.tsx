'use client';
import {useState} from 'react';
import {useQuery} from '@tanstack/react-query';
import {Card} from '@astryxdesign/core/Card';
import {Button} from '@astryxdesign/core/Button';
import {Heading, Text} from '@astryxdesign/core/Text';
import {HStack, VStack} from '@astryxdesign/core/Layout';
import {Grid} from '@astryxdesign/core/Grid';
import {TextInput} from '@astryxdesign/core/TextInput';
import {Selector} from '@astryxdesign/core/Selector';
import {Slider} from '@astryxdesign/core/Slider';
import {Dialog, DialogHeader} from '@astryxdesign/core/Dialog';
import {Divider} from '@astryxdesign/core/Divider';
import {Activity, CloudSun, FlaskConical, ShieldCheck} from 'lucide-react';
import {Bar, BarChart, ResponsiveContainer, XAxis, YAxis, Tooltip} from 'recharts';
import type {Address, TransactionReceipt} from 'viem';
import {core, money, same, shield, short, unit, weather, type Offer, type Pool, type Snapshot} from './chain';

export type Send = (contract: typeof core, functionName: string, args?: readonly unknown[]) => Promise<TransactionReceipt>;
export type Run = (label: string, job: (send:Send, approve:(spender:Address, amount:bigint) => Promise<void>) => Promise<void>, close?:boolean) => Promise<void>;
export const poolOpen = (p:Pool, now:bigint) => p.status === 0 && p.expiry > now;
const price = (quote:Offer) => Number(quote.premiumPerShare) / 10_000;
export const quotedRisk = (p:Pool, offers:Offer[]) => {
  if (p.impliedRiskBps) return Number(p.impliedRiskBps) / 100;
  const rates = offers.filter(o => o.poolId === p.id && o.active).map(price);
  return rates.length ? Math.min(...rates) : undefined;
};
const sharesOf = (v:string) => /^\d{1,30}$/.test(v.trim()) ? BigInt(v) : 0n;
const status = (p:Pool, now:bigint) => p.status === 1 ? 'Triggered' : p.status === 2 ? 'Expired safe' : poolOpen(p,now) ? 'Open' : 'Awaiting oracle';
type Props = {s?:Snapshot; address?:Address; run:Run; busy:boolean};
const poolOptions = (pools:Pool[]) => pools.map(p => ({value:String(p.id), label:p.region}));

function Telemetry({pool, gps}: {pool:Pool; gps?:string}) {
  const q = useQuery({queryKey:['weather',gps], queryFn:() => weather(gps!), enabled:!!gps, staleTime:600_000, retry:false});
  const salinity = /salinity/i.test(pool.triggerCondition);
  if (!gps || q.isError) return <Text color="secondary">Regional telemetry unavailable{salinity ? ' · No salinity sensor configured' : ''}.</Text>;
  if (!q.data) return <Text color="secondary">Reading Open-Meteo…</Text>;
  const {temperature_2m,apparent_temperature,rain,highs,time} = q.data;
  return <VStack gap={1}><Text>{temperature_2m}°C · Feels like {apparent_temperature}°C</Text>
    <Text color="secondary">{salinity ? 'Salinity: no sensor configured' : /rain/i.test(pool.triggerCondition) ? `30-day rain: ${rain === null ? 'unavailable' : `${rain.toFixed(1)} mm`}` : /temp/i.test(pool.triggerCondition) ? `Last five daily highs: ${highs.map(n => n == null ? '—' : `${n}°`).join(' · ')}` : 'No climate metric mapped to this trigger'}</Text>
    <Text color="secondary">Open-Meteo · {time.replace('T',' ')} local · not used for settlement</Text></VStack>;
}

export function Market({s,address,run,busy,initialBatch}: Props & {initialBatch?:string}) {
  const [batchId,setBatch] = useState(initialBatch); const [offerId,setOffer] = useState<string>(); const [shares,setShares] = useState('100');
  const [lpPool,setLpPool] = useState<string>(); const [lpShares,setLpShares] = useState('500'); const [rate,setRate] = useState(12);
  const [orderPool,setOrderPool] = useState('all');
  const pools = s?.pools || []; const now = s?.now || 0n; const open = pools.filter(p => poolOpen(p,now));
  const batches = s?.batches.filter(b => b.status < 3 && (same(address,b.farmer) || same(address,b.buyer))) || [];
  const batch = batches.find(b => String(b.id) === batchId);
  const region = s?.farms.find(f => f.id === batch?.farmId)?.region;
  const offers = (s?.offers || []).filter(o => o.active && open.some(p => p.id === o.poolId)).toSorted((a,b) => price(a)-price(b));
  const eligible = offers.filter(o => batch && open.some(p => p.id === o.poolId && p.region === region && (!batch.insuredPoolId || batch.insuredPoolId === p.id)));
  const offer = eligible.find(o => String(o.id) === offerId);
  const qty = sharesOf(shares); const lpQty = sharesOf(lpShares); const premium = BigInt(rate) * 10_000n;
  const activeLpPool = open.find(p => String(p.id) === lpPool);
  return <VStack gap={5}>
    <VStack gap={1}><Heading level={2}>Certainary Risk Shield</Heading><Text color="secondary">Buy collateralized crop protection or quote a premium as an underwriter.</Text></VStack>
    {pools.length ? <Grid columns={{minWidth:270,max:3}} gap={4}>{pools.map(p => {
      const risk = quotedRisk(p,s!.offers); const farm = s!.farms.find(f => f.region === p.region);
      return <Card padding={4} key={String(p.id)}><VStack gap={3}>
        <HStack gap={2} hAlign="between" wrap="wrap"><HStack gap={1} vAlign="center"><CloudSun size={18}/><Text color="accent">Regional pool #{p.id.toString()}</Text></HStack><Text>{status(p,now)}</Text></HStack>
        <Heading level={3}>{p.region}</Heading><Text>{p.triggerCondition}</Text><Text color="secondary">Expiry {new Date(Number(p.expiry) * 1000).toISOString().slice(0,10)} UTC</Text>
        <Divider/><Telemetry pool={p} gps={farm?.gpsCoords}/><Divider/>
        <HStack gap={2} hAlign="between" vAlign="center"><Text color="secondary">Market-implied risk</Text><Heading level={3}>{risk === undefined ? '—' : `${risk}%`}</Heading></HStack>
        {risk !== undefined && <ResponsiveContainer width="100%" height={28}><BarChart data={[{risk}]} layout="vertical" accessibilityLayer><XAxis type="number" domain={[0,100]} hide/><YAxis type="category" hide/><Bar dataKey="risk" fill="var(--color-text-accent)" background={{fill:'var(--color-background-wash)'}} radius={4} isAnimationActive={false}/></BarChart></ResponsiveContainer>}
        <Text color="secondary">{p.impliedRiskBps ? 'Latest matched premium' : 'Best active quote before first fill'} · {money(p.totalCollateral)} mUSDC locked in matched coverage</Text>
      </VStack></Card>;
    })}</Grid> : <Card padding={4}><Text color="secondary">Regional pools will appear once created on Fuji.</Text></Card>}
    <Grid columns={{minWidth:270,max:2}} gap={4}>
      <Card padding={4}><VStack gap={3}><HStack gap={2} vAlign="center"><ShieldCheck size={20}/><Heading level={3}>Buy crop protection</Heading></HStack>
        <Selector width="100%" label="Your cacao batch" placeholder="Select a batch" value={batch ? String(batch.id) : undefined} onChange={id => {setBatch(id);setOffer(undefined);}} options={batches.map(b => ({value:String(b.id),label:`#${b.id} · ${s?.farms.find(f=>f.id===b.farmId)?.farmName}`}))}/>
        <Selector width="100%" label="Underwriter quote" value={offer ? String(offer.id) : undefined} onChange={setOffer} options={eligible.map(o => ({value:String(o.id),label:`Offer #${o.id} · ${price(o)}% · ${o.availableShares} available`}))}/>
        <TextInput label="Shares to cover" inputMode="numeric" value={shares} onChange={setShares}/>
        <HStack hAlign="between" wrap="wrap" gap={2}><Text>Premium: {offer ? `${money(qty * offer.premiumPerShare)} mUSDC` : '—'}</Text><Text>Payout if triggered: {money(qty * unit)} mUSDC</Text></HStack>
        <Text color="secondary">The farmer receives YES shares even if the buyer pays the premium. Claims require oracle settlement.</Text>
        <Button label="Attach shield on Fuji" variant="primary" isDisabled={busy || !batch || !offer || qty === 0n || qty > offer.availableShares} onClick={() => {if (batch && offer) void run('Crop protection',async (send,approve) => {await approve(shield.address,qty*offer.premiumPerShare); await send(shield,'attachShieldToBatch',[batch.id,offer.id,qty]);});}}/>
      </VStack></Card>
      <Card padding={4}><VStack gap={3}><HStack gap={2} vAlign="center"><Activity size={20}/><Heading level={3}>Underwrite climate risk</Heading></HStack>
        <Selector width="100%" label="Regional pool" value={activeLpPool ? String(activeLpPool.id) : undefined} onChange={setLpPool} options={poolOptions(open)}/>
        <TextInput label="Shares offered" inputMode="numeric" value={lpShares} onChange={setLpShares}/>
        <Slider label="Premium rate" value={rate} onChange={setRate} min={1} max={40} valueDisplay="text" formatValue={v => `${v}%`}/>
        <Text>Collateral to lock: {money((unit-premium)*lpQty)} mUSDC</Text><Text>Full-fill premium if safe: {money(premium*lpQty)} mUSDC</Text>
        <Text color="secondary">Matched collateral is lost if the trigger resolves YES. Unmatched liquidity can be withdrawn.</Text>
        <Button label="Post underwriter offer" variant="primary" isDisabled={busy || !activeLpPool || !lpQty} onClick={() => {if (activeLpPool) void run('Underwriter offer',async (send,approve) => {await approve(shield.address,(unit-premium)*lpQty); await send(shield,'postUnderwriteOffer',[activeLpPool.id,lpQty,premium]);});}}/>
      </VStack></Card>
    </Grid>
    <VStack gap={3}><HStack gap={3} hAlign="between" vAlign="center" wrap="wrap"><Heading level={3}>Live orderbook</Heading><Selector label="Filter by pool" isLabelHidden value={orderPool} onChange={setOrderPool} options={[{value:'all',label:'All pools'},...poolOptions(open)]}/></HStack>
      {offers.filter(o => orderPool === 'all' || String(o.poolId) === orderPool).map(o => <VStack gap={2} key={String(o.id)}><HStack hAlign="between" vAlign="center" gap={3} wrap="wrap"><Text>#{String(o.id)} · {pools.find(p=>p.id===o.poolId)?.region}</Text><Text color="secondary">{short(o.underwriter)}</Text><Text>{price(o)}% · {o.availableShares.toString()} shares</Text><Button label="Use quote" size="sm" isDisabled={!eligible.includes(o) || busy} onClick={() => setOffer(String(o.id))}/></HStack><Divider/></VStack>)}
      {!offers.some(o => orderPool === 'all' || String(o.poolId) === orderPool) && <Text color="secondary">No open quotes for this selection.</Text>}
    </VStack>
  </VStack>;
}

export function Portfolio({s,address,run,busy,connect,passport}: Props & {connect:()=>void;passport:(id:bigint)=>void}) {
  const [drawer,setDrawer] = useState(false); const [poolId,setPool] = useState<string>();
  const [trigger,setTrigger] = useState(''); const [region,setRegion] = useState(''); const [days,setDays] = useState('30');
  const farms = s?.farms.filter(f => same(f.farmer,address)) || [];
  const batches = s?.batches.filter(b => same(b.farmer,address) || same(b.buyer,address)) || [];
  const positions = s?.positions.filter(p => p.yes || p.no) || [];
  const offers = s?.offers.filter(o => same(o.underwriter,address) && o.availableShares > 0n) || [];
  const oracle = same(address,s?.oracleOwner); const compliance = same(address,s?.coreOwner);
  const pending = s?.pools.filter(p=>p.status===0) || []; const pool = pending.find(p => String(p.id) === poolId);
  return <VStack gap={5}>
    <HStack hAlign="between" vAlign="center" gap={3} wrap="wrap"><VStack gap={1}><Heading level={2}>My portfolio</Heading><Text color="secondary">Your farm records, escrow contracts, and Certainary positions.</Text></VStack><Button label="Demo oracle" icon={<FlaskConical size={16}/>} onClick={() => setDrawer(true)}/></HStack>
    {!address ? <Card padding={4}><VStack gap={2} hAlign="start"><Text>Connect a wallet to view on-chain positions.</Text><Button label="Connect wallet" variant="primary" onClick={connect}/></VStack></Card> : <>
      <Grid columns={{minWidth:270,max:2}} gap={4}>
        <Card padding={4}><VStack gap={3}><Heading level={3}>My farms</Heading>{!farms.length && <Text color="secondary">No farms registered by this wallet.</Text>}{farms.map(f => <HStack key={String(f.id)} gap={2} hAlign="between" wrap="wrap"><Text>{f.farmName}</Text><Text color="secondary">{f.eudrCompliant ? 'Attested' : 'Not attested'}</Text></HStack>)}</VStack></Card>
        <Card padding={4}><VStack gap={3}><Heading level={3}>My batches</Heading>{!batches.length && <Text color="secondary">No associated batches.</Text>}{batches.map(b => <HStack key={String(b.id)} gap={2} hAlign="between" wrap="wrap" vAlign="center"><Text>#{String(b.id)} · {money(b.escrowAmount)} mUSDC · {['Listed','Funded','Verified','Completed','Disputed'][b.status]}</Text><Button label="Passport" size="sm" onClick={() => passport(b.id)}/></HStack>)}</VStack></Card>
      </Grid>
      <VStack gap={3}><Heading level={3}>Insurance shares</Heading>{!positions.length && <Text color="secondary">No YES or NO shares in this wallet.</Text>}{positions.map(({pool:p,yes,no}) => {
        const claim = p.status === 1 ? yes : p.status === 2 ? no : 0n;
        return <VStack gap={2} key={String(p.id)}><HStack gap={2} hAlign="between" vAlign="center" wrap="wrap"><Text>{p.region} · {status(p,s!.now)}</Text><Text>YES {String(yes)} / NO {String(no)}</Text><Button label={claim ? `Claim ${money(claim*unit)} mUSDC` : 'No claim available'} variant={claim ? 'primary' : 'secondary'} isDisabled={busy || !claim} onClick={() => run('Insurance payout',async send => {await send(shield,'claimInsurancePayout',[p.id]);})}/></HStack><Divider/></VStack>;
      })}</VStack>
      <VStack gap={3}><Heading level={3}>Unmatched underwriter collateral</Heading>{!offers.length && <Text color="secondary">No unfilled offers from this wallet.</Text>}{offers.map(o => <HStack key={String(o.id)} hAlign="between" vAlign="center" gap={2} wrap="wrap"><Text>Offer #{String(o.id)} · {money((unit-o.premiumPerShare)*o.availableShares)} mUSDC available</Text><Button label="Withdraw unused collateral" isDisabled={busy} onClick={() => run('Quote withdrawal',async send => {await send(shield,'withdrawOffer',[o.id]);})}/></HStack>)}</VStack>
      {compliance && <Card padding={4}><VStack gap={3}><Heading level={3}>Farm attestations</Heading><Text color="secondary">Record an owner attestation only after checking the underlying evidence. This is not legal certification.</Text>{s?.farms.map(f => <HStack key={String(f.id)} hAlign="between" vAlign="center" wrap="wrap" gap={2}><Text>{f.farmName}</Text><Button label={f.eudrCompliant ? 'Revoke attestation' : 'Attest deforestation-free'} isDisabled={busy} onClick={() => run('Compliance attestation',async send => {await send(core,'attestCompliance',[f.id,!f.eudrCompliant]);})}/></HStack>)}</VStack></Card>}
    </>}
    <Dialog isOpen={drawer} onOpenChange={setDrawer} width={520} position={{end:'var(--spacing-4)'}}><DialogHeader title="Hackathon demo oracle" onOpenChange={setDrawer}/><VStack padding={4} gap={3}>
      <Text color="secondary">The contract owner sets the outcome directly on Fuji. Settlement is irreversible and does not read the weather feed.</Text>
      {!oracle ? <Text>Connect the Certainary owner wallet to settle or create pools.</Text> : <>
        <Selector width="100%" label="Unresolved pool" value={pool ? String(pool.id) : undefined} options={poolOptions(pending)} onChange={setPool}/>
        <Button variant="destructive" label="Simulate extreme drought / salinity spike" isDisabled={busy || !pool} onClick={() => {if (pool) {setDrawer(false);void run('Disaster settlement',async send => {await send(shield,'resolveClimateOracle',[pool.id,true]);});}}}/>
        <Button variant="primary" label="Complete safe harvest" isDisabled={busy || !pool} onClick={() => {if (pool) {setDrawer(false);void run('Safe settlement',async send => {await send(shield,'resolveClimateOracle',[pool.id,false]);});}}}/>
        <Divider/><Heading level={3}>Create regional pool</Heading><TextInput label="Region" value={region} onChange={setRegion}/><TextInput label="Trigger condition" value={trigger} onChange={setTrigger}/><TextInput label="Duration in whole days" inputMode="numeric" value={days} onChange={setDays}/>
        <Button label="Create pool on Fuji" isDisabled={busy || !region.trim() || !trigger.trim() || !sharesOf(days)} onClick={() => {setDrawer(false);void run('Pool creation',async send => {await send(shield,'createRiskPool',[region.trim(),trigger.trim(),sharesOf(days)*86400n]);});}}/>
      </>}
    </VStack></Dialog>
  </VStack>;
}

export function HarvestChart({s}: {s:Snapshot}) {
  const data = s.farms.map(f => ({region:f.farmName, weight:s.batches.filter(b=>b.farmId===f.id).reduce((a,b) => a + Number(b.weightKg),0)})).filter(x=>x.weight>0).slice(0,12);
  if (!data.length) return null;
  return <Card padding={4}><VStack gap={2}><Heading level={3}>Listed harvest volume</Heading><Text color="secondary">Kilograms per farm · up to 12 farms</Text><ResponsiveContainer width="100%" height={180}><BarChart data={data} accessibilityLayer><XAxis dataKey="region" hide/><YAxis/><Tooltip formatter={v => [`${v} kg`,'Harvest volume']}/><Bar dataKey="weight" fill="var(--color-text-accent)" isAnimationActive={false}/></BarChart></ResponsiveContainer></VStack></Card>;
}

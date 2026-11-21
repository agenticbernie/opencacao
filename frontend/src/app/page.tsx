'use client';

import {useEffect, useRef, useState, type ReactNode} from 'react';
import {Layout, LayoutContent, VStack, HStack} from '@astryxdesign/core/Layout';
import {Grid} from '@astryxdesign/core/Grid';
import {Card} from '@astryxdesign/core/Card';
import {Heading, Text} from '@astryxdesign/core/Text';
import {Button} from '@astryxdesign/core/Button';
import {Tab, TabList} from '@astryxdesign/core/TabList';
import {Dialog, DialogHeader} from '@astryxdesign/core/Dialog';
import {TextInput} from '@astryxdesign/core/TextInput';
import {Selector} from '@astryxdesign/core/Selector';
import {Divider} from '@astryxdesign/core/Divider';
import {Activity, ArrowUpRight, Blocks, Droplets, FlaskConical, Leaf, LockKeyhole, MapPin, Package, Plus, QrCode, ShieldCheck, Sprout, Wallet} from 'lucide-react';
import {QueryClient, QueryClientProvider, useQuery, useQueryClient} from '@tanstack/react-query';
import {WagmiProvider, useAccount, useConnect, useDisconnect, useSwitchChain, useWriteContract} from 'wagmi';
import {avalancheFuji} from 'wagmi/chains';
import {BaseError, decodeEventLog, parseUnits, zeroAddress, type Hash} from 'viem';
import {QRCodeSVG} from 'qrcode.react';
import {client, config, configured, core, explorer, money, polygon, provenance, read, same, short, snapshot, token, unit, type Batch, type Farm, type Snapshot} from './chain';
import {HarvestChart, Market, Portfolio, poolOpen, quotedRisk, type Run, type Send} from './market';
import {Theme} from '@astryxdesign/core/theme';
import {themes, defaultThemeSlug} from '../astryx-themes';

const batchStatus = ['Listed', 'Escrow funded', 'Harvest verified', 'Completed', 'Disputed'];
const eventNames: Record<string, string> = {BatchCreated:'Harvest batch listed', EscrowFunded:'Buyer funded escrow', MilestoneLogged:'Farmer submitted processing certificate', EscrowReleased:'Buyer confirmed delivery and released funds', InsuranceLinked:'Certainary protection attached'};
const integer = (s: string, min = 1n) => {if (!/^\d+$/.test(s.trim()) || BigInt(s) < min) throw new Error(`Enter a whole number of at least ${min}.`); return BigInt(s);};
const decimal = (s: string, digits: number) => {if (!new RegExp(`^\\d+(\\.\\d{1,${digits}})?$`).test(s.trim())) throw new Error(`Enter a decimal with at most ${digits} fractional digits.`); return parseUnits(s.trim(), digits);};
const addr = (address: string) => <a href={`${explorer}/address/${address}`} target="_blank" rel="noreferrer">{short(address)} <ArrowUpRight size={12}/></a>;

function Passport({batch, farm}: {batch: Batch; farm: Farm}) {
  const query = useQuery({queryKey:['passport', String(batch.id)], queryFn: () => provenance(batch.id), retry: 1});
  const url = new URL(window.location.pathname, window.location.origin); url.searchParams.set('batch', String(batch.id)); url.searchParams.set('core', core.address);
  const data = query.data;
  const cert = data?.cert?.replace(/^ipfs:\/\//, '');
  return <VStack gap={4}>
    <HStack gap={4} wrap="wrap" vAlign="center"><QRCodeSVG value={url.href} size={124} marginSize={3} title={`Open public passport for batch ${batch.id}`}/><VStack gap={1}>
      <Heading level={3}>{farm.farmName}</Heading><Text color="secondary">{farm.region} · {batch.weightKg.toString()} kg · {batchStatus[batch.status]}</Text>
      <Text>Farmer {addr(farm.farmer)}{batch.buyer !== zeroAddress && <> · Buyer {addr(batch.buyer)}</>}</Text>
      <Text color="secondary">{farm.eudrCompliant ? 'Deforestation-free: owner attested' : 'Deforestation-free: not attested'}</Text><a href={url.href}>Open public passport <ArrowUpRight size={12}/></a>
    </VStack></HStack>
    <Divider/><Text>Farm area: {farm.areaHectares.toString()} ha</Text><Text color="secondary">GPS polygon (longitude, latitude)</Text><Text>{farm.gpsCoords}</Text>
    <Text>Fermentation: {batch.status >= 2 ? `${batch.fermentationScore}/100` : 'Not recorded'} · Moisture: {data?.moisture ? `${Number(data.moisture)/100}%` : 'Not recorded'}</Text>
    {cert && <Text>Processing certificate: {/^[a-zA-Z0-9]+$/.test(cert) ? <a href={`https://ipfs.io/ipfs/${cert}`} target="_blank" rel="noreferrer">{cert} <ArrowUpRight size={12}/></a> : cert}</Text>}
    <Heading level={3}>On-chain provenance</Heading>
    {query.isPending && <Text>Reading Fuji events…</Text>}{query.isError && <Text color="secondary">Could not read the timeline. Check the Fuji RPC and deployment block.</Text>}
    {data?.logs.map(log => <HStack key={`${log.transactionHash}-${log.logIndex}`} gap={2} vAlign="center" wrap="wrap"><Blocks size={15}/><Text>{eventNames[log.eventName || ''] || log.eventName}</Text><a href={`${explorer}/tx/${log.transactionHash}`} target="_blank" rel="noreferrer">Block {String(log.blockNumber)} <ArrowUpRight size={12}/></a></HStack>)}
  </VStack>;
}

function Registration({farms, run}: {farms: Farm[]; run: Run}) {
  const [farm, setFarm] = useState('new'); const [name, setName] = useState(''); const [region, setRegion] = useState(''); const [gps, setGps] = useState(''); const [area, setArea] = useState(''); const [weight, setWeight] = useState(''); const [price, setPrice] = useState('');
  const [includeBatch, setIncludeBatch] = useState('yes');
  return <VStack gap={3}>
    <Selector width="100%" label="Farm" value={farm} onChange={setFarm} options={[{value:'new',label:'Register a new farm'}, ...farms.map(f => ({value:String(f.id),label:f.farmName}))]}/>
    {farm === 'new' && <><TextInput label="Farm name" value={name} onChange={setName}/><TextInput label="Region (exact pool region for coverage)" value={region} onChange={setRegion}/><TextInput label="Closed GPS polygon (JSON longitude, latitude pairs)" value={gps} onChange={setGps} placeholder="[[106.37,10.24],[106.38,10.24],[106.38,10.25],[106.37,10.24]]"/><TextInput label="Area (whole hectares)" value={area} onChange={setArea} inputMode="numeric"/><Selector label="Next step" value={includeBatch} onChange={setIncludeBatch} options={[{value:'yes',label:'Register farm and list batch'},{value:'no',label:'Register farm only'}]}/></>}
    {(farm !== 'new' || includeBatch === 'yes') && <Grid columns={{minWidth:140,max:2}} gap={3}><TextInput label="Harvest weight (kg)" value={weight} onChange={setWeight} inputMode="numeric"/><TextInput label="Total asking price (mUSDC)" value={price} onChange={setPrice} inputMode="decimal"/></Grid>}
    <Button label="Submit on Fuji" variant="primary" icon={<ArrowUpRight size={16}/>} onClick={() => run('Registration', async send => {
      const list = farm !== 'new' || includeBatch === 'yes';
      const kg = list ? integer(weight) : 0n; const amount = list ? decimal(price, 6) : 0n;
      if (list && amount === 0n) throw new Error('Price must be greater than zero.');
      let id: bigint;
      if (farm === 'new') {
        if (!name.trim() || !region.trim()) throw new Error('Enter a farm name and region.');
        const receipt = await send(core, 'registerFarm', [name.trim(), region.trim(), JSON.stringify(polygon(gps)), integer(area)]);
        const log = receipt.logs.find(l => same(l.address, core.address)); if (!log) throw new Error('Farm registered, but the receipt did not include a farm ID.');
        id = (decodeEventLog({abi:core.abi,eventName:'FarmRegistered',data:log.data,topics:log.topics}).args as unknown as {farmId:bigint}).farmId;
        setFarm(String(id));
      } else id = BigInt(farm);
      if (list) await send(core, 'createCacaoBatch', [id, kg, amount]);
    }, true)}/>
  </VStack>;
}

function Milestone({batch, run}: {batch: Batch; run: Run}) {
  const [score, setScore] = useState(''); const [moisture, setMoisture] = useState(''); const [cid, setCid] = useState('');
  return <VStack gap={3}><Text>Submit your processing measurements before the buyer confirms delivery.</Text><TextInput label="Fermentation score (0–100)" value={score} onChange={setScore} inputMode="numeric"/><TextInput label="Moisture (%)" value={moisture} onChange={setMoisture} inputMode="decimal"/><TextInput label="IPFS certificate CID" value={cid} onChange={setCid}/><Button variant="primary" label="Log processing milestone" onClick={() => run('Processing milestone', async send => {
    const s = integer(score, 0n); const m = decimal(moisture, 2); const hash = cid.trim().replace(/^ipfs:\/\//, '');
    if (s > 100n || m > 10_000n || !/^[a-zA-Z0-9]{32,100}$/.test(hash)) throw new Error('Enter valid quality measurements and an IPFS CID.');
    await send(core, 'recordMoisture', [batch.id, m]); await send(core, 'logProcessingMilestone', [batch.id, Number(s), `ipfs://${hash}`]);
  }, true)}/></VStack>;
}

type Modal = {type:'register' | 'wallet'} | {type:'passport' | 'milestone'; id:bigint};
function Workspace() {
  const account = useAccount(); const {address} = account; const {connectors, connectAsync, isPending: connecting} = useConnect(); const {disconnect} = useDisconnect(); const {switchChainAsync} = useSwitchChain(); const {writeContractAsync} = useWriteContract();
  const queries = useQueryClient();
  const chain = useQuery({queryKey:['chain', address], queryFn: () => snapshot(address), enabled: configured, refetchInterval: 15_000, retry: 1}); const s = chain.data;
  const [tab, setTab] = useState('supply'); const [modal, setModal] = useState<Modal>(); const [filter, setFilter] = useState('all'); const [search, setSearch] = useState('');
  const [targetBatch, setTargetBatch] = useState<string>(); const [deepLinkError, setDeepLinkError] = useState(false);
  const [tx, setTx] = useState<{text:string; hash?:Hash; error?:boolean}>(); const [busy, setBusy] = useState(false); const pending = useRef(false);
  useEffect(() => {
    const p = new URLSearchParams(window.location.search); const id = p.get('batch'); if (!id) return;
    if (!/^\d+$/.test(id) || (p.has('core') && !same(p.get('core')!, core.address))) {setDeepLinkError(true); return;}
    if (!s) return;
    if (!s.batches.some(b => b.id === BigInt(id))) {setDeepLinkError(true); return;}
    setModal({type:'passport',id:BigInt(id)});
  // A shared passport opens once when the initial chain snapshot arrives.
  }, [Boolean(s)]); // eslint-disable-line react-hooks/exhaustive-deps
  const run: Run = async (label, work, close) => {
    if (pending.current) return;
    if (!configured) {setTx({text:'Deploy and configure the Fuji contracts before submitting transactions.',error:true}); return;}
    if (!address) {setModal({type:'wallet'}); return;}
    pending.current = true; setBusy(true); setTx({text:`${label}: preparing…`}); let lastHash: Hash | undefined;
    try {
      if (account.chainId !== avalancheFuji.id) await switchChainAsync({chainId: avalancheFuji.id});
      const send: Send = async (contract, functionName, args = []) => {
        setTx({text:`${label}: confirm ${functionName} in your wallet`, hash:lastHash});
        const {request} = await client.simulateContract({...contract, functionName, args, account:address});
        const hash = await writeContractAsync({...request, chainId:avalancheFuji.id}); lastHash = hash;
        setTx({text:`${label}: waiting for Fuji confirmation`, hash});
        const receipt = await client.waitForTransactionReceipt({hash}); if (receipt.status !== 'success') throw new Error('Transaction reverted.');
        lastHash = receipt.transactionHash; return receipt;
      };
      await work(send, async (spender, amount) => {
        const allowance = await read<bigint>(token, 'allowance', [address, spender]);
        if (allowance < amount) await send(token, 'approve', [spender, amount]);
      });
      setTx({text:`${label} confirmed on Fuji`,hash:lastHash}); if (close) setModal(undefined);
    } catch (error) {setTx({text:error instanceof BaseError ? error.shortMessage : error instanceof Error ? error.message : 'Transaction failed', hash:lastHash,error:true});}
    finally {pending.current = false; setBusy(false); void queries.invalidateQueries({queryKey:['chain']}); void queries.invalidateQueries({queryKey:['passport']});}
  };
  const connectWallet = async (connector: (typeof connectors)[number]) => {
    try {await connectAsync({connector}); setTx(undefined); setModal(undefined);}
    catch (e) {setTx({text:e instanceof BaseError ? e.shortMessage : e instanceof Error ? e.message : 'Unable to connect wallet',error:true});}
  };
  const changeNetwork = async () => {try {await switchChainAsync({chainId:43113});} catch (e) {setTx({text:e instanceof Error ? e.message : 'Switch network in your wallet.',error:true});}};
  const active = s?.pools.filter(p => poolOpen(p, s.now)) || [];
  const quotes = active.map(p => quotedRisk(p, s!.offers)).filter((v): v is number => v !== undefined);
  const avg = quotes.length ? `${(quotes.reduce((a,b) => a+b, 0)/quotes.length).toFixed(1)}%` : '—';
  const batches = s?.batches.filter(b => {const f = s.farms.find(f => f.id === b.farmId); return (filter === 'all' || String(b.status) === filter) && `${b.id} ${f?.farmName} ${f?.region}`.toLowerCase().includes(search.trim().toLowerCase());}) || [];
  const modalBatch = modal && 'id' in modal ? s?.batches.find(b => b.id === modal.id) : undefined;
  const modalFarm = s?.farms.find(f => f.id === modalBatch?.farmId);
  const header = <HStack as="header" paddingInline={6} paddingBlock={3} hAlign="between" vAlign="center" wrap="wrap" gap={3} style={{background:'var(--color-background-surface)',borderBottom:'1px solid var(--color-border-default)'}}>
    <HStack gap={3} vAlign="center"><Card padding={2} variant="green"><Sprout size={24}/></Card><VStack gap={0}><Heading level={3}>OpenCacao</Heading><Text color="secondary">Traceable Cacao &amp; Parametric Risk Shield</Text></VStack></HStack>
    <HStack gap={3} vAlign="center" wrap="wrap"><HStack gap={1} vAlign="center" style={{color:'var(--color-text-accent)'}}><Activity size={15}/><Text> Avalanche Fuji</Text></HStack><Divider orientation="vertical"/><Text>{address && s ? `${money(s.balance)} mUSDC` : '— mUSDC'}</Text>
      <Button label="Faucet 10,000 mUSDC" icon={<Droplets size={16}/>} isDisabled={!configured || busy} onClick={() => run('mUSDC faucet', async send => {await send(token,'faucet');})}/>
      <Button variant="primary" icon={<Wallet size={16}/>} label={address ? (account.chainId !== 43113 ? 'Switch to Fuji' : short(address)) : 'Connect wallet'} onClick={() => address && account.chainId !== 43113 ? void changeNetwork() : setModal({type:'wallet'})}/>
    </HStack>
  </HStack>;
  const status = tx && <section role={tx.error ? 'alert' : 'status'}><Card padding={3} variant={tx.error ? 'red' : 'green'}><HStack gap={2} wrap="wrap"><Text>{tx.text}</Text>{tx.hash && <a href={`${explorer}/tx/${tx.hash}`} target="_blank" rel="noreferrer">View transaction <ArrowUpRight size={13}/></a>}</HStack></Card></section>;
  return <Layout height="auto" contentWidth={1280} header={header} content={<LayoutContent role="main" padding={6}>
    <VStack gap={6}>
      <Card padding={6} variant="green"><VStack gap={2}><HStack gap={2} vAlign="center"><Leaf size={17}/><Text>FIELD-TO-MARKET TERMINAL</Text></HStack><Heading level={1} type="display-2">Cacao Supply Chain</Heading><Text color="secondary">Trace harvests to their farms, fund forward purchases, and protect growers against climate risk.</Text></VStack></Card>
      <Grid columns={{minWidth:200,max:4}} gap={4}>
        <Stat icon={<Sprout/>} label="EUDR farms attested" value={s ? String(s.farms.filter(f => f.eudrCompliant).length) : '—'} detail="Owner attestations"/>
        <Stat icon={<LockKeyhole/>} label="Active escrow TVL" value={s ? money(s.tvl) : '—'} detail="mUSDC in forward contracts"/>
        <Stat icon={<ShieldCheck/>} label="Harvest protected" value={s ? money(active.reduce((a,p) => a + p.totalCollateral,0n)) : '—'} detail="mUSDC of active coverage"/>
        <Stat icon={<Activity/>} label="Avg. implied climate risk" value={avg} detail="Latest fills or best open quotes"/>
      </Grid>
      <TabList value={tab} onChange={setTab} hasDivider><Tab value="supply" label="Supply Chain & Escrow" icon={<Package size={17}/>}/><Tab value="market" label="Certainary Risk Shield" icon={<ShieldCheck size={17}/>}/><Tab value="portfolio" label="My Portfolio" icon={<Wallet size={17}/>}/></TabList>
      {!configured && <Card variant="orange" padding={4}><HStack gap={2} vAlign="center" wrap="wrap"><FlaskConical size={18}/><Text>Fuji deployment not configured. Follow the README to deploy and connect the contracts; no sample balances or records are displayed.</Text></HStack></Card>}
      {configured && chain.isPending && <Text>Reading on-chain records from Avalanche Fuji…</Text>}
      {chain.isError && <HStack gap={2} wrap="wrap"><Text>Could not read Fuji contracts. Check the deployment addresses and RPC.</Text><Button label="Retry" onClick={() => void chain.refetch()}/></HStack>}
      {deepLinkError && <Text>This passport does not match an available batch in this deployment.</Text>}
      {!modal && status}
      {tab === 'supply' && <VStack gap={4}>
        <HStack hAlign="between" vAlign="center" gap={3} wrap="wrap"><VStack gap={1}><Heading level={2}>Harvest marketplace</Heading><Text color="secondary">Browse registered cacao batches and their forward contracts.</Text></VStack><Button label="Register Farm & Batch" variant="primary" icon={<Plus size={17}/>} isDisabled={!configured || busy} onClick={() => setModal({type:address ? 'register':'wallet'})}/></HStack>
        <HStack gap={3} vAlign="center" wrap="wrap"><TextInput label="Search batches" isLabelHidden type="search" placeholder="Search farms or batch IDs" value={search} onChange={setSearch}/><Selector label="Batch status" isLabelHidden value={filter} onChange={setFilter} options={[{value:'all',label:'All statuses'},...batchStatus.map((label,i) => ({label, value:String(i)}))]}/></HStack>
        {batches.length ? <Grid columns={{minWidth:300,max:3}} gap={4}>{batches.map(b => <BatchCard key={String(b.id)} batch={b} s={s!} owner={address} busy={busy} run={run} open={setModal} protect={() => {setTargetBatch(String(b.id));setTab('market');}}/>)}</Grid> : <Card padding={6}><VStack gap={2} hAlign="center"><Package size={28}/><Heading level={3}>{s?.batches.length ? 'No matching batches' : 'No harvest batches to display'}</Heading><Text color="secondary">{s?.batches.length ? 'Try a different farm name or status.' : 'Harvests appear here once their listings are confirmed on Fuji.'}</Text></VStack></Card>}
        {s && <HarvestChart s={s}/>}
      </VStack>}
      {tab === 'market' && <Market s={s} address={address} run={run} busy={busy} initialBatch={targetBatch}/>}
      {tab === 'portfolio' && <Portfolio s={s} address={address} run={run} busy={busy} connect={() => setModal({type:'wallet'})} passport={id => setModal({type:'passport',id})}/>}
      <Divider/><HStack gap={2} vAlign="center" hAlign="between" wrap="wrap"><Text color="secondary">OpenCacao · Fuji testnet · mUSDC has no real-world value</Text>{s && <a href={`${explorer}/block/${s.block}`} target="_blank" rel="noreferrer">Fuji block {s.block.toString()} <ArrowUpRight size={13}/></a>}</HStack>
    </VStack>
    <Dialog isOpen={!!modal} onOpenChange={open => {if (!open && !busy) setModal(undefined);}} width={modal?.type === 'passport' ? 690 : 540} purpose={busy ? 'required' : 'form'}>
      <DialogHeader title={modal?.type === 'register' ? 'Register farm & batch' : modal?.type === 'milestone' ? `Process batch #${modalBatch?.id}` : modal?.type === 'passport' ? `Traceability passport · Batch #${modalBatch?.id}` : 'Wallet connection'} onOpenChange={busy ? undefined : () => setModal(undefined)}/>
      <VStack padding={4} gap={3}>
        {status}
        {modal?.type === 'wallet' && (address ? <><Text>{address}</Text><Button label="Disconnect wallet" onClick={() => {disconnect();setModal(undefined);}}/></> : <><Text color="secondary">Connect an injected wallet such as Core or MetaMask. Fuji AVAX is required for gas.</Text>{connectors.map(c => <Button key={c.uid} label={c.id === 'injected' ? 'Browser wallet' : c.name} icon={<Wallet size={16}/>} isDisabled={connecting} onClick={() => void connectWallet(c)}/>)}</>)}
        {modal?.type === 'register' && <Registration farms={s?.farms.filter(f => same(f.farmer,address)) || []} run={run}/>}
        {modal?.type === 'milestone' && modalBatch && <Milestone batch={modalBatch} run={run}/>}
        {modal?.type === 'passport' && modalBatch && modalFarm && <Passport batch={modalBatch} farm={modalFarm}/>}
      </VStack>
    </Dialog>
  </LayoutContent>}/>;
}

function Stat({icon, label, value, detail}: {icon:ReactNode;label:string;value:string;detail:string}) {
  return <Card padding={4}><VStack gap={2}><HStack gap={2} vAlign="center" style={{color:'var(--color-text-accent)'}}>{icon}<Text>{label}</Text></HStack><Heading level={2}>{value}</Heading><Text color="secondary">{detail}</Text></VStack></Card>;
}

function BatchCard({batch:b, s, owner, busy, run, open, protect}: {batch: Batch;s:Snapshot;owner?:string;busy:boolean;run:Run;open:(m:Modal)=>void;protect:()=>void}) {
  const f = s.farms.find(f => f.id === b.farmId)!;
  const pool = s.pools.find(p => p.id === b.insuredPoolId); const protectedNow = pool && poolOpen(pool,s.now) && b.insuredShares > 0n;
  return <Card padding={4}><VStack gap={3}>
    <HStack hAlign="between" gap={2} wrap="wrap"><Text color="secondary">BATCH #{String(b.id).padStart(3,'0')}</Text><Text>{batchStatus[b.status]}</Text></HStack>
    <VStack gap={1}><Heading level={3}>{f.farmName}</Heading><HStack gap={1} vAlign="center"><MapPin size={14}/><Text color="secondary">{f.region}</Text></HStack><Text maxLines={1} color="secondary">{f.gpsCoords}</Text><Text>{f.eudrCompliant ? '✓ EUDR owner attested' : 'EUDR not attested'}</Text></VStack>
    <Divider/><Grid columns={3} gap={2}><VStack gap={1}><Text color="secondary">Weight</Text><Text>{b.weightKg.toString()} kg</Text></VStack><VStack gap={1}><Text color="secondary">Escrow</Text><Text>{money(b.escrowAmount)}</Text></VStack><VStack gap={1}><Text color="secondary">Quality</Text><Text>{b.status >= 2 ? `${b.fermentationScore}/100` : '—'}</Text></VStack></Grid>
    <Button variant="ghost" icon={<ShieldCheck size={16}/>} label={protectedNow ? `Protected: ${money(b.insuredShares * unit)} mUSDC` : pool ? 'View previous protection' : 'Uninsured · Explore shield'} onClick={protect}/>
    <HStack gap={2} wrap="wrap"><Button label="Passport" icon={<QrCode size={16}/>} onClick={() => open({type:'passport',id:b.id})}/>
      {b.status === 0 && !same(b.farmer,owner) && <Button label="Fund forward escrow" variant="primary" isDisabled={busy} onClick={() => run('Escrow funding', async (send, approve) => {await approve(core.address,b.escrowAmount); await send(core,'fundBatchEscrow',[b.id]);})}/>}
      {b.status === 1 && same(b.farmer,owner) && <Button label="Log fermentation" variant="primary" isDisabled={busy} onClick={() => open({type:'milestone',id:b.id})}/>}
      {b.status === 2 && same(b.buyer,owner) && <Button label="Confirm delivery & release" variant="primary" isDisabled={busy} onClick={() => run('Escrow release', async send => {await send(core,'releaseEscrow',[b.id]);})}/>}
    </HStack>
  </VStack></Card>;
}

export default function Page() {
  const [queryClient] = useState(() => new QueryClient());
  return <Theme theme={themes[defaultThemeSlug]} mode="dark"><VStack minHeight="100dvh" style={{background:'var(--color-background-body)'}}><WagmiProvider config={config}><QueryClientProvider client={queryClient}><Workspace/></QueryClientProvider></WagmiProvider></VStack></Theme>;
}

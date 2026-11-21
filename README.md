# OpenCacao

OpenCacao is a testnet workspace for cacao batch provenance, forward-purchase escrow, and Certainary climate coverage. The frontend reads contract state and events from Avalanche Fuji (chain ID `43113`) and sends writes through an injected wallet. Without deployment addresses it shows an unconfigured state, not simulated balances or records.

## Deployed contracts — Avalanche Fuji

Network: **Avalanche Fuji testnet**, chain ID **43113**. Deployment start block: **61418109**. All 22 deployment and seed transactions succeeded, and the Solidity source for all three contracts is **verified on Snowtrace**.

| Contract | Address (links to verified source) | Deployment transaction |
| --- | --- | --- |
| MockUSDC | [`0x87005BC3344194015a9f4E1Ef74b59f8118030D7`](https://testnet.snowtrace.io/address/0x87005BC3344194015a9f4E1Ef74b59f8118030D7#code) | [Transaction](https://testnet.snowtrace.io/tx/0x25640cc4bf81c1d33a301d5e2091cfaffc62175c41ddf2d655d081e33852d698) |
| OpenCacaoCore | [`0x67f21bb2626271ABc108c97D72A4987E8C5f7d66`](https://testnet.snowtrace.io/address/0x67f21bb2626271ABc108c97D72A4987E8C5f7d66#code) | [Transaction](https://testnet.snowtrace.io/tx/0xace864ed68c52194b32430d1126abf92ce036c5264b00e0f30062e926683b91f) |
| CertainaryModule | [`0x93314E0853A3FB128954516020E625556F3a938E`](https://testnet.snowtrace.io/address/0x93314E0853A3FB128954516020E625556F3a938E#code) | [Transaction](https://testnet.snowtrace.io/tx/0x23da5346ed0fd62da22a76ab6fed245e6510f9ef35a270af66fbee6d3d633c2c) |

These are demo testnet contracts, not audited production deployments. Local frontend configuration is generated in `frontend/.env.local`; restart or rebuild the frontend after changing deployment settings.

## Install and verify

Install current Foundry (`forge`, `cast`) and Node.js 22 or newer. From the project root:

```bash
cd contracts
forge install OpenZeppelin/openzeppelin-contracts@v5.0.2 --no-git
forge install foundry-rs/forge-std@v1.9.7 --no-git
forge test -vvv
cd ..
node scripts/export-abis.mjs
npm --prefix frontend ci
npm --prefix frontend run build
```

Skip the `forge install` commands if the libraries are already present. `--no-git` is the current Foundry option for installing dependencies without committing or creating Git submodules.

## How to deploy to Avalanche Fuji

Skip this section if you only want to host the frontend against the existing deployment. See [Deploy the frontend to Vercel](#deploy-the-frontend-to-vercel).

1. Fund a dedicated testnet wallet with Fuji AVAX for gas. Copy `.env.example` to `.env` and enter its `0x`-prefixed private key **locally**. Do not share the key or place it in a `NEXT_PUBLIC_*` variable. That wallet will own the oracle and compliance permissions, the seeded farms and batches, and the initial underwriting offers.
2. From the project root, run:

   ```bash
   set -a
   source .env
   set +a
   cast chain-id --rpc-url "$AVALANCHE_FUJI_RPC_URL"  # Must print 43113
   (cd contracts && forge script script/Deploy.s.sol:Deploy --rpc-url "$AVALANCHE_FUJI_RPC_URL" --broadcast -vvv)
   unset PRIVATE_KEY
   node scripts/export-abis.mjs
   node scripts/configure-deployment.mjs
   npm --prefix frontend run dev
   ```

3. Open `http://localhost:3000`. Successful seeding creates **3 farms, 4 listed batches, 3 risk pools, and 3 underwriting offers**. The seed farms and owner attestations are demonstration records, not verified claims about actual farms. No escrow or coverage is matched at deployment.

`scripts/configure-deployment.mjs` creates or replaces `frontend/.env.local` with the three contract addresses and deployment block from the Fuji broadcast receipts. Edit `NEXT_PUBLIC_FUJI_RPC_URL` there if the app should use a different Fuji RPC.

If the frontend reports an RPC or deployment error, check that all three addresses have bytecode on Fuji, the RPC supports browser requests and historical logs, and the configured deployment block matches the broadcast. If a wallet transaction fails for insufficient funds, fund that wallet with **Fuji AVAX**; the app faucet only mints test mUSDC.

## Deploy the frontend to Vercel

You can host the Next.js app without redeploying any contracts. The frontend uses the ABIs already committed in `frontend/src/contracts`; Vercel does not need Foundry, broadcast receipts, or a wallet key.

1. In the [Vercel dashboard](https://vercel.com/dashboard), create a project and import this GitHub repo. Set **Root Directory** to `frontend`, **Framework Preset** to **Next.js**, and **Node.js Version** to **22.x**. Use `npm ci` as the install command and `npm run build` as the build command. Leave the output directory at its default.
2. Under **Environment Variables**, add these settings for **Production** and, if you want previews to use the same Fuji deployment, **Preview**. Enter each line as a separate name and value:

   ```dotenv
   NEXT_PUBLIC_FUJI_RPC_URL=https://api.avax-test.network/ext/bc/C/rpc
   NEXT_PUBLIC_MOCK_USDC_ADDRESS=0x87005BC3344194015a9f4E1Ef74b59f8118030D7
   NEXT_PUBLIC_CORE_ADDRESS=0x67f21bb2626271ABc108c97D72A4987E8C5f7d66
   NEXT_PUBLIC_CERTAINARY_ADDRESS=0x93314E0853A3FB128954516020E625556F3a938E
   NEXT_PUBLIC_DEPLOYMENT_BLOCK=61418109
   ```

   These values are public and embedded in the browser bundle at build time. **Do not upload the root `.env` or add `PRIVATE_KEY` to Vercel.** For a fresh contract deployment, use the public values from the generated `frontend/.env.local` instead. Redeploy the frontend after changing any of these variables.
3. Click **Deploy**. Open the resulting HTTPS URL and check that the seeded batch listings load without connecting a wallet. Open a batch **Passport** and test its QR code from another device before sharing the URL. To send a transaction, connect a wallet on Avalanche Fuji with Fuji AVAX for gas.

## Judge walkthrough

| Role | Action | Expected result |
| --- | --- | --- |
| Exporter (a second Fuji-funded wallet) | Click **Faucet 10,000 mUSDC**, then **Fund forward escrow** on a seeded batch. Sign the token approval and escrow funding separately. | The listing shows **Escrow funded** and TVL increases. |
| Farm owner (deployer for a seeded batch) | Use **Log fermentation** to record moisture, fermentation score, and an existing IPFS certificate CID. | The batch shows **Harvest verified**; its passport links to the transaction. |
| Farmer or exporter | Before releasing escrow, select the batch and a matching regional quote in **Certainary Risk Shield** and attach coverage. | The batch shows its active coverage; YES shares accrue to the farmer, NO shares to the underwriter. |
| Exporter | Click **Confirm delivery & release**. | The farmer receives the asking amount, escrow TVL falls, and the batch becomes **Completed**. |
| Oracle owner | In **My Portfolio → Demo oracle**, settle the covered pool as triggered or safe. | The farmer can claim on a trigger, or the underwriter can claim if safe. To demonstrate both outcomes, use two different pools. |
| Underwriter | In **My Portfolio**, withdraw an offer's unused collateral. | Only unmatched liquidity returns; matched shares remain subject to settlement. |

The **Passport** opens without a wallet. Its QR links to the batch ID and contract in the same deployment. New farm registration accepts a closed JSON polygon of `[longitude, latitude]` pairs. Use the exact on-chain region name to match it to an existing pool.

## Contract model and MVP limits

- **`MockUSDC`** uses six decimals. `faucet()` mints 10,000 test mUSDC per call, with no cooldown or monetary value.
- **`OpenCacaoCore`** records farm polygons, owner attestations, harvest details, and provenance events. The farmer logs processing after funding; the buyer confirms delivery and triggers the final payout. There is no arbitration, refund, or timeout path in this MVP. An owner attestation is not legal EUDR certification. On-chain records are public; do not publish private information.
- **`CertainaryModule`** matches a selected offer against a batch. For each matched share, the underwriter locks `1 mUSDC − premium` and the purchaser locks the premium. The winning side can claim exactly `1 mUSDC` per share after settlement. Shares are contract balances, not transferable ERC-20s. Each batch can attach to one regional pool. The displayed risk estimate is the last matched premium, or the cheapest active quote before the first fill; it is not a calibrated probability or a guarantee of settlement.
- **Weather and settlement are separate.** Open-Meteo provides informational temperature and precipitation near the farm polygon. No salinity sensor is configured. The oracle owner can settle early for judging; expiry closes quoting and matching but does not resolve the outcome. Use a vetted oracle, a dispute process, independently verified farm attestations, and a contract audit before considering production.

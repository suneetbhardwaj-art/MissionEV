# MissionEV audit and repair report

Audit date: 2026-10-26. Scope: the repo at `suneetbhardwaj-art/MissionEV` (main at `caa4b0e`) and the live site `syntax-error-2gyu.onrender.com`.

## Root causes found

1. **Styles never loaded.** `index.html` links `css/styles.css`; the repo only had a root `style.css`. The live site served `style.css` (200) but `css/styles.css` returned 404, so the page rendered unstyled. Fixed by moving the file to `css/styles.css`.
2. **Wrong chain ID hex.** `chainIdHex` was `0x190f0b49` (= 420416329). The RPC answers `0x190f1ca9` (= 420420777). `wallet_switchEthereumChain` / `wallet_addEthereumChain` would have targeted a non-existent chain. Now derived from the decimal ID.
3. **No contract at the configured addresses.** `eth_getCode` returned `0x` for both the contract (`0x71C8…39a8`) and token (`0x3A5d…1948`). Everything labelled "on-chain" could not have worked. Addresses removed; the UI now checks bytecode live and stays in demo mode until a real one is supplied.
4. **Fake wallet and fake receipts.** `web3-azure.js` registered a second click handler that "connected" a hard-coded wallet (`0x7B2F…39e1`) and produced random tx hashes, block numbers and gas receipts labelled "TRANSACTION MINED ON PORTAL EVM". Removed.
5. **Wrong contract in the preview.** The preview showed `MissionEV.recordCommute(...)`, which needs an Azure-oracle EIP-712 signature that does not exist. The UI actually targets `EVMobilityRewards`. The preview now shows the real function.
6. **Unsupported modes submitted as petrol.** In `web3-portal.js`, Metro / e-bus / walking / e-scooter fell through to `recordICEJourney` as a petrol trip after a toast. Now disabled with an explanation.
7. **Inconsistent emissions maths** (details below).
8. **Misleading claims**: "AZURE ORACLE VERIFIED", "LIVE", fake service status, fake `Verified on Portal EVM` trips with tx hashes, fabricated contract `0x82b9…46A0`, `ERC-721 badges`, `Zero Knowledge Audit`, "2.5x multiplier", "Top 3%", Azure "powered by", a "Transaction initializing…" state that never resolved, etc.

## Calculation corrections

| Issue | Before | After |
| --- | --- | --- |
| EV car factor | Fixed 68 g/km, while the same row said 15.2 kWh/100 km × 0.71 kg/kWh (= 108 g/km) | Derived: 0.152 kWh/km × 727 g/kWh = 110.5 g/km |
| e-bus factor | 35 g/pkm vs stated 1.1 kWh/km ÷ 32 pax (= 24 g) | Derived from the stated inputs |
| Sign of avoided | `Math.max(0, …)` hid negatives; chart showed "−3.2 kg AVOIDED" | Signed `baseline − journey`; negative shown as "above baseline" with explanation |
| Weekly mix, city sim | Hard-coded 68 / 28 / 196 / 42 g/km separate from the model | All read the single model |
| Route comparison | Typed-in kg values and ₹ costs | Computed; unverifiable ₹ costs removed |
| Trip notes, sample trips | Typed-in numbers | Computed |
| Units | g and kg mixed, no documentation | Documented in `js/data.js`: km, g/km, kWh/km, g/kWh, kg |
| Distance limits | slider 150, number box 200, contract 500 | Lab 1–200, contract preview validates 1–500 whole km |
| Grid factor | "0.71 kg/kWh, CEA" with no period | 0.727 t/MWh, CEA FY2023-24 weighted average **as reported by SolarQuarter (Jan 2025)**; CEA v22.0 may have revised it and the primary table was not re-checked |
| Solar factor | 15 g/km, unsourced | 48 g/kWh (IPCC AR5 utility PV lifecycle median; verify) |
| Health ₹ valuation, token "treasury" | Invented | Removed |

Still illustrative or unverified (labelled as such on the page): kWh/km values, fossil 196 / 224 g/km (project assumptions that mirror the contract), urban average 162 g/km, city trip counts, PM2.5 0.02 g/km, tree equivalence, the IEA "about a quarter" statistic.

## Contract behaviour (read from the Solidity source)

- `recordEVJourney`: self-reported distance 1–500 km; fixed (196−68) g/km "avoided"; score +8; streak +1 if within 36 h; pays 1.5 tokens/km **only if the contract's token balance covers it**; **never mints**; rewards are per km travelled, not per kg avoided.
- `recordICEJourney`: records emitted grams, score −5, streak reset. **Does not burn, deduct or transfer tokens.**
- The `oracle` role is unused. `MissionEV.sol` (EIP-712 oracle signature, own token with minting) is a separate, unused design.
- The contract's 68 g/km EV constant differs from the lab's electricity-based factor, so on-chain "avoided" values differ from the lab. The UI says so and labels the numbers.

## Files changed

`index.html`, `css/styles.css` (moved from `style.css`, plus additions), `js/contract-abi.js` (now the single config module), `js/data.js` (single emissions model), `js/simulator.js`, `js/dashboard.js`, `js/web3-portal.js` (rewritten), `js/web3-azure.js` (rewritten, no wallet), `js/city-simulator.js`, `README.md`, `AUDIT.md`.

## What is genuinely connected

- Live RPC reads (chain ID, latest block, bytecode check, token and balance reads once a contract exists).
- Wallet connect, network switch/add, transaction submit/wait/receipt parsing via ethers v6 (bundled).

## Not connected / missing

- **No EVMobilityRewards deployment** with bytecode exists at any configured address. Real submission is therefore untested against a real chain.
- Azure Functions, Maps, Event Hubs, Cosmos DB, Power BI, oracle: planned only.
- Block explorer URL (`test-explorer-v3.portaldot.dev`) did not respond to my check; links to it are labelled as unverified.

## Tests completed

- Desktop (1280) and mobile (375) browser runs: no JS errors; no horizontal overflow at 375 after fixes (found and fixed overflow from the leaderboard grid, transaction preview, methodology tables, city buttons, header).
- Lab: all 7 modes, baseline switch, solar toggle, distance edit/clamp/reset; positive, zero and negative differences; chart, cards, tooltips and preview agree.
- Demo walkthrough shows no hash/block/gas; resets when lab inputs change.
- Testnet mode with no contract, invalid address, and a valid address with no bytecode: submit stays disabled with the reason.
- **Mocked** wallet + mocked RPC (test harness only, not shipped): wrong-network switch, wallet rejection, send-time revert, mined revert, and confirmed success with event parsing all render the right state. This validates the UI logic, **not** a real chain.

## New deployment needed?

Yes, to publish the fixes (the live site currently 404s its stylesheet). The repo has no deployment config; it is a static site served from the repo root.
